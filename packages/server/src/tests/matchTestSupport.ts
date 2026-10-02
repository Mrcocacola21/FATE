import { randomUUID } from "node:crypto";
import { buildServer } from "../index";
import type {
  MatchPersistence,
  WaitingMatchInput,
  SeatParticipantInput,
  StartedMatchInput,
  FinishedMatchInput,
} from "../services/matchService";

interface TestMatch extends WaitingMatchInput {
  id: string;
  status: "WAITING" | "IN_PROGRESS" | "FINISHED" | "CANCELLED";
  participants: Map<string, SeatParticipantInput>;
  startedAt?: Date;
  result?: FinishedMatchInput;
}

/** Explicit injected fake for database-free runtime regressions; never a production fallback. */
export class MemoryMatchPersistence implements MatchPersistence {
  readonly matches = new Map<string, TestMatch>();
  readonly calls: string[] = [];
  fail = new Set<string>();

  private called(operation: string): void {
    this.calls.push(operation);
    if (this.fail.has(operation)) throw new Error("Simulated persistence failure");
  }
  private get(id: string): TestMatch {
    const match = this.matches.get(id);
    if (!match) throw new Error("Missing match");
    return match;
  }
  async createWaitingMatch(input: WaitingMatchInput) {
    this.called("create");
    const existing = Array.from(this.matches.values()).find(
      (match) => match.roomId === input.roomId,
    );
    if (existing) return { id: existing.id };
    const match: TestMatch = {
      ...input,
      id: randomUUID(),
      status: "WAITING",
      participants: new Map(),
    };
    this.matches.set(match.id, match);
    return { id: match.id };
  }
  async syncParticipant(id: string, input: SeatParticipantInput): Promise<void> {
    this.called("participant");
    const match = this.get(id);
    if (match.status === "WAITING") match.participants.set(input.seat, { ...input });
  }
  async updateWaitingGameMode(id: string, gameMode: string): Promise<void> {
    this.called("mode");
    const match = this.get(id);
    if (match.status === "WAITING") match.gameMode = gameMode;
  }
  async markStarted(id: string, input: StartedMatchInput): Promise<void> {
    this.called("start");
    const match = this.get(id);
    if (match.status === "IN_PROGRESS") return;
    if (match.status !== "WAITING") throw new Error("Invalid transition");
    match.status = "IN_PROGRESS";
    match.startedAt = input.startedAt;
    match.gameMode = input.gameMode;
    match.participants = new Map(input.participants.map((p) => [p.seat, { ...p }]));
  }
  async markFinished(id: string, input: FinishedMatchInput): Promise<void> {
    this.called("finish");
    const match = this.get(id);
    if (match.status === "FINISHED" && match.result?.finalRevision === input.finalRevision) return;
    if (match.status !== "IN_PROGRESS") throw new Error("Invalid transition");
    match.status = "FINISHED";
    match.result = { ...input };
  }
  async markCancelled(id: string): Promise<void> {
    this.called("cancel");
    const match = this.get(id);
    if (match.status === "CANCELLED") return;
    if (match.status !== "WAITING") throw new Error("Invalid transition");
    match.status = "CANCELLED";
  }
}

export function buildTestServer() {
  return buildServer({ matchPersistence: new MemoryMatchPersistence() });
}
