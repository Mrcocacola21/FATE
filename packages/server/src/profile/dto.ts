import type { ProfileWithOwner } from "../repositories/profileRepository";

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
    preferredLanguage: profile.preferredLanguage,
    preferredTheme: profile.preferredTheme,
    updatedAt: profile.updatedAt.toISOString(),
  };
}
