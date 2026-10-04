import { GameModeIdSchema } from "../schemas";
import { z } from "zod";

const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number);
export const ratingHistoryQuerySchema = z
  .object({
    gameMode: GameModeIdSchema.default("standard"),
    page: positiveInteger.pipe(z.number().int().max(21474836)).default("1"),
    limit: positiveInteger.pipe(z.number().int().max(100)).default("20"),
  })
  .strict();
export type RatingHistoryQuery = z.infer<typeof ratingHistoryQuerySchema>;
