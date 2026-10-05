import { z } from "zod";
import { AppError } from "../errors/appError";
import type { validationDetailsSchema } from "../errors/schemas";

export class ValidationError extends AppError {
  constructor(error: z.ZodError) {
    const fields: z.infer<typeof validationDetailsSchema>["fields"] = error.issues
      .flatMap((issue) => {
        // Do not send input values, union errors, library internals or custom refinements.
        const paths =
          issue.code === "unrecognized_keys"
            ? issue.keys.map((key) => [...issue.path, key])
            : [issue.path];
        const message =
          issue.code === "unrecognized_keys"
            ? "Unexpected field."
            : issue.code === "too_small"
              ? "Value is below the allowed minimum."
              : issue.code === "too_big"
                ? "Value exceeds the allowed maximum."
                : "Invalid value.";
        return paths.map((path) => ({ path: path.join("."), message }));
      })
      .sort((a, b) => a.path.localeCompare(b.path) || a.message.localeCompare(b.message));
    super("VALIDATION_ERROR", 400, "Request validation failed.", { fields });
  }
}

export function parseInput<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(result.error);
  return result.data;
}
