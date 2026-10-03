import { Prisma, type PrismaClient, type MatchAction } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import { getDatabaseClient } from "../db/client";
import type { AcceptedActionRecord } from "../persistence/acceptedAction";

export class MatchActionConflict extends Error {
  readonly code = "MATCH_ACTION_CONFLICT";
  constructor() { super("MATCH_ACTION_CONFLICT"); }
}

export class MatchActionRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  /** Never read payloads/events just to build the public replay timeline. */
  async findReplayTimeline(matchId: string) {
    return this.database.matchAction.findMany({
      where: { matchId }, orderBy: { revision: "asc" },
      select: { revision: true, actorSeat: true, actionType: true, createdAt: true },
    });
  }

  async findReplayAction(matchId: string, revision: number) {
    return this.database.matchAction.findUnique({
      where: { matchId_revision: { matchId, revision } },
      select: { revision: true, actorSeat: true, actionType: true, createdAt: true },
    });
  }

  async appendAcceptedAction(input: AcceptedActionRecord): Promise<void> {
    try {
      await this.database.matchAction.create({ data: input });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const canonical = await this.database.matchAction.findUnique({
        where: { matchId_revision: { matchId: input.matchId, revision: input.revision } },
      });
      // Time and generated row id are informational. Never overwrite canonical data.
      if (!canonical || canonical.actorUserId !== input.actorUserId || canonical.actorSeat !== input.actorSeat ||
          canonical.actionType !== input.actionType || !isDeepStrictEqual(canonical.actionPayload, input.actionPayload) ||
          !isDeepStrictEqual(canonical.events, input.events)) throw new MatchActionConflict();
    }
  }

  findByMatchIdOrdered(matchId: string, revisionAfter = 0, limit = 100): Promise<MatchAction[]> {
    return this.database.matchAction.findMany({
      where: { matchId, revision: { gt: revisionAfter } }, orderBy: { revision: "asc" }, take: limit,
    });
  }

  findInRevisionRange(matchId: string, baseRevision: number, targetRevision: number): Promise<MatchAction[]> {
    return this.database.matchAction.findMany({
      where: { matchId, revision: { gt: baseRevision, lte: targetRevision } },
      orderBy: { revision: "asc" },
    });
  }
}
