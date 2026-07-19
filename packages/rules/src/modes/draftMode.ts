import type { PlayerId, UnitClass } from "../model";
import { HERO_CATALOG, type HeroAvailabilityReason, type HeroSelection } from "../heroes";
import { createDefaultArmy } from "../actions/armyActions";
import { HERO_REGISTRY_LIST } from "../heroMeta";

export type HeroDraftMeta = {
  heroId: string;
  primaryClass: UnitClass;
  implemented: boolean;
  draftEnabled: boolean;
  isBase: boolean;
  reason?: HeroAvailabilityReason;
};

export type DraftPlayer = PlayerId;
export type DraftPhase = "ban" | "pick" | "complete";

export type DraftLockReason =
  | "banned"
  | "picked"
  | "base_unit_not_allowed"
  | "hero_not_draftable"
  | "class_slot_already_filled"
  | "ban_would_break_class_pool"
  | "max_bans_per_class_reached"
  | "not_current_player"
  | "draft_phase_mismatch"
  | "invalid_draft_hero";

export type DraftEvent =
  | {
      type: "ban";
      player: DraftPlayer;
      heroId: string;
      primaryClass: UnitClass;
    }
  | {
      type: "pick";
      player: DraftPlayer;
      heroId: string;
      primaryClass: UnitClass;
    };

export type DraftState = {
  mode: "safe-class-draft";
  phase: DraftPhase;
  stepIndex: number;
  currentPlayer: DraftPlayer;
  bannedHeroIds: string[];
  picks: {
    P1: Partial<Record<UnitClass, string>>;
    P2: Partial<Record<UnitClass, string>>;
  };
  history: DraftEvent[];
};

export type DraftCommandResult =
  | {
      ok: true;
      state: DraftState;
      event: DraftEvent;
    }
  | {
      ok: false;
      reason: DraftLockReason;
      state: DraftState;
    };

export const DRAFT_CLASSES: UnitClass[] = [
  "knight",
  "spearman",
  "rider",
  "archer",
  "assassin",
  "trickster",
  "berserker",
];

export const DRAFT_BAN_ORDER: DraftPlayer[] = ["P1", "P2", "P2", "P1"];
export const DRAFT_TOTAL_BANS = DRAFT_BAN_ORDER.length;
export const DRAFT_PICK_COUNT_PER_PLAYER = DRAFT_CLASSES.length;
export const DRAFT_TOTAL_PICKS = DRAFT_PICK_COUNT_PER_PLAYER * 2;

export type DraftPoolValidationConfig = {
  classes: readonly UnitClass[];
  picksRequiredPerClass: number;
  maxBansPerClass: number;
};

export type DraftPoolShortage = {
  primaryClass: UnitClass;
  available: number;
  required: number;
};

export type DraftPoolValidationResult =
  | { ok: true; counts: Record<UnitClass, number> }
  | {
      ok: false;
      counts: Record<UnitClass, number>;
      shortages: DraftPoolShortage[];
      message: string;
    };

export function isDraftableHero(
  hero: Partial<HeroDraftMeta>
): hero is HeroDraftMeta {
  return (
    typeof hero.heroId === "string" &&
    hero.implemented === true &&
    hero.draftEnabled === true &&
    hero.isBase === false &&
    DRAFT_CLASSES.includes(hero.primaryClass as UnitClass)
  );
}

export function getDraftableHeroes(
  heroCatalog: ReadonlyArray<Partial<HeroDraftMeta>>
): HeroDraftMeta[] {
  return heroCatalog.filter(isDraftableHero);
}

export function validateDraftPoolForMode(
  config: DraftPoolValidationConfig,
  draftableHeroes: ReadonlyArray<HeroDraftMeta>
): DraftPoolValidationResult {
  const counts = Object.fromEntries(
    DRAFT_CLASSES.map((unitClass) => [unitClass, 0])
  ) as Record<UnitClass, number>;
  for (const hero of getDraftableHeroes(draftableHeroes)) {
    counts[hero.primaryClass] += 1;
  }

  const required = config.picksRequiredPerClass + config.maxBansPerClass;
  const shortages = config.classes.flatMap<DraftPoolShortage>((primaryClass) =>
    counts[primaryClass] < required
      ? [{ primaryClass, available: counts[primaryClass], required }]
      : []
  );
  if (shortages.length === 0) return { ok: true, counts };

  return {
    ok: false,
    counts,
    shortages,
    message: `Invalid draft pool: ${shortages
      .map(
        ({ primaryClass, available, required: classRequired }) =>
          `${primaryClass} has ${available}, requires ${classRequired}`
      )
      .join("; ")}`,
  };
}

const HERO_CLASS_BY_ID = new Map(
  HERO_CATALOG.map((hero) => [hero.id, hero.mainClass])
);

const BASE_HERO_IDS = new Set(
  HERO_REGISTRY_LIST.filter((hero) => hero.id.startsWith("base-")).map(
    (hero) => hero.id
  )
);

export const HERO_DRAFT_META: HeroDraftMeta[] = [
  ...HERO_CATALOG.map((hero) => ({
    heroId: hero.id,
    primaryClass: hero.mainClass,
    implemented: hero.implemented,
    draftEnabled: hero.draftEnabled,
    isBase: false,
    reason: hero.reason,
  })),
  ...HERO_REGISTRY_LIST.filter((hero) => BASE_HERO_IDS.has(hero.id)).map(
    (hero) => ({
      heroId: hero.id,
      primaryClass: hero.mainClass,
      implemented: true,
      draftEnabled: false,
      isBase: true,
    })
  ),
];

export const DRAFT_HERO_POOL: HeroDraftMeta[] = getDraftableHeroes(
  HERO_DRAFT_META
);

export const SAFE_CLASS_DRAFT_POOL_VALIDATION = validateDraftPoolForMode(
  {
    classes: DRAFT_CLASSES,
    picksRequiredPerClass: 2,
    maxBansPerClass: 1,
  },
  DRAFT_HERO_POOL
);

if (!SAFE_CLASS_DRAFT_POOL_VALIDATION.ok) {
  throw new Error(SAFE_CLASS_DRAFT_POOL_VALIDATION.message);
}

const HERO_DRAFT_META_BY_ID = new Map(
  HERO_DRAFT_META.map((hero) => [hero.heroId, hero])
);

export function getHeroDraftMeta(heroId: string): HeroDraftMeta | undefined {
  return HERO_DRAFT_META_BY_ID.get(heroId);
}

export function createSafeClassDraftState(): DraftState {
  return {
    mode: "safe-class-draft",
    phase: "ban",
    stepIndex: 0,
    currentPlayer: DRAFT_BAN_ORDER[0],
    bannedHeroIds: [],
    picks: {
      P1: {},
      P2: {},
    },
    history: [],
  };
}

export function getDraftCurrentPlayer(state: DraftState): DraftPlayer {
  if (state.phase === "ban") {
    return DRAFT_BAN_ORDER[state.stepIndex] ?? "P1";
  }
  if (state.phase === "pick") {
    return getPickOrder()[state.stepIndex] ?? "P1";
  }
  return state.currentPlayer;
}

export function getPickOrder(): DraftPlayer[] {
  const order: DraftPlayer[] = [];
  for (let index = 0; index < DRAFT_TOTAL_PICKS; index += 1) {
    if (index === 0) {
      order.push("P1");
      continue;
    }
    const pairIndex = Math.floor((index - 1) / 2);
    order.push(pairIndex % 2 === 0 ? "P2" : "P1");
  }
  return order;
}

function getPickedHeroIds(state: DraftState): Set<string> {
  return new Set([
    ...Object.values(state.picks.P1).filter(Boolean),
    ...Object.values(state.picks.P2).filter(Boolean),
  ] as string[]);
}

function countBansForClass(state: DraftState, unitClass: UnitClass): number {
  return state.bannedHeroIds.filter(
    (heroId) => getHeroDraftMeta(heroId)?.primaryClass === unitClass
  ).length;
}

function availableDraftHeroesForClass(
  state: DraftState,
  unitClass: UnitClass,
  extraBannedHeroId?: string
): HeroDraftMeta[] {
  const banned = new Set(state.bannedHeroIds);
  if (extraBannedHeroId) banned.add(extraBannedHeroId);
  const picked = getPickedHeroIds(state);
  return DRAFT_HERO_POOL.filter(
    (hero) =>
      hero.primaryClass === unitClass &&
      !banned.has(hero.heroId) &&
      !picked.has(hero.heroId)
  );
}

function validateDraftHero(heroId: string): HeroDraftMeta | DraftLockReason {
  const meta = getHeroDraftMeta(heroId);
  if (!meta) return "invalid_draft_hero";
  if (meta.isBase) return "base_unit_not_allowed";
  if (!isDraftableHero(meta)) return "hero_not_draftable";
  return meta;
}

export function banDraftHero(
  state: DraftState,
  player: DraftPlayer,
  heroId: string
): DraftCommandResult {
  if (state.phase !== "ban") {
    return { ok: false, reason: "draft_phase_mismatch", state };
  }
  if (player !== state.currentPlayer) {
    return { ok: false, reason: "not_current_player", state };
  }

  const meta = validateDraftHero(heroId);
  if (typeof meta === "string") {
    return { ok: false, reason: meta, state };
  }

  if (state.bannedHeroIds.includes(heroId)) {
    return { ok: false, reason: "banned", state };
  }
  if (getPickedHeroIds(state).has(heroId)) {
    return { ok: false, reason: "picked", state };
  }
  if (countBansForClass(state, meta.primaryClass) >= 1) {
    return { ok: false, reason: "max_bans_per_class_reached", state };
  }
  if (availableDraftHeroesForClass(state, meta.primaryClass, heroId).length < 2) {
    return { ok: false, reason: "ban_would_break_class_pool", state };
  }

  const nextStepIndex = state.stepIndex + 1;
  const nextPhase: DraftPhase =
    nextStepIndex >= DRAFT_TOTAL_BANS ? "pick" : "ban";
  const nextCurrentPlayer =
    nextPhase === "pick" ? getPickOrder()[0] : DRAFT_BAN_ORDER[nextStepIndex];
  const event: DraftEvent = {
    type: "ban",
    player,
    heroId,
    primaryClass: meta.primaryClass,
  };
  return {
    ok: true,
    event,
    state: {
      ...state,
      phase: nextPhase,
      stepIndex: nextPhase === "pick" ? 0 : nextStepIndex,
      currentPlayer: nextCurrentPlayer,
      bannedHeroIds: [...state.bannedHeroIds, heroId],
      history: [...state.history, event],
    },
  };
}

export function pickDraftHero(
  state: DraftState,
  player: DraftPlayer,
  heroId: string
): DraftCommandResult {
  if (state.phase !== "pick") {
    return { ok: false, reason: "draft_phase_mismatch", state };
  }
  if (player !== state.currentPlayer) {
    return { ok: false, reason: "not_current_player", state };
  }

  const meta = validateDraftHero(heroId);
  if (typeof meta === "string") {
    return { ok: false, reason: meta, state };
  }

  if (state.bannedHeroIds.includes(heroId)) {
    return { ok: false, reason: "banned", state };
  }
  if (getPickedHeroIds(state).has(heroId)) {
    return { ok: false, reason: "picked", state };
  }
  if (state.picks[player][meta.primaryClass]) {
    return { ok: false, reason: "class_slot_already_filled", state };
  }

  const nextPicks = {
    ...state.picks,
    [player]: {
      ...state.picks[player],
      [meta.primaryClass]: heroId,
    },
  };
  const event: DraftEvent = {
    type: "pick",
    player,
    heroId,
    primaryClass: meta.primaryClass,
  };
  const nextStepIndex = state.stepIndex + 1;
  const complete = isDraftPicksComplete(nextPicks);
  return {
    ok: true,
    event,
    state: {
      ...state,
      phase: complete ? "complete" : "pick",
      stepIndex: nextStepIndex,
      currentPlayer: complete
        ? player
        : getPickOrder()[nextStepIndex] ?? state.currentPlayer,
      picks: nextPicks,
      history: [...state.history, event],
    },
  };
}

export function isDraftPicksComplete(
  picks: DraftState["picks"]
): boolean {
  return (["P1", "P2"] as const).every((player) =>
    DRAFT_CLASSES.every((unitClass) => !!picks[player][unitClass])
  );
}

export function draftPicksToHeroSelection(
  picks: Partial<Record<UnitClass, string>>
): HeroSelection {
  return DRAFT_CLASSES.reduce<HeroSelection>((selection, unitClass) => {
    const heroId = picks[unitClass];
    if (heroId && HERO_CLASS_BY_ID.get(heroId) === unitClass) {
      selection[unitClass] = heroId;
    }
    return selection;
  }, {});
}

export function createDraftArmy(
  player: PlayerId,
  picks: Partial<Record<UnitClass, string>>
) {
  return createDefaultArmy(player, draftPicksToHeroSelection(picks));
}
