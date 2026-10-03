/** Competitive classification is application metadata, separate from gameplay rules. */
export type MatchType = "CASUAL" | "RATED";

export function matchTypeFromRated(isRated: boolean): MatchType {
  return isRated ? "RATED" : "CASUAL";
}

export class MatchTypeError extends Error {
  readonly statusCode = 400;
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function validateMatchType(value: unknown, roomMode = "normal"): MatchType {
  const matchType = value === undefined ? "CASUAL" : value;
  if (matchType !== "CASUAL" && matchType !== "RATED")
    throw new MatchTypeError("INVALID_MATCH_TYPE", "Choose Casual or Rated");
  if (roomMode === "test" && matchType === "RATED")
    throw new MatchTypeError("INVALID_MATCH_TYPE", "Test rooms are always Casual");
  return matchType;
}
