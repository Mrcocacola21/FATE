import type { ProfileWithOwner } from "../repositories/profileRepository";
import { isFigureFrameId, isSealId } from "rules";
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
    presenceVisibility: profile.presenceVisibility,
    lobbyInvites: profile.lobbyInvites,
    directMessages: profile.directMessages,
    figureFrame: isFigureFrameId(profile.figureFrame) ? profile.figureFrame : null,
    seal: isSealId(profile.seal) ? profile.seal : null,
    updatedAt: profile.updatedAt.toISOString(),
  };
}
