import { z } from "zod";
import { profileLanguages } from "../profile/languages";

const email = z.string().trim().toLowerCase().max(320).email();
const password = z.string().min(8).max(128);

// Registration and profile editing share case-sensitive handle semantics.
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/);

export const registerSchema = z
  .object({
    email,
    username: usernameSchema,
    password,
    // Carries the guest's current UI choice into the new profile instead of en/light defaults.
    preferredLanguage: z.enum(profileLanguages).optional(),
    preferredTheme: z.enum(["light", "dark"]).optional(),
  })
  .strict();

export const loginSchema = z.object({ email, password }).strict();
