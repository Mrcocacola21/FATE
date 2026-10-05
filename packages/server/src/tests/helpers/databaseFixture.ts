import { randomUUID } from "node:crypto";
import { PrismaClient, type UserRole } from "@prisma/client";
import { configureTestDatabase } from "../testDatabase";

/** Isolated ownership, no table-wide truncate. Close runtimes before fixture.dispose(). */
export function databaseFixture() {
  const url = configureTestDatabase();
  const db = new PrismaClient({ datasources: { db: { url } } });
  const users: string[] = [], matches: string[] = [];
  return {
    db, users, matches,
    async user(name: string, role: UserRole = "USER") {
      const suffix = randomUUID().slice(0, 8);
      const user = await db.user.create({ data: {
        email: `${name}-${suffix}@example.test`, role,
        profile: { create: { username: `${name}_${suffix}`, displayName: name } },
      } });
      users.push(user.id);
      return user;
    },
    async dispose() {
      try {
        await db.auditLog.deleteMany({ where: { OR: [
          { actorUserId: { in: users } }, { targetUserId: { in: users } }, { matchId: { in: matches } },
        ] } });
        await db.ratingHistory.deleteMany({ where: { userId: { in: users } } });
        await db.match.deleteMany({ where: { OR: [{ id: { in: matches } }, { createdById: { in: users } }] } });
        await db.user.deleteMany({ where: { id: { in: users } } });
      } finally { await db.$disconnect(); }
    },
  };
}
