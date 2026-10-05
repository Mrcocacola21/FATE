import { pageSchema, limitSchema } from "../validation/commonSchemas";
import { z } from "zod";
import { GameModeIdSchema } from "../schemas";

export const matchHistoryQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema(),
    result: z.enum(["WIN", "LOSS", "DRAW"]).optional(),
    gameMode: GameModeIdSchema.optional(),
  })
  .strict();
export type MatchHistoryQuery = z.infer<typeof matchHistoryQuerySchema>;
