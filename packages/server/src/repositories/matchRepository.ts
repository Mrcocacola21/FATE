import { Prisma, type Match, type MatchStatus, type PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";
import type { WaitingMatchInput, SeatParticipantInput, StartedMatchInput, FinishedMatchInput } from "../services/matchService";

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

  findByRoomId(roomId: string): Promise<Match | null> {
    return this.database.match.findUnique({ where: { roomId } });
  }

  async createWaitingMatch(input: WaitingMatchInput): Promise<Match> {
    try {
      return await this.database.match.upsert({
        where: { roomId: input.roomId },
        create: { ...input, status: "WAITING" },
        update: {},
      });
    } catch (error) {
      // Empty-update upserts can use Prisma's read/insert path instead of native
      // ON CONFLICT. Recover the winner of that race, without changing its data.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.findByRoomId(input.roomId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  findParticipants(matchId: string) {
    return this.database.matchParticipant.findMany({ where: { matchId }, orderBy: { seat: "asc" } });
  }

  async upsertWaitingParticipant(matchId: string, input: SeatParticipantInput): Promise<void> {
    await this.database.$transaction(async (tx) => {
      // Updating the parent locks it until commit, serializing against start/cancel.
      const locked = await tx.match.updateMany({
        where: { id: matchId, status: "WAITING" }, data: { updatedAt: new Date() },
      });
      if (!locked.count) {
        await tx.match.findUniqueOrThrow({ where: { id: matchId } });
        return; // Historical competitors are immutable after WAITING.
      }
      await tx.matchParticipant.upsert({
        where: { matchId_seat: { matchId, seat: input.seat } },
        create: { matchId, ...input }, update: input,
      });
    });
  }

  async updateWaitingGameMode(matchId: string, gameMode: string): Promise<void> {
    await this.database.match.updateMany({ where: { id: matchId, status: "WAITING" }, data: { gameMode } });
  }

  markStarted(matchId: string, input: StartedMatchInput): Promise<Match> {
    return this.database.$transaction(async (tx) => {
      const changed = await tx.match.updateMany({
        where: { id: matchId, status: "WAITING" },
        data: { status: "IN_PROGRESS", startedAt: input.startedAt, gameMode: input.gameMode },
      });
      if (changed.count) {
        await tx.matchParticipant.deleteMany({
          where: { matchId, seat: { notIn: input.participants.map((p) => p.seat) } },
        });
        for (const participant of input.participants) {
          await tx.matchParticipant.upsert({
            where: { matchId_seat: { matchId, seat: participant.seat } },
            create: { matchId, ...participant }, update: participant,
          });
        }
      }
      return tx.match.findUniqueOrThrow({ where: { id: matchId } });
    });
  }

  async markFinished(matchId: string, input: FinishedMatchInput): Promise<Match> {
    await this.database.match.updateMany({
      where: { id: matchId, status: "IN_PROGRESS" }, data: { status: "FINISHED", ...input },
    });
    return this.database.match.findUniqueOrThrow({ where: { id: matchId } });
  }

  async markCancelled(matchId: string, finishedAt: Date): Promise<Match> {
    await this.database.match.updateMany({
      where: { id: matchId, status: "WAITING" }, data: { status: "CANCELLED", finishedAt },
    });
    return this.database.match.findUniqueOrThrow({ where: { id: matchId } });
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
