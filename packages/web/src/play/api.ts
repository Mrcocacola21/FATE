import { authClient } from "../auth/authStore";
import { ApiError, isRecord } from "../api/client";

export interface CompetitiveRating {
  rating: number;
  ratingDeviation: number;
  ratedGames: number;
}
export const competitiveApi = {
  rating: (id: string) =>
    authClient.request(`/api/users/${encodeURIComponent(id)}/rating`, (value) => {
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
      };
    }),
  config: () =>
    authClient.request("/api/competitive/config", (value) => {
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
