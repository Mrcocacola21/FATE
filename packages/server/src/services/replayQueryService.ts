import { makeReplayView, type ReplayView } from "rules";
import type { MatchActionRepository } from "../repositories/matchActionRepository";
import type { DetailedMatch, MatchRepository } from "../repositories/matchRepository";
import { ReplayService } from "./replayService";
import { ReplayError } from "../replay/replayError";
import { initialConfigSchema } from "../replay/initialState";
import { MatchResultError } from "../persistence/matchResult";

type TimelineRow = Awaited<ReturnType<MatchActionRepository["findReplayTimeline"]>>[number];
export interface ReplayTimelineEntry {
  revision: number;
  actorSeat: "P1" | "P2" | null;
  actionType: string;
  createdAt: string;
}
export interface ReplayStateDTO {
  matchId: string;
  revision: number;
  state: ReplayView;
  action: ReplayTimelineEntry | null;
}
const timelineEntry = (row: TimelineRow): ReplayTimelineEntry => ({
  revision: row.revision,
  actorSeat: row.actorSeat,
  actionType: row.actionType,
  createdAt: row.createdAt.toISOString(),
});

/** Only read capabilities; no rooms, lifecycle or writes. HTTP access is authenticated separately. */
export class ReplayQueryService {
  constructor(
    private readonly matches: Pick<MatchRepository, "findByIdWithParticipants">,
    private readonly actions: Pick<
      MatchActionRepository,
      "findReplayTimeline" | "findReplayAction"
    >,
    private readonly replay: Pick<ReplayService, "reconstructAtRevision"> = new ReplayService(),
  ) {}

  private async loadMatch(id: string): Promise<DetailedMatch & { finalRevision: number }> {
    const match = await this.matches.findByIdWithParticipants(id);
    if (!match) throw new MatchResultError("MATCH_NOT_FOUND", 404);
    if (match.status !== "FINISHED") throw new MatchResultError("MATCH_NOT_FINISHED", 409);
    if (
      !Number.isSafeInteger(match.finalRevision) ||
      !match.finalRevision ||
      match.finalRevision < 1 ||
      match.finalRevision > 2147483647 ||
      !["standard", "classic", "draft"].includes(match.gameMode) ||
      !initialConfigSchema.safeParse(match.initialConfig).success ||
      !Number.isInteger(match.seed) ||
      match.participants.length !== 2 ||
      !["P1", "P2"].every((seat) => match.participants.some((p) => p.seat === seat))
    )
      throw new MatchResultError("MATCH_NOT_REPLAYABLE", 409);
    return { ...match, finalRevision: match.finalRevision };
  }

  async getMetadata(id: string) {
    const match = await this.loadMatch(id);
    const rows = await this.actions.findReplayTimeline(id);
    if (!rows.length) throw new MatchResultError("MATCH_NOT_REPLAYABLE", 409);
    // Phase 11's journal requires contiguous accepted revisions. A gap is corruption,
    // never an invitation to fabricate/clamp history. UI still navigates actual entries.
    if (rows.length !== match.finalRevision || rows.some((row, i) => row.revision !== i + 1))
      throw new ReplayError("REPLAY_ACTION_GAP", { matchId: id });
    return {
      matchId: id,
      status: "FINISHED" as const,
      gameMode: match.gameMode,
      initialRevision: 0,
      finalRevision: match.finalRevision,
      participants: [...match.participants]
        .sort((a, b) => a.seat.localeCompare(b.seat))
        .map((p) => ({
          seat: p.seat,
          userId: p.userId,
          displayName: p.displayNameSnapshot,
          username: p.user?.profile?.username ?? null,
          avatarUrl: p.user?.profile?.avatarUrl ?? null,
          outcome: p.outcome,
        })),
      winnerSeat: match.winnerSeat,
      finishReason: match.finishReason,
      startedAt: match.startedAt?.toISOString() ?? null,
      finishedAt: match.finishedAt?.toISOString() ?? null,
      durationMs: match.durationMs,
      timeline: rows.map(timelineEntry),
    };
  }

  async getState(id: string, revision: number): Promise<ReplayStateDTO> {
    const match = await this.loadMatch(id);
    if (!Number.isSafeInteger(revision) || revision < 0 || revision > match.finalRevision)
      throw new MatchResultError("INVALID_REPLAY_REVISION", 400);
    // A config alone is not a durable replay. Guard even revision zero against
    // legacy/empty/truncated journals with two indexed metadata-only reads.
    const [first, final] = await Promise.all([
      this.actions.findReplayAction(id, 1),
      this.actions.findReplayAction(id, match.finalRevision),
    ]);
    if (!first || !final) throw new MatchResultError("MATCH_NOT_REPLAYABLE", 409);
    const row = revision === 0 ? null : await this.actions.findReplayAction(id, revision);
    if (revision !== 0 && !row) throw new MatchResultError("INVALID_REPLAY_REVISION", 400);
    const reconstructed = await this.replay.reconstructAtRevision(id, revision);
    if (
      revision === match.finalRevision &&
      (reconstructed.state.gameOver?.winnerPlayerId ?? null) !== match.winnerSeat
    )
      throw new ReplayError("REPLAY_FINAL_STATE_MISMATCH", {
        matchId: id,
        targetRevision: revision,
      });
    return {
      matchId: id,
      revision,
      state: makeReplayView(reconstructed.state),
      action: row ? timelineEntry(row) : null,
    };
  }
}
