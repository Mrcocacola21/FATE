import { matchTypeFromRated, type MatchType } from "../matches/matchType";
import { AuthError } from "../auth/authErrors";
import type { MatchHistoryQuery } from "../matches/historySchema";
import type { HistoryMatch, MatchHistoryRepository } from "../repositories/matchHistoryRepository";

export interface MatchHistoryItemDTO {
  id: string;
  status: "FINISHED";
  matchType: MatchType;
  result: "WIN" | "LOSS" | "DRAW" | null;
  seat: "P1" | "P2";
  gameMode: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  finishReason: string | null;
  finalRevision: number | null;
  turnCount: number | null;
  opponent: {
    userId: string | null;
    seat: "P1" | "P2";
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
  } | null;
}

export function toMatchHistoryItem(match: HistoryMatch, userId: string): MatchHistoryItemDTO {
  const participant = match.participants.find((p) => p.userId === userId);
  if (!participant || match.status !== "FINISHED") throw new Error("Invalid history record");
  const opponent = match.participants.find(
    (p) => p.seat !== participant.seat && p.userId !== userId,
  );
  return {
    id: match.id,
    status: "FINISHED",
    result: participant.outcome,
    seat: participant.seat,
    gameMode: match.gameMode,
    matchType: matchTypeFromRated(match.isRated),
    createdAt: match.createdAt.toISOString(),
    startedAt: match.startedAt?.toISOString() ?? null,
    finishedAt: match.finishedAt?.toISOString() ?? null,
    durationMs: match.durationMs,
    finishReason: match.finishReason,
    finalRevision: match.finalRevision,
    turnCount: match.turnCount,
    opponent: opponent
      ? {
          userId: opponent.userId,
          seat: opponent.seat,
          displayName: opponent.displayNameSnapshot,
          username: opponent.user?.profile?.username ?? null,
          avatarUrl: opponent.user?.profile?.avatarUrl ?? null,
        }
      : null,
  };
}

export class MatchHistoryService {
  constructor(
    private readonly history: Pick<MatchHistoryRepository, "userExists" | "findUserHistory">,
  ) {}

  async getUserMatchHistory(userId: string, query: MatchHistoryQuery) {
    if (!(await this.history.userExists(userId))) throw new AuthError("USER_NOT_FOUND");
    const { total, items } = await this.history.findUserHistory(userId, query);
    return {
      items: items.map((match) => toMatchHistoryItem(match, userId)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
