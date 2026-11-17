import { Prisma, type ChatReportReason, type ChatReportSource, type PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";
import { AuthError } from "../auth/authErrors";
import { AppError } from "../errors/appError";
import { assertCanModerate } from "../admin/policy";
import { AuditLogService } from "../services/auditLogService";
import { AuditActorType, AuditEventType } from "../audit/events";
import { lockAccountAdministration } from "./adminRepository";

/** One line of the copy kept with a report, oldest first. */
export interface ReportContextLine {
  name: string;
  username: string;
  text: string;
  sentAt: string;
  /** The reported message itself. */
  reported: boolean;
}

export interface NewChatReport {
  reporterId: string;
  reportedId: string;
  source: ChatReportSource;
  messageKey: string;
  roomId?: string | null;
  matchId?: string | null;
  body: string;
  context: ReportContextLine[];
  reason: ChatReportReason;
  comment?: string | null;
}

const person = {
  id: true,
  role: true,
  blockedAt: true,
  chatMutedUntil: true,
  chatMuteReason: true,
  profile: { select: { username: true, displayName: true } },
} satisfies Prisma.UserSelect;

export const chatReportSelect = {
  id: true,
  source: true,
  messageKey: true,
  roomId: true,
  matchId: true,
  body: true,
  context: true,
  reason: true,
  comment: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  resolvedById: true,
  reporter: { select: person },
  reported: { select: person },
} satisfies Prisma.ChatReportSelect;
export type ChatReportRow = Prisma.ChatReportGetPayload<{ select: typeof chatReportSelect }>;

/** A moderator reopening the same report within this window is not logged again. */
export const REPORT_VIEW_WINDOW_MS = 5 * 60 * 1000;

export const chatReportErrors = {
  notFound: () => new AppError("CHAT_REPORT_NOT_FOUND", 404, "Report not found."),
  closed: () => new AppError("CHAT_REPORT_CLOSED", 409, "This report is already closed."),
};

type Actor = { id: string; role: "USER" | "MODERATOR" | "ADMIN"; blockedAt: Date | null };

export class ChatReportRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  /** False when this reporter already reported the message. */
  async create(input: NewChatReport): Promise<boolean> {
    try {
      await this.database.chatReport.create({
        data: { ...input, context: input.context as unknown as Prisma.InputJsonValue },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  countSince(reporterId: string, since: Date) {
    return this.database.chatReport.count({ where: { reporterId, createdAt: { gte: since } } });
  }

  async mutedUntil(userId: string, now: Date): Promise<Date | null> {
    const user = await this.database.user.findUnique({ where: { id: userId }, select: { chatMutedUntil: true } });
    return user?.chatMutedUntil && user.chatMutedUntil > now ? user.chatMutedUntil : null;
  }

  async list(query: { status: "OPEN" | "CLOSED"; page: number; limit: number }) {
    const where: Prisma.ChatReportWhereInput =
      query.status === "OPEN" ? { status: "OPEN" } : { status: { not: "OPEN" } };
    const [total, items, open] = await this.database.$transaction([
      this.database.chatReport.count({ where }),
      this.database.chatReport.findMany({
        where,
        select: chatReportSelect,
        orderBy: query.status === "OPEN" ? [{ createdAt: "asc" }, { id: "asc" }] : [{ resolvedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.database.chatReport.count({ where: { status: "OPEN" } }),
    ]);
    const keys = [...new Set(items.map((item) => item.messageKey))];
    const counts = keys.length
      ? await this.database.chatReport.groupBy({
          by: ["messageKey"],
          where: { messageKey: { in: keys } },
          _count: { _all: true },
        })
      : [];
    const perMessage = new Map(counts.map((row) => [row.messageKey, row._count._all]));
    return { total, open, items, perMessage };
  }

  async countOpen() {
    return this.database.chatReport.count({ where: { status: "OPEN" } });
  }

  async get(id: string) {
    const report = await this.database.chatReport.findUnique({ where: { id }, select: chatReportSelect });
    if (!report) throw chatReportErrors.notFound();
    const [sameMessage, history, resolvedBy] = await Promise.all([
      this.database.chatReport.count({ where: { messageKey: report.messageKey } }),
      this.database.chatReport.groupBy({
        by: ["status"],
        where: { reportedId: report.reported.id, id: { not: report.id } },
        _count: { _all: true },
      }),
      report.resolvedById
        ? this.database.user.findUnique({ where: { id: report.resolvedById }, select: person })
        : null,
    ]);
    return { report, sameMessage, history, resolvedBy };
  }

  /**
   * One audit row per moderator and report within `window`: reloads, double-mounted effects and
   * the refresh after a decision do not repeat it. Concurrent opens wait on the same lock.
   */
  async recordViewed(actor: Actor, report: ChatReportRow, now: Date, windowMs = REPORT_VIEW_WINDOW_MS) {
    await this.database.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`chat-report-view:${actor.id}:${report.id}`}))`;
      const recent = await tx.auditLog.findFirst({
        where: {
          eventType: AuditEventType.CHAT_REPORT_VIEWED,
          actorUserId: actor.id,
          createdAt: { gte: new Date(now.getTime() - windowMs) },
          metadata: { path: ["reportId"], equals: report.id },
        },
        select: { id: true },
      });
      if (recent) return;
      await new AuditLogService().record(tx, {
        eventType: AuditEventType.CHAT_REPORT_VIEWED,
        actor: { type: AuditActorType.USER, userId: actor.id, role: actor.role as "MODERATOR" | "ADMIN" },
        targetUserId: report.reported.id,
        metadata: { reportId: report.id, source: report.source },
      });
    });
  }

  /**
   * Closes every open report on the same message, optionally restricting the author's chat.
   * Returns the new restriction end when one was set.
   */
  async resolve(
    actorId: string,
    reportId: string,
    decision: { mute: false } | { mute: true; hours: number; reason?: string },
    now: Date,
  ): Promise<{ reportedId: string; mutedUntil: Date | null }> {
    return this.database.$transaction(async (tx) => {
      await lockAccountAdministration(tx);
      const actor = await this.actor(tx, actorId);
      const report = await tx.chatReport.findUnique({ where: { id: reportId }, select: chatReportSelect });
      if (!report) throw chatReportErrors.notFound();
      if (report.status !== "OPEN") throw chatReportErrors.closed();
      if (decision.mute) assertCanModerate(actor, report.reported, true);
      const closed = await tx.chatReport.updateMany({
        where: { messageKey: report.messageKey, status: "OPEN" },
        data: { status: decision.mute ? "MUTED" : "DISMISSED", resolvedAt: now, resolvedById: actor.id },
      });
      const auditActor = { type: AuditActorType.USER, userId: actor.id, role: actor.role as "MODERATOR" | "ADMIN" };
      await new AuditLogService().record(tx, {
        eventType: AuditEventType.CHAT_REPORT_RESOLVED,
        actor: auditActor,
        targetUserId: report.reported.id,
        ...(decision.mute && decision.reason ? { reason: decision.reason } : {}),
        metadata: {
          reportId: report.id,
          outcome: decision.mute ? "MUTED" : "DISMISSED",
          source: report.source,
          reports: Math.max(1, closed.count),
        },
      });
      const mutedUntil = decision.mute
        ? await this.applyMute(tx, auditActor, report.reported, decision.hours, decision.reason, report.id, now)
        : null;
      return { reportedId: report.reported.id, mutedUntil };
    });
  }

  async mute(actorId: string, targetId: string, hours: number, reason: string | undefined, now: Date) {
    return this.database.$transaction(async (tx) => {
      await lockAccountAdministration(tx);
      const actor = await this.actor(tx, actorId);
      const target = await tx.user.findUnique({ where: { id: targetId }, select: person });
      if (!target) throw new AuthError("USER_NOT_FOUND");
      assertCanModerate(actor, target, true);
      const auditActor = { type: AuditActorType.USER, userId: actor.id, role: actor.role as "MODERATOR" | "ADMIN" };
      return this.applyMute(tx, auditActor, target, hours, reason, null, now);
    });
  }

  /** Null when there was nothing to lift. */
  async unmute(actorId: string, targetId: string, now: Date) {
    return this.database.$transaction(async (tx) => {
      await lockAccountAdministration(tx);
      const actor = await this.actor(tx, actorId);
      const target = await tx.user.findUnique({ where: { id: targetId }, select: person });
      if (!target) throw new AuthError("USER_NOT_FOUND");
      assertCanModerate(actor, target, false);
      if (!target.chatMutedUntil || target.chatMutedUntil <= now) return false;
      await tx.user.update({ where: { id: targetId }, data: { chatMutedUntil: null, chatMuteReason: null } });
      await new AuditLogService().record(tx, {
        eventType: AuditEventType.CHAT_UNMUTED,
        actor: { type: AuditActorType.USER, userId: actor.id, role: actor.role as "MODERATOR" | "ADMIN" },
        targetUserId: target.id,
        metadata: { previousUntil: target.chatMutedUntil.toISOString() },
      });
      return true;
    });
  }

  private async actor(tx: Prisma.TransactionClient, actorId: string) {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: person });
    if (!actor) throw new AuthError("UNAUTHORIZED");
    return actor;
  }

  /** A longer restriction already in force is kept. */
  private async applyMute(
    tx: Prisma.TransactionClient,
    actor: { type: "USER"; userId: string; role: "MODERATOR" | "ADMIN" },
    target: { id: string; chatMutedUntil: Date | null },
    hours: number,
    reason: string | undefined,
    reportId: string | null,
    now: Date,
  ) {
    const requested = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const until = target.chatMutedUntil && target.chatMutedUntil > requested ? target.chatMutedUntil : requested;
    await tx.user.update({ where: { id: target.id }, data: { chatMutedUntil: until, chatMuteReason: reason || null } });
    await new AuditLogService().record(tx, {
      eventType: AuditEventType.CHAT_MUTED,
      actor,
      targetUserId: target.id,
      ...(reason ? { reason } : {}),
      metadata: { until: until.toISOString(), hours, reportId },
    });
    return until;
  }
}

export type { ChatReportReason, ChatReportSource };
