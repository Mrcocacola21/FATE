import { z } from "zod";

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
  })
  .strict();

export const loginSchema = z.object({ email, password }).strict();
