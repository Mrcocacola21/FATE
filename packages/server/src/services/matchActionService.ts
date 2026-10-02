import type { MatchAction, Prisma } from "@prisma/client";
import type { MatchRepository } from "../repositories/matchRepository";
import type { MatchActionRepository } from "../repositories/matchActionRepository";
import { MatchResultError } from "../persistence/matchResult";

function safeEvents(value: Prisma.JsonValue | null): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  // Player-neutral allowlist: hidden positions, targets, choices and private rolls
  // remain in the canonical journal, even after the match has finished.
  const fields: Record<string, string[]> = {
    turnStarted: ["player", "turnNumber"], roundStarted: ["roundNumber"],
    gameEnded: ["winner", "winnerPlayerId", "loserPlayerId", "reason"], gameDraw: ["reason"],
    battleStarted: [],
  };
  return value.flatMap((event) => {
    if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.type !== "string" || !Object.prototype.hasOwnProperty.call(fields, event.type)) return [];
    const dto: Record<string, unknown> = { type: event.type };
    for (const field of fields[event.type]) {
      const item = event[field];
      if (typeof item === "number" || typeof item === "string" || typeof item === "boolean") dto[field] = item;
    }
    return [dto];
  });
}

export function toActionHistoryDto(row: MatchAction, displayName: string | null) {
  return {
    revision: row.revision,
    actor: { seat: row.actorSeat, userId: row.actorUserId, displayName },
    type: row.actionType,
    // No state exists here to safely resolve historical visibility. Fail closed.
    payload: { type: row.actionType },
    events: safeEvents(row.events),
    createdAt: row.createdAt.toISOString(),
  };
}

export class MatchActionService {
  constructor(
    private readonly matches: Pick<MatchRepository, "findByIdWithParticipants">,
    private readonly actions: Pick<MatchActionRepository, "findByMatchIdOrdered">,
  ) {}

  async getCompletedMatchActionHistory(matchId: string, revisionAfter = 0, limit = 100) {
    const match = await this.matches.findByIdWithParticipants(matchId);
    if (!match) throw new MatchResultError("MATCH_NOT_FOUND", 404);
    if (match.status !== "FINISHED") throw new MatchResultError("MATCH_NOT_FINISHED", 409);
    const rows = await this.actions.findByMatchIdOrdered(matchId, revisionAfter, limit + 1);
    const page = rows.slice(0, limit);
    return {
      matchId,
      actions: page.map((row) => toActionHistoryDto(row,
        match.participants.find((p) => p.seat === row.actorSeat)?.displayNameSnapshot ?? null)),
      nextRevisionAfter: rows.length > limit ? page[page.length - 1].revision : null,
    };
  }
}
