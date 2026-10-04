import type { MatchAction } from "@prisma/client";
import { getGameRoom, publishGameRoom, restoreGameRoom } from "../store";
import type { MatchLifecycle } from "../persistence/matchLifecycle";
import { MatchRecoveryRepository, type RecoveryMatch } from "../repositories/matchRecoveryRepository";
import { ReplayService } from "./replayService";
import { RatingService } from "./ratingService";
import { RatingRepository } from "../repositories/ratingRepository";
import { ReplayError } from "../replay/replayError";
import { deserializeReplayAction } from "../replay/deserializeAction";
import { initialConfigSchema } from "../replay/initialState";
import { RatingError } from "../rating/ratingError";
import { Glicko2Error } from "../rating/glicko2";
import { MatchSnapshotError } from "../persistence/matchSnapshot";
import { MatchResultError } from "../persistence/matchResult";

type Logger = { info(data: object, message: string): void; error(data: object, message: string): void };
type Repository = Pick<MatchRecoveryRepository,
  "findCandidates" | "loadDurableHistory" | "latestSnapshotRevision" | "interrupt" | "findUnprocessedRatings">;
export class MatchRecoveryError extends Error {
  constructor(readonly code: string) { super(code); }
}
export interface RecoverySummary {
  scanned: number;
  recovered: number;
  skipped: number;
  interrupted: number;
  finalized: number;
  ratingsRepaired: number;
  ratingFailures: number;
  durationMs: number;
}

/** Single backend owner: run before accepting gameplay. Reconstruction itself is read-only. */
export class MatchRecoveryService {
  private running?: Promise<RecoverySummary>;
  constructor(
    private readonly repository: Repository = new MatchRecoveryRepository(),
    private readonly replay: Pick<ReplayService, "reconstructForRecovery"> = new ReplayService(),
    private readonly ratings: Pick<RatingService, "processRatedMatch"> = new RatingService(new RatingRepository()),
  ) {}

  recover(lifecycle: MatchLifecycle, logger: Logger): Promise<RecoverySummary> {
    // Concurrent calls share one coordinator; sequential calls inspect the registry again.
    if (this.running) return this.running;
    const work = this.run(lifecycle, logger);
    this.running = work;
    void work.finally(() => { if (this.running === work) this.running = undefined; }).catch(() => {});
    return work;
  }

  private async run(lifecycle: MatchLifecycle, logger: Logger): Promise<RecoverySummary> {
    const started = Date.now();
    const summary: RecoverySummary = { scanned: 0, recovered: 0, skipped: 0, interrupted: 0,
      finalized: 0, ratingsRepaired: 0, ratingFailures: 0, durationMs: 0 };
    let afterId: string | undefined;
    for (;;) {
      const page = await this.repository.findCandidates(afterId);
      if (!page.length) break;
      for (const match of page) {
        summary.scanned++;
        try {
          const existing = match.roomId ? getGameRoom(match.roomId) : undefined;
          if (existing) {
            if (existing.matchId !== match.id) throw new MatchRecoveryError("ROOM_ID_CONFLICT");
            summary.skipped++;
            continue;
          }
          if (match.status === "WAITING") throw new MatchRecoveryError("WAITING_LOBBY_NOT_DURABLE");
          if (!match.roomId) throw new MatchRecoveryError("MISSING_STABLE_IDENTITY");
          if (!["standard", "classic", "draft"].includes(match.gameMode))
            throw new MatchRecoveryError("UNSUPPORTED_GAME_MODE");
          const participants = this.participants(match);
          const rows = await this.repository.loadDurableHistory(match.id);
          const snapshotRevision = await this.repository.latestSnapshotRevision(match.id);
          const target = durableRecoveryFrontier(match, rows, snapshotRevision);
          const recovered = await this.replay.reconstructForRecovery(match.id, target);
          if (recovered.state.phase === "ended" && snapshotRevision === target && recovered.base.revision !== target)
            throw new MatchRecoveryError("INVALID_TERMINAL_SNAPSHOT");
          const config = initialConfigSchema.safeParse(match.initialConfig);
          const hostSeat = recovered.state.hostPlayerId ?? (config.success ? config.data.hostSeat : null);
          if (!hostSeat) throw new MatchRecoveryError("MISSING_HOST_IDENTITY");
          let room;
          try { room = restoreGameRoom({
            matchId: match.id, roomId: match.roomId, seed: match.seed,
            gameMode: match.gameMode as "standard" | "classic" | "draft",
            matchType: match.isRated ? "RATED" : "CASUAL", createdAt: match.createdAt,
            lobbyName: config.success ? config.data.lobbyName ?? "FATE Lobby" : "FATE Lobby",
            origin: config.success ? config.data.origin ?? "MANUAL" : "MANUAL",
            recovered, participants, hostSeat,
          }); } catch { throw new MatchRecoveryError("STATE_VALIDATION_FAILED"); }
          lifecycle.attachRestoredRoom(room);
          if (room.state.phase === "ended") {
            // Durable terminal action, result commit interrupted. Use normal result/rating pipeline.
            await lifecycle.finalizeRestoredRoom(room, snapshotRevision < target, rows[rows.length - 1].createdAt);
            summary.finalized++;
          } else {
            publishGameRoom(room);
            summary.recovered++;
          }
          logger.info({ event: "match:recovered", matchId: match.id, roomId: match.roomId,
            revision: target, baseRevision: recovered.base.revision, actionsApplied: recovered.actionsApplied },
          "Durable match reconstructed");
        } catch (error) {
          // Storage/global failures stop startup. Never cancel games because PostgreSQL is down.
          if (error instanceof ReplayError && error.code === "REPLAY_STORAGE_UNAVAILABLE") throw error;
          if (!(error instanceof MatchRecoveryError || error instanceof ReplayError || error instanceof MatchSnapshotError || error instanceof MatchResultError)) throw error;
          if (error instanceof MatchRecoveryError && error.code === "ROOM_ID_CONFLICT") throw error;
          await this.repository.interrupt(match.id, `SERVER_RESTART_UNRECOVERABLE:${error.code}`);
          summary.interrupted++;
          logger.error({ event: "match:recovery_interrupted", matchId: match.id, code: error.code,
            ...(error instanceof ReplayError ? error.metadata : {}) }, "Match cannot safely resume");
        }
      }
      afterId = page[page.length - 1].id;
    }
    afterId = undefined;
    for (;;) {
      const page = await this.repository.findUnprocessedRatings(afterId);
      if (!page.length) break;
      for (const { id } of page) {
        try {
          const result = await this.ratings.processRatedMatch(id);
          if (result.outcome === "processed") summary.ratingsRepaired++;
        }
        catch (error) {
          // Rating repair is independent of live-room recovery. Preserve FINISHED on failure.
          summary.ratingFailures++;
          logger.error({ event: "match:rating_repair_failed", matchId: id,
            code: error instanceof RatingError || error instanceof Glicko2Error ? error.code : "RATING_STORAGE_UNAVAILABLE" },
          "Finished match rating repair failed");
        }
      }
      afterId = page[page.length - 1].id;
    }
    summary.durationMs = Date.now() - started;
    logger.info({ event: "match:recovery_summary", ...summary }, "Startup match recovery completed");
    return summary;
  }

  private participants(match: RecoveryMatch) {
    if (match.participants.length !== 2 || new Set(match.participants.map(p => p.seat)).size !== 2)
      throw new MatchRecoveryError("MISSING_PARTICIPANTS");
    const identity = (seat: "P1" | "P2") => {
      const p = match.participants.find(p => p.seat === seat);
      if (!p?.userId) throw new MatchRecoveryError("GUEST_RECLAIM_UNAVAILABLE");
      return { userId: p.userId, username: p.displayNameSnapshot, displayName: p.displayNameSnapshot };
    };
    const participants = { P1: identity("P1"), P2: identity("P2") };
    if (participants.P1.userId === participants.P2.userId)
      throw new MatchRecoveryError("INVALID_PARTICIPANTS");
    return participants;
  }
}

/** There is no currentRevision/watermark. The ordered journal must prove every accepted revision.
 * Check the entire durable log, even history hidden behind a checkpoint, without truncating gaps. */
export function durableRecoveryFrontier(match: RecoveryMatch, rows: MatchAction[], snapshotRevision: number): number {
  if (!Number.isSafeInteger(snapshotRevision) || snapshotRevision < 0)
    throw new MatchRecoveryError("DURABLE_REVISION_CONFLICT");
  let target = 0;
  let started = false;
  for (const row of rows) {
    if (row.matchId !== match.id || row.revision !== target + 1)
      throw new MatchRecoveryError("ACTION_LOG_GAP");
    deserializeReplayAction(row);
    if (row.actionType === "startGame") started = true;
    if (started && row.actorUserId && (!row.actorSeat ||
      match.participants.find(p => p.seat === row.actorSeat)?.userId !== row.actorUserId))
      throw new MatchRecoveryError("ACTION_ACTOR_MISMATCH");
    target = row.revision;
  }
  if (snapshotRevision > target || (match.finalRevision !== null && match.finalRevision !== target))
    throw new MatchRecoveryError("DURABLE_REVISION_CONFLICT");
  return target;
}
