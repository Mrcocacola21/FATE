import { z } from "zod";

// Names are presentation, never routing identities. React renders them as text.
export const LobbyNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine(
    (value) =>
      Array.from(value).every((character) => {
        const code = character.codePointAt(0)!;
        return code > 31 && (code < 127 || code > 159);
      }),
    "Control characters are not allowed",
  );

export function defaultLobbyName(displayName?: string): string {
  const proposed = displayName ? `${displayName.slice(0, 45)}'s Lobby` : "FATE Lobby";
  return LobbyNameSchema.safeParse(proposed).success ? proposed : "FATE Lobby";
}

export interface RatedCompatibility {
  ratings: { P1: number | null; P2: number | null };
  difference: number | null;
  maxDifference: number;
  eligible: boolean;
  reason:
    | "RATED_MATCH_INVALID_PARTICIPANTS"
    | "RATED_RATING_UNAVAILABLE"
    | "RATED_RATING_DIFFERENCE_TOO_LARGE"
    | null;
}

export function ratedCompatibility(
  ratings: RatedCompatibility["ratings"],
  maxDifference: number,
  distinct: boolean,
): RatedCompatibility {
  const available = ratings.P1 !== null && ratings.P2 !== null;
  const difference = available ? Math.abs(ratings.P1! - ratings.P2!) : null;
  const reason = !distinct
    ? "RATED_MATCH_INVALID_PARTICIPANTS"
    : !available
      ? "RATED_RATING_UNAVAILABLE"
      : difference! > maxDifference
        ? "RATED_RATING_DIFFERENCE_TOO_LARGE"
        : null;
  return { ratings, difference, maxDifference, eligible: reason === null, reason };
}
