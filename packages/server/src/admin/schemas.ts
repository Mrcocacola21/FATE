import { dateTimeSchema, userRoleSchema, queryIntegerSchema, limitSchema, resourceIdSchema, sortOrderSchema } from "../validation/commonSchemas";
import { parseInput } from "../validation/parseRequest";
export { parseInput } from "../validation/parseRequest";
import { z } from "zod";
import { GameModeIdSchema } from "../schemas";
import { AuditEventType, AuditActorType } from "../audit/events";

export { userRoleSchema } from "../validation/commonSchemas";
const integer = (max: number) => queryIntegerSchema(1, max);
const pagination = { page: integer(1000000).default("1"), limit: limitSchema() };
export const userListSchema = z
  .object({
    ...pagination,
    search: z.string().trim().min(1).max(100).optional(),
    role: userRoleSchema.optional(),
    status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
    sort: z.enum(["createdAt", "updatedAt", "username"]).default("createdAt"),
    order: sortOrderSchema.default("desc"),
  })
  .strict();
const date = dateTimeSchema.optional();
export const matchListSchema = z
  .object({
    ...pagination,
    status: z.enum(["WAITING", "IN_PROGRESS", "FINISHED", "CANCELLED"]).optional(),
    gameMode: GameModeIdSchema.optional(),
    matchType: z.enum(["CASUAL", "RATED"]).optional(),
    participantUserId: resourceIdSchema.optional(),
    matchId: resourceIdSchema.optional(),
    createdFrom: date,
    createdTo: date,
    finishedFrom: date,
    finishedTo: date,
    sort: z.enum(["createdAt", "finishedAt"]).default("createdAt"),
    order: sortOrderSchema.default("desc"),
  })
  .strict()
  .refine((q) => !q.createdFrom || !q.createdTo || q.createdFrom <= q.createdTo, { path: ["createdTo"] })
  .refine((q) => !q.finishedFrom || !q.finishedTo || q.finishedFrom <= q.finishedTo, { path: ["finishedTo"] });
export const actionListSchema = z
  .object({
    page: integer(1000000).default("1"),
    limit: integer(200).default("50"),
    order: sortOrderSchema.default("asc"),
  })
  .strict();
export const blockSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();
export const auditListSchema = z
  .object({
    page: integer(1000000).default("1"),
    limit: integer(200).default("50"),
    eventType: z.nativeEnum(AuditEventType).optional(),
    actorType: z.nativeEnum(AuditActorType).optional(),
    actorUserId: resourceIdSchema.optional(),
    targetUserId: resourceIdSchema.optional(),
    matchId: resourceIdSchema.optional(),
    dateFrom: date,
    dateTo: date,
  })
  .strict()
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, { path: ["dateTo"] });
export type AuditListQuery = z.infer<typeof auditListSchema>;
export const rolePatchSchema = z.object({ role: userRoleSchema }).strict();
export type UserListQuery = z.infer<typeof userListSchema>;
export type MatchListQuery = z.infer<typeof matchListSchema>;
export type ActionListQuery = z.infer<typeof actionListSchema>;

export const resourceId = (value: unknown, field = "id") =>
  parseInput(z.object({ [field]: resourceIdSchema }).strict(), { [field]: value })[field];
