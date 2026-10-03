import { Prisma, type PrismaClient, type MatchSnapshot } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import { getDatabaseClient } from "../db/client";
import { MatchSnapshotError, type SerializedMatchSnapshot } from "../persistence/matchSnapshot";

export class MatchSnapshotRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  async create(input: SerializedMatchSnapshot): Promise<void> {
    try {
      await this.database.matchSnapshot.create({ data: input });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
        throw error;
      const canonical = await this.findByMatchAndRevision(input.matchId, input.revision);
      // JSONB object key order, generated id and timestamp do not affect equivalence.
      if (
        !canonical ||
        canonical.formatVersion !== input.formatVersion ||
        !isDeepStrictEqual(canonical.state, input.state) ||
        !isDeepStrictEqual(canonical.rngState, input.rngState)
      ) {
        throw new MatchSnapshotError("MATCH_SNAPSHOT_CONFLICT");
      }
    }
  }

  findByMatchAndRevision(matchId: string, revision: number): Promise<MatchSnapshot | null> {
    return this.database.matchSnapshot.findUnique({
      where: { matchId_revision: { matchId, revision } },
    });
  }
  findLatestByMatchId(matchId: string): Promise<MatchSnapshot | null> {
    return this.database.matchSnapshot.findFirst({
      where: { matchId },
      orderBy: { revision: "desc" },
    });
  }
  findLatestAtOrBeforeRevision(matchId: string, revision: number): Promise<MatchSnapshot | null> {
    return this.database.matchSnapshot.findFirst({
      where: { matchId, revision: { lte: revision } },
      orderBy: { revision: "desc" },
    });
  }
}
