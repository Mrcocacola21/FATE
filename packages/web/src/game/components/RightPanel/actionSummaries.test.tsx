import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AbilityView, PlayerView, UnitState } from "rules";
import { setLanguage, translate } from "../../../i18n";
import { BattleUnitSummary } from "./sections/BattleUnitSummary";
import {
  getPublicBattleActionBars,
  getUnitDetailActionBars,
  type UnitActionSummary,
  type UnitMoveSummary,
  type UnitStealthSummary,
} from "./actionSummaries";

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
  ];

  for (const language of ["en", "uk"] as const) {
    setLanguage(language, { setItem: () => undefined });
    for (const key of keys) {
      assert.notEqual(translate(key), key);
    }
  }
  setLanguage("en", { setItem: () => undefined });
});
