import type { AccessCredentials, AccountCredentials, AuthApi, AuthUser } from "../auth/types";
import { ApiError, type ApiClient, isRecord } from "./client";

function user(value: unknown): AuthUser {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !["USER", "MODERATOR", "ADMIN"].includes(value.role as string) ||
    typeof value.email !== "string" ||
    typeof value.createdAt !== "string" ||
    ![value.username, value.displayName, value.avatarUrl].every(
      (field) => field === null || typeof field === "string",
    )
  ) {
    throw new ApiError("INVALID_RESPONSE");
  }
  return {
    id: value.id,
    role: value.role as AuthUser["role"],
    email: value.email,
    createdAt: value.createdAt,
    username: value.username as string | null,
    displayName: value.displayName as string | null,
    avatarUrl: value.avatarUrl as string | null,
  };
}

function credentials(value: unknown): AccessCredentials {
  if (
    !isRecord(value) ||
    typeof value.accessToken !== "string" ||
    !value.accessToken ||
    typeof value.accessTokenExpiresIn !== "number" ||
    !Number.isFinite(value.accessTokenExpiresIn) ||
    value.accessTokenExpiresIn <= 0
  ) {
    throw new ApiError("INVALID_RESPONSE");
  }
  return { accessToken: value.accessToken, accessTokenExpiresIn: value.accessTokenExpiresIn };
}

function accountCredentials(value: unknown): AccountCredentials {
  if (!isRecord(value)) throw new ApiError("INVALID_RESPONSE");
  return { ...credentials(value), user: user(value.user) };
}

export function parseCurrentUser(value: unknown): AuthUser {
  if (!isRecord(value)) throw new ApiError("INVALID_RESPONSE");
  return user(value.user);
}

export function createAuthApi(client: ApiClient): AuthApi {
  return {
    login: (input) =>
      client.request("/api/auth/login", accountCredentials, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    register: (input) =>
      client.request("/api/auth/register", accountCredentials, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    refresh: () => client.request("/api/auth/refresh", credentials, { method: "POST" }),
    logout: () => client.request("/api/auth/logout", () => undefined, { method: "POST" }),
    getMe: (token) =>
      client.request("/api/auth/me", parseCurrentUser, {
        headers: { Authorization: `Bearer ${token}` },
      }),
  };
}
