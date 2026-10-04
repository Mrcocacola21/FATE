import { RatingError } from "./ratingError";

/** Major ranks are derived from precise Glicko rating, never persisted. */
export const RATING_TIERS = [
  { id: "SHADOW", min: null, maxExclusive: 350 },
  { id: "CRESCENT", min: 350, maxExclusive: 700 },
  { id: "HALF", min: 700, maxExclusive: 1100 },
  { id: "FULL", min: 1100, maxExclusive: 1600 },
  { id: "ECLIPSE", min: 1600, maxExclusive: 1750 },
  { id: "BLACK_MOON", min: 1750, maxExclusive: 1850 },
  { id: "NOVA", min: 1850, maxExclusive: 2000 },
  { id: "DESTINY", min: 2000, maxExclusive: null },
] as const;

export type RankTier = (typeof RATING_TIERS)[number]["id"];
export interface RankProgress {
  currentMin: number | null;
  nextTier: RankTier | null;
  nextRating: number | null;
  ratingToNext: number;
  progress: number | null;
  isMaxRank: boolean;
}

export function getRatingTier(rating: number): RankTier {
  if (!Number.isFinite(rating)) throw new RatingError("RATING_INVALID_STATE");
  return RATING_TIERS.find((tier) => tier.maxExclusive === null || rating < tier.maxExclusive)!.id;
}

export function getRankProgress(rating: number): RankProgress {
  const index = getRankTierIndex(getRatingTier(rating));
  const current = RATING_TIERS[index];
  const next = RATING_TIERS[index + 1];
  const nextRating = current.maxExclusive;
  return {
    currentMin: current.min,
    nextTier: next?.id ?? null,
    nextRating,
    ratingToNext: nextRating === null ? 0 : Math.max(0, nextRating - rating),
    progress:
      current.min === null || nextRating === null
        ? null
        : Math.min(1, Math.max(0, (rating - current.min) / (nextRating - current.min))),
    isMaxRank: nextRating === null,
  };
}

export function getRankMetadata(rating: number) {
  return { rankTier: getRatingTier(rating), rankProgress: getRankProgress(rating) };
}

export function getRankTierIndex(tier: RankTier): number {
  return RATING_TIERS.findIndex((entry) => entry.id === tier);
}

/** Positive = promotion; negative = demotion; zero = same major tier. */
export function compareRankTiers(before: RankTier, after: RankTier): number {
  return Math.sign(getRankTierIndex(after) - getRankTierIndex(before));
}
