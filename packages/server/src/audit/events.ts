import { AuditEventType, AuditActorType, UserRole } from "@prisma/client";
import { z } from "zod";

export { AuditEventType, AuditActorType };
const role = z.nativeEnum(UserRole);
const actor = z.discriminatedUnion("type", [
  z.object({ type: z.literal(AuditActorType.USER), userId: z.string().uuid(), role }).strict(),
  z.object({ type: z.literal(AuditActorType.SYSTEM) }).strict(),
]);
export const auditMetadataSchemas = {
  USER_BLOCKED: z.object({ targetRole: role }).strict(),
  USER_UNBLOCKED: z.object({ targetRole: role }).strict(),
  USER_ROLE_CHANGED: z.object({ previousRole: role, newRole: role }).strict(),
  CHAT_MUTED: z
    .object({
      until: z.string().datetime(),
      hours: z.number().int().min(1).max(8760),
      reportId: z.string().uuid().nullable(),
    })
    .strict(),
  CHAT_UNMUTED: z.object({ previousUntil: z.string().datetime() }).strict(),
  CHAT_REPORT_RESOLVED: z
    .object({
      reportId: z.string().uuid(),
      outcome: z.enum(["MUTED", "DISMISSED"]),
      source: z.enum(["MATCH", "SPECTATORS", "DIRECT"]),
      reports: z.number().int().min(1).max(10000),
    })
    .strict(),
  CHAT_REPORT_VIEWED: z
    .object({ reportId: z.string().uuid(), source: z.enum(["MATCH", "SPECTATORS", "DIRECT"]) })
    .strict(),
  MATCH_INTERRUPTED: z
    .object({
      previousStatus: z.enum(["WAITING", "IN_PROGRESS"]),
      newStatus: z.literal("CANCELLED"),
      recoveryReason: z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/),
      lastDurableRevision: z.number().int().min(0).max(2147483647).nullable(),
    })
    .strict(),
};
const humanActor = z
  .object({
    type: z.literal(AuditActorType.USER),
    userId: z.string().uuid(),
    role: z.enum(["MODERATOR", "ADMIN"]),
  })
  .strict();
const user = {
  actor: humanActor,
  targetUserId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
};
export const auditEventSchema = z.discriminatedUnion("eventType", [
  z
    .object({
      ...user,
      eventType: z.literal(AuditEventType.USER_BLOCKED),
      metadata: auditMetadataSchemas.USER_BLOCKED,
    })
    .strict(),
  z
    .object({
      ...user,
      eventType: z.literal(AuditEventType.USER_UNBLOCKED),
      metadata: auditMetadataSchemas.USER_UNBLOCKED,
    })
    .strict(),
  z
    .object({
      ...user,
      actor,
      eventType: z.literal(AuditEventType.USER_ROLE_CHANGED),
      metadata: auditMetadataSchemas.USER_ROLE_CHANGED,
    })
    .strict(),
  ...(["CHAT_MUTED", "CHAT_UNMUTED", "CHAT_REPORT_RESOLVED", "CHAT_REPORT_VIEWED"] as const).map(
    (eventType) =>
      z
        .object({
          ...user,
          eventType: z.literal(AuditEventType[eventType]),
          metadata: auditMetadataSchemas[eventType],
        })
        .strict(),
  ),
  z
    .object({
      eventType: z.literal(AuditEventType.MATCH_INTERRUPTED),
      actor: z.object({ type: z.literal(AuditActorType.SYSTEM) }).strict(),
      matchId: z.string().uuid(),
      metadata: auditMetadataSchemas.MATCH_INTERRUPTED,
    })
    .strict(),
]);
export type AuditEvent = z.infer<typeof auditEventSchema>;
