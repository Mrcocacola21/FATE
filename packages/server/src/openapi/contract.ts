import type { FastifyContextConfig, RouteShorthandOptions } from "fastify";
import type { z } from "zod";
import type { ApiResponses } from "./responseTypes";

export const apiTags = [
  "Auth",
  "Users",
  "Profiles",
  "Matches",
  "Statistics",
  "Ratings",
  "Leaderboard",
  "Replay",
  "Lobbies",
  "Matchmaking",
  "Admin",
  "Audit",
  "Operations",
  "Heroes",
] as const;

export interface ApiContract {
  operationId: string;
  tag: (typeof apiTags)[number];
  summary: string;
  description?: string;
  auth?: "bearer" | "optionalBearer" | "refresh" | "optionalRefresh";
  role?: "MODERATOR" | "ADMIN";
  body?: z.ZodTypeAny;
  bodyOptional?: boolean;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  response?: keyof ApiResponses;
  success?: number;
  errors?: Record<number, readonly string[]>;
  requestExample?: unknown;
  responseExample?: unknown;
  cookie?: "set" | "clear";
}

declare module "fastify" {
  interface FastifyContextConfig {
    apiContract?: ApiContract;
  }
}

/** Metadata only: existing parseInput and query validation remain authoritative. */
export function documented(
  contract: ApiContract,
  existing: FastifyContextConfig = {},
): Pick<RouteShorthandOptions, "config"> {
  const config: FastifyContextConfig = { ...existing, apiContract: contract };
  if (contract.query) config.querySchema = contract.query;
  return { config };
}

/** Explicit exclusions are checked alongside documented routes in the coverage test. */
export const hiddenRest = { schema: { hide: true } };

export const protectedErrors = {
  401: ["UNAUTHORIZED"],
  403: ["ACCOUNT_BLOCKED"],
  503: ["DATABASE_UNAVAILABLE", "AUTH_UNAVAILABLE"],
};
export const readErrors = { 404: ["USER_NOT_FOUND"], 503: ["DATABASE_UNAVAILABLE"] };
