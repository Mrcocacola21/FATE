import type { ProfileWithOwner } from "../repositories/profileRepository";
import { toPublicLanguage } from "./languages";

export function toPublicProfileDto(profile: ProfileWithOwner) {
  return {
    id: profile.userId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    createdAt: profile.user.createdAt.toISOString(),
  };
}

export function toOwnProfileDto(profile: ProfileWithOwner) {
  return {
    ...toPublicProfileDto(profile),
    email: profile.user.email,
    preferredLanguage: toPublicLanguage(profile.preferredLanguage),
    preferredTheme: profile.preferredTheme,
    friendRequests: profile.friendRequests,
    updatedAt: profile.updatedAt.toISOString(),
  };
}
