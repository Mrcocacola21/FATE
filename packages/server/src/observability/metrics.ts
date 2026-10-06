import { Counter, Gauge, Histogram, Registry } from "prom-client";
import { performance } from "node:perf_hooks";

export type OperationResult = "success" | "rejected" | "error";
const fastBuckets = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5];
const slowBuckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30];

/** Each runtime has an explicit registry; never use prom-client's global registry. */
export class ApplicationMetrics {
  readonly registry = new Registry();
  private readonly sockets = new Set<object>();
  private readonly lifecycleSeen = new WeakMap<object, Set<string>>();
  private roomCount = () => 0;
  private readonly lifecycleCounters = Object.fromEntries(
    ["created", "started", "finished", "cancelled", "interrupted"].map(event => [event,
      new Counter({ name: `fate_matches_${event}_total`, help: `Match ${event} transitions observed since boot`, registers: [this.registry] }),
    ]),
  );
  private readonly command = new Histogram({ name: "fate_game_command_duration_seconds", help: "Parsed WS command through response/broadcast decision, including queues",
    labelNames: ["command", "result"] as const, buckets: fastBuckets, registers: [this.registry] });
  private readonly replay = new Histogram({ name: "fate_replay_reconstruction_duration_seconds", help: "Reconstruction including durable reads",
    labelNames: ["source", "result"] as const, buckets: slowBuckets, registers: [this.registry] });
  private readonly database = new Histogram({ name: "fate_db_operation_duration_seconds", help: "Prisma operation or readiness deadline duration",
    labelNames: ["operation", "result"] as const, buckets: fastBuckets, registers: [this.registry] });
  private readonly databaseErrors = new Counter({ name: "fate_db_errors_total", help: "Unexpected database operation failures (unique conflicts excluded)",
    labelNames: ["operation", "category"] as const, registers: [this.registry] });
  private readonly recovery = new Histogram({ name: "fate_match_recovery_duration_seconds", help: "Per candidate recovery duration",
    labelNames: ["result"] as const, buckets: slowBuckets, registers: [this.registry] });
  private readonly recoveryCount = new Counter({ name: "fate_match_recovery_total", help: "Recovery candidate outcomes",
    labelNames: ["result"] as const, registers: [this.registry] });
  private readonly startup = new Histogram({ name: "fate_startup_recovery_duration_seconds", help: "Recovery coordinator duration",
    labelNames: ["result"] as const, buckets: slowBuckets, registers: [this.registry] });

  constructor() {
    const roomCount = () => this.roomCount();
    const socketCount = () => this.sockets.size;
    new Gauge({ name: "fate_active_rooms", help: "Registered runtime GameRooms (including retained ended rooms)", registers: [this.registry],
      collect() { this.set(roomCount()); } });
    new Gauge({ name: "fate_active_websocket_connections", help: "Open accepted sockets, including spectators and connections without a room", registers: [this.registry],
      collect() { this.set(socketCount()); } });
  }
  setRoomCollector(collect: () => number) { this.roomCount = collect; }
  socketOpened(socket: object) { this.sockets.add(socket); }
  socketClosed(socket: object) { this.sockets.delete(socket); }
  /** Object ownership avoids an unbounded historical set of match IDs. */
  matchTransition(owner: object, event: "created" | "started" | "finished" | "cancelled" | "interrupted") {
    let seen = this.lifecycleSeen.get(owner);
    if (!seen) this.lifecycleSeen.set(owner, seen = new Set());
    if (seen.has(event)) return;
    seen.add(event);
    this.lifecycleCounters[event].inc();
  }
  observeCommand(command: string, allowed: ReadonlySet<string>, result: OperationResult, seconds: number) {
    this.command.observe({ command: allowed.has(command) ? command : "UNKNOWN", result }, seconds);
  }
  observeReplay(source: "initial_state" | "snapshot_tail" | "unknown", result: "success" | "error", seconds: number) {
    this.replay.observe({ source, result }, seconds);
  }
  observeRecovery(result: "recovered" | "finalized" | "skipped" | "unrecoverable" | "error", seconds: number) {
    this.recovery.observe({ result }, seconds); this.recoveryCount.inc({ result });
  }
  observeStartupRecovery(result: "success" | "error", seconds: number) { this.startup.observe({ result }, seconds); }
  observeDatabase(operation: "query" | "readiness_probe", result: "success" | "error", seconds: number, error?: unknown) {
    this.database.observe({ operation, result }, seconds);
    if (result === "error" && databaseErrorCode(error) !== "P2002")
      this.databaseErrors.inc({ operation, category: databaseErrorCategory(error) });
  }
}

function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("errorCode" in error && typeof error.errorCode === "string") return error.errorCode;
  return undefined;
}
export function databaseErrorCategory(error: unknown) {
  const code = databaseErrorCode(error);
  if (["P1002", "P1008", "P2024", "READINESS_TIMEOUT"].includes(code ?? "")) return "timeout";
  if (["P1000", "P1001", "P1017"].includes(code ?? "")) return "connection";
  if (["P2002", "P2003", "P2011"].includes(code ?? "")) return "constraint";
  if (["P2028", "P2034"].includes(code ?? "")) return "transaction";
  return "unknown";
}
export async function measureDatabase<T>(run: () => Promise<T>, metrics = applicationMetrics): Promise<T> {
  const started = performance.now();
  try {
    const value = await run();
    metrics.observeDatabase("query", "success", elapsedSeconds(started));
    return value;
  } catch (error) {
    metrics.observeDatabase("query", "error", elapsedSeconds(started), error);
    throw error;
  }
}
export const elapsedSeconds = (started: number) => Math.max(0, (performance.now() - started) / 1000);
export const applicationMetrics = new ApplicationMetrics();
