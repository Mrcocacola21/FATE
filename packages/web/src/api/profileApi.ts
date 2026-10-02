import { API_BASE } from "./config";
import { ApiError, createApiClient, isRecord, type ApiClient } from "./client";
import { authClient } from "../auth/authStore";
import type { OwnProfile, ProfileApi, PublicProfile } from "../profile/types";

function publicProfile(value: unknown): PublicProfile {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.username !== "string" ||
    typeof value.createdAt !== "string" ||
    ![value.displayName, value.avatarUrl].every(
      (field) => field === null || typeof field === "string",
    )
  )
    throw new ApiError("INVALID_RESPONSE");
  return {
    id: value.id,
    username: value.username,
    createdAt: value.createdAt,
    displayName: value.displayName as string | null,
    avatarUrl: value.avatarUrl as string | null,
  };
}
export function parsePublicProfile(value: unknown): PublicProfile {
  if (!isRecord(value)) throw new ApiError("INVALID_RESPONSE");
  return publicProfile(value.profile);
}
export function parseOwnProfile(value: unknown): OwnProfile {
  if (!isRecord(value) || !isRecord(value.profile)) throw new ApiError("INVALID_RESPONSE");
  const profile = value.profile;
  if (
    typeof profile.email !== "string" ||
    typeof profile.updatedAt !== "string" ||
    (profile.preferredLanguage !== "en" && profile.preferredLanguage !== "uk") ||
    (profile.preferredTheme !== "light" && profile.preferredTheme !== "dark")
  )
    throw new ApiError("INVALID_RESPONSE");
  return {
    ...publicProfile(profile),
    email: profile.email,
    updatedAt: profile.updatedAt,
    preferredLanguage: profile.preferredLanguage,
    preferredTheme: profile.preferredTheme,
  };
}
export function createProfileApi(client: ApiClient, authenticated: ApiClient): ProfileApi {
  return {
    getOwn: () => authenticated.request("/api/profile", parseOwnProfile),
    updateOwn: (patch) =>
      authenticated.request("/api/profile", parseOwnProfile, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    getPublic: (username) =>
      client.request(`/api/users/${encodeURIComponent(username)}`, parsePublicProfile),
  };
}
export const profileApi = createProfileApi(createApiClient(API_BASE), authClient);
