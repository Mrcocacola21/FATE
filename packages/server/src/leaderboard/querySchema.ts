import { GameModeIdSchema } from "../schemas";
import { z } from "zod";

const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number);
export const leaderboardQuerySchema = z
  .object({
    gameMode: GameModeIdSchema.default("standard"),
    status: z.enum(["qualified", "provisional"]).default("qualified"),
    page: positiveInteger.pipe(z.number().int().max(21474836)).default("1"),
    limit: positiveInteger.pipe(z.number().int().max(100)).default("20"),
    sort: z.enum(["rating", "gamesPlayed", "winRate", "lastActivity"]).default("rating"),
    order: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
