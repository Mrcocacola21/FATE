import type { GameModeId } from "rules";
import { GAME_MODE_IDS } from "../modes/modeLabels";
import { API_BASE } from "../api/config";
import { ApiError, isRecord, createApiClient, type ApiClient } from "../api/client";
import { parseRankTier, parseRankProgress, type RankProgress } from "../ranks/rankProgress";

export interface CompetitiveRating {
  rating: number;
  ratingDeviation: number;
  ratedGames: number;
  rankTier: string;
  rankProgress: RankProgress;
}
export function parseCompetitiveRating(value: unknown): CompetitiveRating {
  if (
    !isRecord(value) ||
    typeof value.rating !== "number" ||
    !Number.isFinite(value.rating) ||
    typeof value.ratingDeviation !== "number" ||
    !Number.isFinite(value.ratingDeviation) ||
    value.ratingDeviation <= 0 ||
    typeof value.ratedGames !== "number" ||
    !Number.isSafeInteger(value.ratedGames) ||
    value.ratedGames < 0
  )
    throw new ApiError("INVALID_RESPONSE");
  return {
    rating: value.rating,
    ratingDeviation: value.ratingDeviation,
    ratedGames: value.ratedGames,
    rankTier: parseRankTier(value.rankTier),
    rankProgress: parseRankProgress(value.rankProgress),
  };
}
/** Rating and qualification config are public reads, including signed-out profiles. */
export function createCompetitiveApi(client: ApiClient) {
  return {
    rating: (id: string, gameMode: GameModeId) =>
      client.request(
        `/api/users/${encodeURIComponent(id)}/rating?gameMode=${gameMode}`,
        parseCompetitiveRating,
      ),
    ratings: (id: string) =>
      client.request(`/api/users/${encodeURIComponent(id)}/ratings`, (value) => {
        if (!isRecord(value) || !isRecord(value.ratings)) throw new ApiError("INVALID_RESPONSE");
        const ratings = value.ratings;
        return Object.fromEntries(
          GAME_MODE_IDS.map((mode) => [mode, parseCompetitiveRating(ratings[mode])]),
        ) as Record<GameModeId, CompetitiveRating>;
      }),
    config: () =>
      client.request("/api/competitive/config", (value) => {
        if (
          !isRecord(value) ||
          typeof value.minRatedGames !== "number" ||
          !Number.isSafeInteger(value.minRatedGames) ||
          value.minRatedGames < 1
        )
          throw new ApiError("INVALID_RESPONSE");
        return value.minRatedGames;
      }),
  };
}
export const competitiveApi = createCompetitiveApi(createApiClient(API_BASE));
