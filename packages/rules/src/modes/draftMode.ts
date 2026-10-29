import type { GameState, PlayerId, UnitClass } from "../model";
import { isRuleDeclarationId, type RuleDeclarationId } from "../ruleDeclarations/types";
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
/**
 * A draft opens with the privilege steps (initiative roll, the two rights, their sides and the
 * rule), then bans and picks. Legacy drafts recorded before privileges start straight at "ban".
 */
export type DraftPhase =
  | "initiative"
  | "right"
  | "draftSide"
  | "fieldSide"
  | "rule"
  | "ban"
  | "pick"
  | "complete";

/** The initiative winner keeps one right; the other player gets the other. */
export type DraftRight = "draft" | "field";
/** The draft right: pick first (with the first and last opening bans) or pick last. */
export type DraftSide = "first" | "last";
/** The field right: place first, or choose the rule and place second. */
export type FieldSide = "placeFirst" | "chooseRule";

export type DraftLockReason =
  | "banned"
  | "picked"
  | "base_unit_not_allowed"
  | "hero_not_draftable"
  | "class_slot_already_filled"
  | "ban_would_break_class_pool"
  | "max_bans_per_class_reached"
  | "ban_would_force_pick"
  | "ban_class_not_contested"
  | "not_current_player"
  | "draft_phase_mismatch"
  | "invalid_draft_hero"
  | "invalid_draft_choice";

export type DraftHeroEvent = {
  type: "ban" | "pick";
  player: DraftPlayer;
  heroId: string;
  primaryClass: UnitClass;
};

export type DraftEvent =
  | DraftHeroEvent
  | { type: "roll"; player: DraftPlayer; dice: number[] }
  | { type: "chooseRight"; player: DraftPlayer; right: DraftRight }
  | { type: "chooseDraftSide"; player: DraftPlayer; side: DraftSide }
  | { type: "chooseFieldSide"; player: DraftPlayer; side: FieldSide }
  | { type: "chooseRule"; player: DraftPlayer; ruleId: RuleDeclarationId }
  /** A mid-draft ban with no legal target passes automatically. */
  | { type: "banSkipped"; player: DraftPlayer };

export type DraftPrivileges = {
  /** The current initiative attempt; a tie clears both and they roll again. */
  rolls: { P1: number[] | null; P2: number[] | null };
  initiativeWinner: DraftPlayer | null;
  draftHolder: DraftPlayer | null;
  fieldHolder: DraftPlayer | null;
  firstPicker: DraftPlayer | null;
  placementFirst: DraftPlayer | null;
  ruleId: RuleDeclarationId | null;
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
  /** Absent on legacy drafts, which use the fixed P1-first order and one ban round. */
  privileges?: DraftPrivileges;
};

/** Choices a player makes before the bans; the server supplies the dice of a roll. */
export type DraftChoice =
  | { type: "roll"; dice: number[] }
  | { type: "chooseRight"; right: DraftRight }
  | { type: "chooseDraftSide"; side: DraftSide }
  | { type: "chooseFieldSide"; side: FieldSide }
  | { type: "chooseRule"; ruleId: RuleDeclarationId };

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

function otherDraftPlayer(player: DraftPlayer): DraftPlayer {
  return player === "P1" ? "P2" : "P1";
}

function emptyDraftPrivileges(): DraftPrivileges {
  return {
    rolls: { P1: null, P2: null },
    initiativeWinner: null,
    draftHolder: null,
    fieldHolder: null,
    firstPicker: null,
    placementFirst: null,
    ruleId: null,
  };
}

/** A new draft: the privilege steps first, then the bans and picks of DRAFT_SEQUENCE. */
export function createSafeClassDraftState(): DraftState {
  return {
    mode: "safe-class-draft",
    phase: "initiative",
    stepIndex: 0,
    currentPlayer: "P1",
    bannedHeroIds: [],
    picks: {
      P1: {},
      P2: {},
    },
    history: [],
    privileges: emptyDraftPrivileges(),
  };
}

/** Drafts recorded before privileges: P1 bans and picks first, one round of bans. */
export function createLegacySafeClassDraftState(): DraftState {
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

/** "A" is whoever took the first pick through the draft right; "B" picks last. */
type DraftSlot = "A" | "B";
type DraftSequenceStep = { kind: "ban" | "pick"; slot: DraftSlot; round: 1 | 2 };

const sequenceStep = (
  kind: DraftSequenceStep["kind"],
  slot: DraftSlot,
  round: DraftSequenceStep["round"]
): DraftSequenceStep => ({ kind, slot, round });

/**
 * Opening bans A B B A, six picks in a snake, then one ban each so the middle of the draft
 * still contests the classes a player has not filled, and the last eight picks. A and B get
 * seven heroes each. B bans second in the middle round, right before its own pick.
 */
export const DRAFT_SEQUENCE: readonly DraftSequenceStep[] = [
  sequenceStep("ban", "A", 1),
  sequenceStep("ban", "B", 1),
  sequenceStep("ban", "B", 1),
  sequenceStep("ban", "A", 1),
  sequenceStep("pick", "A", 1),
  sequenceStep("pick", "B", 1),
  sequenceStep("pick", "B", 1),
  sequenceStep("pick", "A", 1),
  sequenceStep("pick", "A", 1),
  sequenceStep("pick", "B", 1),
  sequenceStep("ban", "A", 2),
  sequenceStep("ban", "B", 2),
  sequenceStep("pick", "B", 2),
  sequenceStep("pick", "A", 2),
  sequenceStep("pick", "A", 2),
  sequenceStep("pick", "B", 2),
  sequenceStep("pick", "B", 2),
  sequenceStep("pick", "A", 2),
  sequenceStep("pick", "A", 2),
  sequenceStep("pick", "B", 2),
];

function slotPlayer(state: DraftState, slot: DraftSlot): DraftPlayer {
  const first = state.privileges?.firstPicker ?? "P1";
  return slot === "A" ? first : otherDraftPlayer(first);
}

export type DraftOrderStep = { kind: "ban" | "pick"; player: DraftPlayer; round: 1 | 2 };

/** Every ban and pick in order, with the player who makes it. */
export function getDraftOrder(state: DraftState): DraftOrderStep[] {
  if (!state.privileges) {
    return [
      ...DRAFT_BAN_ORDER.map((player) => ({ kind: "ban" as const, player, round: 1 as const })),
      ...getPickOrder().map((player) => ({ kind: "pick" as const, player, round: 1 as const })),
    ];
  }
  return DRAFT_SEQUENCE.map((step) => ({
    kind: step.kind,
    player: slotPlayer(state, step.slot),
    round: step.round,
  }));
}

/** The position of the current ban or pick in getDraftOrder, or -1 outside them. */
export function getDraftOrderIndex(state: DraftState): number {
  if (state.phase !== "ban" && state.phase !== "pick") return -1;
  if (!state.privileges) {
    return state.phase === "ban" ? state.stepIndex : DRAFT_TOTAL_BANS + state.stepIndex;
  }
  return state.stepIndex;
}

export function getDraftBanRound(state: DraftState): 1 | 2 | null {
  if (state.phase !== "ban") return null;
  if (!state.privileges) return 1;
  return DRAFT_SEQUENCE[state.stepIndex]?.round ?? null;
}

export function getDraftCurrentPlayer(state: DraftState): DraftPlayer {
  if (!state.privileges) {
    if (state.phase === "ban") {
      return DRAFT_BAN_ORDER[state.stepIndex] ?? "P1";
    }
    if (state.phase === "pick") {
      return getPickOrder()[state.stepIndex] ?? "P1";
    }
    return state.currentPlayer;
  }
  if (state.phase === "ban" || state.phase === "pick") {
    const step = DRAFT_SEQUENCE[state.stepIndex];
    return step ? slotPlayer(state, step.slot) : state.currentPlayer;
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

/**
 * Whether the current ban step may take this hero, whoever's turn it is.
 * Opening bans: one per class, and both players keep at least two heroes in it.
 * Middle bans: only a class someone still needs, at most two bans in it, and every player
 * who needs it keeps a choice of at least two, so a ban never forces a pick.
 */
export function getDraftBanLockReason(
  state: DraftState,
  heroId: string
): DraftLockReason | null {
  const meta = validateDraftHero(heroId);
  if (typeof meta === "string") return meta;
  if (state.bannedHeroIds.includes(heroId)) return "banned";
  if (getPickedHeroIds(state).has(heroId)) return "picked";
  const unitClass = meta.primaryClass;
  if (getDraftBanRound(state) === 2) {
    const need = (["P1", "P2"] as const).filter((player) => !state.picks[player][unitClass])
      .length;
    if (need === 0) return "ban_class_not_contested";
    if (countBansForClass(state, unitClass) >= 2) return "max_bans_per_class_reached";
    if (availableDraftHeroesForClass(state, unitClass, heroId).length < need + 1) {
      return "ban_would_force_pick";
    }
    return null;
  }
  if (countBansForClass(state, unitClass) >= 1) return "max_bans_per_class_reached";
  if (availableDraftHeroesForClass(state, unitClass, heroId).length < 2) {
    return "ban_would_break_class_pool";
  }
  return null;
}

function hasLegalBan(state: DraftState): boolean {
  return DRAFT_HERO_POOL.some((hero) => getDraftBanLockReason(state, hero.heroId) === null);
}

/** Moves a privileged draft to the step at nextIndex, passing middle bans that have no target. */
function enterSequenceStep(state: DraftState, nextIndex: number): DraftState {
  let next: DraftState = { ...state, stepIndex: nextIndex };
  for (;;) {
    const step = DRAFT_SEQUENCE[next.stepIndex];
    if (!step) {
      return { ...next, phase: "complete" };
    }
    next = { ...next, phase: step.kind, currentPlayer: slotPlayer(next, step.slot) };
    if (step.kind !== "ban" || hasLegalBan(next)) return next;
    next = {
      ...next,
      stepIndex: next.stepIndex + 1,
      history: [...next.history, { type: "banSkipped", player: next.currentPlayer }],
    };
  }
}

function invalidChoice(state: DraftState, reason: DraftLockReason): DraftCommandResult {
  return { ok: false, reason, state };
}

/** After both sides are known the rule chooser picks the rule; until then, the missing side. */
function afterSideChoice(state: DraftState, privileges: DraftPrivileges): DraftState {
  if (!privileges.firstPicker) {
    return { ...state, privileges, phase: "draftSide", currentPlayer: privileges.draftHolder! };
  }
  if (!privileges.placementFirst) {
    return { ...state, privileges, phase: "fieldSide", currentPlayer: privileges.fieldHolder! };
  }
  return {
    ...state,
    privileges,
    phase: "rule",
    currentPlayer: otherDraftPlayer(privileges.placementFirst),
  };
}

const CHOICE_PHASE: Record<DraftChoice["type"], DraftPhase> = {
  roll: "initiative",
  chooseRight: "right",
  chooseDraftSide: "draftSide",
  chooseFieldSide: "fieldSide",
  chooseRule: "rule",
};

/**
 * The privilege steps: both players roll 2d6 (a tie rolls again), the higher roll keeps one
 * right, each holder picks a side (the roll winner first), the rule chooser names the rule,
 * and the bans begin.
 */
export function applyDraftChoice(
  state: DraftState,
  player: DraftPlayer,
  choice: DraftChoice
): DraftCommandResult {
  const privileges = state.privileges;
  if (!privileges || state.phase !== CHOICE_PHASE[choice.type]) {
    return invalidChoice(state, "draft_phase_mismatch");
  }
  if (player !== state.currentPlayer) return invalidChoice(state, "not_current_player");

  switch (choice.type) {
    case "roll": {
      const dice = choice.dice;
      if (
        !Array.isArray(dice) ||
        dice.length !== 2 ||
        !dice.every((value) => Number.isInteger(value) && value >= 1 && value <= 6) ||
        privileges.rolls[player]
      ) {
        return invalidChoice(state, "invalid_draft_choice");
      }
      const event: DraftEvent = { type: "roll", player, dice: [...dice] };
      const rolls = { ...privileges.rolls, [player]: [...dice] };
      const history = [...state.history, event];
      const opponent = otherDraftPlayer(player);
      const opponentDice = rolls[opponent];
      if (!opponentDice) {
        return {
          ok: true,
          event,
          state: { ...state, history, privileges: { ...privileges, rolls }, currentPlayer: opponent },
        };
      }
      const sum = (values: number[]) => values[0] + values[1];
      const mine = sum(rolls[player]!);
      const theirs = sum(opponentDice);
      if (mine === theirs) {
        return {
          ok: true,
          event,
          state: {
            ...state,
            history,
            privileges: { ...privileges, rolls: { P1: null, P2: null } },
            currentPlayer: "P1",
          },
        };
      }
      const winner = mine > theirs ? player : opponent;
      return {
        ok: true,
        event,
        state: {
          ...state,
          history,
          phase: "right",
          currentPlayer: winner,
          privileges: { ...privileges, rolls, initiativeWinner: winner },
        },
      };
    }
    case "chooseRight": {
      if (choice.right !== "draft" && choice.right !== "field") {
        return invalidChoice(state, "invalid_draft_choice");
      }
      const event: DraftEvent = { type: "chooseRight", player, right: choice.right };
      const draftHolder = choice.right === "draft" ? player : otherDraftPlayer(player);
      return {
        ok: true,
        event,
        state: {
          ...state,
          history: [...state.history, event],
          // The roll winner sets the side of the right they kept; the other player answers.
          phase: choice.right === "draft" ? "draftSide" : "fieldSide",
          currentPlayer: player,
          privileges: {
            ...privileges,
            draftHolder,
            fieldHolder: otherDraftPlayer(draftHolder),
          },
        },
      };
    }
    case "chooseDraftSide": {
      if (choice.side !== "first" && choice.side !== "last") {
        return invalidChoice(state, "invalid_draft_choice");
      }
      const event: DraftEvent = { type: "chooseDraftSide", player, side: choice.side };
      return {
        ok: true,
        event,
        state: afterSideChoice(
          { ...state, history: [...state.history, event] },
          {
            ...privileges,
            firstPicker: choice.side === "first" ? player : otherDraftPlayer(player),
          }
        ),
      };
    }
    case "chooseFieldSide": {
      if (choice.side !== "placeFirst" && choice.side !== "chooseRule") {
        return invalidChoice(state, "invalid_draft_choice");
      }
      const event: DraftEvent = { type: "chooseFieldSide", player, side: choice.side };
      return {
        ok: true,
        event,
        state: afterSideChoice(
          { ...state, history: [...state.history, event] },
          {
            ...privileges,
            placementFirst: choice.side === "placeFirst" ? player : otherDraftPlayer(player),
          }
        ),
      };
    }
    case "chooseRule": {
      if (!isRuleDeclarationId(choice.ruleId)) {
        return invalidChoice(state, "invalid_draft_choice");
      }
      const event: DraftEvent = { type: "chooseRule", player, ruleId: choice.ruleId };
      return {
        ok: true,
        event,
        state: enterSequenceStep(
          {
            ...state,
            history: [...state.history, event],
            privileges: { ...privileges, ruleId: choice.ruleId },
          },
          0
        ),
      };
    }
  }
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
  const lock = getDraftBanLockReason(state, heroId);
  if (lock) {
    return { ok: false, reason: lock, state };
  }

  const event: DraftEvent = {
    type: "ban",
    player,
    heroId,
    primaryClass: meta.primaryClass,
  };
  const banned: DraftState = {
    ...state,
    bannedHeroIds: [...state.bannedHeroIds, heroId],
    history: [...state.history, event],
  };
  if (state.privileges) {
    return { ok: true, event, state: enterSequenceStep(banned, state.stepIndex + 1) };
  }

  const nextStepIndex = state.stepIndex + 1;
  const nextPhase: DraftPhase =
    nextStepIndex >= DRAFT_TOTAL_BANS ? "pick" : "ban";
  const nextCurrentPlayer =
    nextPhase === "pick" ? getPickOrder()[0] : DRAFT_BAN_ORDER[nextStepIndex];
  return {
    ok: true,
    event,
    state: {
      ...banned,
      phase: nextPhase,
      stepIndex: nextPhase === "pick" ? 0 : nextStepIndex,
      currentPlayer: nextCurrentPlayer,
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
  const picked: DraftState = { ...state, picks: nextPicks, history: [...state.history, event] };
  const complete = isDraftPicksComplete(nextPicks);
  if (state.privileges) {
    return {
      ok: true,
      event,
      state: complete
        ? { ...picked, phase: "complete", stepIndex: state.stepIndex + 1, currentPlayer: player }
        : enterSequenceStep(picked, state.stepIndex + 1),
    };
  }
  const nextStepIndex = state.stepIndex + 1;
  return {
    ok: true,
    event,
    state: {
      ...picked,
      phase: complete ? "complete" : "pick",
      stepIndex: nextStepIndex,
      currentPlayer: complete
        ? player
        : getPickOrder()[nextStepIndex] ?? state.currentPlayer,
    },
  };
}

/** Replays a recorded history from the start; legacy histories open with a ban. */
export function replayDraftHistory(history: readonly DraftEvent[]): DraftState {
  let draft =
    history[0]?.type === "ban" ? createLegacySafeClassDraftState() : createSafeClassDraftState();
  for (const event of history) {
    // Skipped bans are produced by the step that precedes them.
    if (event.type === "banSkipped") continue;
    const result = isDraftHeroEvent(event)
      ? event.type === "ban"
        ? banDraftHero(draft, event.player, event.heroId)
        : pickDraftHero(draft, event.player, event.heroId)
      : applyDraftChoice(draft, event.player, draftEventToChoice(event));
    if (!result.ok) throw new Error("INVALID_DRAFT_HISTORY");
    draft = result.state;
  }
  if (JSON.stringify(draft.history) !== JSON.stringify(history)) {
    throw new Error("INVALID_DRAFT_HISTORY");
  }
  return draft;
}

function draftEventToChoice(
  event: Exclude<DraftEvent, DraftHeroEvent | { type: "banSkipped" }>
): DraftChoice {
  switch (event.type) {
    case "roll":
      return { type: "roll", dice: event.dice };
    case "chooseRight":
      return { type: "chooseRight", right: event.right };
    case "chooseDraftSide":
      return { type: "chooseDraftSide", side: event.side };
    case "chooseFieldSide":
      return { type: "chooseFieldSide", side: event.side };
    case "chooseRule":
      return { type: "chooseRule", ruleId: event.ruleId };
  }
}

export function isDraftHeroEvent(event: DraftEvent): event is DraftHeroEvent {
  return event.type === "ban" || event.type === "pick";
}

/**
 * Carries the pre-draft decisions into the lobby state that startGame reads: who places first
 * and which rule the other player chose. The engine keeps initiative.winner equal to the first
 * placer, as after a normal initiative roll; the sums are the draft roll that settled it.
 */
export function applyDraftPrivilegesToGame(state: GameState, draft: DraftState | null): GameState {
  const privileges = draft?.privileges;
  if (!privileges?.placementFirst || !privileges.ruleId) return state;
  const sum = (dice: number[] | null) => (dice ? dice[0] + dice[1] : null);
  return {
    ...state,
    initiative: {
      P1: sum(privileges.rolls.P1),
      P2: sum(privileges.rolls.P2),
      winner: privileges.placementFirst,
    },
    placementFirstPlayer: privileges.placementFirst,
    ruleDeclaration: {
      selectedRuleId: privileges.ruleId,
      chooserPlayer: otherDraftPlayer(privileges.placementFirst),
      setupComplete: false,
      ruleData: {},
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
