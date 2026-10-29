import {
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  replayDraftHistory,
  RULE_DECLARATION_IDS,
  isHeroSelectableInStandard,
  type DraftState,
  type GameModeId,
  type GameState,
  type HeroSelection,
} from "rules";
import { z } from "zod";

const seat = z.enum(["P1", "P2"]);
const flags = z.object({ P1: z.boolean(), P2: z.boolean() }).strict();
const selection = z
  .object({
    rider: z.string(),
    spearman: z.string(),
    trickster: z.string(),
    assassin: z.string(),
    berserker: z.string(),
    archer: z.string(),
    knight: z.string(),
  })
  .partial()
  .strict();
const validSelection = selection.refine((value) =>
  Object.entries(value).every(([unitClass, heroId]) =>
    isHeroSelectableInStandard(heroId, unitClass as keyof HeroSelection),
  ),
);
const die = z.number().int().min(1).max(6);
const draftEvent = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("ban"),
      player: seat,
      heroId: z.string(),
      primaryClass: z.enum(["rider", "spearman", "trickster", "assassin", "berserker", "archer", "knight"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("pick"),
      player: seat,
      heroId: z.string(),
      primaryClass: z.enum(["rider", "spearman", "trickster", "assassin", "berserker", "archer", "knight"]),
    })
    .strict(),
  z.object({ type: z.literal("roll"), player: seat, dice: z.tuple([die, die]) }).strict(),
  z.object({ type: z.literal("chooseRight"), player: seat, right: z.enum(["draft", "field"]) }).strict(),
  z.object({ type: z.literal("chooseDraftSide"), player: seat, side: z.enum(["first", "last"]) }).strict(),
  z
    .object({ type: z.literal("chooseFieldSide"), player: seat, side: z.enum(["placeFirst", "chooseRule"]) })
    .strict(),
  z.object({ type: z.literal("chooseRule"), player: seat, ruleId: z.enum(RULE_DECLARATION_IDS) }).strict(),
  z.object({ type: z.literal("banSkipped"), player: seat }).strict(),
]);
export const replaySetupSchema = z
  .object({
    formatVersion: z.literal(1),
    gameMode: z.enum(["standard", "classic", "draft"]),
    hostPlayerId: seat.nullable(),
    seats: flags,
    playersReady: flags,
    armies: z.object({ P1: validSelection, P2: validSelection }).strict(),
    // Ties in the draft initiative roll add events; 64 leaves room for several rerolls.
    draftHistory: z.array(draftEvent).max(64).nullable(),
  })
  .strict();
export type ReplaySetup = z.infer<typeof replaySetupSchema>;

/** Compact inputs for lobby changes that do not themselves have revisions. */
export function captureReplaySetup(
  state: GameState,
  gameMode: GameModeId,
  draft: DraftState | null,
): ReplaySetup {
  const armies: { P1: HeroSelection; P2: HeroSelection } = { P1: {}, P2: {} };
  for (const unit of Object.values(state.units)) {
    if (unit.heroId && unit.id.startsWith(`${unit.owner}-${unit.class}-`))
      armies[unit.owner][unit.class] = unit.heroId;
  }
  return replaySetupSchema.parse({
    formatVersion: 1,
    gameMode,
    hostPlayerId: state.hostPlayerId,
    seats: state.seats,
    playersReady: state.playersReady,
    armies,
    draftHistory: draft ? draft.history : null,
  });
}

export function restoreReplaySetup(state: GameState, setup: ReplaySetup): GameState {
  if (state.phase !== "lobby") throw new Error("INVALID_REPLAY_SETUP_PHASE");
  let armies = attachArmy(createEmptyGame(), createDefaultArmy("P1", setup.armies.P1));
  armies = attachArmy(armies, createDefaultArmy("P2", setup.armies.P2));
  return {
    ...state,
    units: armies.units,
    hostPlayerId: setup.hostPlayerId,
    seats: { ...setup.seats },
    playersReady: { ...setup.playersReady },
  };
}

/** The snapshot contract owns GameState, so draft cursor comes from bounded setup inputs. */
export function restoreDraftHistory(setup: ReplaySetup): DraftState | null {
  if (!setup.draftHistory) return null;
  if (setup.gameMode !== "draft") throw new Error("INVALID_DRAFT_MODE");
  return replayDraftHistory(setup.draftHistory);
}
