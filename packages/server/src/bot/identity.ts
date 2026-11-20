import type { ConnectionIdentity } from "../auth/connectionIdentity";
import { isBotDifficulty, type BotDifficulty } from "./types";

/**
 * The bot sits in its seat under a runtime identity that is never an account. Its id cannot be a
 * UUID, so it can never collide with a user, and it is written to the database as no user at all.
 */
const BOT_USER_PREFIX = "bot:";

/** English names; the client shows the localized name from the room's bot metadata. */
const BOT_NAMES: Record<BotDifficulty, string> = {
  apprentice: "Apprentice",
  sorcerer: "Sorcerer",
  archmage: "Archmage",
};

/** The connection id that holds the bot's seat; no socket ever carries it. */
export const BOT_CONNECTION_ID = "server-bot";

export function botIdentity(difficulty: BotDifficulty): ConnectionIdentity {
  return {
    userId: `${BOT_USER_PREFIX}${difficulty}`,
    username: `bot-${difficulty}`,
    displayName: BOT_NAMES[difficulty],
    avatarUrl: null,
    figureFrame: null,
    seal: null,
  };
}

export function botDisplayName(difficulty: BotDifficulty): string {
  return BOT_NAMES[difficulty];
}

export function isBotUserId(userId: string | null | undefined): boolean {
  return typeof userId === "string" && userId.startsWith(BOT_USER_PREFIX);
}

/** What the database stores for a seat's user: the account id, or null for a guest or the bot. */
export function durableUserId(userId: string | null | undefined): string | null {
  return userId && !isBotUserId(userId) ? userId : null;
}

export function botDifficultyOf(userId: string | null | undefined): BotDifficulty | null {
  if (!isBotUserId(userId)) return null;
  const difficulty = userId!.slice(BOT_USER_PREFIX.length);
  return isBotDifficulty(difficulty) ? difficulty : null;
}

/** A room restored from storage takes the bot back into the seat whose identity is the bot's. */
export function attachRestoredBot(room: {
  seatIdentities: Record<"P1" | "P2", ConnectionIdentity | null>;
  seats: { P1: string | null; P2: string | null };
  bot?: { seat: "P1" | "P2"; difficulty: BotDifficulty };
}): void {
  for (const seat of ["P1", "P2"] as const) {
    const difficulty = botDifficultyOf(room.seatIdentities[seat]?.userId);
    if (!difficulty) continue;
    room.bot = { seat, difficulty };
    room.seats[seat] = BOT_CONNECTION_ID;
  }
}
