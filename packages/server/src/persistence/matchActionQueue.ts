import { Prisma } from "@prisma/client";
import type { AcceptedActionRecord } from "./acceptedAction";
import { MatchActionConflict } from "../repositories/matchActionRepository";
import { MatchSnapshotError, type SerializedMatchSnapshot } from "./matchSnapshot";

type Logger = { error(data: object, message: string): void };
export interface ActionWriter {
  appendAcceptedAction(record: AcceptedActionRecord): Promise<void>;
  appendMatchSnapshot?(snapshot: SerializedMatchSnapshot): Promise<void>;
}

function retryable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P1001", "P1002", "P1008", "P1017", "P2024", "P2034"].includes(error.code) ||
    error instanceof Prisma.PrismaClientInitializationError &&
    ["P1001", "P1002", "P1017"].includes(error.errorCode ?? "");
}

/** Independent, tracked match chains: action N -> snapshot N -> later writes/result.
 * A failed action or checkpoint stops subsequent writes and finalization. */
export class MatchActionQueue {
  private readonly chains = new Map<string, Promise<void>>();
  private readonly pending = new Map<string, number>();
  private readonly failures = new Map<string, string>();
  constructor(
    private readonly writer: ActionWriter,
    private readonly logger: Logger,
    private readonly options: { maxPending?: number; backoffMs?: number; drainTimeoutMs?: number } = {},
  ) {}

  get pendingCount(): number { return [...this.pending.values()].reduce((sum, count) => sum + count, 0); }
  get activeMatches(): number { return this.chains.size; }
  hasPending(matchId: string): boolean { return this.pending.has(matchId); }
  failed(matchId: string): boolean { return this.failures.has(matchId); }

  fail(matchId: string, code: string, context: object = {}): void {
    if (this.failures.has(matchId)) return;
    this.failures.set(matchId, code);
    this.logger.error({ event: code.startsWith("MATCH_SNAPSHOT") ? "match:snapshot_persistence_failed" : "match:action_persistence_failed", matchId, errorCode: code, ...context },
      "Match persistence incomplete; runtime preserved, result finalization blocked");
  }

  enqueue(record: AcceptedActionRecord, roomId: string): void {
    this.enqueueWrite(record.matchId, () => this.writer.appendAcceptedAction(record), "action", {
      roomId, revision: record.revision, actionType: record.actionType, seat: record.actorSeat,
    });
  }

  enqueueSnapshot(snapshot: SerializedMatchSnapshot, roomId: string): void {
    this.enqueueWrite(snapshot.matchId, () => {
      if (!this.writer.appendMatchSnapshot) throw new MatchSnapshotError("MATCH_SNAPSHOT_INVALID");
      return this.writer.appendMatchSnapshot(snapshot);
    }, "snapshot", { roomId, revision: snapshot.revision, formatVersion: snapshot.formatVersion });
  }

  private enqueueWrite(id: string, write: () => Promise<void>, operation: "action" | "snapshot", details: object): void {
    if (this.failed(id)) return;
    const context = { ...details, operation };
    if ((this.pending.get(id) ?? 0) >= (this.options.maxPending ?? 10000)) {
      this.fail(id, "MATCH_ACTION_QUEUE_FULL", context);
      return;
    }
    this.pending.set(id, (this.pending.get(id) ?? 0) + 1);
    const run = (this.chains.get(id) ?? Promise.resolve()).then(async () => {
      if (this.failed(id)) return;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try { await write(); return; }
        catch (error) {
          if (attempt < 3 && retryable(error)) {
            await new Promise((resolve) => setTimeout(resolve, (this.options.backoffMs ?? 50) * attempt));
            continue;
          }
          this.fail(id, error instanceof MatchActionConflict || error instanceof MatchSnapshotError ? error.code :
            operation === "snapshot" ? "MATCH_SNAPSHOT_WRITE_FAILED" : "MATCH_ACTION_WRITE_FAILED", context);
          return;
        }
      }
    }).catch(() => this.fail(id, operation === "snapshot" ? "MATCH_SNAPSHOT_WRITE_FAILED" : "MATCH_ACTION_WRITE_FAILED", context));
    this.chains.set(id, run);
    void run.then(() => {
      const count = (this.pending.get(id) ?? 1) - 1;
      if (count) this.pending.set(id, count); else this.pending.delete(id);
      if (this.chains.get(id) === run) this.chains.delete(id);
    });
  }

  async drain(matchId?: string): Promise<boolean> {
    const work = matchId ? [this.chains.get(matchId)] : [...this.chains.values()];
    let timer: NodeJS.Timeout | undefined;
    const completed = await Promise.race([
      Promise.all(work).then(() => true),
      new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), this.options.drainTimeoutMs ?? 5000); }),
    ]);
    if (timer) clearTimeout(timer);
    if (!completed) this.logger.error({ event: "match:action_drain_timeout", matchId, pending: this.pendingCount },
      "Match persistence drain timed out; writes remain tracked");
    return completed && (matchId ? !this.failed(matchId) : this.failures.size === 0);
  }

  release(matchId: string): void {
    const release = () => this.failures.delete(matchId);
    const chain = this.chains.get(matchId);
    if (chain) void chain.then(release); else release();
  }
}
