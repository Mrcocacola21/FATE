import type { FastifyBaseLogger } from "fastify";
import { AuthError } from "../auth/authErrors";
import { ChatRateLimiter, chatTextLength, normalizeChatText } from "../chat/roomChat";
import { AppError } from "../errors/appError";
import type { DirectMessageRepository, DirectMessageRow } from "../repositories/directMessageRepository";
import type { FriendRepository } from "../repositories/friendRepository";
import { silentChannel, type UserChannel } from "../realtime/userEvents";
import { toPlayerDto, type PlayerDto } from "./friendService";
import {
  CHAT_REPORT_CONTEXT,
  chatModerationErrors,
  noChatModeration,
  type ChatModeration,
} from "./chatModerationService";
import { CHAT_REPORT_COMMENT_MAX, type ChatReportReasonId } from "../chat/roomChat";

export const DIRECT_MESSAGE_MAX_LENGTH = 1000;
export const DIRECT_MESSAGE_PAGE = 50;
export const CONVERSATION_LIMIT = 50;
export const DIRECT_MESSAGE_RETENTION_DAYS = 180;

export interface DirectMessageDto {
  id: string;
  from: string;
  to: string;
  text: string;
  sentAt: string;
  readAt: string | null;
}

export interface ConversationDto {
  player: PlayerDto;
  lastMessage: DirectMessageDto;
  unread: number;
  /** Friends who have not blocked each other can write, unless the other turned messages off. */
  canSend: boolean;
}

export const directMessageErrors = {
  self: () => new AppError("MESSAGE_SELF", 400, "You cannot message yourself."),
  empty: () => new AppError("MESSAGE_EMPTY", 400, "The message is empty."),
  tooLong: () => new AppError("MESSAGE_TOO_LONG", 400, "The message is too long."),
  notAllowed: () => new AppError("MESSAGE_NOT_ALLOWED", 403, "You can only message your friends."),
  duplicate: () => new AppError("MESSAGE_DUPLICATE", 409, "You just sent this message."),
};

export function toDirectMessageDto(row: DirectMessageRow): DirectMessageDto {
  return {
    id: row.id,
    from: row.senderId,
    to: row.recipientId,
    text: row.body,
    sentAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  };
}

type FriendLookups = Pick<FriendRepository, "findPlayerById" | "findPair" | "blocksBetween">;

/** Private messages between friends. A block in either direction hides the whole conversation. */
export class DirectMessageService {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly messages: DirectMessageRepository,
    private readonly friends: FriendLookups,
    private readonly channel: UserChannel = silentChannel,
    private readonly limiter = new ChatRateLimiter(),
    private readonly now: () => Date = () => new Date(),
    private readonly log?: FastifyBaseLogger,
    private readonly moderation: Pick<ChatModeration, "mutedUntil" | "report"> = noChatModeration,
  ) {}

  private async relation(userId: string, targetId: string) {
    if (userId === targetId) throw directMessageErrors.self();
    const target = await this.friends.findPlayerById(targetId);
    if (!target) throw new AuthError("USER_NOT_FOUND");
    const [pair, blocks] = await Promise.all([
      this.friends.findPair(userId, targetId),
      this.friends.blocksBetween(userId, targetId),
    ]);
    const blocked = blocks.iBlocked || blocks.blockedMe;
    const open = target.directMessages !== "NOBODY";
    return { target, blocked, canSend: !blocked && open && pair?.status === "ACCEPTED" };
  }

  async send(userId: string, targetId: string, raw: string): Promise<DirectMessageDto> {
    const text = normalizeChatText(raw);
    if (!text) throw directMessageErrors.empty();
    if (chatTextLength(text) > DIRECT_MESSAGE_MAX_LENGTH) throw directMessageErrors.tooLong();
    const { canSend } = await this.relation(userId, targetId);
    if (!canSend) throw directMessageErrors.notAllowed();
    const mutedUntil = await this.moderation.mutedUntil(userId);
    if (mutedUntil) throw chatModerationErrors.muted(mutedUntil);
    const limited = this.limiter.consume(userId, `${targetId}:${text}`);
    if (limited?.code === "CHAT_DUPLICATE") throw directMessageErrors.duplicate();
    if (limited) throw new AuthError("RATE_LIMITED");
    const message = toDirectMessageDto(await this.messages.create({ senderId: userId, recipientId: targetId, body: text }));
    try {
      this.channel.send(userId, { type: "directMessage", message });
      if (this.channel.isOnline(targetId))
        this.channel.send(targetId, { type: "directMessage", message, unread: await this.messages.countUnread(targetId) });
    } catch (error) {
      this.log?.warn({ event: "direct_message_push_failed", err: error }, "Could not push a direct message");
    }
    return message;
  }

  /** One page of a conversation, oldest first; `before` is the id of the oldest message held. */
  async history(userId: string, targetId: string, beforeId?: string) {
    const [{ target, blocked, canSend }, muted] = await Promise.all([
      this.relation(userId, targetId),
      this.moderation.mutedUntil(userId),
    ]);
    const player = toPlayerDto(target);
    const mutedUntil = muted?.toISOString() ?? null;
    if (blocked) return { player, messages: [] as DirectMessageDto[], hasMore: false, canSend: false, mutedUntil };
    let before: { createdAt: Date; id: string } | undefined;
    if (beforeId) {
      const anchor = await this.messages.findById(beforeId);
      const inConversation = anchor && [anchor.senderId, anchor.recipientId].sort().join() === [userId, targetId].sort().join();
      if (!inConversation) throw new AppError("MESSAGE_NOT_FOUND", 404, "Message not found.");
      before = { createdAt: anchor.createdAt, id: anchor.id };
    }
    const rows = await this.messages.page(userId, targetId, DIRECT_MESSAGE_PAGE + 1, before);
    const hasMore = rows.length > DIRECT_MESSAGE_PAGE;
    return {
      player,
      messages: rows.slice(0, DIRECT_MESSAGE_PAGE).reverse().map(toDirectMessageDto),
      hasMore,
      canSend,
      mutedUntil,
    };
  }

  async conversations(userId: string) {
    const latest = await this.messages.latestPerConversation(userId, CONVERSATION_LIMIT);
    const partnerOf = (row: DirectMessageRow) => (row.senderId === userId ? row.recipientId : row.senderId);
    const [partners, unread] = await Promise.all([
      this.messages.partners(userId, latest.map(partnerOf)),
      this.messages.unreadBySender(userId),
    ]);
    const profiles = new Map(partners.profiles.map((profile) => [profile.userId, profile]));
    const conversations: ConversationDto[] = [];
    for (const row of latest) {
      const partnerId = partnerOf(row);
      const profile = profiles.get(partnerId);
      if (!profile || partners.blocked.has(partnerId)) continue;
      conversations.push({
        player: toPlayerDto(profile),
        lastMessage: toDirectMessageDto(row),
        unread: unread.get(partnerId) ?? 0,
        canSend: partners.friends.has(partnerId) && profile.directMessages !== "NOBODY",
      });
    }
    return { conversations, unread: conversations.reduce((sum, item) => sum + item.unread, 0) };
  }

  async unreadCount(userId: string) {
    return { unread: await this.messages.countUnread(userId) };
  }

  /**
   * Reports a message the other player sent in this conversation. The message and up to ten
   * before it are copied into the report, so it outlives the 180-day retention.
   */
  async report(userId: string, targetId: string, messageId: string, reason: ChatReportReasonId, rawComment?: string) {
    if (userId === targetId) throw directMessageErrors.self();
    const message = await this.messages.findById(messageId);
    if (!message || message.senderId !== targetId || message.recipientId !== userId)
      throw chatModerationErrors.reportInvalid();
    const [earlier, reporter, reported] = await Promise.all([
      this.messages.page(userId, targetId, CHAT_REPORT_CONTEXT, { createdAt: message.createdAt, id: message.id }),
      this.friends.findPlayerById(userId),
      this.friends.findPlayerById(targetId),
    ]);
    const nameOf = (id: string) => {
      const profile = id === userId ? reporter : reported;
      return { name: profile?.displayName || profile?.username || "", username: profile?.username ?? "" };
    };
    const comment = rawComment ? normalizeChatText(rawComment) : "";
    const outcome = await this.moderation.report({
      reporterId: userId,
      reportedId: targetId,
      source: "DIRECT",
      messageKey: message.id,
      body: message.body,
      context: [...earlier.reverse(), message].map((row) => ({
        ...nameOf(row.senderId),
        text: row.body,
        sentAt: row.createdAt.toISOString(),
        reported: row.id === message.id,
      })),
      reason,
      comment: comment ? [...comment].slice(0, CHAT_REPORT_COMMENT_MAX).join("") : null,
    });
    if (outcome === "limited") throw chatModerationErrors.reportLimit();
  }

  /** Marks everything the other player sent as read and tells both sides. */
  async markRead(userId: string, targetId: string) {
    const { blocked } = await this.relation(userId, targetId);
    const readAt = this.now();
    const changed = blocked ? 0 : await this.messages.markRead(userId, targetId, readAt);
    const unread = await this.messages.countUnread(userId);
    if (changed > 0) {
      const event = { type: "directMessagesRead" as const, readerId: userId, partnerId: targetId, readAt: readAt.toISOString() };
      this.channel.send(userId, { ...event, unread });
      this.channel.send(targetId, event);
    }
    return { unread };
  }

  async prune() {
    const cutoff = new Date(this.now().getTime() - DIRECT_MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    try {
      const removed = await this.messages.deleteOlderThan(cutoff);
      if (removed) this.log?.info({ event: "direct_messages_pruned", removed }, "Old direct messages deleted");
    } catch (error) {
      this.log?.warn({ event: "direct_messages_prune_failed", err: error }, "Could not delete old direct messages");
    }
  }

  start(intervalMs = 6 * 60 * 60 * 1000) {
    if (this.timer) return;
    void this.prune();
    this.timer = setInterval(() => void this.prune(), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
