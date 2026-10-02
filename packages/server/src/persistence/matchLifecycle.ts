import type { GameAction, PlayerId } from "rules";
import { extractPersistentMatchResult, MatchResultError } from "./matchResult";
import { Prisma } from "@prisma/client";
import { hasDistinctPlayerIdentities, identityDisplayName } from "../auth/connectionIdentity";
import { rejected } from "../commandResult";
import { randomUUID } from "node:crypto";
import {
  applyGameAction,
  cleanupGameRooms,
  createGameRoomWithId,
  deleteGameRoom,
  getGameRoom,
  publishGameRoom,
  type CreateGameOptions,
  type GameRoom,
} from "../store";
import { enqueueRoomCommand, fateRoomKey, getQueuedFateRoomIds } from "../roomQueue";
import { MatchRepository } from "../repositories/matchRepository";
import {
  MatchService,
  type MatchPersistence,
  type SeatParticipantInput,
  type StartedMatchInput,
  type FinishedMatchInput,
} from "../services/matchService";

type Logger = {
  info: (data: object, message: string) => void;
  error: (data: object, message: string) => void;
};
interface Projection {
  roomId: string;
  matchId: string;
  names: Map<PlayerId, SeatParticipantInput>;
  dirtySeats: Set<PlayerId>;
  removedSeats: Set<PlayerId>;
  gameMode?: string;
  started: boolean;
  start?: StartedMatchInput;
  finish?: FinishedMatchInput;
  finishAttempts?: number;
  resultBlocked?: boolean;
  cancel?: Date;
  removed: boolean;
}

export class MatchCreationError extends Error {
  readonly statusCode = 503;
  readonly code = "MATCH_PERSISTENCE_UNAVAILABLE";
  constructor() {
    super("Unable to create persistent room");
  }
}

/** Lifecycle projection only: no GameState, actions, RNG or sockets are persisted. */
export class MatchLifecycle {
  private readonly projections = new Map<string, Projection>();
  private service?: MatchPersistence;
  private timer?: NodeJS.Timeout;
  private retryRun?: Promise<void>;

  constructor(
    private readonly logger: Logger,
    service?: MatchPersistence,
  ) {
    this.service = service;
  }

  private getService(): MatchPersistence {
    return (this.service ??= new MatchService(new MatchRepository(), this.logger));
  }

  startRetries(): void {
    this.timer = setInterval(() => {
      if (this.retryRun) return;
      this.retryRun = this.retryPending().finally(() => {
        this.retryRun = undefined;
      });
    }, 5000);
    this.timer.unref();
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.retryRun;
    if (Array.from(this.projections.values()).some((p) => this.hasPending(p) || p.resultBlocked))
      this.logger.error(
        { event: "match:pending_at_shutdown" },
        "Match projections still pending at shutdown",
      );
  }

  async createRoom(
    options: CreateGameOptions = {},
    id: string = randomUUID(),
    createdById: string | null = null,
  ): Promise<GameRoom> {
    if (getGameRoom(id)) throw new Error("Room already exists");
    // Keep the staged room invisible to discovery, joins and cleanup until binding succeeds.
    const room = createGameRoomWithId(id, { ...options, publish: false });
    if (room.roomMode === "normal") {
      try {
        const match = await this.getService().createWaitingMatch({
          roomId: room.id,
          gameMode: room.gameMode,
          seed: room.seed,
          createdById,
        });
        room.matchId = match.id;
      } catch {
        this.logger.error(
          { event: "match:create_failed", roomId: room.id },
          "Persistent room creation failed",
        );
        throw new MatchCreationError();
      }
    }
    publishGameRoom(room);
    if (room.matchId) {
      this.projection(room);
      this.logger.info(
        { event: "match:created", roomId: room.id, matchId: room.matchId },
        "Match linked to room",
      );
    }
    return room;
  }

  private projection(room: GameRoom): Projection | null {
    if (!room.matchId || room.roomMode === "test") return null;
    let projection = this.projections.get(room.matchId);
    if (!projection) {
      projection = {
        roomId: room.id,
        matchId: room.matchId,
        names: new Map(),
        dirtySeats: new Set(),
        removedSeats: new Set(),
        started: false,
        removed: false,
      };
      this.projections.set(room.matchId, projection);
    }
    return projection;
  }

  async syncParticipant(
    room: GameRoom,
    seat: PlayerId,
    name?: string,
    resumed = false,
  ): Promise<void> {
    const p = this.projection(room);
    if (!p || p.started) return;
    const identity = room.seatIdentities[seat];
    p.names.set(seat, {
      seat,
      userId: identity?.userId ?? null,
      // Existing WS names are unbounded; the durable column is varchar(100).
      displayNameSnapshot: Array.from(
        (identity ? identityDisplayName(identity) : name?.trim()) ||
          (resumed ? p.names.get(seat)?.displayNameSnapshot : undefined) || seat,
      )
        .slice(0, 100)
        .join(""),
    });
    p.dirtySeats.add(seat);
    await this.flush(p);
  }

  async syncVacantSeats(room: GameRoom): Promise<void> {
    const p = this.projection(room);
    if (!p || p.started) return;
    for (const seat of ["P1", "P2"] as const) {
      if (!room.seats[seat] && p.names.has(seat)) {
        p.names.delete(seat);
        p.dirtySeats.delete(seat);
        p.removedSeats.add(seat);
      }
    }
    await this.flush(p);
  }

  async syncGameMode(room: GameRoom): Promise<void> {
    const p = this.projection(room);
    if (!p || p.started) return;
    p.gameMode = room.gameMode;
    await this.flush(p);
  }

  async applyAction(room: GameRoom, action: GameAction, playerId?: PlayerId) {
    if (room.roomMode === "normal" && action.type === "startGame") {
      if (!hasDistinctPlayerIdentities(room))
        return rejected("AUTH_REQUIRED", "Two distinct authenticated players are required");
      const projection = this.projection(room);
      if (projection && !projection.started) {
        for (const seat of ["P1", "P2"] as const)
          await this.syncParticipant(room, seat);
        if (projection.dirtySeats.size || projection.removedSeats.size)
          return rejected("MATCH_PERSISTENCE_UNAVAILABLE", "Participants must be synchronized before start");
      }
    }
    const previousPhase = room.state.phase;
    const command = applyGameAction(room, action, playerId);
    if (!command.ok) return command;
    const p = this.projection(room);
    if (!p) return command;
    if (
      !p.started &&
      ((action.type === "startGame" && previousPhase === "lobby") ||
        (previousPhase === "lobby" && room.state.phase !== "lobby"))
    ) {
      p.started = true;
      room.participantsLocked = true;
      p.start = {
        gameMode: room.gameMode,
        startedAt: new Date(),
        participants: (["P1", "P2"] as const)
          .filter((seat) => !!room.seats[seat])
          .map((seat) => ({
            ...(p.names.get(seat) ?? { seat, userId: null, displayNameSnapshot: seat }),
          })),
      };
      p.gameMode = undefined;
      p.dirtySeats.clear();
      await this.flush(p);
    }
    if (previousPhase !== "ended" && room.state.phase === "ended") {
      try {
        p.finish = extractPersistentMatchResult(room, new Date());
        await this.flush(p);
      } catch {
        p.resultBlocked = true;
        this.logger.error({ event: "match:result_invalid", code: "MATCH_RESULT_INVALID", roomId: room.id, matchId: p.matchId },
          "Terminal result extraction failed; runtime preserved");
      }
    }
    // Ordinary actions perform no database reads/writes or retry work.
    return command;
  }

  async cleanup(options: Parameters<typeof cleanupGameRooms>[0] = {}): Promise<string[]> {
    const removedRooms: GameRoom[] = [];
    const removed = cleanupGameRooms({
      ...options,
      activeRoomIds: new Set([...(options?.activeRoomIds ?? []), ...getQueuedFateRoomIds()]),
      onRemoved: (room) => removedRooms.push(room),
    });
    await Promise.all(
      removedRooms.map((room) =>
        enqueueRoomCommand(fateRoomKey(room.id), () => this.roomRemoved(room)),
      ),
    );
    return removed;
  }

  /** Caller holds the room command queue when permanently removing a room. */
  async removeRoom(room: GameRoom): Promise<void> {
    deleteGameRoom(room.id);
    await this.roomRemoved(room);
  }

  private async roomRemoved(room: GameRoom): Promise<void> {
    const p = this.projection(room);
    if (!p) return;
    p.removed = true;
    // A pending initiative roll is already a started match, despite phase=lobby.
    if (!p.started && room.state.phase === "lobby" && !room.state.pendingRoll)
      p.cancel = new Date();
    await this.flush(p);
    if (!this.hasPending(p)) this.projections.delete(p.matchId);
  }

  private hasPending(p: Projection): boolean {
    return !p.resultBlocked && !!(p.dirtySeats.size || p.removedSeats.size || p.gameMode || p.start || p.finish || p.cancel);
  }

  async retryPending(): Promise<void> {
    await Promise.all(
      Array.from(this.projections.values())
        .filter((p) => this.hasPending(p))
        .map((p) =>
          enqueueRoomCommand(fateRoomKey(p.roomId), async () => {
            await this.flush(p);
            if (p.removed && !this.hasPending(p)) this.projections.delete(p.matchId);
          }),
        ),
    );
  }

  private async flush(p: Projection): Promise<void> {
    if (p.resultBlocked) return;
    let operation = "participant";
    try {
      const service = this.getService();
      for (const seat of p.removedSeats) {
        await service.removeWaitingParticipant(p.matchId, seat);
        p.removedSeats.delete(seat);
      }
      for (const seat of p.dirtySeats) {
        await service.syncParticipant(p.matchId, p.names.get(seat)!);
        p.dirtySeats.delete(seat);
        this.logger.info(
          { event: "match:participant", roomId: p.roomId, matchId: p.matchId, seat },
          "Participant synchronized",
        );
      }
      if (p.gameMode) {
        operation = "game_mode";
        await service.updateWaitingGameMode(p.matchId, p.gameMode);
        p.gameMode = undefined;
      }
      if (p.start) {
        operation = "started";
        await service.markStarted(p.matchId, p.start);
        p.start = undefined;
        this.logger.info(
          { event: "match:started", roomId: p.roomId, matchId: p.matchId },
          "Match started",
        );
      }
      if (p.finish) {
        operation = "finished";
        p.finishAttempts = (p.finishAttempts ?? 0) + 1;
        await service.finalizeMatch(p.matchId, p.finish);
        p.finish = undefined;
        this.logger.info(
          { event: "match:finished", roomId: p.roomId, matchId: p.matchId },
          "Match finished",
        );
      }
      if (p.cancel) {
        operation = "cancelled";
        await service.markCancelled(p.matchId, p.cancel);
        p.cancel = undefined;
        this.logger.info(
          { event: "match:cancelled", roomId: p.roomId, matchId: p.matchId },
          "Match cancelled",
        );
      }
    } catch (error) {
      const domainError = error instanceof MatchResultError;
      const databaseIntegrityError = error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2003", "P2025"].includes(error.code);
      const permanent = domainError || databaseIntegrityError;
      const exhausted = operation === "finished" && (p.finishAttempts ?? 0) >= 5;
      if (permanent || exhausted) p.resultBlocked = true;
      // Prisma diagnostics can contain values. Log safe identifiers, never tokens/names.
      this.logger.error(
        { event: "match:persistence_failed", operation, roomId: p.roomId, matchId: p.matchId,
          code: domainError ? error.code : databaseIntegrityError ? "MATCH_RESULT_INVALID" :
            exhausted ? "MATCH_RESULT_RETRY_EXHAUSTED" : "MATCH_PERSISTENCE_UNAVAILABLE" },
        p.resultBlocked ? "Match persistence failed; runtime preserved, automatic retries stopped" :
          "Match persistence failed; runtime preserved and projection queued for retry",
      );
    }
  }
}
