import { z } from "zod";
import { gameModeSchema } from "../validation/commonSchemas";

export const joinQueueSchema = z
  .object({ gameMode: gameModeSchema, matchType: z.enum(["RATED", "CASUAL"]).optional() })
  .strict();
