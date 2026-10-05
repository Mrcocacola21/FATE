import { z } from "zod";
import { queryIntegerSchema } from "../validation/commonSchemas";

export const replayRevisionQuerySchema = z.object({
  revision: queryIntegerSchema(0, 2147483647),
}).strict();
