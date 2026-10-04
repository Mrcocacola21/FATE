import type { AuthSession, PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";
import { AuthError } from "../auth/authErrors";

export interface CreateAuthSessionInput {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
}

export class AuthSessionRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  create(input: CreateAuthSessionInput): Promise<AuthSession> {
    return this.database.$transaction(async (tx) => {
      // Serialize session creation with blocking's user-row update.
      const users = await tx.$queryRaw<{ blockedAt: Date | null }[]>`
        SELECT "blockedAt" FROM "User" WHERE "id" = ${input.userId}::uuid FOR UPDATE`;
      if (!users[0]) throw new AuthError("UNAUTHORIZED");
      if (users[0].blockedAt) throw new AuthError("ACCOUNT_BLOCKED");
      return tx.authSession.create({ data: input });
    });
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
      where: {
        id,
        userId,
        refreshTokenHash: currentHash,
        revokedAt: null,
        expiresAt: { gt: now },
        user: { blockedAt: null },
      },
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
