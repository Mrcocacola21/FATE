import { z } from "zod";
import { isGameModeId } from "rules";

const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number);
export const matchHistoryQuerySchema = z
  .object({
    page: positiveInteger.pipe(z.number().int().max(21474836)).default("1"),
    limit: positiveInteger.pipe(z.number().int().max(100)).default("20"),
    result: z.enum(["WIN", "LOSS", "DRAW"]).optional(),
    gameMode: z.string().refine(isGameModeId).optional(),
  })
  .strict();
export type MatchHistoryQuery = z.infer<typeof matchHistoryQuerySchema>;
