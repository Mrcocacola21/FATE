import { z } from "zod";
import { usernameSchema } from "../auth/schemas";
import { profileLanguages } from "./languages";

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable();

export const profilePatchSchema = z
  .object({
    username: usernameSchema.optional(),
    displayName: nullableText(64).optional(),
    avatarUrl: nullableText(2048)
      .refine((value) => {
        if (value === null) return true;
        try {
          return ["http:", "https:"].includes(new URL(value).protocol);
        } catch {
          return false;
        }
      })
      .describe("HTTP(S) avatar URL; an empty/blank string or null clears the avatar.")
      .optional(),
    preferredLanguage: z.enum(profileLanguages).optional(),
    preferredTheme: z.enum(["light", "dark"]).optional(),
  })
  .strict();

export type ProfilePatch = z.infer<typeof profilePatchSchema>;
