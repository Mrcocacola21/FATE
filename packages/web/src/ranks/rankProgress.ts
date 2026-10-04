import { ApiError, isRecord } from "../api/client";

/** Wire metadata computed by the backend; no rating thresholds live here. */
export interface RankProgress {
  currentMin: number | null;
  nextTier: string | null;
  nextRating: number | null;
  ratingToNext: number;
  progress: number | null;
  isMaxRank: boolean;
}

export function parseRankTier(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new ApiError("INVALID_RESPONSE");
  // Future semantic values are retained for the emblem's safe fallback.
  return value;
}

export function parseRankProgress(value: unknown): RankProgress {
  const finite = (number: unknown): number is number =>
    typeof number === "number" && Number.isFinite(number);
  if (
    !isRecord(value) ||
    !(value.currentMin === null || finite(value.currentMin)) ||
    !(
      value.nextTier === null ||
      (typeof value.nextTier === "string" && value.nextTier.length > 0)
    ) ||
    !(value.nextRating === null || finite(value.nextRating)) ||
    !finite(value.ratingToNext) ||
    value.ratingToNext < 0 ||
    !(
      value.progress === null ||
      (finite(value.progress) && value.progress >= 0 && value.progress <= 1)
    ) ||
    typeof value.isMaxRank !== "boolean"
  )
    throw new ApiError("INVALID_RESPONSE");
  if (
    value.isMaxRank
      ? value.nextTier !== null ||
        value.nextRating !== null ||
        value.progress !== null ||
        value.ratingToNext !== 0
      : value.nextTier === null ||
        value.nextRating === null ||
        (value.currentMin === null
          ? value.progress !== null
          : value.progress === null || value.nextRating <= value.currentMin)
  )
    throw new ApiError("INVALID_RESPONSE");
  return {
    currentMin: value.currentMin,
    nextTier: value.nextTier,
    nextRating: value.nextRating,
    ratingToNext: value.ratingToNext,
    progress: value.progress,
    isMaxRank: value.isMaxRank,
  };
}

/** Floor consistently: the displayed integer never crosses a boundary before the real rating. */
export function formatCompetitiveRating(rating: number): number {
  return Math.floor(rating);
}
