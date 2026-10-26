import type { GameModeId } from "rules";
import { matchApi } from "../api/matchApi";
import { GAME_MODE_IDS } from "../modes/modeLabels";
import { competitiveApi, type CompetitiveRating, type RatingHistoryEntry } from "../play/api";
import type { GameModeStatistics } from "../statistics/types";

export const RECENT_MATCH_LIMIT = 5;
/** Points drawn in the rating chart; the peak tile looks at everything loaded. */
export const CHART_GAME_LIMIT = 40;

export type RatingHistories = Record<GameModeId, RatingHistoryEntry[]>;

export const loadRatingHistories = async (userId: string): Promise<RatingHistories> =>
  Object.fromEntries(
    await Promise.all(
      GAME_MODE_IDS.map(
        async (mode) => [mode, await competitiveApi.ratingHistory(userId, mode)] as const,
      ),
    ),
  ) as RatingHistories;

export const loadRecentMatches = (userId: string) =>
  matchApi.getUserMatches(userId, { page: 1, limit: RECENT_MATCH_LIMIT });

/** Default chart format: the one with the most rated games, Standard on ties. */
export function mostPlayedMode(ratings: Record<GameModeId, CompetitiveRating>): GameModeId {
  return GAME_MODE_IDS.reduce((best, mode) =>
    ratings[mode].ratedGames > ratings[best].ratedGames ? mode : best,
  );
}

export function peakRating(
  histories: RatingHistories,
): { rating: number; mode: GameModeId } | null {
  let peak: { rating: number; mode: GameModeId } | null = null;
  for (const mode of GAME_MODE_IDS)
    for (const entry of histories[mode])
      if (!peak || entry.ratingAfter > peak.rating) peak = { rating: entry.ratingAfter, mode };
  return peak;
}

export function favoriteMode(modes: readonly GameModeStatistics[]): GameModeStatistics | null {
  return modes.reduce<GameModeStatistics | null>(
    (best, mode) => (mode.gamesPlayed > (best?.gamesPlayed ?? 0) ? mode : best),
    null,
  );
}

export function ratingDeltaByMatch(histories: RatingHistories): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const mode of GAME_MODE_IDS)
    for (const entry of histories[mode])
      if (entry.matchId) deltas.set(entry.matchId, entry.ratingDelta);
  return deltas;
}

export interface ChartPoint {
  rating: number;
  /** Null for the starting point, which is the rating before the first charted game. */
  entry: RatingHistoryEntry | null;
}

/** API order is newest first; the chart reads oldest to newest and starts from the rating before. */
export function chartPoints(history: readonly RatingHistoryEntry[], limit = CHART_GAME_LIMIT) {
  const games = history.slice(0, limit).reverse();
  if (games.length === 0) return [];
  return [
    { rating: games[0].ratingBefore, entry: null },
    ...games.map((entry) => ({ rating: entry.ratingAfter, entry })),
  ] satisfies ChartPoint[];
}

/** Padded y-domain with round gridline ticks; a nearby rank threshold stays in view. */
export function chartScale(ratings: readonly number[], threshold?: number | null) {
  let min = Math.min(...ratings);
  let max = Math.max(...ratings);
  const reach = Math.max(max - min, 60);
  if (threshold != null && threshold >= min - reach && threshold <= max + reach) {
    min = Math.min(min, threshold);
    max = Math.max(max, threshold);
  }
  const pad = Math.max((max - min) * 0.12, 10);
  min -= pad;
  max += pad;
  const step = [10, 25, 50, 100, 200, 500].find((value) => (max - min) / value <= 4) ?? 1000;
  const ticks: number[] = [];
  for (let tick = Math.ceil(min / step) * step; tick <= max; tick += step) ticks.push(tick);
  return {
    min,
    max,
    ticks,
    showThreshold: threshold != null && threshold >= min && threshold <= max,
  };
}
