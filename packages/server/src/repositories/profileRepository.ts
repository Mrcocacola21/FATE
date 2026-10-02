import type { Prisma, PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";
import type { ProfilePatch } from "../profile/schemas";

// Select only the owner fields needed for DTOs; never load credentials or sessions.
const owner = { select: { id: true, email: true, createdAt: true } } as const;
export type ProfileWithOwner = Prisma.ProfileGetPayload<{ include: { user: typeof owner } }>;

export class ProfileRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  findByUserId(userId: string): Promise<ProfileWithOwner | null> {
    return this.database.profile.findUnique({ where: { userId }, include: { user: owner } });
  }

  findByUsername(username: string): Promise<ProfileWithOwner | null> {
    return this.database.profile.findUnique({ where: { username }, include: { user: owner } });
  }

  updateByUserId(userId: string, patch: ProfilePatch): Promise<ProfileWithOwner> {
    return this.database.profile.update({
      where: { userId },
      data: patch,
      include: { user: owner },
    });
  }
}
