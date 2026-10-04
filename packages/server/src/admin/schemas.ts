import { z } from "zod";
import { GameModeIdSchema } from "../schemas";

export const userRoleSchema = z.enum(["USER", "MODERATOR", "ADMIN"]);
const integer = (max: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(max));
const pagination = { page: integer(1000000).default("1"), limit: integer(100).default("20") };
export const userListSchema = z
  .object({
    ...pagination,
    search: z.string().trim().min(1).max(100).optional(),
    role: userRoleSchema.optional(),
    status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
    sort: z.enum(["createdAt", "updatedAt", "username"]).default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();
const date = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .optional();
export const matchListSchema = z
  .object({
    ...pagination,
    status: z.enum(["WAITING", "IN_PROGRESS", "FINISHED", "CANCELLED"]).optional(),
    gameMode: GameModeIdSchema.optional(),
    matchType: z.enum(["CASUAL", "RATED"]).optional(),
    participantUserId: z.string().uuid().optional(),
    matchId: z.string().uuid().optional(),
    createdFrom: date,
    createdTo: date,
    finishedFrom: date,
    finishedTo: date,
    sort: z.enum(["createdAt", "finishedAt"]).default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()
  .refine((q) => !q.createdFrom || !q.createdTo || q.createdFrom <= q.createdTo)
  .refine((q) => !q.finishedFrom || !q.finishedTo || q.finishedFrom <= q.finishedTo);
export const actionListSchema = z
  .object({
    page: integer(1000000).default("1"),
    limit: integer(200).default("50"),
    order: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();
export const blockSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();
export const rolePatchSchema = z.object({ role: userRoleSchema }).strict();
export type UserListQuery = z.infer<typeof userListSchema>;
export type MatchListQuery = z.infer<typeof matchListSchema>;
export type ActionListQuery = z.infer<typeof actionListSchema>;

export function parseInput<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AuthError("INVALID_REQUEST");
  return parsed.data;
}
import { AuthError } from "../auth/authErrors";
export const resourceId = (value: unknown) => parseInput(z.string().uuid(), value);
