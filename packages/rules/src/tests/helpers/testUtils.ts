import {
  createEmptyGame,
  createDefaultArmy,
  attachArmy,
  applyAction as applyActionRaw,
  coordFromNotation,
  Coord,
  GameEvent,
  GameState,
  ALL_ROLL_KINDS,
  PlayerId,
  RollKind,
  UnitState,
  makePlayerView,
  makeEmptyTurnEconomy,
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_CHIKATILO_ASSASSIN_MARK,
  ABILITY_CHIKATILO_DECOY,
  ABILITY_GENGHIS_KHAN_KHANS_DECREE,
  ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
  ABILITY_EL_SID_COMPEADOR_TISONA,
  ABILITY_EL_SID_COMPEADOR_KOLADA,
  ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
  ABILITY_KAISER_DORA,
  ABILITY_KAISER_CARPET_STRIKE,
  ABILITY_KAISER_ENGINEERING_MIRACLE,
  ABILITY_GROZNY_INVADE_TIME,
  ABILITY_LECHY_CONFUSE_TERRAIN,
  ABILITY_LECHY_GUIDE_TRAVELER,
  ABILITY_LECHY_STORM,
  ABILITY_GUTS_ARBALET,
  ABILITY_GUTS_BERSERK_MODE,
  ABILITY_GUTS_CANNON,
  ABILITY_GUTS_EXIT_BERSERK,
  ABILITY_KALADIN_FIRST,
  ABILITY_KALADIN_FIFTH,
  ABILITY_FRISK_GENOCIDE,
  ABILITY_FRISK_PACIFISM,
  ABILITY_SANS_BADASS_JOKE,
  ABILITY_SANS_BONE_FIELD,
  ABILITY_SANS_GASTER_BLASTER,
  ABILITY_SANS_SLEEP,
  ABILITY_UNDYNE_ENERGY_SPEAR,
  ABILITY_UNDYNE_SPEAR_THROW,
  ABILITY_UNDYNE_UNDYING,
  ABILITY_LOKI_LAUGHT,
  ABILITY_ODIN_MUNINN,
  ABILITY_ODIN_SLEIPNIR,
  ABILITY_TRICKSTER_AOE,
  ABILITY_GRIFFITH_FEMTO_REBIRTH,
  ABILITY_FEMTO_DIVINE_MOVE,
  ABILITY_JEBE_HAIL_OF_ARROWS,
  ABILITY_JEBE_KHANS_SHOOTER,
  ABILITY_HASSAN_TRUE_ENEMY,
  ABILITY_ASGORE_FIREBALL,
  ABILITY_ASGORE_FIRE_PARADE,
  ABILITY_ASGORE_SOUL_PARADE,
  ABILITY_RIVER_PERSON_BOAT,
  ABILITY_RIVER_PERSON_BOATMAN,
  ABILITY_RIVER_PERSON_TRA_LA_LA,
  ABILITY_PAPYRUS_BLUE_BONE,
  ABILITY_PAPYRUS_COOL_GUY,
  ABILITY_PAPYRUS_LONG_BONE,
  ABILITY_METTATON_EX,
  ABILITY_METTATON_FINAL_CHORD,
  ABILITY_METTATON_GRACE,
  ABILITY_METTATON_LASER,
  ABILITY_METTATON_NEO,
  ABILITY_METTATON_POPPINS,
  ABILITY_METTATON_RIDER_FEATURE,
  ABILITY_METTATON_BERSERKER_MULTICLASS,
  ABILITY_METTATON_STAGE_PHENOMENON,
  ABILITY_PAPYRUS_ORANGE_BONE,
  ABILITY_PAPYRUS_SPAGHETTI,
  ABILITY_TEST_MULTI_SLOT,
  ABILITY_VLAD_FOREST,
  AUTO_TRIGGERED_IMPULSE_IDS,
  getImpulseAbilityIds,
  HERO_GRAND_KAISER_ID,
  HERO_CHIKATILO_ID,
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_GENGHIS_KHAN_ID,
  HERO_EL_CID_COMPEADOR_ID,
  HERO_GROZNY_ID,
  HERO_LECHY_ID,
  HERO_GUTS_ID,
  HERO_GRIFFITH_ID,
  HERO_FEMTO_ID,
  HERO_JEBE_ID,
  HERO_HASSAN_ID,
  HERO_ASGORE_ID,
  HERO_METTATON_ID,
  HERO_PAPYRUS_ID,
  HERO_RIVER_PERSON_ID,
  HERO_SANS_ID,
  HERO_UNDYNE_ID,
  HERO_KALADIN_ID,
  HERO_FRISK_ID,
  HERO_LOKI_ID,
  HERO_ODIN_ID,
  HERO_VLAD_TEPES_ID,
  HERO_REGISTRY,
  getHeroMeta,
  getLegalPlacements,
  getLegalMovesForUnit,
  getUnitDefinition,
  getTricksterMovesForRoll,
  getBerserkerMovesForRoll,
  resolveAttack,
  getUnitAt,
  getLegalAttackTargets,
  getLegalIntents,
  linePath,
  getStealthSuccessMinRoll,
} from "../../index";
import { SeededRNG } from "../../rng";
import type { RNG } from "../../rng";
import * as pendingRollActions from "../../actions/pendingRollActions";
import { CORE_PENDING_ROLL_KINDS } from "../../pendingRoll/resolvePendingRoll/coreCases";
import { HERO_PENDING_ROLL_KINDS } from "../../pendingRoll/resolvePendingRoll/heroCases";
import { applyFalseTrailExplosion } from "../../actions/heroes/chikatilo";
import assert from "assert";
import fs from "fs";
import path from "path";

export { createEmptyGame, createDefaultArmy, attachArmy, applyActionRaw, coordFromNotation, Coord, GameEvent, GameState, ALL_ROLL_KINDS, PlayerId, RollKind, UnitState, makePlayerView, makeEmptyTurnEconomy, ABILITY_BERSERK_AUTO_DEFENSE, ABILITY_CHIKATILO_ASSASSIN_MARK, ABILITY_CHIKATILO_DECOY, ABILITY_GENGHIS_KHAN_KHANS_DECREE, ABILITY_GENGHIS_KHAN_MONGOL_CHARGE, ABILITY_EL_SID_COMPEADOR_TISONA, ABILITY_EL_SID_COMPEADOR_KOLADA, ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST, ABILITY_KAISER_DORA, ABILITY_KAISER_CARPET_STRIKE, ABILITY_KAISER_ENGINEERING_MIRACLE, ABILITY_GROZNY_INVADE_TIME, ABILITY_LECHY_CONFUSE_TERRAIN, ABILITY_LECHY_GUIDE_TRAVELER, ABILITY_LECHY_STORM, ABILITY_GUTS_ARBALET, ABILITY_GUTS_BERSERK_MODE, ABILITY_GUTS_CANNON, ABILITY_GUTS_EXIT_BERSERK, ABILITY_KALADIN_FIRST, ABILITY_KALADIN_FIFTH, ABILITY_FRISK_GENOCIDE, ABILITY_FRISK_PACIFISM, ABILITY_SANS_BADASS_JOKE, ABILITY_SANS_BONE_FIELD, ABILITY_SANS_GASTER_BLASTER, ABILITY_SANS_SLEEP, ABILITY_UNDYNE_ENERGY_SPEAR, ABILITY_UNDYNE_SPEAR_THROW, ABILITY_UNDYNE_UNDYING, ABILITY_LOKI_LAUGHT, ABILITY_ODIN_MUNINN, ABILITY_ODIN_SLEIPNIR, ABILITY_TRICKSTER_AOE, ABILITY_GRIFFITH_FEMTO_REBIRTH, ABILITY_FEMTO_DIVINE_MOVE, ABILITY_JEBE_HAIL_OF_ARROWS, ABILITY_JEBE_KHANS_SHOOTER, ABILITY_HASSAN_TRUE_ENEMY, ABILITY_ASGORE_FIREBALL, ABILITY_ASGORE_FIRE_PARADE, ABILITY_ASGORE_SOUL_PARADE, ABILITY_RIVER_PERSON_BOAT, ABILITY_RIVER_PERSON_BOATMAN, ABILITY_RIVER_PERSON_TRA_LA_LA, ABILITY_PAPYRUS_BLUE_BONE, ABILITY_PAPYRUS_COOL_GUY, ABILITY_PAPYRUS_LONG_BONE, ABILITY_METTATON_EX, ABILITY_METTATON_FINAL_CHORD, ABILITY_METTATON_GRACE, ABILITY_METTATON_LASER, ABILITY_METTATON_NEO, ABILITY_METTATON_POPPINS, ABILITY_METTATON_RIDER_FEATURE, ABILITY_METTATON_BERSERKER_MULTICLASS, ABILITY_METTATON_STAGE_PHENOMENON, ABILITY_PAPYRUS_ORANGE_BONE, ABILITY_PAPYRUS_SPAGHETTI, ABILITY_TEST_MULTI_SLOT, ABILITY_VLAD_FOREST, AUTO_TRIGGERED_IMPULSE_IDS, getImpulseAbilityIds, HERO_GRAND_KAISER_ID, HERO_CHIKATILO_ID, HERO_FALSE_TRAIL_TOKEN_ID, HERO_GENGHIS_KHAN_ID, HERO_EL_CID_COMPEADOR_ID, HERO_GROZNY_ID, HERO_LECHY_ID, HERO_GUTS_ID, HERO_GRIFFITH_ID, HERO_FEMTO_ID, HERO_JEBE_ID, HERO_HASSAN_ID, HERO_ASGORE_ID, HERO_METTATON_ID, HERO_PAPYRUS_ID, HERO_RIVER_PERSON_ID, HERO_SANS_ID, HERO_UNDYNE_ID, HERO_KALADIN_ID, HERO_FRISK_ID, HERO_LOKI_ID, HERO_ODIN_ID, HERO_VLAD_TEPES_ID, HERO_REGISTRY, getHeroMeta, getLegalPlacements, getLegalMovesForUnit, getUnitDefinition, getTricksterMovesForRoll, getBerserkerMovesForRoll, resolveAttack, getUnitAt, getLegalAttackTargets, getLegalIntents, linePath, getStealthSuccessMinRoll, SeededRNG, pendingRollActions, CORE_PENDING_ROLL_KINDS, HERO_PENDING_ROLL_KINDS, applyFalseTrailExplosion, assert, fs, path };
export type { RNG };



export function setUnit(
  state: GameState,
  unitId: string,
  patch: Partial<UnitState>
): GameState {
  const unit = state.units[unitId];
  if (!unit) {
    return state;
  }
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: { ...unit, ...patch },
    },
  };
}


export function initKnowledgeForOwners(state: GameState): GameState {
  const knowledge: GameState["knowledge"] = { P1: {}, P2: {} };
  for (const u of Object.values(state.units)) {
    if (!u.isAlive) continue;
    knowledge[u.owner][u.id] = true;
  }
  return { ...state, knowledge };
}


export function applyAction(
  state: GameState,
  action: Parameters<typeof applyActionRaw>[1],
  rng: Parameters<typeof applyActionRaw>[2]
) {
  return applyActionRaw(state, action as any, rng as any);
}


export function resolvePendingRollOnce(
  state: GameState,
  rng: Parameters<typeof applyActionRaw>[2],
  choice?: unknown
) {
  if (!state.pendingRoll) {
    return { state, events: [] as any[] };
  }
  const pending = state.pendingRoll;
  const firstOption = Array.isArray(pending.context?.options)
    ? pending.context.options[0]
    : undefined;
  const resolvedChoice =
    choice !== undefined
      ? choice
      : pending.kind === "berserkerDefenseChoice" ||
        pending.kind === "odinMuninnDefenseChoice" ||
        pending.kind === "asgoreBraveryDefenseChoice" ||
        pending.kind === "dora_berserkerDefenseChoice" ||
        pending.kind === "jebeHailOfArrows_berserkerDefenseChoice" ||
        pending.kind === "carpetStrike_berserkerDefenseChoice" ||
        pending.kind === "vladForest_berserkerDefenseChoice"
      ? "roll"
      : pending.kind === "ruleDeclarationChoice"
      ? { type: "chooseRuleDeclaration", ruleId: "moon_game" }
      : pending.kind === "ruleDeclarationAdvantageThreshold"
      ? { type: "ruleThreshold", threshold: 3 }
      : pending.kind === "ruleDeclarationChessKingChoice" && typeof firstOption === "string"
      ? { type: "ruleUnit", unitId: firstOption }
      : (pending.kind === "courtEffectUnitChoice" ||
          pending.kind === "moonCheeseHolesChoice" ||
          pending.kind === "pureBloodRedirectChoice") &&
        typeof firstOption === "string"
      ? { type: "ruleUnit", unitId: firstOption }
      : pending.kind === "courtEffectChargeChoice" && typeof firstOption === "string"
      ? { type: "ruleCharge", abilityId: firstOption }
      : pending.kind === "courtForcedAppearanceDestination" && firstOption
      ? { type: "ruleCell", position: firstOption }
      : pending.kind === "groznyTyrantOptionChoice" &&
        (firstOption === "normal" || firstOption === "invadeTime")
      ? {
          type: "groznyTyrantOption",
          mode: firstOption,
        }
      : pending.kind === "groznyTyrantAllyChoice" &&
        typeof firstOption === "string"
      ? {
          type: "groznyTyrantAlly",
          targetId: firstOption,
        }
      : pending.kind === "groznyTyrantAttackCellChoice" &&
        firstOption &&
        typeof firstOption === "object" &&
        typeof (firstOption as { targetId?: unknown }).targetId === "string" &&
        ((firstOption as { mode?: unknown }).mode === "normal" ||
          (firstOption as { mode?: unknown }).mode === "invadeTime")
      ? {
          type: "groznyTyrantAttackCell",
          mode: (firstOption as { mode: "normal" | "invadeTime" }).mode,
          targetId: (firstOption as { targetId: string }).targetId,
          position: (firstOption as { position: Coord }).position,
        }
      : pending.kind === "gutsBerserkAttackChoice" &&
        typeof (pending.context as { targetId?: unknown }).targetId === "string"
      ? {
          type: "gutsBerserkAttackMode",
          mode: "single",
          targetId: (pending.context as { targetId: string }).targetId,
        }
      : undefined;
  return applyActionRaw(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      choice: resolvedChoice,
      player: pending.player,
    } as any,
    rng as any
  );
}


export function resolveAllPendingRolls(
  state: GameState,
  rng: Parameters<typeof applyActionRaw>[2],
  choice?: unknown
) {
  let result = { state, events: [] as any[] };
  while (result.state.pendingRoll) {
    result = resolvePendingRollOnce(result.state, rng, choice);
  }
  return result;
}


export function resolveAllPendingRollsWithEvents(
  state: GameState,
  rng: Parameters<typeof applyActionRaw>[2],
  choice?: unknown
) {
  let current = { state, events: [] as any[] };
  const events: any[] = [];
  while (current.state.pendingRoll) {
    current = resolvePendingRollOnce(current.state, rng, choice);
    events.push(...current.events);
  }
  return { state: current.state, events };
}


export function coordKeys(coords: { col: number; row: number }[]): string[] {
  return coords.map((c) => `${c.col},${c.row}`).sort();
}


export function toBattleState(
  state: GameState,
  currentPlayer: "P1" | "P2",
  activeUnitId: string
): GameState {
  return {
    ...state,
    phase: "battle",
    currentPlayer,
    activeUnitId,
    placementOrder: [activeUnitId],
    turnQueue: [activeUnitId],
    turnQueueIndex: 0,
    turnOrder: [activeUnitId],
    turnOrderIndex: 0,
  };
}


export function setupKaiserState() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { archer: HERO_GRAND_KAISER_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const kaiser = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;

  return { state, kaiser, enemy };
}


export function setupVladState() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { spearman: HERO_VLAD_TEPES_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const vlad = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  return { state, vlad, enemy };
}


export function setupMettatonState() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { archer: HERO_METTATON_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const mettaton = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_METTATON_ID
  )!;
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.id !== mettaton.id
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;

  return { state, mettaton, ally, enemy };
}


export function setupSansState() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", {
    trickster: HERO_SANS_ID,
    spearman: HERO_PAPYRUS_ID,
  });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const sans = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_SANS_ID
  )!;
  const papyrus = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_PAPYRUS_ID
  )!;
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.id !== sans.id && u.id !== papyrus.id
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;
  const enemy2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id && u.class === "berserker"
  )!;

  return { state, sans, papyrus, ally, enemy, enemy2 };
}


export function setupUndyneState() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { berserker: HERO_UNDYNE_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const undyne = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_UNDYNE_ID
  )!;
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.id !== undyne.id
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;
  const enemy2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id && u.class === "spearman"
  )!;

  return { state, undyne, ally, enemy, enemy2 };
}


export class SequenceRNG implements RNG {
  private index = 0;
  constructor(private values: number[], private fallback = 0.5) {}
  next(): number {
    if (this.index < this.values.length) {
      const value = this.values[this.index];
      this.index += 1;
      return value;
    }
    return this.fallback;
  }
}


export function makeAttackWinRng(attacks: number): SequenceRNG {
  const values: number[] = [];
  for (let i = 0; i < attacks; i += 1) {
    values.push(0.99, 0.99, 0.01, 0.01);
  }
  return new SequenceRNG(values);
}


export function makeSharedAttackerWinRng(targets: number): SequenceRNG {
  const values: number[] = [0.99, 0.99];
  for (let i = 0; i < targets; i += 1) {
    values.push(0.01, 0.01);
  }
  return new SequenceRNG(values);
}


export function setupElCidState() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { knight: HERO_EL_CID_COMPEADOR_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const elCid = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;

  return { state, elCid, enemy };
}


export function setupSpearmanAttackState(position: Coord) {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { spearman: HERO_VLAD_TEPES_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const spearman = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, spearman.id, { position });
  state = toBattleState(state, "P1", spearman.id);
  state = initKnowledgeForOwners(state);

  return { state, spearman, enemy };
}


export function makeRngSequence(values: number[]) {
  let index = 0;
  return {
    next: () => {
      if (index >= values.length) return 0.5;
      const value = values[index];
      index += 1;
      return value;
    },
  };
}


export function toPlacementState(
  state: GameState,
  firstPlayer: PlayerId = "P1"
): GameState {
  return {
    ...state,
    phase: "placement",
    currentPlayer: firstPlayer,
    placementFirstPlayer: firstPlayer,
    initiative: {
      ...state.initiative,
      winner: firstPlayer,
    },
    unitsPlaced: { P1: 0, P2: 0 },
    placementOrder: [],
    turnQueue: [],
    turnQueueIndex: 0,
    turnOrder: [],
    turnOrderIndex: 0,
  };
}


export function setupBerserkerBattleState(col: number, row: number) {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = toPlacementState(state, "P1");

  const berserker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "berserker"
  )!;

  state = setUnit(state, berserker.id, { position: { col, row } });
  state = toBattleState(state, "P1", berserker.id);
  state = initKnowledgeForOwners(state);

  return { state, berserkerId: berserker.id };
}


export function setupJebeState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { archer: HERO_JEBE_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const jebe = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_JEBE_ID
  )!;

  return { state, jebe };
}


export function setupHassanState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_HASSAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const hassan = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_HASSAN_ID
  )!;

  return { state, hassan };
}


export function setupGriffithState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { knight: HERO_GRIFFITH_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const griffith = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_GRIFFITH_ID
  )!;

  return { state, griffith };
}


export function promoteToFemto(state: GameState, unitId: string): GameState {
  const unit = state.units[unitId];
  if (!unit) return state;
  const berserkerHp = getUnitDefinition("berserker").maxHp;
  const berserkerAttack = getUnitDefinition("berserker").baseAttack;
  return setUnit(state, unitId, {
    heroId: HERO_FEMTO_ID,
    figureId: HERO_FEMTO_ID,
    transformed: true,
    hp: berserkerHp + 5,
    attack: berserkerAttack,
    charges: {
      ...unit.charges,
      [ABILITY_BERSERK_AUTO_DEFENSE]: 6,
    },
  });
}


export function setupGutsState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { berserker: HERO_GUTS_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const guts = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_GUTS_ID
  )!;

  return { state, guts };
}


export function setupKaladinState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { spearman: HERO_KALADIN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const kaladin = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_KALADIN_ID
  )!;

  return { state, kaladin };
}


export function setupAsgoreState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { knight: HERO_ASGORE_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const asgore = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_ASGORE_ID
  )!;

  return { state, asgore };
}


export function startAsgoreSoulParadeTurn(state: GameState, asgoreId: string) {
  const prepared = initKnowledgeForOwners({
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    pendingRoll: null,
    pendingMove: null,
    turnQueue: [asgoreId],
    turnQueueIndex: 0,
    turnOrder: [asgoreId],
    turnOrderIndex: 0,
  });
  return applyAction(
    prepared,
    { type: "unitStartTurn", unitId: asgoreId } as any,
    makeRngSequence([])
  );
}


export function setupOdinState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_ODIN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const odin = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_ODIN_ID
  )!;

  return { state, odin };
}


export function setupRiverPersonState() {
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", { rider: HERO_RIVER_PERSON_ID })
  );
  state = attachArmy(state, createDefaultArmy("P2"));

  const river = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_RIVER_PERSON_ID
  )!;

  return { state, river };
}


export function setupLokiState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LOKI_ID }));
  state = attachArmy(
    state,
    createDefaultArmy("P2", { rider: HERO_GENGHIS_KHAN_ID })
  );

  const loki = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_LOKI_ID
  )!;

  return { state, loki };
}


export function resolvePendingWithChoice(
  state: GameState,
  choice: any,
  rng: Parameters<typeof applyActionRaw>[2]
) {
  const pending = state.pendingRoll;
  assert(pending, "pending roll should exist");
  return applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice,
    } as any,
    rng
  );
}


export function setupFriskState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_FRISK_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const frisk = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_FRISK_ID
  )!;

  return { state, frisk };
}


export function setupGroznyTyrantState() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", {
    berserker: HERO_GROZNY_ID,
    spearman: HERO_VLAD_TEPES_ID,
  });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const grozny = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "berserker"
  )!;
  const commander = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;

  return { state, grozny, commander, ally };
}


export function setupChikatiloPlacementState(seed = 901) {
  const rng = new SeededRNG(seed);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { assassin: HERO_CHIKATILO_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = toPlacementState(state, "P1");

  const chikatilo = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_CHIKATILO_ID
  )!;
  const tokenId = chikatilo.chikatiloFalseTrailTokenId ?? `falseTrail-${chikatilo.id}`;
  const token = state.units[tokenId];
  assert(token && token.heroId === HERO_FALSE_TRAIL_TOKEN_ID, "false trail token should exist");

  return { state, rng, chikatilo, token: token! };
}
