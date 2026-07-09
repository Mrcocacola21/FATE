import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AbilityView, PlayerView, UnitState } from "rules";
import { setLanguage, translate } from "../../../i18n";
import {
  GRIFFITH_FEMTO_REBIRTH_ID,
  GUTS_CANNON_ID,
  LOKI_LAUGHT_ID,
  METTATON_EX_ID,
  METTATON_NEO_ID,
} from "../../../rulesHints";
import { CurrentTaskPanel } from "../../gameshell-content/components/CurrentTaskPanel";
import { BattleUnitSummary } from "./sections/BattleUnitSummary";
import { BattleAbilityActions } from "./sections/BattleAbilityActions";
import {
  getPublicBattleActionBars,
  getUnitDetailActionBars,
  type UnitActionSummary,
  type UnitMoveSummary,
  type UnitStealthSummary,
} from "./actionSummaries";
import {
  formatChargeLabel,
  getAbilityChargeState,
  isActionableAbility,
} from "./rightPanelHelpers";

function makeUnit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: "P1-assassin-1",
    owner: "P1",
    class: "assassin",
    heroId: "frisk",
    hp: 4,
    attack: 2,
    position: { col: 2, row: 2 },
    isStealthed: false,
    stealthTurnsLeft: 0,
    stealthAttemptedThisTurn: false,
    turn: {
      moveUsed: false,
      attackUsed: false,
      actionUsed: false,
      stealthUsed: false,
    },
    charges: {},
    cooldowns: {},
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    isAlive: true,
    ...overrides,
  };
}

function makeAbility(overrides: Partial<AbilityView> = {}): AbilityView {
  return {
    id: "elCidCompeadorTisona",
    name: "Tisona",
    kind: "active",
    description: "Line attack",
    slot: "action",
    chargeRequired: 2,
    maxCharges: 2,
    currentCharges: 2,
    isAvailable: true,
    ...overrides,
  };
}

function makeView(unit: UnitState): PlayerView {
  return {
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: unit.id,
    boardSize: 9,
    hostPlayerId: "P1",
    playersReady: { P1: true, P2: true },
    seats: { P1: true, P2: true },
    turnNumber: 1,
    roundNumber: 1,
    pendingMove: null,
    pendingRoll: null,
    pendingCombatQueueCount: 0,
    pendingAoEPreview: null,
    rollCounter: 0,
    stakeMarkers: [],
    forestMarkers: [],
    forestMarker: null,
    turnOrder: [unit.id],
    turnOrderIndex: 0,
    placementOrder: [],
    turnQueue: [unit.id],
    turnQueueIndex: 0,
    units: { [unit.id]: unit },
    events: [],
    knowledge: { P1: {}, P2: {} },
    lastKnownPositions: {},
    initiative: { P1: null, P2: null, winner: null },
    ruleDeclaration: {
      selectedRuleId: "moon_game",
      chooserPlayer: "P1",
      setupComplete: true,
      ruleData: { moonGame: {} },
    },
    placementFirstPlayer: "P1",
    arenaId: null,
    startingUnitId: unit.id,
    unitsPlaced: { P1: 1, P2: 0 },
    abilitiesByUnitId: {},
    legal: {
      placementsByUnitId: {},
      movesByUnitId: { [unit.id]: [{ col: 2, row: 3 }] },
      attackTargetsByUnitId: { [unit.id]: ["P2-rider-1"] },
    },
    legalIntents: {
      canSearchMove: true,
      canSearchAction: true,
      canMove: true,
      canAttack: true,
      canEnterStealth: true,
    },
  } as PlayerView;
}

test("unit detail summaries expose Action, Move, and Stealth without a main Attack bar", () => {
  const unit = makeUnit();
  const summaries = getUnitDetailActionBars({
    unit,
    abilityViews: [makeAbility()],
    view: makeView(unit),
    canAct: true,
    pendingRoll: false,
    legalAttackTargetCount: 1,
    legalMoveCount: 1,
  });

  assert.deepEqual(
    summaries.map((summary) => summary.kind),
    ["action", "move", "stealth"],
  );
  assert.equal((summaries[0] as UnitActionSummary).basicAttack?.state, "available");
  assert.equal((summaries[1] as UnitMoveSummary).legalMoveCount, 1);
  assert.equal((summaries[2] as UnitStealthSummary).threshold, 5);
});

test("unit summary renders three main bars and explains basic attack under Action", () => {
  setLanguage("en", { setItem: () => undefined });
  const unit = makeUnit();
  const markup = renderToStaticMarkup(
    <BattleUnitSummary
      selectedUnit={unit}
      selectedHeroName="Frisk"
      showUnitIdInClassLabel={false}
      selectedMettatonRating={null}
      forestMarkers={[]}
      selectedInsideForest={false}
      stormActive={false}
      selectedStormExempt={false}
      moveRoll={null}
      economy={unit.turn}
      abilityViews={[makeAbility()]}
      view={makeView(unit)}
      canAct={true}
      pendingRoll={false}
      legalAttackTargetCount={1}
      legalMoveCount={1}
      onHoverAbility={() => undefined}
    />,
  );

  assert.match(markup, /data-action-bar-kind="action"/);
  assert.match(markup, /data-action-bar-kind="move"/);
  assert.match(markup, /data-action-bar-kind="stealth"/);
  assert.doesNotMatch(markup, /data-action-bar-kind="attack"/);
  assert.match(markup, /Basic Attack/);
  assert.match(markup, /Uses Action/);
  assert.match(markup, /Ability: Tisona/);
});

test("public battle bars keep compact Move, Attack, and Stealth states", () => {
  const unit = makeUnit({
    turn: {
      moveUsed: false,
      attackUsed: true,
      actionUsed: true,
      stealthUsed: false,
    },
  });
  const bars = getPublicBattleActionBars(unit, makeView(unit), false);

  assert.deepEqual(
    bars.map((bar) => bar.kind),
    ["move", "attack", "stealth"],
  );
  assert.equal(bars.find((bar) => bar.kind === "attack")?.state, "spent");
});

test("charge labels distinguish bounded and unbounded counters", () => {
  const unbounded = makeAbility({
    id: "friskPacifism",
    chargeRequired: 10,
    maxCharges: undefined,
    chargeUnlimited: true,
    currentCharges: 12,
  });
  const unboundedState = getAbilityChargeState(unbounded.id, null, unbounded);
  assert.equal(unboundedState.max, null);
  assert.equal(formatChargeLabel(unbounded, unboundedState, false), "12");

  const threshold = makeAbility({
    id: "mettatonNeo",
    chargeRequired: 10,
    maxCharges: undefined,
    currentCharges: 12,
  });
  const thresholdState = getAbilityChargeState(threshold.id, null, threshold);
  assert.equal(thresholdState.max, null);
  assert.equal(formatChargeLabel(threshold, thresholdState, false), "12");

  const bounded = makeAbility({
    id: "undyneEnergySpear",
    chargeRequired: 2,
    maxCharges: 2,
    currentCharges: 1,
  });
  const boundedState = getAbilityChargeState(bounded.id, null, bounded);
  assert.equal(boundedState.max, 2);
  assert.equal(formatChargeLabel(bounded, boundedState, false), "1/2");
});

test("current task panel shows local targeting name, instruction, cost, and cancel", () => {
  setLanguage("en", { setItem: () => undefined });
  const guts = makeUnit({
    id: "P1-guts",
    class: "berserker",
    heroId: "guts",
    position: { col: 4, row: 4 },
  });
  const ability = makeAbility({
    id: GUTS_CANNON_ID,
    name: "Hand Cannon",
    description: "Ranged attack line",
    chargeRequired: 1,
    maxCharges: 1,
    currentCharges: 1,
  });
  const view = {
    ...makeView(guts),
    abilitiesByUnitId: { [guts.id]: [ability] },
  };

  const markup = renderToStaticMarkup(
    <CurrentTaskPanel
      vm={{
        view,
        playerId: "P1",
        pendingRoll: null,
        pendingMeta: null,
        actionMode: "gutsCannon",
        targetingMode: {
          sourceUnitId: guts.id,
          abilityId: GUTS_CANNON_ID,
          step: "gutsCannon",
          resourcePreview: { action: true },
        },
        selectedUnitId: guts.id,
        papyrusLineAxis: "row",
        setActionMode: () => undefined,
      }}
    />,
  );

  assert.match(markup, /Using: Hand Cannon/);
  assert.match(markup, /Hand Cannon: select an enemy in ranged attack line/);
  assert.match(markup, /Cost preview: Uses Action/);
  assert.match(markup, /Cancel/);
});

test("current task panel shows Frisk board target pending prompts", () => {
  setLanguage("en", { setItem: () => undefined });
  const frisk = makeUnit({ id: "P1-frisk", heroId: "frisk" });
  const markup = renderToStaticMarkup(
    <CurrentTaskPanel
      vm={{
        view: makeView(frisk),
        playerId: "P1",
        pendingRoll: {
          id: "roll",
          player: "P1",
          kind: "friskPacifismHugsTargetChoice",
          context: { friskId: frisk.id, options: [] },
        },
        pendingMeta: null,
        pendingQueueCount: 0,
        stakeSelections: [],
        stakeLimit: 0,
        hassanAssassinOrderSelections: [],
        isFriskPacifismHugsTargetChoice: true,
        actionMode: null,
        targetingMode: null,
        sendAction: () => undefined,
        setStakeSelections: () => undefined,
        setHassanAssassinOrderSelections: () => undefined,
      }}
    />,
  );

  assert.match(markup, /Frisk: Hugs/);
  assert.match(markup, /Hugs: select a highlighted unit within 2 cells/);
  assert.match(markup, /Pending for P1/);
});

test("automatic transformations do not render executable action buttons", () => {
  setLanguage("en", { setItem: () => undefined });
  const griffith = makeUnit({
    id: "P1-griffith",
    heroId: "griffith",
    class: "berserker",
  });
  const abilities = [
    makeAbility({
      id: GRIFFITH_FEMTO_REBIRTH_ID,
      name: "Femto Rebirth",
      kind: "phantasm",
      slot: "action",
    }),
    makeAbility({
      id: METTATON_EX_ID,
      name: "Mettaton EX",
      kind: "phantasm",
      slot: "action",
    }),
    makeAbility({
      id: METTATON_NEO_ID,
      name: "Mettaton NEO",
      kind: "phantasm",
      slot: "action",
    }),
  ].filter(isActionableAbility);

  const markup = renderToStaticMarkup(
    <BattleAbilityActions
      view={makeView(griffith)}
      actionableAbilities={abilities}
      selectedUnit={griffith}
      canAct={true}
      economy={griffith.turn}
      actionMode={null}
      targetingActive={false}
      onUseAbility={() => undefined}
      onUseLokiLaughtOption={() => undefined}
      onToggleMode={() => undefined}
      onModePreview={() => undefined}
      onHoverAbility={() => undefined}
    />,
  );

  assert.equal(markup, "");
  assert.doesNotMatch(markup, /Femto Rebirth/);
  assert.doesNotMatch(markup, /Mettaton EX/);
  assert.doesNotMatch(markup, /Mettaton NEO/);
});

test("new action UI i18n keys exist in English and Ukrainian", () => {
  const keys = [
    "actionUi.states.available",
    "actionUi.states.spent",
    "actionUi.states.blocked",
    "actionUi.states.pending",
    "actionUi.usesAction",
    "actionUi.movementAction",
    "actionUi.stealthAction",
    "actionUi.basicAttack",
    "actionUi.noAvailableOptions",
    "actionUi.clickDetails",
    "actionUi.cannotEnterStealth",
    "actionUi.movementBlocked",
    "actionUi.actionAlreadySpent",
    "pending.friskHugs",
    "pending.friskHugsPrompt",
    "pending.friskWarmWords",
    "pending.friskWarmWordsPrompt",
    "pending.friskPrecisionStrike",
    "pending.friskPrecisionStrikePrompt",
    "preview.labels.friskHugsTarget",
    "preview.labels.friskWarmWordsTarget",
    "preview.labels.friskPrecisionStrikeTarget",
  ];

  for (const language of ["en", "uk"] as const) {
    setLanguage(language, { setItem: () => undefined });
    for (const key of keys) {
      assert.notEqual(translate(key), key);
    }
  }
  setLanguage("en", { setItem: () => undefined });
});

test("Loki Laughter renders separate option buttons with costs and availability", () => {
  setLanguage("en", { setItem: () => undefined });
  const loki = makeUnit({
    id: "P1-trickster-loki",
    class: "trickster",
    heroId: "loki",
    hp: 9,
    position: { col: 2, row: 2 },
    charges: { [LOKI_LAUGHT_ID]: 15 },
  });
  const ally = makeUnit({
    id: "P1-knight-1",
    class: "knight",
    heroId: undefined,
    position: { col: 3, row: 2 },
  });
  const controlledEnemy = makeUnit({
    id: "P2-knight-1",
    owner: "P2",
    class: "knight",
    heroId: undefined,
    position: { col: 1, row: 2 },
  });
  const enemyAllyTarget = makeUnit({
    id: "P2-rider-1",
    owner: "P2",
    class: "rider",
    heroId: undefined,
    position: { col: 1, row: 3 },
  });
  const view: PlayerView = {
    ...makeView(loki),
    units: {
      [loki.id]: loki,
      [ally.id]: ally,
      [controlledEnemy.id]: controlledEnemy,
      [enemyAllyTarget.id]: enemyAllyTarget,
    },
  };
  const ability = makeAbility({
    id: LOKI_LAUGHT_ID,
    name: "Loki's Laughter",
    description: "Pick a trick",
    slot: "none",
    chargeRequired: 0,
    maxCharges: undefined,
    currentCharges: 15,
    chargeUnlimited: true,
    isAvailable: true,
  });

  const markup = renderToStaticMarkup(
    <BattleAbilityActions
      view={view}
      actionableAbilities={[ability]}
      selectedUnit={loki}
      canAct={true}
      economy={loki.turn}
      actionMode={null}
      targetingActive={false}
      onUseAbility={() => undefined}
      onUseLokiLaughtOption={() => undefined}
      onToggleMode={() => undefined}
      onModePreview={() => undefined}
      onHoverAbility={() => undefined}
    />,
  );

  assert.equal((markup.match(/data-loki-laught-option=/g) ?? []).length, 5);
  assert.match(markup, /Again some nonsense/);
  assert.match(markup, /Chicken/);
  assert.match(markup, /Mind Control/);
  assert.match(markup, /Spin the drum/);
  assert.match(markup, /Great Loki joke/);
  assert.match(markup, /data-loki-laught-cost="3"/);
  assert.match(markup, /data-loki-laught-cost="5"/);
  assert.match(markup, /data-loki-laught-cost="10"/);
  assert.match(markup, /data-loki-laught-cost="12"/);
  assert.match(markup, /data-loki-laught-cost="15"/);
  assert.doesNotMatch(markup, />Loki&#x27;s Laughter</);

  const lowChargeMarkup = renderToStaticMarkup(
    <BattleAbilityActions
      view={view}
      actionableAbilities={[{ ...ability, currentCharges: 4 }]}
      selectedUnit={{ ...loki, charges: { [LOKI_LAUGHT_ID]: 4 } }}
      canAct={true}
      economy={loki.turn}
      actionMode={null}
      targetingActive={false}
      onUseAbility={() => undefined}
      onUseLokiLaughtOption={() => undefined}
      onToggleMode={() => undefined}
      onModePreview={() => undefined}
      onHoverAbility={() => undefined}
    />,
  );

  assert.match(lowChargeMarkup, /Not enough charges/);
});
