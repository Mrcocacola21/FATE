import {
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  createSafeClassDraftState,
  banDraftHero,
  pickDraftHero,
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
const draftEvent = z
  .object({
    type: z.enum(["ban", "pick"]),
    player: seat,
    heroId: z.string(),
    primaryClass: z.enum([
      "rider",
      "spearman",
      "trickster",
      "assassin",
      "berserker",
      "archer",
      "knight",
    ]),
  })
  .strict();
export const replaySetupSchema = z
  .object({
    formatVersion: z.literal(1),
    gameMode: z.enum(["standard", "classic", "draft"]),
    hostPlayerId: seat.nullable(),
    seats: flags,
    playersReady: flags,
    armies: z.object({ P1: validSelection, P2: validSelection }).strict(),
    draftHistory: z.array(draftEvent).max(32).nullable(),
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
  let draft = createSafeClassDraftState();
  for (const event of setup.draftHistory) {
    const result =
      event.type === "ban"
        ? banDraftHero(draft, event.player, event.heroId)
        : pickDraftHero(draft, event.player, event.heroId);
    if (!result.ok || result.event.primaryClass !== event.primaryClass)
      throw new Error("INVALID_DRAFT_HISTORY");
    draft = result.state;
  }
  return draft;
}
