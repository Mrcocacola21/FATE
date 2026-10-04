import { getRankMetadata } from "../../../server/src/rating/rankTiers";
import type { CompetitiveRating } from "../play/api";

/** Test data comes from the canonical backend helper, never a frontend policy copy. */
export function competitiveRatingFixture(rating = 1500, ratedGames = 0): CompetitiveRating {
  return { rating, ratingDeviation: 74, ratedGames, ...getRankMetadata(rating) };
}
