import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { MatchResultError } from "../persistence/matchResult";
import { buildServer } from "../index";
import { ConnectionIdentityService } from "../auth/connectionIdentity";
import { TokenService } from "../auth/tokens";
import type { UserWithProfile } from "../repositories/userRepository";
import type { AcceptedActionRecord } from "../persistence/acceptedAction";
import { MatchActionConflict } from "../repositories/matchActionRepository";
import { MatchSnapshotError, type SerializedMatchSnapshot } from "../persistence/matchSnapshot";

export const testTokens = new TokenService({
  accessSecret: "phase6-test-access-secret-01234567890123456789",
  refreshSecret: "phase6-test-refresh-secret-01234567890123456789",
  accessTtlSeconds: 900, refreshTtlSeconds: 3600,
});
export const testUserIds = { P1: randomUUID(), P2: randomUUID() };
const testProfiles = new Map<string, { username: string; displayName: string | null }>();
export function testAccessToken(seat: "P1" | "P2", name: string = seat): string {
  testProfiles.set(testUserIds[seat], { username: name, displayName: null });
  return testTokens.signAccessToken(testUserIds[seat]);
}
export function testIdentityService() {
  return new ConnectionIdentityService(testTokens, {
    findAccountById: async (id) => {
      const profile = testProfiles.get(id);
      return profile ? { id, profile } as UserWithProfile : null;
    },
  });
}
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
  readonly snapshots = new Map<string, SerializedMatchSnapshot>();
  async appendMatchSnapshot(snapshot: SerializedMatchSnapshot): Promise<void> {
    this.called("snapshot");
    const key = `${snapshot.matchId}:${snapshot.revision}`;
    const previous = this.snapshots.get(key);
    if (previous && !isDeepStrictEqual(previous, snapshot)) throw new MatchSnapshotError("MATCH_SNAPSHOT_CONFLICT");
    if (!previous) this.snapshots.set(key, snapshot);
  }
  readonly actions = new Map<string, AcceptedActionRecord>();
  async appendAcceptedAction(record: AcceptedActionRecord): Promise<void> {
    const key = `${record.matchId}:${record.revision}`;
    const previous = this.actions.get(key);
    if (previous && !isDeepStrictEqual({ ...previous, createdAt: null }, { ...record, createdAt: null })) throw new MatchActionConflict();
    if (!previous) this.actions.set(key, record);
  }
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
  async removeWaitingParticipant(id: string, seat: "P1" | "P2"): Promise<void> {
    this.called("removeParticipant");
    const match = this.get(id);
    if (match.status === "WAITING") match.participants.delete(seat);
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
  async finalizeMatch(id: string, input: FinishedMatchInput): Promise<void> {
    this.called("finish");
    const match = this.get(id);
    if (match.status === "FINISHED") {
      const previous = { ...match.result, finishedAt: undefined };
      if (!isDeepStrictEqual(previous, { ...input, finishedAt: undefined })) throw new MatchResultError("MATCH_RESULT_CONFLICT");
      return;
    }
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
  return buildServer({ matchPersistence: new MemoryMatchPersistence(), connectionIdentity: testIdentityService() });
}
