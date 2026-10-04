import type { Match, MatchAction, MatchParticipant, PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";

export type RecoveryMatch = Match & { participants: MatchParticipant[] };

/** Startup-only reads and neutral lifecycle transitions. Never deletes historical data. */
export class MatchRecoveryRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  findCandidates(afterId?: string): Promise<RecoveryMatch[]> {
    return this.database.match.findMany({
      where: { status: { in: ["IN_PROGRESS", "WAITING"] }, ...(afterId ? { id: { gt: afterId } } : {}) },
      include: { participants: true }, orderBy: { id: "asc" }, take: 100,
    });
  }

  async loadDurableHistory(matchId: string): Promise<MatchAction[]> {
    const rows: MatchAction[] = [];
    let revision: number | undefined;
    for (;;) {
      const page = await this.database.matchAction.findMany({
        where: { matchId, ...(revision === undefined ? {} : { revision: { gt: revision } }) },
        orderBy: { revision: "asc" }, take: 1000,
      });
      rows.push(...page);
      if (page.length < 1000) return rows;
      revision = page[page.length - 1].revision;
    }
  }

  async latestSnapshotRevision(matchId: string): Promise<number> {
    const row = await this.database.matchSnapshot.findFirst({
      where: { matchId }, orderBy: { revision: "desc" }, select: { revision: true },
    });
    return row?.revision ?? 0;
  }

  async interrupt(matchId: string, reason: string): Promise<void> {
    await this.database.match.updateMany({
      where: { id: matchId, status: { in: ["IN_PROGRESS", "WAITING"] } },
      data: { status: "CANCELLED", finishedAt: new Date(), finishReason: reason },
    });
  }

  findUnprocessedRatings(afterId?: string): Promise<{ id: string }[]> {
    return this.database.match.findMany({
      where: { status: "FINISHED", isRated: true, ratingProcessedAt: null,
        ...(afterId ? { id: { gt: afterId } } : {}) },
      select: { id: true }, orderBy: { id: "asc" }, take: 100,
    });
  }

  async isInterruptedRoom(roomId: string): Promise<boolean> {
    const row = await this.database.match.findUnique({
      where: { roomId }, select: { status: true, finishReason: true },
    });
    return row?.status === "CANCELLED" && !!row.finishReason?.startsWith("SERVER_");
  }
}
