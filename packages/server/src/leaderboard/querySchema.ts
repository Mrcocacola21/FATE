import { pageSchema, limitSchema, sortOrderSchema } from "../validation/commonSchemas";
import { GameModeIdSchema } from "../schemas";
import { z } from "zod";

export const leaderboardQuerySchema = z
  .object({
    gameMode: GameModeIdSchema.default("standard"),
    status: z.enum(["qualified", "provisional"]).default("qualified"),
    page: pageSchema,
    limit: limitSchema(),
    sort: z.enum(["rating", "gamesPlayed", "winRate", "lastActivity"]).default("rating"),
    order: sortOrderSchema.default("desc"),
  })
  .strict();
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
