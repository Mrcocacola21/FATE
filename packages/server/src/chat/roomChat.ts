import { randomUUID } from "node:crypto";
import type { PlayerId } from "rules";

/**
 * Room chat: the two players' channel, which spectators read, and a spectators-only channel.
 * It lives next to the room in memory and never touches GameState, the revision or the
 * action journal, so it is gone with the room and is not part of a replay.
 */
export const CHAT_CHANNELS = ["match", "spectators"] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

/** Short phrases the web shows in the reader's own language. */
export const QUICK_PHRASES = ["goodLuck", "niceMove", "oops", "thanks", "goodGame"] as const;
export type QuickPhraseId = (typeof QUICK_PHRASES)[number];

/** Why a player reports a message; the same list serves room chat and private messages. */
export const CHAT_REPORT_REASONS = ["ABUSE", "SPAM", "CHEATING", "OTHER"] as const;
export type ChatReportReasonId = (typeof CHAT_REPORT_REASONS)[number];
export const CHAT_REPORT_COMMENT_MAX = 300;

export const CHAT_MAX_LENGTH = 200;
export const CHAT_HISTORY_LIMIT = 100;
export const CHAT_RATE_WINDOW_MS = 10_000;
export const CHAT_RATE_MAX_MESSAGES = 5;
const DUPLICATE_WINDOW_MS = 30_000;

export interface ChatSender {
  userId: string;
  username: string;
  name: string;
  seat: PlayerId | null;
}

interface StoredChatMessage {
  id: string;
  channel: ChatChannel;
  sentAt: string;
  sender: ChatSender;
  text?: string;
  phrase?: QuickPhraseId;
}

/** What a client receives. The sender's account id stays on the server. */
export interface ChatMessageDto {
  id: string;
  channel: ChatChannel;
  sentAt: string;
  sender: { username: string; name: string; seat: PlayerId | null };
  /** The recipient sent it. */
  own: boolean;
  text?: string;
  phrase?: QuickPhraseId;
}

export interface ChatAccess {
  read: ChatChannel[];
  write: ChatChannel[];
  /** Set while a moderator's restriction keeps this player from writing in any channel. */
  mutedUntil?: string;
}

/** A connection as chat sees it. */
export interface ChatParticipant {
  role: PlayerId | "spectator";
  seat: PlayerId | null;
  userId: string | null;
}

export type ChatRejectionCode =
  | "CHAT_DISABLED"
  | "CHAT_AUTH_REQUIRED"
  | "CHAT_FORBIDDEN"
  | "CHAT_EMPTY"
  | "CHAT_TOO_LONG"
  | "CHAT_RATE_LIMITED"
  | "CHAT_DUPLICATE"
  | "CHAT_UNAVAILABLE"
  | "CHAT_MUTED"
  | "CHAT_REPORT_INVALID"
  | "CHAT_REPORT_LIMIT"
  | "CHAT_BLOCK_INVALID";

/** Blocks in either direction among the given players, as `[blocker, blocked]` pairs. */
export interface ChatBlockLookup {
  blocksAmong(userIds: string[]): Promise<Array<[string, string]>>;
  /** The same block as on the Friends page: ends a friendship or request between them. */
  block?(blockerId: string, blockedId: string): Promise<void>;
}

export const noChatBlocks: ChatBlockLookup = { blocksAmong: async () => [] };

/** Only test rooms go without chat. */
export function chatAccess(participant: ChatParticipant, roomMode: "normal" | "test"): ChatAccess {
  if (roomMode === "test") return { read: [], write: [] };
  const signedIn = participant.userId !== null;
  if (participant.seat) return { read: ["match"], write: signedIn ? ["match"] : [] };
  return { read: ["match", "spectators"], write: signedIn ? ["spectators"] : [] };
}

// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const BIDI_AND_CONTROL = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/** Strips control and direction-override characters and folds runs of whitespace. */
export function normalizeChatText(raw: string): string {
  return raw.normalize("NFC").replace(BIDI_AND_CONTROL, " ").replace(/\s+/g, " ").trim();
}

export function chatTextLength(text: string): number {
  return [...text].length;
}

/** Per-player send budget across all rooms: 5 messages in 10 seconds, no repeats in a row. */
export class ChatRateLimiter {
  private readonly sent = new Map<string, { times: number[]; lastText: string | null; lastAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Records the send and returns null, or says why it was refused. */
  consume(userId: string, text: string | null):
    | null
    | { code: "CHAT_RATE_LIMITED"; retryAfterMs: number }
    | { code: "CHAT_DUPLICATE" } {
    const now = this.now();
    const entry = this.sent.get(userId) ?? { times: [], lastText: null, lastAt: 0 };
    entry.times = entry.times.filter((at) => now - at < CHAT_RATE_WINDOW_MS);
    if (entry.times.length >= CHAT_RATE_MAX_MESSAGES) {
      this.sent.set(userId, entry);
      return { code: "CHAT_RATE_LIMITED", retryAfterMs: CHAT_RATE_WINDOW_MS - (now - entry.times[0]) };
    }
    if (text !== null && entry.lastText === text && now - entry.lastAt < DUPLICATE_WINDOW_MS)
      return { code: "CHAT_DUPLICATE" };
    entry.times.push(now);
    entry.lastText = text;
    entry.lastAt = now;
    this.sent.set(userId, entry);
    if (this.sent.size > 10_000) this.prune(now);
    return null;
  }

  private prune(now: number) {
    for (const [userId, entry] of this.sent)
      if (now - entry.lastAt > DUPLICATE_WINDOW_MS) this.sent.delete(userId);
  }
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** The set of player pairs that must not see each other's messages. */
export async function loadBlockedPairs(lookup: ChatBlockLookup, userIds: Iterable<string>): Promise<Set<string>> {
  const ids = [...new Set(userIds)];
  if (ids.length < 2) return new Set();
  return new Set((await lookup.blocksAmong(ids)).map(([a, b]) => pairKey(a, b)));
}

export function canReceive(
  message: Pick<StoredChatMessage, "channel" | "sender">,
  recipient: ChatParticipant,
  access: ChatAccess,
  blockedPairs: Set<string>,
): boolean {
  if (!access.read.includes(message.channel)) return false;
  if (recipient.userId && recipient.userId !== message.sender.userId
    && blockedPairs.has(pairKey(recipient.userId, message.sender.userId))) return false;
  return true;
}

export function toChatDto(message: StoredChatMessage, recipient: ChatParticipant): ChatMessageDto {
  return {
    id: message.id,
    channel: message.channel,
    sentAt: message.sentAt,
    sender: { username: message.sender.username, name: message.sender.name, seat: message.sender.seat },
    own: recipient.userId === message.sender.userId,
    ...(message.text !== undefined ? { text: message.text } : {}),
    ...(message.phrase !== undefined ? { phrase: message.phrase } : {}),
  };
}

/** Recent messages of each room, held as long as the room object itself. */
export class RoomChatLog {
  private readonly logs = new WeakMap<object, StoredChatMessage[]>();

  constructor(private readonly now: () => number = Date.now) {}

  append(
    room: object,
    input: { channel: ChatChannel; sender: ChatSender; text?: string; phrase?: QuickPhraseId },
  ): StoredChatMessage {
    const message: StoredChatMessage = {
      id: randomUUID(),
      channel: input.channel,
      sentAt: new Date(this.now()).toISOString(),
      sender: input.sender,
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.phrase !== undefined ? { phrase: input.phrase } : {}),
    };
    const log = this.logs.get(room) ?? [];
    log.push(message);
    // Each channel keeps its own last 100.
    const inChannel = log.filter((item) => item.channel === message.channel);
    if (inChannel.length > CHAT_HISTORY_LIMIT) log.splice(log.indexOf(inChannel[0]), 1);
    this.logs.set(room, log);
    return message;
  }

  messages(room: object): readonly StoredChatMessage[] {
    return this.logs.get(room) ?? [];
  }
}

export type { StoredChatMessage };
