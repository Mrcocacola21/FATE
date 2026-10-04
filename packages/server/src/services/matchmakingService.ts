import { randomInt, randomUUID } from "node:crypto";
import { isGameModeId, type GameModeId } from "rules";
import {
  MultiplayerIdentityError,
  identityDisplayName,
  type ConnectionIdentity,
} from "../auth/connectionIdentity";
import {
  getAllowedRatingRange,
  readMatchmakingConfig,
  type MatchmakingConfig,
} from "../matchmaking/config";
import type {
  MatchmakingEntry,
  MatchmakingEvent,
  MatchmakingStatus,
  MatchFound,
  PairAttempt,
} from "../matchmaking/types";
import { PairCreationRolledBack } from "../matchmaking/errors";

export interface MatchmakingDependencies {
  loadPlayer(
    userId: string,
    gameMode: GameModeId,
  ): Promise<{ rating: number; ratingDeviation: number }>;
  hasPersistentActiveMatch(userId: string): Promise<boolean>;
  hasRuntimeMatch(userId: string, exceptRoomId?: string): boolean;
  createPair(attempt: PairAttempt): Promise<{ matchId: string; roomId: string }>;
  resultIsUsable(result: MatchFound, userId: string): boolean;
  logger: { info(data: object, message: string): void; error(data: object, message: string): void };
}
/** One instance per active server process. All claims and competitor guards precede awaits. */
export class MatchmakingService {
  private readonly entries = new Map<string, MatchmakingEntry>();
  private readonly found = new Map<string, MatchFound>();
  private readonly deliveries = new Map<string, Map<string, (event: MatchmakingEvent) => void>>();
  private readonly joining = new Map<string, Promise<MatchmakingStatus>>();
  private readonly competitorLocks = new Set<string>();
  private readonly attempts = new Map<string, PairAttempt>();
  private revision = 0;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private closing = false;
  constructor(
    private readonly deps: MatchmakingDependencies,
    readonly config: MatchmakingConfig = readMatchmakingConfig(),
    private readonly now = Date.now,
    private readonly swapSeats = () => randomInt(2) === 1,
    private readonly schedule: (run: () => void) => void = queueMicrotask,
  ) {}

  start(): void {
    if (this.timer || this.closing) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.tickMs);
    this.timer.unref();
  }
  async close(): Promise<void> {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
    await Promise.allSettled(this.joining.values());
    this.entries.clear();
    this.found.clear();
    this.deliveries.clear();
    this.attempts.clear();
  }
  connect(
    identity: ConnectionIdentity,
    connectionId: string,
    deliver: (event: MatchmakingEvent) => void,
  ): void {
    let routes = this.deliveries.get(identity.userId);
    if (!routes) this.deliveries.set(identity.userId, (routes = new Map()));
    routes.set(connectionId, deliver);
    const entry = this.entries.get(identity.userId);
    if (entry) delete entry.disconnectedAt;
    this.publish(identity.userId);
  }
  disconnect(userId: string, connectionId: string): void {
    const routes = this.deliveries.get(userId);
    routes?.delete(connectionId);
    if (routes?.size === 0) this.deliveries.delete(userId);
    const entry = this.entries.get(userId);
    if (entry && !this.available(userId)) entry.disconnectedAt ??= this.now();
  }
  private available(userId: string): boolean {
    return !!this.deliveries.get(userId)?.size;
  }
  getSnapshot(userId: string): MatchmakingStatus & { revision: number } {
    return { ...this.getStatus(userId), revision: this.revision };
  }
  getStatus(userId: string): MatchmakingStatus {
    const result = this.found.get(userId);
    if (result) {
      if (this.deps.resultIsUsable(result, userId)) return result;
      this.found.delete(userId);
      // Every tab must return to the idle search state when the normal room ends.
      // Removal precedes publish, so its status read cannot recurse into this branch.
      this.publish(userId);
    }
    const entry = this.entries.get(userId);
    if (!entry) return { status: "NOT_QUEUED" };
    const waitMs = Math.max(0, this.now() - entry.joinedAt);
    return {
      status: entry.state,
      joinedAt: new Date(entry.joinedAt).toISOString(),
      waitMs,
      rating: entry.rating,
      currentRange: getAllowedRatingRange(waitMs, this.config),
      gameMode: entry.gameMode,
      available: this.available(userId),
    };
  }
  join(identity: ConnectionIdentity, gameMode: GameModeId): Promise<MatchmakingStatus> {
    if (!identity?.userId)
      return Promise.reject(this.error("AUTH_REQUIRED", "Sign in to find a Rated match"));
    if (!isGameModeId(gameMode))
      return Promise.reject(
        this.error("MATCHMAKING_INVALID_GAME_MODE", "Choose a valid game mode"),
      );
    const pending = this.joining.get(identity.userId);
    if (pending) return pending;
    const existing = this.getStatus(identity.userId);
    if (existing.status !== "NOT_QUEUED") return Promise.resolve(existing);
    const work = this.enqueue(identity, gameMode);
    this.joining.set(identity.userId, work);
    void work
      .finally(() => {
        if (this.joining.get(identity.userId) === work) {
          this.joining.delete(identity.userId);
          this.competitorLocks.delete(`cancel:${identity.userId}`);
        }
      })
      .catch(() => undefined);
    return work;
  }
  private async enqueue(
    identity: ConnectionIdentity,
    gameMode: GameModeId,
  ): Promise<MatchmakingStatus> {
    const id = identity.userId;
    this.assertEligible(id);
    const [rating, active] = await Promise.all([
      this.deps.loadPlayer(id, gameMode),
      this.deps.hasPersistentActiveMatch(id),
    ]);
    this.assertEligible(id);
    if (active)
      throw this.error("MATCHMAKING_ALREADY_IN_MATCH", "Leave your active match before searching");
    if (!this.available(id))
      throw this.error("MATCHMAKING_CONNECTION_REQUIRED", "Reconnect before searching");
    this.entries.set(id, { identity, gameMode, ...rating, joinedAt: this.now(), state: "QUEUED" });
    this.deps.logger.info(
      { event: "matchmaking:join", userId: id, gameMode },
      "User entered Rated queue",
    );
    this.publish(id);
    // Event-driven matching is scheduled after the idempotent join has settled.
    this.schedule(() => {
      void this.tick();
    });
    return this.getStatus(id);
  }
  cancel(userId: string): MatchmakingStatus {
    const entry = this.entries.get(userId);
    // Pending joins are rejected when their awaited eligibility reads complete.
    if (this.joining.has(userId)) this.competitorLocks.add(`cancel:${userId}`);
    if (entry?.state === "MATCHING") return this.getStatus(userId);
    if (entry) {
      this.entries.delete(userId);
      this.deps.logger.info({ event: "matchmaking:cancel", userId }, "User left Rated queue");
    }
    this.publish(userId);
    return this.getStatus(userId);
  }
  async withCompetitor<T>(
    userId: string | undefined,
    roomId: string | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    if (!userId) return action();
    if (this.entries.has(userId) || this.joining.has(userId))
      throw this.error("MATCHMAKING_IN_QUEUE", "Cancel your search before entering another match");
    if (this.competitorLocks.has(userId) || this.deps.hasRuntimeMatch(userId, roomId))
      throw this.error("MATCHMAKING_ALREADY_IN_MATCH", "You already occupy a player seat");
    this.competitorLocks.add(userId);
    try {
      return await action();
    } finally {
      this.competitorLocks.delete(userId);
    }
  }
  private assertEligible(id: string): void {
    if (this.competitorLocks.delete(`cancel:${id}`))
      throw this.error("MATCHMAKING_CANCELLED", "Search cancelled");
    if (this.closing) throw this.error("MATCHMAKING_UNAVAILABLE", "Matchmaking is shutting down");
    if (this.competitorLocks.has(id) || this.deps.hasRuntimeMatch(id))
      throw this.error("MATCHMAKING_ALREADY_IN_MATCH", "Leave your active match before searching");
  }
  tick(): Promise<void> {
    if (this.closing) return Promise.resolve();
    if (this.running) return this.running;
    const work = this.runPass();
    this.running = work;
    void work
      .finally(() => {
        if (this.running === work) this.running = undefined;
      })
      .catch(() => undefined);
    return work;
  }
  private async runPass(): Promise<void> {
    const now = this.now();
    for (const [id, entry] of this.entries) {
      if (
        entry.state === "QUEUED" &&
        entry.disconnectedAt !== undefined &&
        now - entry.disconnectedAt >= this.config.disconnectGraceMs
      ) {
        this.entries.delete(id);
        this.publish(id);
        this.deps.logger.info(
          { event: "matchmaking:cancel", userId: id, reason: "disconnect_grace_expired" },
          "Disconnected search expired",
        );
      }
    }
    const byAge = (a: MatchmakingEntry, b: MatchmakingEntry) =>
      a.joinedAt - b.joinedAt || a.identity.userId.localeCompare(b.identity.userId);
    const queue = [...this.entries.values()]
      .filter((e) => e.state === "QUEUED" && this.available(e.identity.userId))
      .sort(byAge);
    // Synchronously claim every pair before the first asynchronous database call.
    for (const a of queue) {
      if (a.state !== "QUEUED") continue;
      const range = (e: MatchmakingEntry) => getAllowedRatingRange(now - e.joinedAt, this.config);
      let b: MatchmakingEntry | undefined;
      for (const candidate of queue) {
        if (
          candidate === a ||
          candidate.state !== "QUEUED" ||
          candidate.gameMode !== a.gameMode ||
          Math.abs(candidate.rating - a.rating) > Math.min(range(a), range(candidate))
        )
          continue;
        if (
          !b ||
          Math.abs(candidate.rating - a.rating) < Math.abs(b.rating - a.rating) ||
          (Math.abs(candidate.rating - a.rating) === Math.abs(b.rating - a.rating) &&
            byAge(candidate, b) < 0)
        )
          b = candidate;
      }
      if (!b) continue;
      a.state = b.state = "MATCHING";
      const players = this.swapSeats() ? { P1: b, P2: a } : { P1: a, P2: b };
      const attempt = { roomId: randomUUID(), players, retryAt: now };
      this.attempts.set(attempt.roomId, attempt);
      this.deps.logger.info(
        {
          event: "matchmaking:claim",
          userId: a.identity.userId,
          opponentUserId: b.identity.userId,
          gameMode: a.gameMode,
          ratingDifference: Math.abs(a.rating - b.rating),
          waitMs: now - a.joinedAt,
          opponentWaitMs: now - b.joinedAt,
          allowedRange: Math.min(range(a), range(b)),
          roomId: attempt.roomId,
        },
        "Rated pair claimed",
      );
    }
    for (const id of this.entries.keys()) this.publish(id);
    await Promise.all(
      [...this.attempts.values()]
        .filter((a) => a.retryAt <= now)
        .map(async (attempt) => {
          try {
            const created = await this.deps.createPair(attempt);
            for (const seat of ["P1", "P2"] as const) {
              const entry = attempt.players[seat];
              const id = entry.identity.userId;
              this.entries.delete(id);
              this.found.set(id, {
                status: "MATCH_FOUND",
                ...created,
                seat,
                gameMode: entry.gameMode,
                matchType: "RATED",
                opponent: {
                  displayName: identityDisplayName(
                    attempt.players[seat === "P1" ? "P2" : "P1"].identity,
                  ),
                },
              });
            }
            this.attempts.delete(attempt.roomId);
            this.deps.logger.info({ event: "matchmaking:found", ...created }, "Rated match ready");
            for (const entry of Object.values(attempt.players)) this.publish(entry.identity.userId);
          } catch (error) {
            if (error instanceof PairCreationRolledBack) {
              this.attempts.delete(attempt.roomId);
              for (const entry of Object.values(attempt.players)) {
                entry.state = "QUEUED";
                this.publish(entry.identity.userId);
              }
            }
            // A transport failure may follow a committed INSERT. Keep the claim and retry
            // the SAME room ID/seed/participants. Never offer either user to another pair.
            attempt.retryAt = this.now() + this.config.tickMs;
            this.deps.logger.error(
              {
                event: "matchmaking:create_failed",
                roomId: attempt.roomId,
                recovery: error instanceof PairCreationRolledBack ? "requeued" : "same_pair_retry",
              },
              "Match creation will retry without losing waiting priority",
            );
          }
        }),
    );
    for (const id of this.found.keys()) this.getStatus(id);
  }
  private publish(userId: string): void {
    const status = this.getStatus(userId);
    const event: MatchmakingEvent = {
      type: status.status === "MATCH_FOUND" ? "matchmakingFound" : "matchmakingStatus",
      revision: ++this.revision,
      status,
    };
    for (const deliver of this.deliveries.get(userId)?.values() ?? []) {
      try {
        deliver(event);
      } catch {
        /* Delivery failure cannot roll back a durable pair. */
      }
    }
  }
  private error(code: string, message: string) {
    return new MultiplayerIdentityError(code, message);
  }
}
