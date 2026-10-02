import type { AuthSession, PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";

export interface CreateAuthSessionInput {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
}

export class AuthSessionRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  create(input: CreateAuthSessionInput): Promise<AuthSession> {
    return this.database.authSession.create({ data: input });
  }

  findById(id: string): Promise<AuthSession | null> {
    return this.database.authSession.findUnique({ where: { id } });
  }

  async rotateToken(
    id: string,
    userId: string,
    currentHash: string,
    nextHash: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.database.authSession.updateMany({
      where: { id, userId, refreshTokenHash: currentHash, revokedAt: null, expiresAt: { gt: now } },
      data: { refreshTokenHash: nextHash, lastUsedAt: now },
    });
    return result.count === 1;
  }

  async revoke(id: string, userId: string, now: Date): Promise<void> {
    await this.database.authSession.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
