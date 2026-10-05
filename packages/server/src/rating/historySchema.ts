import { pageSchema, limitSchema } from "../validation/commonSchemas";
import { GameModeIdSchema } from "../schemas";
import { z } from "zod";

export const ratingHistoryQuerySchema = z
  .object({
    gameMode: GameModeIdSchema.default("standard"),
    page: pageSchema,
    limit: limitSchema(),
  })
  .strict();
export type RatingHistoryQuery = z.infer<typeof ratingHistoryQuerySchema>;

export const ratingQuerySchema = z.object({ gameMode: GameModeIdSchema.default("standard") }).strict();
