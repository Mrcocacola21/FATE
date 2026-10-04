import { isGameModeId } from "../modes/modeLabels";
import type { LeaderboardQuery } from "./types";

export const leaderboardSorts = ["rating", "gamesPlayed", "winRate", "lastActivity"] as const;
export function readLeaderboardQuery(params: URLSearchParams): LeaderboardQuery {
  const positive = (key: string, fallback: number, max: number) => {
    const value = params.get(key);
    return value && /^[1-9]\d*$/.test(value) && Number(value) <= max ? Number(value) : fallback;
  };
  const sort = params.get("sort");
  const mode = params.get("gameMode");
  return {
    gameMode: isGameModeId(mode) ? mode : "standard",
    status: params.get("status") === "provisional" ? "provisional" : "qualified",
    page: positive("page", 1, 21474836),
    limit: positive("limit", 20, 100),
    sort: leaderboardSorts.find((value) => value === sort) ?? "rating",
    order: params.get("order") === "asc" ? "asc" : "desc",
  };
}
export function leaderboardParams(query: LeaderboardQuery): URLSearchParams {
  return new URLSearchParams({
    gameMode: query.gameMode,
    status: query.status,
    page: String(query.page),
    limit: String(query.limit),
    sort: query.sort,
    order: query.order,
  });
}
