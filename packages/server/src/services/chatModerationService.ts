import type { FastifyBaseLogger } from "fastify";
import { AppError } from "../errors/appError";
import { paginated } from "../admin/dto";
import {
  chatReportErrors,
  type ChatReportRepository,
  type ChatReportRow,
  type NewChatReport,
  type ReportContextLine,
} from "../repositories/chatReportRepository";
import { silentChannel, type UserChannel } from "../realtime/userEvents";

export { CHAT_REPORT_REASONS } from "../chat/roomChat";
/** How many messages before the reported one are copied into the report. */
export const CHAT_REPORT_CONTEXT = 10;
export const CHAT_REPORTS_PER_HOUR = 10;
export const CHAT_MUTE_HOURS = [1, 24, 168, 720] as const;

export const chatModerationErrors = {
  muted: (until: Date) =>
    new AppError("CHAT_MUTED", 403, "A moderator has restricted your chat.", { until: until.toISOString() }),
  reportLimit: () => new AppError("CHAT_REPORT_LIMIT", 429, "Too many reports. Try again later."),
  reportInvalid: () => new AppError("CHAT_REPORT_INVALID", 400, "This message cannot be reported."),
};

/** The parts of a report the room chat and private messages need. */
export interface ChatModeration {
  /** A restriction still in force, or null. */
  mutedUntil(userId: string): Promise<Date | null>;
  /** "limited" when the reporter used up this hour's reports; a repeat is accepted quietly. */
  report(input: NewChatReport): Promise<"created" | "duplicate" | "limited">;
}

export const noChatModeration: ChatModeration = {
  mutedUntil: async () => null,
  report: async () => "created",
};

type Person = ChatReportRow["reporter"];
const toPerson = (user: Person) => ({
  id: user.id,
  username: user.profile?.username ?? null,
  displayName: user.profile?.displayName ?? null,
});

function contextLines(value: unknown): ReportContextLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) =>
    line && typeof line === "object" && typeof line.text === "string" && typeof line.sentAt === "string"
      ? [
          {
            name: typeof line.name === "string" ? line.name : "",
            username: typeof line.username === "string" ? line.username : "",
            text: line.text,
            sentAt: line.sentAt,
            reported: line.reported === true,
          },
        ]
      : [],
  );
}

function toReportSummary(row: ChatReportRow, reports: number) {
  return {
    id: row.id,
    source: row.source,
    reason: row.reason,
    status: row.status,
    body: row.body,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    reporter: toPerson(row.reporter),
    reported: toPerson(row.reported),
    /** Every report on this message, this one included. */
    reports,
  };
}

/** Player reports of chat messages, and the moderators' answers to them. */
export class ChatModerationService implements ChatModeration {
  constructor(
    private readonly reports: ChatReportRepository,
    private readonly channel: UserChannel = silentChannel,
    private readonly now: () => Date = () => new Date(),
    private readonly log?: FastifyBaseLogger,
  ) {}

  mutedUntil(userId: string) {
    return this.reports.mutedUntil(userId, this.now());
  }

  async report(input: NewChatReport) {
    const since = new Date(this.now().getTime() - 60 * 60 * 1000);
    if ((await this.reports.countSince(input.reporterId, since)) >= CHAT_REPORTS_PER_HOUR) return "limited" as const;
    return (await this.reports.create(input)) ? ("created" as const) : ("duplicate" as const);
  }

  async list(query: { status: "OPEN" | "CLOSED"; page: number; limit: number }) {
    const { total, open, items, perMessage } = await this.reports.list(query);
    return {
      ...paginated(
        query,
        total,
        items.map((row) => toReportSummary(row, perMessage.get(row.messageKey) ?? 1)),
      ),
      open,
    };
  }

  /** Opening a report on private messages is written to the audit log. */
  async get(actor: { id: string; role: "USER" | "MODERATOR" | "ADMIN"; blockedAt: Date | null }, id: string) {
    const { report, sameMessage, history, resolvedBy } = await this.reports.get(id);
    if (report.source === "DIRECT") await this.reports.recordViewed(actor, report, this.now());
    const count = (status: string) => history.find((row) => row.status === status)?._count._all ?? 0;
    const now = this.now();
    return {
      report: {
        ...toReportSummary(report, sameMessage),
        roomId: report.roomId,
        matchId: report.matchId,
        context: contextLines(report.context),
        resolvedBy: resolvedBy ? toPerson(resolvedBy) : null,
        reportedChat: {
          mutedUntil:
            report.reported.chatMutedUntil && report.reported.chatMutedUntil > now
              ? report.reported.chatMutedUntil.toISOString()
              : null,
          muteReason: report.reported.chatMuteReason,
          openReports: count("OPEN"),
          mutedReports: count("MUTED"),
          dismissedReports: count("DISMISSED"),
        },
      },
    };
  }

  async resolve(actorId: string, id: string, decision: { mute: false } | { mute: true; hours: number; reason?: string }) {
    const result = await this.reports.resolve(actorId, id, decision, this.now());
    if (result.mutedUntil) this.tell(result.reportedId, result.mutedUntil);
    return {
      status: decision.mute ? ("MUTED" as const) : ("DISMISSED" as const),
      mutedUntil: result.mutedUntil?.toISOString() ?? null,
    };
  }

  async mute(actorId: string, targetId: string, hours: number, reason?: string): Promise<{ mutedUntil: string | null }> {
    const until = await this.reports.mute(actorId, targetId, hours, reason, this.now());
    this.tell(targetId, until);
    return { mutedUntil: until.toISOString() };
  }

  async unmute(actorId: string, targetId: string): Promise<{ mutedUntil: string | null }> {
    if (await this.reports.unmute(actorId, targetId, this.now())) this.tell(targetId, null);
    return { mutedUntil: null };
  }

  openCount() {
    return this.reports.countOpen();
  }

  /** The player's open pages update their chat boxes at once. */
  private tell(userId: string, until: Date | null) {
    try {
      this.channel.send(userId, { type: "chatMuted", until: until?.toISOString() ?? null });
    } catch (error) {
      this.log?.warn({ event: "chat_mute_push_failed", err: error }, "Could not push a chat restriction");
    }
  }
}

export { chatReportErrors };
