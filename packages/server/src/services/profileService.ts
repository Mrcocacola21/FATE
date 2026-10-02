import { Prisma } from "@prisma/client";
import { AuthError } from "../auth/authErrors";
import { toOwnProfileDto, toPublicProfileDto } from "../profile/dto";
import { profilePatchSchema, type ProfilePatch } from "../profile/schemas";
import type { ProfileRepository } from "../repositories/profileRepository";

export class ProfileService {
  constructor(private readonly profiles: ProfileRepository) {}

  async getOwnProfile(userId: string) {
    const profile = await this.profiles.findByUserId(userId);
    // Legacy identities without a Profile must be repaired explicitly by their importer/fixture.
    if (!profile) throw new AuthError("USER_NOT_FOUND");
    return toOwnProfileDto(profile);
  }

  async getPublicProfile(username: string) {
    const profile = await this.profiles.findByUsername(username);
    if (!profile) throw new AuthError("USER_NOT_FOUND");
    return toPublicProfileDto(profile);
  }

  async updateOwnProfile(userId: string, input: ProfilePatch) {
    const parsed = profilePatchSchema.safeParse(input);
    if (!parsed.success) throw new AuthError("INVALID_REQUEST");
    if (Object.keys(parsed.data).length === 0) return this.getOwnProfile(userId);
    try {
      return toOwnProfileDto(await this.profiles.updateByUserId(userId, parsed.data));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // The unique constraint arbitrates simultaneous claims, including races after any read.
        if (error.code === "P2002" && parsed.data.username !== undefined)
          throw new AuthError("USERNAME_ALREADY_TAKEN");
        if (error.code === "P2025") throw new AuthError("USER_NOT_FOUND");
      }
      throw error;
    }
  }
}
