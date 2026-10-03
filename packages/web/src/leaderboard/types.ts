export type LeaderboardStatus = "qualified" | "provisional";
export type LeaderboardSort = "rating" | "gamesPlayed" | "winRate" | "lastActivity";
export interface LeaderboardQuery {
  status: LeaderboardStatus;
  page: number;
  limit: number;
  sort: LeaderboardSort;
  order: "asc" | "desc";
}
export interface LeaderboardPlayer {
  ratingRank: number | null;
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  rating: number;
  ratingDeviation: number;
  ratedGames: number;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  winRate: number | null;
  lastActivity: string | null;
  performanceAvailable: boolean;
  status: "QUALIFIED" | "PROVISIONAL";
  gamesUntilQualified: number;
}
export interface LeaderboardResponse {
  items: LeaderboardPlayer[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  qualification: { minRatedGames: number };
}
