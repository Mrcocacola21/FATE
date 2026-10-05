import { AuthError } from "../auth/authErrors";
import { MultiplayerIdentityError } from "../auth/connectionIdentity";
import { MatchTypeError } from "../matches/matchType";
import { MatchResultError } from "../persistence/matchResult";
import { ReplayError } from "../replay/replayError";
import { AppError, internalError } from "./appError";

export const domainErrors: Record<string, readonly [number, string]> = {
  MATCH_NOT_FOUND: [404, "Match not found."],
  MATCH_NOT_FINISHED: [409, "Match has not finished."],
  MATCH_NOT_REPLAYABLE: [409, "This match cannot be replayed."],
  INVALID_REPLAY_REVISION: [400, "Invalid replay revision."],
  MATCH_INVALID_TRANSITION: [409, "Invalid match transition."],
  MATCH_RESULT_CONFLICT: [409, "Match result conflicts with the stored result."],
  MATCHMAKING_ALREADY_IN_MATCH: [409, "Leave your active match before searching."],
  MATCHMAKING_CONNECTION_REQUIRED: [409, "Reconnect before searching."],
  MATCHMAKING_IN_QUEUE: [409, "Cancel your search before entering another match."],
  MATCHMAKING_CANCELLED: [409, "Search cancelled."],
  MATCHMAKING_UNAVAILABLE: [503, "Matchmaking is unavailable."],
};

/** Transport mappings stay outside pure replay/game helpers. */
export function toDomainApiError(error: unknown): AppError | undefined {
  if (error instanceof MultiplayerIdentityError || error instanceof MatchTypeError) {
    if (["AUTH_REQUIRED", "INVALID_ACCESS_TOKEN", "RATED_MATCH_REQUIRES_AUTHENTICATION"].includes(error.code))
      return new AuthError("UNAUTHORIZED");
    if (error.code === "ACCOUNT_BLOCKED") return new AuthError("ACCOUNT_BLOCKED");
    if (["INVALID_MATCH_TYPE", "MATCHMAKING_INVALID_GAME_MODE"].includes(error.code))
      return new AppError("VALIDATION_ERROR", 400, "Request validation failed.");
    const mapping = domainErrors[error.code];
    return mapping ? new AppError(error.code, ...mapping) : internalError();
  }
  if (error instanceof MatchResultError) {
    const mapping = domainErrors[error.code];
    return mapping ? new AppError(error.code, ...mapping) : internalError();
  }
  if (error instanceof ReplayError) {
    if (error.code === "REPLAY_STORAGE_UNAVAILABLE") return undefined;
    if (error.code === "INVALID_TARGET_REVISION")
      return new AppError("INVALID_REPLAY_REVISION", 400, "Invalid replay revision.");
    const mapping = domainErrors[error.code];
    if (mapping) return new AppError(error.code, ...mapping);
    return new AppError(error.code, 409, "Stored replay data cannot be reconstructed.");
  }
  return undefined;
}
