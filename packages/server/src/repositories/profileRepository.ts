import type { Prisma, PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";
import type { ProfilePatch } from "../profile/schemas";
import { uploadedAvatarPath, type AvatarImage } from "../profile/avatarImage";
import { toStoredLanguage } from "../profile/languages";

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
    const data = {
      ...patch,
      preferredLanguage:
        patch.preferredLanguage === undefined ? undefined : toStoredLanguage(patch.preferredLanguage),
    };
    if (patch.avatarUrl === undefined)
      return this.database.profile.update({ where: { userId }, data, include: { user: owner } });
    // Setting or clearing the URL by hand replaces any uploaded picture, so drop its bytes too.
    return this.database.$transaction(async (tx) => {
      const profile = await tx.profile.update({ where: { userId }, data, include: { user: owner } });
      await tx.userAvatar.deleteMany({ where: { userId } });
      return profile;
    });
  }

  /** Stores the picture and points the profile at its versioned URL in one transaction. */
  saveAvatar(userId: string, image: AvatarImage): Promise<ProfileWithOwner> {
    return this.database.$transaction(async (tx) => {
      const profile = await tx.profile.update({
        where: { userId },
        data: { avatarUrl: uploadedAvatarPath(userId, image.sha256) },
        include: { user: owner },
      });
      const stored = {
        contentType: image.contentType,
        data: new Uint8Array(image.data),
        sha256: image.sha256,
      };
      await tx.userAvatar.upsert({ where: { userId }, create: { userId, ...stored }, update: stored });
      return profile;
    });
  }

  findAvatar(userId: string) {
    return this.database.userAvatar.findUnique({
      where: { userId },
      select: { contentType: true, data: true, sha256: true },
    });
  }
}
