import { z } from "zod";

export const errorDetailsSchema = z.record(z.unknown());
export const validationDetailsSchema = z
  .object({
    fields: z.array(z.object({ path: z.string(), message: z.string() }).strict()),
  })
  .strict();
export const apiErrorSchema = z
  .object({
    error: z
      .object({ code: z.string(), message: z.string(), details: errorDetailsSchema.optional() })
      .strict(),
  })
  .strict();
// Parser failures have no fields; normalized Zod failures include the safe fields array.
export const validationErrorSchema = apiErrorSchema.extend({
  error: z
    .object({
      code: z.literal("VALIDATION_ERROR"),
      message: z.string(),
      details: validationDetailsSchema.optional(),
    })
    .strict(),
});
