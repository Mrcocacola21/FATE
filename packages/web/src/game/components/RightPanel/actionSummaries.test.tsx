import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AbilityView, PlayerView, UnitState } from "rules";
import { setLanguage, translate } from "../../../i18n";
import {
  ARTEMIS_MOON_INSIGHT_ID,
  DON_SORROWFUL_ID,
  GRIFFITH_FEMTO_REBIRTH_ID,
  GUTS_CANNON_ID,
  JACK_SNARES_ID,
  KANEKI_REGENERATION_ID,
  LOKI_LAUGHT_ID,
  LUCHE_DIVINE_RAY_ID,
  METTATON_EX_ID,
  METTATON_NEO_ID,
  RIVER_PERSON_BOAT_ID,
  getMaxHp,
} from "../../../rulesHints";
import { createCellClickHandler } from "../../gameshell-content/cellHandlers";
import { CurrentTaskPanel } from "../../gameshell-content/components/CurrentTaskPanel";
import { BattleUnitSummary } from "./sections/BattleUnitSummary";
import { BattleAbilityActions } from "./sections/BattleAbilityActions";
import { BattleBottomHints } from "./sections/BattleBottomHints";
import { getAvailableMovementModes } from "../../movementModes";
import {
  getPublicBattleActionBars,
  getUnitDetailActionBars,
  getUnitMoveSummary,
  type UnitActionSummary,
  type UnitMoveSummary,
  type UnitStealthSummary,
} from "./actionSummaries";
import {
  formatChargeLabel,
  getAbilityChargeState,
  isActionableAbility,
} from "./rightPanelHelpers";
import { buildRightPanelViewModel } from "./rightPanelViewModel";

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
      movementActionsRemaining: 1,
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

test("Boatman movement budget keeps Move, Boat, and Search(Move) available", () => {
  setLanguage("en", { setItem: () => undefined });
  const river = makeUnit({
    id: "P1-river",
    class: "rider",
    heroId: "riverPerson",
    turn: {
      moveUsed: true,
      attackUsed: false,
      actionUsed: true,
      stealthUsed: false,
    },
    hasMovedThisTurn: true,
    hasActedThisTurn: true,
    riverBoatmanExtraMoves: 1,
  });
  const boat = makeAbility({
    id: RIVER_PERSON_BOAT_ID,
    name: "Boat",
    description: "Move with an optional passenger",
    slot: "move",
    chargeRequired: undefined,
    maxCharges: undefined,
    currentCharges: undefined,
    isAvailable: true,
  });
  const view = {
    ...makeView(river),
    abilitiesByUnitId: { [river.id]: [boat] },
    legalIntents: {
      ...makeView(river).legalIntents!,
      movementActionsRemaining: 1,
      canMove: true,
      canSearchMove: true,
    },
  };
  const vm = buildRightPanelViewModel(
    {
      view,
      role: "P1",
      selectedUnitId: river.id,
      actionMode: null,
      targetingMode: null,
      placeUnitId: null,
      moveOptions: null,
      joined: true,
      pendingRoll: false,
      onSelectUnit: () => undefined,
      onSetActionMode: () => undefined,
      onSetPlaceUnit: () => undefined,
      onMoveRequest: () => undefined,
      onSendAction: () => undefined,
      onHoverAbility: () => undefined,
      onHoverActionMode: () => undefined,
      papyrusLineAxis: "row",
      onSetPapyrusLineAxis: () => undefined,
    },
    translate,
  );

  assert.equal(vm.moveDisabled, false, "Move should use authoritative movement availability");
  assert.equal(vm.searchMoveDisabled, false, "Search(Move) should share the movement budget");

  const markup = renderToStaticMarkup(
    <BattleAbilityActions
      view={view}
      actionableAbilities={[boat]}
      selectedUnit={river}
      canAct={true}
      economy={river.turn}
      actionMode={null}
      targetingActive={false}
      onUseAbility={() => undefined}
      onUseLokiLaughtOption={() => undefined}
      onToggleMode={() => undefined}
      onModePreview={() => undefined}
      onHoverAbility={() => undefined}
    />,
  );
  assert.match(markup, /<button(?![^>]*disabled)[^>]*>Boat<\/button>/);

  const moveSummary = getUnitMoveSummary({
    unit: river,
    abilityViews: [boat],
    view,
    canAct: true,
    pendingRoll: false,
  });
  assert.equal(moveSummary.state, "available");
  assert.equal(moveSummary.movementActionsRemaining, 1);
  assert.equal(moveSummary.abilities[0]?.state, "available");
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

test("current task panel keeps movement intent visible through mode and destination selection", () => {
  setLanguage("en", { setItem: () => undefined });
  const undyne = makeUnit({
    id: "P1-undyne",
    class: "berserker",
    heroId: "undyne",
  });
  const baseVm = {
    view: makeView(undyne),
    playerId: "P1",
    pendingRoll: null,
    pendingMeta: null,
    actionMode: "move",
    targetingMode: {
      sourceUnitId: undyne.id,
      abilityId: "move",
      step: "move",
      resourcePreview: { move: true },
    },
    selectedUnitId: undyne.id,
    papyrusLineAxis: "row",
    setActionMode: () => undefined,
  };

  const modeMarkup = renderToStaticMarkup(
    <CurrentTaskPanel
      vm={{
        ...baseVm,
        moveOptions: {
          unitId: undyne.id,
          legalTo: [],
          modes: ["normal", "spearman"],
        },
      }}
    />,
  );
  assert.match(modeMarkup, /Choose move mode/);
  assert.doesNotMatch(modeMarkup, /No forced task/);

  const destinationMarkup = renderToStaticMarkup(
    <CurrentTaskPanel
      vm={{
        ...baseVm,
        moveOptions: {
          unitId: undyne.id,
          legalTo: [{ col: 2, row: 3 }],
          mode: "spearman",
        },
      }}
    />,
  );
  assert.match(destinationMarkup, /Choose a destination/);
  assert.doesNotMatch(destinationMarkup, /No forced task/);
});

test("Artemida and Kaneki expose generic multiclass movement choices", () => {
  setLanguage("en", { setItem: () => undefined });
  const artemida = makeUnit({
    id: "P1-artemida",
    class: "archer",
    heroId: "artemida",
  });
  const kaneki = makeUnit({
    id: "P1-kaneki",
    class: "berserker",
    heroId: "kaneki",
    kanekiCentipedeUnlocked: true,
  });
  assert.deepEqual(
    getAvailableMovementModes(artemida, makeView(artemida)).map((option) => [option.id, option.classId]),
    [["normal", "archer"], ["trickster", "trickster"]],
  );
  assert.deepEqual(
    getAvailableMovementModes(kaneki, makeView(kaneki)).map((option) => [option.id, option.classId]),
    [["normal", "berserker"], ["assassin", "assassin"], ["rider", "rider"]],
  );

  const requests: string[] = [];
  const markup = renderToStaticMarkup(
    <BattleBottomHints
      moveModeOptions={["normal", "trickster"]}
      selectedUnitId={artemida.id}
      selectedUnitClass={artemida.class}
      moveDisabled={false}
      actionMode={null}
      targetingMode={null}
      abilityViews={[]}
      papyrusLineAxis="row"
      undyneAxis="row"
      onMoveRequest={(_unitId, mode) => requests.push(String(mode))}
      onCancelTargeting={() => undefined}
    />,
  );
  assert.match(markup, /Move as Archer/);
  assert.match(markup, /Move as Trickster/);
});

test("Boat targeting remains a forced board task and offers cancel without spending", () => {
  setLanguage("en", { setItem: () => undefined });
  const river = makeUnit({
    id: "P1-river",
    class: "rider",
    heroId: "riverPerson",
  });
  const markup = renderToStaticMarkup(
    <CurrentTaskPanel
      vm={{
        view: makeView(river),
        playerId: "P1",
        pendingRoll: {
          id: "boat-choice",
          player: "P1",
          kind: "riverBoatCarryChoice",
          context: { riverId: river.id, options: [] },
        },
        pendingMeta: { id: "boat-choice" },
        pendingQueueCount: 0,
        stakeSelections: [],
        stakeLimit: 0,
        hassanAssassinOrderSelections: [],
        isRiverBoatCarryChoice: true,
        actionMode: null,
        targetingMode: null,
        sendAction: () => undefined,
      }}
    />,
  );

  assert.match(markup, /Move without passenger/);
  assert.match(markup, /Cancel/);
  assert.doesNotMatch(markup, /No forced task/);
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

test("new-batch passive and start-turn impulse abilities are not normal action buttons", () => {
  for (const id of [ARTEMIS_MOON_INSIGHT_ID, DON_SORROWFUL_ID, JACK_SNARES_ID]) {
    assert.equal(
      isActionableAbility(makeAbility({
        id,
        kind: id === DON_SORROWFUL_ID ? "passive" : "impulse",
      })),
      false,
      `${id} must not render as a manual action`,
    );
  }

  assert.equal(
    isActionableAbility(makeAbility({
      id: LUCHE_DIVINE_RAY_ID,
      kind: "impulse",
      slot: "action",
      isAvailable: true,
    })),
    true,
    "Light Ray keeps only its paid Action/Sun variant",
  );
});

test("Kaneki Regeneration renders a confirmed partial-RC selector", () => {
  setLanguage("en", { setItem: () => undefined });
  const kaneki = makeUnit({
    id: "P1-berserker-kaneki",
    class: "berserker",
    heroId: "kaneki",
    hp: 7,
    charges: { kanekiRcCells: 4 },
  });
  const markup = renderToStaticMarkup(
    <BattleAbilityActions
      view={makeView(kaneki)}
      actionableAbilities={[makeAbility({
        id: KANEKI_REGENERATION_ID,
        name: "Regeneration",
        currentCharges: 4,
        chargeRequired: 1,
      })]}
      selectedUnit={kaneki}
      canAct={true}
      economy={kaneki.turn}
      actionMode={null}
      targetingActive={false}
      onUseAbility={() => undefined}
      onUseLokiLaughtOption={() => undefined}
      onToggleMode={() => undefined}
      onModePreview={() => undefined}
      onHoverAbility={() => undefined}
    />,
  );

  assert.match(markup, /Spend 1 RC Cells to heal 1 HP/);
  assert.match(markup, /Confirm/);
  assert.match(markup, /data-regeneration-amount="1"/);
});

test("new-batch HP passives are reflected by every web HP bar", () => {
  const cases = [
    ["duolingo", "trickster", 2],
    ["luche", "spearman", 2],
    ["kaneki", "berserker", 2],
    ["zoro", "knight", 2],
    ["donKihote", "rider", 1],
    ["jackRipper", "assassin", 1],
    ["artemida", "archer", 5],
  ] as const;

  for (const [heroId, unitClass, bonus] of cases) {
    const ordinary = makeUnit({ class: unitClass, heroId: undefined });
    const hero = makeUnit({ class: unitClass, heroId });
    assert.equal(
      getMaxHp(hero.class, hero.heroId),
      getMaxHp(ordinary.class, ordinary.heroId) + bonus,
      heroId,
    );
  }
  assert.equal(getMaxHp("archer", "artemida"), 10);
});

test("Duolingo Push Notification keeps local intent and submits the clicked destination", () => {
  const duolingo = makeUnit({
    id: "P1-trickster-duolingo",
    class: "trickster",
    heroId: "duolingo",
    position: { col: 1, row: 1 },
  });
  const creature = makeUnit({
    id: "P2-knight-target",
    owner: "P2",
    class: "knight",
    heroId: undefined,
    position: { col: 3, row: 3 },
  });
  const view = {
    ...makeView(duolingo),
    units: { [duolingo.id]: duolingo, [creature.id]: creature },
  };
  let selectedTarget: string | null = null;
  let sent: unknown = null;
  const common = {
    view,
    playerId: "P1",
    joined: true,
    isSpectator: false,
    hasBlockingRoll: false,
    boardSelectionPending: false,
    actionMode: "duolingoPush",
    selectedUnitId: duolingo.id,
    newHeroAbilityTargetId: null,
    setNewHeroAbilityTargetId: (id: string | null) => { selectedTarget = id; },
    sendGameAction: (action: unknown) => { sent = action; },
    setActionMode: () => undefined,
    legalPlacementCoords: [],
    sendAction: () => undefined,
  };

  createCellClickHandler(common as never)(3, 3);
  assert.equal(selectedTarget, creature.id);

  createCellClickHandler({ ...common, newHeroAbilityTargetId: creature.id } as never)(4, 3);
  assert.deepEqual(sent, {
    type: "useAbility",
    unitId: duolingo.id,
    abilityId: "duolingoPushNotification",
    payload: { targetId: creature.id, destination: { col: 4, row: 3 } },
  });
});

test("movement intent submits only an authoritative highlighted destination", () => {
  const artemida = makeUnit({
    id: "P1-artemida-move",
    class: "archer",
    heroId: "artemida",
    position: { col: 2, row: 2 },
  });
  const sent: unknown[] = [];
  const context = {
    view: makeView(artemida),
    playerId: "P1",
    joined: true,
    isSpectator: false,
    hasBlockingRoll: false,
    boardSelectionPending: false,
    actionMode: "move",
    selectedUnitId: artemida.id,
    legalMoveCoords: [{ col: 3, row: 2 }],
    sendGameAction: (action: unknown) => sent.push(action),
    setActionMode: () => undefined,
    setMoveOptions: () => undefined,
    sendAction: () => undefined,
  };

  createCellClickHandler(context as never)(4, 2);
  assert.equal(sent.length, 0, "an unhighlighted destination must not submit");
  createCellClickHandler(context as never)(3, 2);
  assert.deepEqual(sent, [{
    type: "move",
    unitId: artemida.id,
    to: { col: 3, row: 2 },
  }]);
});

test("Artemida ability clicks reject off-line cells before command submission", () => {
  const artemida = makeUnit({
    id: "P1-artemida-sickle",
    class: "archer",
    heroId: "artemida",
    position: { col: 2, row: 2 },
  });
  const sent: unknown[] = [];
  const context = {
    view: makeView(artemida),
    playerId: "P1",
    joined: true,
    isSpectator: false,
    hasBlockingRoll: false,
    boardSelectionPending: false,
    actionMode: "artemisSilverSickle",
    selectedUnitId: artemida.id,
    artemidaLineTargetKeys: new Set(["4,2"]),
    sendGameAction: (action: unknown) => sent.push(action),
    setActionMode: () => undefined,
    sendAction: () => undefined,
  };

  createCellClickHandler(context as never)(4, 3);
  assert.equal(sent.length, 0, "off-line Silver Moon Sickle point must not submit");
  createCellClickHandler(context as never)(4, 2);
  assert.deepEqual(sent, [{
    type: "useAbility",
    unitId: artemida.id,
    abilityId: "artemidaSilverCrescent",
    payload: { target: { col: 4, row: 2 } },
  }]);
});

test("Don board pending choices route cell clicks to the server", () => {
  const don = makeUnit({
    id: "P1-rider-don",
    class: "rider",
    heroId: "donKihote",
    position: { col: 2, row: 2 },
  });
  let sent: unknown = null;
  createCellClickHandler({
    view: makeView(don),
    playerId: "P1",
    joined: true,
    isSpectator: false,
    hasBlockingRoll: true,
    boardSelectionPending: true,
    isChargedImpulseTargetChoice: true,
    chargedImpulseTargetKeys: new Set(["3,2"]),
    pendingRoll: {
      id: "pending-don-move",
      kind: "donSorrowfulMoveChoice",
      playerId: "P1",
      context: {},
    },
    actionMode: null,
    selectedUnitId: don.id,
    sendAction: (action: unknown) => { sent = action; },
    sendGameAction: () => undefined,
  } as never)(3, 2);

  assert.deepEqual(sent, {
    type: "resolvePendingRoll",
    pendingRollId: "pending-don-move",
    choice: { type: "donSorrowfulMove", destination: { col: 3, row: 2 } },
  });
});

test("Hassan True Enemy unit clicks submit only highlighted targets", () => {
  const hassan = makeUnit({
    id: "P1-assassin-hassan",
    heroId: "hassan",
    position: { col: 2, row: 2 },
  });
  const controlled = makeUnit({
    id: "P2-rider-controlled",
    owner: "P2",
    class: "rider",
    heroId: undefined,
    position: { col: 3, row: 2 },
  });
  const invalid = makeUnit({
    id: "P2-knight-invalid",
    owner: "P2",
    class: "knight",
    heroId: undefined,
    position: { col: 4, row: 2 },
  });
  const view = {
    ...makeView(hassan),
    units: {
      [hassan.id]: hassan,
      [controlled.id]: controlled,
      [invalid.id]: invalid,
    },
  };
  const sent: unknown[] = [];
  const common = {
    view,
    playerId: "P1",
    joined: true,
    isSpectator: false,
    hasBlockingRoll: false,
    boardSelectionPending: false,
    actionMode: "hassanTrueEnemy",
    selectedUnitId: hassan.id,
    hassanTrueEnemyCandidateIds: [controlled.id],
    sendGameAction: (action: unknown) => sent.push(action),
    sendAction: () => undefined,
  };

  createCellClickHandler(common as never)(4, 2);
  assert.equal(sent.length, 0, "non-highlighted unit should not submit");
  createCellClickHandler(common as never)(3, 2);
  assert.deepEqual(sent, [
    {
      type: "useAbility",
      unitId: hassan.id,
      abilityId: "hassanTrueEnemy",
      payload: { forcedAttackerId: controlled.id },
    },
  ]);
});

test("Hassan and Loki pending unit targets submit authenticated board choices", () => {
  const caster = makeUnit({ id: "P1-caster", position: { col: 1, row: 1 } });
  const controlled = makeUnit({
    id: "P2-controlled",
    owner: "P2",
    position: { col: 2, row: 1 },
  });
  const attackTarget = makeUnit({
    id: "P2-target",
    owner: "P2",
    class: "knight",
    position: { col: 3, row: 1 },
  });
  const view = {
    ...makeView(caster),
    units: {
      [caster.id]: caster,
      [controlled.id]: controlled,
      [attackTarget.id]: attackTarget,
    },
  };
  const cases = [
    {
      flag: "isHassanTrueEnemyTargetChoice",
      ids: "hassanTrueEnemyTargetIds",
      choiceType: "hassanTrueEnemyTarget",
    },
    {
      flag: "isLokiMindControlEnemyChoice",
      ids: "lokiMindControlEnemyIds",
      choiceType: "lokiMindControlEnemy",
    },
    {
      flag: "isLokiMindControlTargetChoice",
      ids: "lokiMindControlTargetIds",
      choiceType: "lokiMindControlTarget",
    },
  ] as const;

  for (const testCase of cases) {
    const sent: unknown[] = [];
    const pendingRollId = `pending-${testCase.choiceType}`;
    const context = {
      view,
      playerId: "P1",
      joined: true,
      isSpectator: false,
      hasBlockingRoll: true,
      boardSelectionPending: true,
      [testCase.flag]: true,
      [testCase.ids]: [attackTarget.id],
      pendingRoll: { id: pendingRollId, kind: "test", player: "P1", context: {} },
      actionMode: null,
      selectedUnitId: caster.id,
      sendAction: (action: unknown) => sent.push(action),
      sendGameAction: () => undefined,
    };

    createCellClickHandler(context as never)(2, 1);
    assert.equal(sent.length, 0, `${testCase.choiceType} should ignore non-highlighted units`);
    createCellClickHandler(context as never)(3, 1);
    assert.deepEqual(sent, [
      {
        type: "resolvePendingRoll",
        pendingRollId,
        player: "P1",
        choice: { type: testCase.choiceType, targetId: attackTarget.id },
      },
    ]);
  }
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
