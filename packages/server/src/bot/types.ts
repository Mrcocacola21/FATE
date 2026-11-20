import type { DraftChoice, GameAction } from "rules";

/** The three bots a player can challenge, weakest first. */
export const BOT_DIFFICULTIES = ["apprentice", "sorcerer", "archmage"] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];

export function isBotDifficulty(value: unknown): value is BotDifficulty {
  return typeof value === "string" && (BOT_DIFFICULTIES as readonly string[]).includes(value);
}

/**
 * The bot's own randomness. It never touches the match RNG: the bot's choices are journaled like
 * any player's commands, so replay never needs to re-run the bot.
 */
export interface BotRandom {
  /** A float in [0, 1). */
  next(): number;
}

/** Difficulty is the quality of decisions, never extra knowledge or rule exceptions. */
export interface BotProfile {
  /** Chance of taking a random reasonable option instead of the best one. */
  blunder: number;
  /** Chance of considering abilities at all on a given decision. */
  abilityUse: number;
  /** Looks one step ahead inside its own activation (where a move leaves an attack). */
  lookahead: boolean;
  /** Weighs the danger of ending next to visible enemies. */
  caution: boolean;
  /** Prefers finishing wounded targets and valuable figures. */
  focusFire: boolean;
}

export const BOT_PROFILES: Record<BotDifficulty, BotProfile> = {
  apprentice: { blunder: 0.6, abilityUse: 0.2, lookahead: false, caution: false, focusFire: false },
  sorcerer: { blunder: 0.05, abilityUse: 0.7, lookahead: true, caution: false, focusFire: true },
  archmage: { blunder: 0, abilityUse: 1, lookahead: true, caution: true, focusFire: true },
};

/** What the bot asks the room to do: the same commands a player's client sends. */
export type BotCommand =
  | { kind: "action"; action: GameAction }
  | { kind: "draftChoice"; choice: DraftChoice | { type: "roll" } }
  | { kind: "draftBan"; heroId: string }
  | { kind: "draftPick"; heroId: string };
