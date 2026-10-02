import type { Match, MatchStatus, PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";

export interface CreateMatchInput {
  roomId?: string | null;
  status?: MatchStatus;
  gameMode: string;
  seed: number;
  createdById?: string | null;
}

export class MatchRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  findById(id: string): Promise<Match | null> {
    return this.database.match.findUnique({ where: { id } });
  }

  create(input: CreateMatchInput): Promise<Match> {
    return this.database.match.create({
      data: {
        roomId: input.roomId,
        status: input.status,
        gameMode: input.gameMode,
        seed: input.seed,
        createdById: input.createdById,
      },
    });
  }
}
