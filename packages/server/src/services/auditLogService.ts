import { Prisma, type PrismaClient } from "@prisma/client";
import { auditEventSchema, auditMetadataSchemas, type AuditEvent } from "../audit/events";
import type { AuditListQuery } from "../admin/schemas";
import { getDatabaseClient } from "../db/client";
import { paginated } from "../admin/dto";

/** No arbitrary metadata, client timestamp, update or delete surface. The caller owns the transaction. */
export class AuditLogService {
  async record(tx: Prisma.TransactionClient, input: AuditEvent): Promise<void> {
    const event = auditEventSchema.parse(input);
    const metadata = event.metadata;
    if (Buffer.byteLength(JSON.stringify(metadata), "utf8") > 2048)
      throw new Error("AUDIT_METADATA_TOO_LARGE");
    await tx.auditLog.create({
      data: {
        eventType: event.eventType,
        actorType: event.actor.type,
        actorUserId: event.actor.type === "USER" ? event.actor.userId : null,
        actorRole: event.actor.type === "USER" ? event.actor.role : null,
        targetUserId: "targetUserId" in event ? event.targetUserId : null,
        matchId: "matchId" in event ? event.matchId : null,
        reason: "reason" in event ? event.reason || null : "Restart recovery unavailable",
        metadata,
      },
    });
  }
}

export class AuditLogReader {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}
  async list(query: AuditListQuery) {
    const where: Prisma.AuditLogWhereInput = {
      eventType: query.eventType,
      actorType: query.actorType,
      actorUserId: query.actorUserId,
      targetUserId: query.targetUserId,
      matchId: query.matchId,
      createdAt: { gte: query.dateFrom, lte: query.dateTo },
    };
    return this.database.$transaction(
      async (tx) => {
        const total = await tx.auditLog.count({ where });
        const records = await tx.auditLog.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            id: true,
            eventType: true,
            actorType: true,
            actorUserId: true,
            actorRole: true,
            targetUserId: true,
            matchId: true,
            reason: true,
            metadata: true,
            createdAt: true,
          },
        });
        const ids = [
          ...new Set(
            records
              .flatMap((r) => [r.actorUserId, r.targetUserId])
              .filter((id): id is string => !!id),
          ),
        ];
        const users = ids.length
          ? await tx.user.findMany({
              where: { id: { in: ids } },
              select: { id: true, profile: { select: { username: true, displayName: true } } },
            })
          : [];
        const identities = new Map(
          users.map((u) => [
            u.id,
            {
              id: u.id,
              username: u.profile?.username ?? null,
              displayName: u.profile?.displayName ?? null,
            },
          ]),
        );
        const items = records.map((r) => {
          // Whitelist again on read; never serialize an unrestricted database row or future payload.
          const parsed = auditMetadataSchemas[r.eventType].safeParse(r.metadata);
          return {
            id: r.id,
            eventType: r.eventType,
            actorType: r.actorType,
            actorUserId: r.actorUserId,
            actorRole: r.actorRole,
            actor: r.actorUserId ? (identities.get(r.actorUserId) ?? null) : null,
            targetUserId: r.targetUserId,
            targetUser: r.targetUserId ? (identities.get(r.targetUserId) ?? null) : null,
            matchId: r.matchId,
            reason: r.reason,
            metadata: parsed.success ? parsed.data : null,
            createdAt: r.createdAt.toISOString(),
          };
        });
        return paginated(query, total, items);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
