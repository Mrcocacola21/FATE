import { z } from "zod";
import { limitSchema, queryIntegerSchema } from "../validation/commonSchemas";

export const matchActionsQuerySchema = z.object({
  limit: limitSchema(500, 100),
  revisionAfter: queryIntegerSchema(0, 2147483647).default("0"),
}).strict();
