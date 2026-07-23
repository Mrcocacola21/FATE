import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AbilityView, GameAction, PlayerView, UnitState } from "rules";
import { setLanguage, translate } from "../../../i18n";
import {
  ARTEMIS_MOON_INSIGHT_ID,
  DON_SORROWFUL_ID,
  DON_WINDMILLS_ID,
  GRIFFITH_FEMTO_REBIRTH_ID,
  GUTS_CANNON_ID,
  HASSAN_ASSASSIN_ORDER_ID,
  JACK_COVERING_TRACKS_ID,
  JACK_SNARES_ID,
  KANEKI_REGENERATION_ID,
  LOKI_LAUGHT_ID,
  LUCHE_DIVINE_RAY_ID,
  METTATON_EX_ID,
  METTATON_NEO_ID,
  RIVER_PERSON_BOAT_ID,
  VLAD_FOREST_ID,
  ZORO_ONI_GIRI_ID,
  getMaxHp,
} from "../../../rulesHints";
import { createCellClickHandler } from "../../gameshell-content/cellHandlers";
import { CurrentTaskPanel } from "../../gameshell-content/components/CurrentTaskPanel";
import { BattleUnitSummary } from "./sections/BattleUnitSummary";
import { BattleAbilityActions } from "./sections/BattleAbilityActions";
import { BattleActionButtons } from "./sections/BattleActionButtons";
import { BattleBottomHints } from "./sections/BattleBottomHints";
import { BattleHeroControls } from "./sections/BattleHeroControls";
import {
  CoreResourceStrip,
  getOrdinaryAbilityCounterView,
  PassiveImpulseInfo,
  SelectedUnitHeader,
  SpecialHeroResourceStrip,
} from "./ActionMenu";
import { getSpecialHeroResourceViews } from "../../specialHeroResources";
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
  shouldRenderManualAbilityButton,
} from "./rightPanelHelpers";
import { buildRightPanelViewModel } from "./rightPanelViewModel";
import { getAbilityDisplay } from "../../../i18n/displayMetadata";

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
    gameOver: null,
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
    jackTraps: [],
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

function makeRightPanelProps(view: PlayerView, selectedUnitId: string) {
  return {
    view,
    role: "P1" as const,
    selectedUnitId,
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
    papyrusLineAxis: "row" as const,
    onSetPapyrusLineAxis: () => undefined,
  };
}

function renderPrimaryActions(showStealthAction: boolean) {
  return renderToStaticMarkup(
    <BattleActionButtons
      actionMode={null}
      targetingActive={false}
      moveDisabled={false}
      attackDisabled={false}
      searchMoveDisabled={false}
      searchActionDisabled={false}
      stealthDisabled={false}
      showStealthAction={showStealthAction}
      onMoveClick={() => undefined}
      onAttackClick={() => undefined}
      onSearchMoveClick={() => undefined}
      onSearchActionClick={() => undefined}
      onStealthClick={() => undefined}
      onModePreview={() => undefined}
    />,
  );
}

test("Grand Kaiser Action Menu loses stealth and Bunker after transformation", () => {
  setLanguage("en", { setItem: () => undefined });
  const baseKaiser = makeUnit({
    id: "P1-grand-kaiser-stealth",
    heroId: "grand-kaiser",
    class: "archer",
    bunker: { active: false, ownTurnsInBunker: 0 },
  });
  const bunker = makeAbility({
    id: "kaiserBunker",
    name: "Bunker",
    kind: "passive",
    slot: "none",
    chargeRequired: undefined,
    maxCharges: undefined,
    currentCharges: undefined,
  });
  const beforeView = {
    ...makeView(baseKaiser),
    abilitiesByUnitId: { [baseKaiser.id]: [bunker] },
  };
  const beforeVm = buildRightPanelViewModel(
    makeRightPanelProps(beforeView, baseKaiser.id),
    translate,
  );

  assert.equal(beforeVm.showStealthAction, true);
  assert.match(renderPrimaryActions(beforeVm.showStealthAction), /Enter Stealth/);
  assert.equal(
    beforeVm.abilityViews.some((ability) => ability.id === "kaiserBunker"),
    true,
  );

  const transformedKaiser = {
    ...baseKaiser,
    transformed: true,
    isStealthed: false,
    stealthTurnsLeft: 0,
  };
  const transformedView = {
    ...makeView(transformedKaiser),
    abilitiesByUnitId: { [transformedKaiser.id]: [bunker] },
    legalIntents: {
      ...makeView(transformedKaiser).legalIntents!,
      canEnterStealth: false,
    },
  };
  const transformedVm = buildRightPanelViewModel(
    makeRightPanelProps(transformedView, transformedKaiser.id),
    translate,
  );
  const transformedActions = renderPrimaryActions(transformedVm.showStealthAction);
  const transformedResources = renderToStaticMarkup(
    <CoreResourceStrip unit={transformedKaiser} economy={transformedKaiser.turn} />,
  );
  const transformedHeader = renderToStaticMarkup(
    <SelectedUnitHeader unit={transformedKaiser} heroName="Grand Kaiser" />,
  );
  const transformedSummary = getUnitDetailActionBars({
    unit: transformedKaiser,
    abilityViews: transformedVm.abilityViews,
    view: transformedView,
    canAct: true,
    pendingRoll: false,
  }).find((summary) => summary.kind === "stealth") as UnitStealthSummary;

  assert.equal(transformedVm.stealthDisabled, true);
  assert.equal(transformedVm.showStealthAction, false);
  assert.doesNotMatch(transformedActions, /Enter Stealth/);
  assert.doesNotMatch(transformedActions, /data-testid="enter-stealth-action"/);
  assert.match(transformedResources, /No stealth/);
  assert.match(transformedHeader, /Rider \+ Berserker/);
  assert.doesNotMatch(transformedHeader, />Archer</);
  assert.equal(transformedSummary.state, "not_applicable");
  assert.equal(transformedSummary.threshold, null);
  assert.equal(
    transformedVm.abilityViews.some((ability) => ability.id === "kaiserBunker"),
    false,
    "stale Bunker projection must not render as usable after transformation",
  );
  assert.equal(
    renderToStaticMarkup(
      <PassiveImpulseInfo unit={transformedKaiser} abilities={transformedVm.abilityViews} />,
    ),
    "",
  );
});

test("shared mobile and desktop primary actions omit transformed Kaiser stealth", () => {
  setLanguage("en", { setItem: () => undefined });
  const sharedActionMarkup = renderPrimaryActions(false);
  assert.doesNotMatch(sharedActionMarkup, /Enter Stealth/);
  assert.match(sharedActionMarkup, /Move/);
  assert.match(sharedActionMarkup, /Attack/);
});

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
  const unit = makeUnit({
    blindUntilOwnTurnStart: true,
    blindExpiresAfterOwnTurn: 1,
  });
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
  assert.match(markup, /Blind: targeting limited to radius 1/);
});

test("Orange Bone status and compact move-first warning follow per-turn tracking", () => {
  setLanguage("en", { setItem: () => undefined });
  const unit = makeUnit({
    papyrusBoneStatus: {
      sourceUnitId: "P2-papyrus",
      kind: "orange",
      expiresOnSourceOwnTurn: 2,
    },
    orangeBoneFirstMoveSatisfied: false,
    orangeBonePenaltyAppliedThisTurn: false,
    hasSpentMeaningfulTurnAction: false,
  });
  const renderSummary = (selectedUnit: UnitState) =>
    renderToStaticMarkup(
      <BattleUnitSummary
        selectedUnit={selectedUnit}
        selectedHeroName="Frisk"
        selectedMettatonRating={null}
        forestMarkers={[]}
        selectedInsideForest={false}
        stormActive={false}
        selectedStormExempt={false}
        moveRoll={null}
        economy={selectedUnit.turn}
        abilityViews={[makeAbility()]}
        view={makeView(selectedUnit)}
        canAct={true}
        pendingRoll={false}
        legalAttackTargetCount={1}
        legalMoveCount={1}
        onHoverAbility={() => undefined}
      />,
    );

  const unresolvedMarkup = renderSummary(unit);
  assert.match(unresolvedMarkup, /data-unit-bone-status="orange"/);
  assert.match(unresolvedMarkup, /the first action this unit takes on its turn must be Movement/);
  assert.match(unresolvedMarkup, /data-orange-bone-warning/);
  assert.match(unresolvedMarkup, /Orange Bone: move first or take 1 damage/);

  const satisfiedMarkup = renderSummary({
    ...unit,
    orangeBoneFirstMoveSatisfied: true,
    hasSpentMeaningfulTurnAction: true,
  });
  assert.match(
    satisfiedMarkup,
    /data-unit-bone-status="orange"/,
    "the active status badge should remain visible after Movement satisfies the turn",
  );
  assert.doesNotMatch(satisfiedMarkup, /data-orange-bone-warning/);

  const penalizedMarkup = renderSummary({
    ...unit,
    hp: 3,
    stealthAttemptedThisTurn: true,
    turn: { ...unit.turn, stealthUsed: true },
    orangeBonePenaltyAppliedThisTurn: true,
    hasSpentMeaningfulTurnAction: true,
  });
  assert.match(penalizedMarkup, /3\/5/);
  assert.match(penalizedMarkup, /data-unit-bone-status="orange"/);
  assert.doesNotMatch(
    penalizedMarkup,
    /data-orange-bone-warning/,
    "a projected Stealth-first penalty should update HP and clear the one-shot warning",
  );
});

test("Papyrus controls never render a global Blue or Orange bone mode toggle", () => {
  setLanguage("en", { setItem: () => undefined });
  const papyrus = makeUnit({
    heroId: "papyrus",
    papyrusUnbelieverActive: true,
    papyrusLongBoneMode: false,
  });
  const markup = renderToStaticMarkup(
    <BattleHeroControls
      selectedUnit={papyrus}
      selectedIsPapyrus={true}
      selectedIsUndyne={false}
      papyrusLineAxis="row"
      papyrusAxisOptions={[
        { axis: "row", label: "Rows" },
        { axis: "col", label: "Columns" },
        { axis: "diagMain", label: "Main diagonal" },
        { axis: "diagAnti", label: "Anti diagonal" },
      ]}
      undyneAxis="row"
      undyneAxisOptions={[]}
      selectedPapyrusUnbeliever={true}
      selectedPapyrusLongBoneMode={false}
      canAct={true}
      onSetPapyrusAxis={() => undefined}
      onSetUndyneAxis={() => undefined}
      onTogglePapyrusLongBone={() => undefined}
    />,
  );

  assert.doesNotMatch(markup, />Blue</);
  assert.doesNotMatch(markup, />Orange</);
  assert.match(markup, /Long Bone/);
});

test("unit summary renders Entangled and Chicken status badges", () => {
  setLanguage("en", { setItem: () => undefined });
  const unit = makeUnit({
    lokiMoveLockSources: ["loki"],
    lokiChickenSources: ["loki"],
  });
  const markup = renderToStaticMarkup(
    <BattleUnitSummary
      selectedUnit={unit}
      selectedHeroName="Target"
      selectedMettatonRating={null}
      forestMarkers={[]}
      selectedInsideForest={false}
      stormActive={false}
      selectedStormExempt={false}
      moveRoll={null}
      economy={unit.turn}
      abilityViews={[]}
      view={makeView(unit)}
      canAct={false}
      pendingRoll={false}
      onHoverAbility={() => undefined}
    />,
  );
  assert.match(markup, /Entangled/);
  assert.match(markup, /Chicken/);
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
  assert.match(markup, /data-ability-action-id="riverBoat"(?![^>]*disabled)/);
  assert.doesNotMatch(markup, /title="Move slot already used"/);

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

test("Windmills renders as an enabled board-targeting action", () => {
  const don = makeUnit({
    id: "P1-rider-don",
    class: "rider",
    heroId: "donKihote",
    charges: { [DON_WINDMILLS_ID]: 3 },
  });
  const windmills = makeAbility({
    id: DON_WINDMILLS_ID,
    name: "Attack on Windmills",
    slot: "move",
    chargeRequired: 3,
    maxCharges: 3,
    currentCharges: 3,
    isAvailable: true,
    targeting: { targetIds: ["P2-knight-target"] },
  });
  const markup = renderToStaticMarkup(
    <BattleAbilityActions
      view={makeView(don)}
      actionableAbilities={[windmills]}
      selectedUnit={don}
      canAct={true}
      economy={don.turn}
      actionMode={null}
      targetingActive={false}
      onUseAbility={() => undefined}
      onUseLokiLaughtOption={() => undefined}
      onToggleMode={() => undefined}
      onModePreview={() => undefined}
      onHoverAbility={() => undefined}
    />,
  );

  assert.match(markup, new RegExp(`data-ability-action-id="${DON_WINDMILLS_ID}"`));
  assert.doesNotMatch(
    markup,
    new RegExp(`data-ability-action-id="${DON_WINDMILLS_ID}"[^>]*disabled`),
  );
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
    getAvailableMovementModes(artemida, makeView(artemida)).map((option) => [
      option.id,
      option.classId,
    ]),
    [
      ["normal", "archer"],
      ["trickster", "trickster"],
    ],
  );
  assert.deepEqual(
    getAvailableMovementModes(kaneki, makeView(kaneki)).map((option) => [
      option.id,
      option.classId,
    ]),
    [
      ["normal", "berserker"],
      ["assassin", "assassin"],
      ["rider", "rider"],
    ],
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

test("Forest of the Dead stays in Cepesh details but not desktop or mobile action buttons", () => {
  setLanguage("en", { setItem: () => undefined });
  const vlad = makeUnit({
    id: "P1-vlad",
    heroId: "vladTepes",
    class: "spearman",
  });
  const forest = makeAbility({
    id: VLAD_FOREST_ID,
    name: "Forest of the Dead",
    kind: "impulse",
    description: "Automatic phantasm",
    slot: "none",
    chargeRequired: undefined,
    maxCharges: undefined,
    currentCharges: undefined,
  });

  assert.equal(shouldRenderManualAbilityButton(forest), false);
  const actionableAbilities = [forest].filter(shouldRenderManualAbilityButton);
  const sharedDesktopAndMobileActions = renderToStaticMarkup(
    <BattleAbilityActions
      view={makeView(vlad)}
      actionableAbilities={actionableAbilities}
      selectedUnit={vlad}
      canAct={true}
      economy={vlad.turn}
      actionMode={null}
      targetingActive={false}
      onUseAbility={() => undefined}
      onUseLokiLaughtOption={() => undefined}
      onToggleMode={() => undefined}
      onModePreview={() => undefined}
      onHoverAbility={() => undefined}
    />,
  );
  assert.equal(sharedDesktopAndMobileActions, "");
  assert.doesNotMatch(sharedDesktopAndMobileActions, /Forest of the Dead/);

  const detailsMarkup = renderToStaticMarkup(
    <BattleUnitSummary
      selectedUnit={vlad}
      selectedHeroName="Vlad III Tepes"
      selectedMettatonRating={null}
      forestMarkers={[]}
      selectedInsideForest={false}
      stormActive={false}
      selectedStormExempt={false}
      moveRoll={null}
      economy={vlad.turn}
      abilityViews={[forest]}
      view={makeView(vlad)}
      canAct={true}
      pendingRoll={false}
      legalAttackTargetCount={1}
      legalMoveCount={1}
      onHoverAbility={() => undefined}
    />,
  );
  assert.match(detailsMarkup, /Forest of the Dead/);
  assert.match(detailsMarkup, /Automatic phantasm\/impulse/);
  assert.match(detailsMarkup, /Phantasm/);
  assert.match(detailsMarkup, /Impulse/);
  assert.match(detailsMarkup, /Automatic/);
  assert.match(detailsMarkup, /Basic Attack/);
});

test("Forest impulse target choice appears in the compact current-task UI", () => {
  setLanguage("en", { setItem: () => undefined });
  const vlad = makeUnit({ id: "P1-vlad", heroId: "vladTepes", class: "spearman" });
  const markup = renderToStaticMarkup(
    <CurrentTaskPanel
      compact
      vm={{
        view: makeView(vlad),
        playerId: "P1",
        pendingRoll: {
          id: "vlad-forest-target",
          player: "P1",
          kind: "vladForestTarget",
          context: { unitId: vlad.id, owner: "P1" },
        },
        pendingQueueCount: 0,
        stakeSelections: [],
        stakeLimit: 0,
        hassanAssassinOrderSelections: [],
        isForestTarget: true,
        sendAction: () => undefined,
        setStakeSelections: () => undefined,
        setHassanAssassinOrderSelections: () => undefined,
      }}
    />,
  );

  assert.match(markup, /mobile-task-content/);
  assert.match(markup, /Forest of the Dead/);
  assert.match(markup, /Select the 3x3 center cell/);
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
    "actionMenu.specialResources",
    "actionMenu.abilityCounter",
    "actionMenu.counterCompact",
    "actionMenu.chargesCost",
    "actionMenu.available",
    "actionMenu.spent",
    "actionMenu.hidden",
    "actionMenu.revealed",
    "actionMenu.notEnoughResource",
    "actionMenu.actionAlreadySpent",
    "actionMenu.movementAlreadySpent",
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
      isActionableAbility(
        makeAbility({
          id,
          kind: id === DON_SORROWFUL_ID ? "passive" : "impulse",
        }),
      ),
      false,
      `${id} must not render as a manual action`,
    );
  }

  assert.equal(
    isActionableAbility(
      makeAbility({
        id: LUCHE_DIVINE_RAY_ID,
        kind: "impulse",
        slot: "action",
        isAvailable: true,
      }),
    ),
    true,
    "Light Ray keeps only its paid Action/Sun variant",
  );

  const radiance = makeAbility({
    id: "lucheShine",
    name: "Radiance",
    kind: "passive",
    description:
      "Radiance — Passive. When a figure successfully hits Luche, that figure becomes Blinded until the end of its next turn.",
  });
  assert.equal(isActionableAbility(radiance), false);
  const radianceMarkup = renderToStaticMarkup(
    <PassiveImpulseInfo unit={makeUnit({ heroId: "luche" })} abilities={[radiance]} />,
  );
  assert.match(radianceMarkup, /data-ability-info-id="lucheShine"/);
  assert.match(radianceMarkup, /Passive/);
  assert.doesNotMatch(radianceMarkup, /data-ability-use-source/);

  const coveringTracks = makeAbility({
    id: JACK_COVERING_TRACKS_ID,
    name: "Covering Tracks",
    kind: "passive",
    description: "Choose a snare to explode before placing a sixth snare.",
  });
  assert.equal(isActionableAbility(coveringTracks), false);
  assert.equal(shouldRenderManualAbilityButton(coveringTracks), false);
  assert.equal(
    getAbilityDisplay(coveringTracks.id, coveringTracks.name, coveringTracks.description, "en")
      .name,
    "Covering Tracks",
  );
  assert.equal(
    getAbilityDisplay(coveringTracks.id, coveringTracks.name, coveringTracks.description, "uk")
      .name,
    "Заметання слідів",
  );
});

test("Oni Giri renders separate counter and Determination source options", () => {
  setLanguage("en", { setItem: () => undefined });
  const zoro = makeUnit({
    id: "P1-knight-zoro",
    class: "knight",
    heroId: "zoro",
    charges: { zoroOniGiri: 2, zoroDetermination: 2 },
  });
  const oni = makeAbility({
    id: ZORO_ONI_GIRI_ID,
    name: "Oni Giri",
    useOptions: [
      {
        id: "abilityCounter",
        source: { type: "abilityCounter", counterId: ZORO_ONI_GIRI_ID },
        sourceName: "Oni Giri",
        currentCharges: 2,
        chargeRequired: 2,
        consumes: { action: true, move: true },
        isAvailable: true,
      },
      {
        id: "heroResource",
        source: { type: "heroResource", resourceId: "zoroDetermination", amount: 2 },
        sourceName: "Determination",
        currentCharges: 2,
        chargeRequired: 2,
        consumes: { action: true, move: true },
        isAvailable: true,
      },
    ],
  });
  const markup = renderToStaticMarkup(
    <BattleAbilityActions
      view={makeView(zoro)}
      actionableAbilities={[oni]}
      selectedUnit={zoro}
      canAct={true}
      economy={zoro.turn}
      actionMode={null}
      targetingActive={false}
      onUseAbility={() => undefined}
      onUseLokiLaughtOption={() => undefined}
      onToggleMode={() => undefined}
      onModePreview={() => undefined}
      onHoverAbility={() => undefined}
    />,
  );
  assert.match(markup, /Oni Giri.*Counter.*Action.*Move/);
  assert.match(markup, /Oni Giri.*Spend Determination.*Action.*Move/);
  assert.match(markup, /data-ability-use-source="abilityCounter"/);
  assert.match(markup, /data-ability-use-source="heroResource"/);
  assert.match(markup, /data-ability-card-id="zoroOniGiri"/);
  assert.match(markup, /data-testid="ability-counter-zoroOniGiri"/);
  assert.match(markup, /Counter 2\/2/);
});

test("Push Notification renders separate counter and Missed Lessons source options", () => {
  setLanguage("en", { setItem: () => undefined });
  const duolingo = makeUnit({
    id: "P1-trickster-duolingo-options",
    class: "trickster",
    heroId: "duolingo",
    charges: { duolingoPushNotification: 3, duolingoSkipClasses: 3 },
  });
  const push = makeAbility({
    id: "duolingoPushNotification",
    name: "Push Notification",
    useOptions: [
      {
        id: "abilityCounter",
        source: { type: "abilityCounter", counterId: "duolingoPushNotification" },
        sourceName: "Push Notification",
        currentCharges: 3,
        chargeRequired: 3,
        consumes: { move: true },
        isAvailable: true,
      },
      {
        id: "heroResource",
        source: { type: "heroResource", resourceId: "duolingoSkipClasses", amount: 3 },
        sourceName: "Missed Lessons",
        currentCharges: 3,
        chargeRequired: 3,
        consumes: { move: true },
        isAvailable: true,
      },
    ],
  });
  const markup = renderToStaticMarkup(
    <BattleAbilityActions
      view={makeView(duolingo)}
      actionableAbilities={[push]}
      selectedUnit={duolingo}
      canAct={true}
      economy={duolingo.turn}
      actionMode={null}
      targetingActive={false}
      onUseAbility={() => undefined}
      onUseLokiLaughtOption={() => undefined}
      onToggleMode={() => undefined}
      onModePreview={() => undefined}
      onHoverAbility={() => undefined}
    />,
  );
  assert.match(markup, /Push Notification.*Counter.*Move/);
  assert.match(markup, /Push Notification.*Spend Missed Lessons.*Move/);
  assert.match(markup, /data-ability-use-source="abilityCounter"/);
  assert.match(markup, /data-ability-use-source="heroResource"/);
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
      actionableAbilities={[
        makeAbility({
          id: KANEKI_REGENERATION_ID,
          name: "Regeneration",
          currentCharges: 4,
          chargeRequired: 1,
        }),
      ]}
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
    abilitiesByUnitId: {
      [duolingo.id]: [
        {
          id: "duolingoPushNotification",
          targeting: {
            targetIds: [creature.id],
            destinationsByTargetId: { [creature.id]: [{ col: 4, row: 3 }] },
          },
        },
      ],
    },
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
    targetingMode: {
      sourceUnitId: duolingo.id,
      abilityId: "duolingoPushNotification",
      step: "duolingoPush",
      useSource: { type: "heroResource", resourceId: "duolingoSkipClasses", amount: 3 },
    },
    selectedUnitId: duolingo.id,
    newHeroAbilityTargetId: null,
    setNewHeroAbilityTargetId: (id: string | null) => {
      selectedTarget = id;
    },
    sendGameAction: (action: unknown) => {
      sent = action;
    },
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
    payload: {
      targetId: creature.id,
      destination: { col: 4, row: 3 },
      source: { type: "heroResource", resourceId: "duolingoSkipClasses", amount: 3 },
    },
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
  assert.deepEqual(sent, [
    {
      type: "move",
      unitId: artemida.id,
      to: { col: 3, row: 2 },
    },
  ]);
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
  assert.deepEqual(sent, [
    {
      type: "useAbility",
      unitId: artemida.id,
      abilityId: "artemidaSilverCrescent",
      payload: { target: { col: 4, row: 2 } },
    },
  ]);
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
    sendAction: (action: unknown) => {
      sent = action;
    },
    sendGameAction: () => undefined,
  } as never)(3, 2);

  assert.deepEqual(sent, {
    type: "resolvePendingRoll",
    pendingRollId: "pending-don-move",
    choice: { type: "donSorrowfulMove", destination: { col: 3, row: 2 } },
  });

  sent = null;
  createCellClickHandler({
    view: makeView(don),
    playerId: "P1",
    joined: true,
    isSpectator: false,
    hasBlockingRoll: true,
    boardSelectionPending: true,
    isChargedImpulseTargetChoice: true,
    chargedImpulseTargetKeys: new Set(["5,5"]),
    pendingRoll: {
      id: "pending-don-madness",
      kind: "donMadDelusionDirection",
      player: "P1",
      context: {
        origin: { col: 2, row: 2 },
        options: [
          { col: 1, row: 1 },
          { col: 1, row: 0 },
        ],
      },
    },
    actionMode: null,
    selectedUnitId: don.id,
    sendAction: (action: unknown) => {
      sent = action;
    },
    sendGameAction: () => undefined,
  } as never)(5, 5);

  assert.deepEqual(sent, {
    type: "resolvePendingRoll",
    pendingRollId: "pending-don-madness",
    choice: { type: "donMadDelusionDirection", direction: { col: 1, row: 1 } },
  });
});

test("Covering Tracks board selection submits the highlighted snare on shared mobile/desktop handling", () => {
  const jack = makeUnit({
    id: "P1-assassin-jack",
    heroId: "jackRipper",
    position: { col: 8, row: 8 },
  });
  let sent: unknown = null;
  const handler = createCellClickHandler({
    view: makeView(jack),
    playerId: "P1",
    joined: true,
    isSpectator: false,
    hasBlockingRoll: true,
    boardSelectionPending: true,
    isChargedImpulseTargetChoice: true,
    chargedImpulseTargetKeys: new Set(["2,2"]),
    pendingRoll: {
      id: "covering-tracks",
      kind: "chargedImpulseTargetChoice",
      player: "P1",
      context: {
        unitId: jack.id,
        abilityId: JACK_SNARES_ID,
        step: "coveringTracks",
        options: [{ col: 2, row: 2 }],
      },
    },
    actionMode: null,
    selectedUnitId: jack.id,
    sendAction: (action: unknown) => {
      sent = action;
    },
    sendGameAction: () => undefined,
  } as never);

  handler(3, 3);
  assert.equal(sent, null, "an unhighlighted mobile tap must not silently select a snare");
  handler(2, 2);
  assert.deepEqual(sent, {
    type: "resolvePendingRoll",
    pendingRollId: "covering-tracks",
    choice: { type: "chargedImpulseTarget", position: { col: 2, row: 2 }, axis: undefined },
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

test("Hassan Assassin Order uses highlighted allied board targets without inspect fallthrough", () => {
  const hassan = makeUnit({
    id: "P1-assassin-hassan",
    heroId: "hassan",
    position: { col: 2, row: 0 },
  });
  const ally = makeUnit({
    id: "P1-rider-ally",
    class: "rider",
    heroId: undefined,
    position: { col: 3, row: 0 },
  });
  const enemy = makeUnit({
    id: "P2-rider-enemy",
    owner: "P2",
    class: "rider",
    heroId: undefined,
    position: { col: 3, row: 8 },
  });
  const view = {
    ...makeView(hassan),
    units: { [hassan.id]: hassan, [ally.id]: ally, [enemy.id]: enemy },
  };
  let selections: string[] = [];
  let inspected = false;
  const handler = createCellClickHandler({
    view,
    playerId: "P1",
    joined: true,
    isSpectator: false,
    hasBlockingRoll: true,
    boardSelectionPending: true,
    isHassanAssassinOrderSelection: true,
    hassanAssassinOrderEligibleIds: [ally.id],
    pendingRoll: {
      id: "hassan-assassin-order",
      kind: "hassanAssassinOrderSelection",
      player: "P1",
      context: { eligibleUnitIds: [ally.id] },
    },
    actionMode: null,
    selectedUnitId: hassan.id,
    setHassanAssassinOrderSelections: (update: string[] | ((previous: string[]) => string[])) => {
      selections = typeof update === "function" ? update(selections) : update;
    },
    setSelectedUnit: () => {
      inspected = true;
    },
    sendAction: () => undefined,
    sendGameAction: () => undefined,
  } as never);

  handler(3, 8);
  assert.deepEqual(selections, [], "non-highlighted enemy clicks should be ignored");
  assert.equal(inspected, false, "a pending board choice must not fall through to inspect");
  handler(3, 0);
  assert.deepEqual(selections, [ally.id]);
  assert.equal(inspected, false, "the highlighted target click must remain in the pending flow");
  handler(3, 0);
  assert.deepEqual(selections, [], "clicking a selected ally again should cancel that selection");
});

test("Hassan Assassin Order is automatic info and has a mobile-safe pending instruction", () => {
  setLanguage("en", { setItem: () => undefined });
  const hassan = makeUnit({
    id: "P1-assassin-hassan",
    heroId: "hassan",
    position: { col: 2, row: 0 },
  });
  const phantasm = makeAbility({
    id: HASSAN_ASSASSIN_ORDER_ID,
    name: "Assassin Order",
    kind: "phantasm",
    description: "At battle start, choose 2 allied heroes.",
    slot: "none",
  });
  assert.equal(shouldRenderManualAbilityButton(phantasm), false);

  const infoMarkup = renderToStaticMarkup(
    <PassiveImpulseInfo unit={hassan} abilities={[phantasm]} />,
  );
  assert.match(infoMarkup, /data-ability-info-id="hassanAssasinOrder"/);
  assert.match(infoMarkup, /Assassin Order/);
  assert.match(infoMarkup, /Phantasm/);
  assert.match(infoMarkup, /Triggers automatically/);
  assert.doesNotMatch(infoMarkup, /<button/);

  const taskMarkup = renderToStaticMarkup(
    <CurrentTaskPanel
      compact
      vm={{
        view: makeView(hassan),
        playerId: "P1",
        pendingRoll: {
          id: "hassan-assassin-order",
          player: "P1",
          kind: "hassanAssassinOrderSelection",
          context: { eligibleUnitIds: ["P1-rider", "P1-knight"] },
        },
        pendingQueueCount: 0,
        stakeSelections: [],
        stakeLimit: 0,
        hassanAssassinOrderSelections: [],
        isHassanAssassinOrderSelection: true,
        sendAction: () => undefined,
        setStakeSelections: () => undefined,
        setHassanAssassinOrderSelections: () => undefined,
      }}
    />,
  );
  assert.match(taskMarkup, /Assassin Order selection/);
  assert.match(taskMarkup, /Choose highlighted allies/);
  assert.match(taskMarkup, /Selected: 0\/2/);
  assert.doesNotMatch(taskMarkup, /Roll dice/);
});

test("Hassan, Loki, and Mongol Charge pending unit targets submit authenticated board choices", () => {
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
      pendingKind: "hassanTrueEnemyTargetChoice",
    },
    {
      flag: "isHassanTrueEnemyTargetChoice",
      ids: "hassanTrueEnemyTargetIds",
      choiceType: "mongolChargeAllyAttackTarget",
      pendingKind: "mongolChargeAllyAttackTarget",
    },
    {
      flag: "isLokiMindControlEnemyChoice",
      ids: "lokiMindControlEnemyIds",
      choiceType: "lokiMindControlEnemy",
      pendingKind: "lokiMindControlEnemyChoice",
    },
    {
      flag: "isLokiMindControlTargetChoice",
      ids: "lokiMindControlTargetIds",
      choiceType: "lokiMindControlTarget",
      pendingKind: "lokiMindControlTargetChoice",
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
      pendingRoll: {
        id: pendingRollId,
        kind: testCase.pendingKind,
        player: "P1",
        context: {},
      },
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

test("Mongol Charge compact task shows a board-target instruction", () => {
  const ally = makeUnit({ id: "P1-ally", position: { col: 3, row: 3 } });
  const markup = renderToStaticMarkup(
    <CurrentTaskPanel
      compact
      vm={{
        view: makeView(ally),
        playerId: "P1",
        pendingRoll: {
          id: "mongol-choice",
          player: "P1",
          kind: "mongolChargeAllyAttackTarget",
          context: {
            sourceUnitId: ally.id,
            legalTargetIds: ["P2-target"],
          },
        },
        pendingQueueCount: 0,
        stakeSelections: [],
        stakeLimit: 0,
        isHassanTrueEnemyTargetChoice: true,
        sendAction: () => undefined,
        setStakeSelections: () => undefined,
      }}
    />,
  );
  assert.match(markup, /Mongol Charge: choose ally attack target/);
  assert.match(markup, /Choose a target for the allied attack/);
  assert.doesNotMatch(markup, /No forced task/);
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
    turn: { actionUsed: true, moveUsed: false, attackUsed: false, stealthUsed: false },
    hasActedThisTurn: true,
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
    name: "Loki's Laugh",
    description: "Pick a trick",
    slot: "none",
    chargeRequired: 0,
    maxCharges: undefined,
    currentCharges: 15,
    chargeUnlimited: true,
    isAvailable: true,
    kind: "phantasm",
    useOptions: [
      {
        id: "againSomeNonsense",
        source: { type: "heroResource", resourceId: LOKI_LAUGHT_ID, amount: 3 },
        sourceName: "Laugh",
        currentCharges: 15,
        chargeRequired: 3,
        consumes: { action: true },
        isAvailable: true,
      },
      {
        id: "chicken",
        source: { type: "heroResource", resourceId: LOKI_LAUGHT_ID, amount: 5 },
        sourceName: "Laugh",
        currentCharges: 15,
        chargeRequired: 5,
        consumes: { action: true },
        isAvailable: true,
      },
      {
        id: "mindControl",
        source: { type: "heroResource", resourceId: LOKI_LAUGHT_ID, amount: 10 },
        sourceName: "Laugh",
        currentCharges: 15,
        chargeRequired: 10,
        consumes: { action: true },
        isAvailable: true,
      },
      {
        id: "spinTheDrum",
        source: { type: "heroResource", resourceId: LOKI_LAUGHT_ID, amount: 12 },
        sourceName: "Laugh",
        currentCharges: 15,
        chargeRequired: 12,
        consumes: { action: true },
        isAvailable: true,
      },
      {
        id: "greatLokiJoke",
        source: { type: "heroResource", resourceId: LOKI_LAUGHT_ID, amount: 15 },
        sourceName: "Laugh",
        currentCharges: 15,
        chargeRequired: 15,
        consumes: { action: true },
        isAvailable: true,
      },
    ],
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
  assert.match(markup, /Again Some Bullshit/);
  assert.match(markup, /Chicken/);
  assert.match(markup, /Mind Capture/);
  assert.match(markup, /Spin the Wheel/);
  assert.match(markup, /Amazing Loki Joke/);
  assert.match(markup, /Again Some Bullshit \(3\)/);
  assert.match(markup, /Chicken \(5\)/);
  assert.match(markup, /Mind Capture \(10\)/);
  assert.match(markup, /Spin the Wheel \(12\)/);
  assert.match(markup, /Amazing Loki Joke \(15\)/);
  const mindCaptureStart = markup.indexOf('data-loki-laught-option="mindControl"');
  const mindCaptureMarkup = markup.slice(
    mindCaptureStart,
    markup.indexOf("</div>", mindCaptureStart),
  );
  const mindCaptureButton = mindCaptureMarkup.match(/<button[^>]*>/)?.[0];
  assert.ok(mindCaptureButton, "Mind Capture button should render");
  assert.doesNotMatch(
    mindCaptureButton,
    /disabled/,
    "Mind Capture should stay enabled when the controlled enemy already spent its action",
  );
  assert.match(markup, /data-loki-laught-cost="3"/);
  assert.match(markup, /data-loki-laught-cost="5"/);
  assert.match(markup, /data-loki-laught-cost="10"/);
  assert.match(markup, /data-loki-laught-cost="12"/);
  assert.match(markup, /data-loki-laught-cost="15"/);
  assert.match(markup, />Loki&#x27;s Laugh</);
  assert.match(markup, /Phantasm · Active/);

  const lowChargeMarkup = renderToStaticMarkup(
    <BattleAbilityActions
      view={view}
      actionableAbilities={[
        {
          ...ability,
          currentCharges: 4,
          useOptions: ability.useOptions?.map((option) => ({
            ...option,
            currentCharges: 4,
            isAvailable: (option.chargeRequired ?? 0) <= 4,
            disabledReason: (option.chargeRequired ?? 0) <= 4 ? undefined : "Not enough Laugh",
          })),
        },
      ]}
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

  assert.match(lowChargeMarkup, /Not enough Laugh/);

  const tenLaughOptions = ability.useOptions?.map((option) => ({
    ...option,
    currentCharges: 10,
    isAvailable: (option.chargeRequired ?? 0) <= 10,
    disabledReason: (option.chargeRequired ?? 0) <= 10 ? undefined : "Not enough Laugh",
  }));
  const tenLaughMarkup = renderToStaticMarkup(
    <BattleAbilityActions
      view={{
        ...view,
        units: {
          ...view.units,
          [loki.id]: { ...loki, charges: { [LOKI_LAUGHT_ID]: 10 } },
        },
      }}
      actionableAbilities={[{ ...ability, currentCharges: 10, useOptions: tenLaughOptions }]}
      selectedUnit={{ ...loki, charges: { [LOKI_LAUGHT_ID]: 10 } }}
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
  for (const optionId of ["againSomeNonsense", "chicken", "mindControl"]) {
    const optionStart = tenLaughMarkup.indexOf(`data-loki-laught-option="${optionId}"`);
    const optionMarkup = tenLaughMarkup.slice(
      optionStart,
      tenLaughMarkup.indexOf("</div>", optionStart),
    );
    assert(optionStart >= 0, `${optionId} should render as a Loki action option`);
    assert.doesNotMatch(
      optionMarkup.match(/<button[^>]*>/)?.[0] ?? "",
      /disabled/,
      `${optionId} should be clickable with 10 Laugh`,
    );
  }
  for (const optionId of ["spinTheDrum", "greatLokiJoke"]) {
    const optionStart = tenLaughMarkup.indexOf(`data-loki-laught-option="${optionId}"`);
    const optionMarkup = tenLaughMarkup.slice(
      optionStart,
      tenLaughMarkup.indexOf("</div>", optionStart),
    );
    assert.match(
      optionMarkup.match(/<button[^>]*>/)?.[0] ?? "",
      /disabled/,
      `${optionId} should be disabled with 10 Laugh`,
    );
    assert.match(optionMarkup, /Not enough Laugh/);
  }
  assert.doesNotMatch(
    tenLaughMarkup,
    /data-ability-use-source=/,
    "Loki options must not fall through to the generic payment-source renderer",
  );

  const sent: GameAction[] = [];
  const naturalStealth = makeAbility({
    id: "lokiNaturalStealth",
    name: "Natural Stealth",
    description: "Stealth succeeds on 5-6.",
    kind: "passive",
    slot: "none",
    chargeRequired: undefined,
    maxCharges: undefined,
    currentCharges: undefined,
  });
  const vm = buildRightPanelViewModel(
    {
      ...makeRightPanelProps(
        { ...view, abilitiesByUnitId: { [loki.id]: [naturalStealth, ability] } },
        loki.id,
      ),
      onSendAction: (action) => sent.push(action),
    },
    translate,
  );
  vm.onUseLokiLaughtOption("chicken");
  assert.deepEqual(sent, [
    {
      type: "useAbility",
      unitId: loki.id,
      abilityId: LOKI_LAUGHT_ID,
      payload: { optionId: "chicken" },
    },
  ]);
  assert.equal(
    vm.actionableAbilities.some((item) => item.id === "lokiNaturalStealth"),
    false,
    "Natural Stealth should remain passive info, not a manual button",
  );
});

test("Action Menu core strip always renders Action, Move, and Stealth", () => {
  setLanguage("en", { setItem: () => undefined });
  const markup = renderToStaticMarkup(
    <CoreResourceStrip
      unit={null}
      economy={{ actionUsed: false, moveUsed: false, attackUsed: false, stealthUsed: false }}
    />,
  );

  assert.match(markup, /data-testid="core-resource-action"/);
  assert.match(markup, /data-testid="core-resource-move"/);
  assert.match(markup, /data-testid="core-resource-stealth"/);
  assert.match(markup, />Action</);
  assert.match(markup, />Move</);
  assert.match(markup, />Stealth</);
  assert.match(markup, /min-h-10/);
  assert.doesNotMatch(markup, /min-h-14/);
});

test("server reveal updates the Action Menu stealth chip and selected-unit badge", () => {
  setLanguage("en", { setItem: () => undefined });
  const hiddenHassan = makeUnit({
    heroId: "hassan",
    isStealthed: true,
    stealthTurnsLeft: 3,
    stealthDuration: {
      ownTurnStartsWhileHidden: 2,
      maxOwnTurnStartsHidden: 3,
      kind: "normal",
    },
  });
  const revealedHassan = {
    ...hiddenHassan,
    isStealthed: false,
    stealthTurnsLeft: 0,
    stealthDuration: undefined,
  };
  const hiddenMarkup = renderToStaticMarkup(
    <>
      <SelectedUnitHeader unit={hiddenHassan} heroName="Hassan" />
      <CoreResourceStrip unit={hiddenHassan} economy={hiddenHassan.turn} />
    </>,
  );
  const revealedMarkup = renderToStaticMarkup(
    <>
      <SelectedUnitHeader unit={revealedHassan} heroName="Hassan" />
      <CoreResourceStrip unit={revealedHassan} economy={revealedHassan.turn} />
    </>,
  );

  assert.match(hiddenMarkup, />Hidden</);
  assert.match(hiddenMarkup, /Turns hidden: 2\/3/);
  assert.match(hiddenMarkup, /4th own turn/);
  assert.match(revealedMarkup, />Revealed</);
  assert.doesNotMatch(revealedMarkup, />Hidden</);
  assert.doesNotMatch(revealedMarkup, /Turns hidden/);
});

test("private stealth counter is omitted when projection redacts its metadata", () => {
  setLanguage("en", { setItem: () => undefined });
  const trackedEnemy = makeUnit({
    id: "P2-loki-tracked",
    owner: "P2",
    heroId: "loki",
    class: "trickster",
    isStealthed: true,
    stealthTurnsLeft: 0,
    stealthDuration: undefined,
  });
  const markup = renderToStaticMarkup(<SelectedUnitHeader unit={trackedEnemy} heroName="Loki" />);
  assert.match(markup, />Hidden</);
  assert.doesNotMatch(markup, /Turns hidden/);
  assert.doesNotMatch(markup, /own turn/);
});

test("Action Menu renders a compact selected unit header", () => {
  setLanguage("en", { setItem: () => undefined });
  const kaiser = makeUnit({
    id: "P1-grand-kaiser-header",
    heroId: "grand-kaiser",
    class: "archer",
    hp: 5,
  });
  const markup = renderToStaticMarkup(<SelectedUnitHeader unit={kaiser} heroName="Grand Kaiser" />);

  assert.match(markup, /data-testid="compact-selected-unit-header"/);
  assert.match(markup, /Grand Kaiser/);
  assert.match(markup, new RegExp(`HP 5\/${getMaxHp("archer", "grand-kaiser")}`));
  assert.match(markup, /Archer/);
  assert.match(markup, /h-10 w-10/);
  assert.doesNotMatch(markup, /h-12 w-12/);
});

test("special resource row stays hidden when a hero has no global resource", () => {
  const kaiser = makeUnit({
    id: "P1-grand-kaiser-no-special",
    heroId: "grand-kaiser",
    class: "archer",
    charges: { kaiserDora: 2, kaiserEngineeringMiracle: 3 },
  });
  const markup = renderToStaticMarkup(
    <SpecialHeroResourceStrip unit={kaiser} view={makeView(kaiser)} viewerRole="P1" />,
  );

  assert.equal(markup, "");
});

test("special resource strip renders the six required hero-wide resources", () => {
  setLanguage("en", { setItem: () => undefined });
  const cases = [
    ["chikatilo", "chikatiloDecoy", "Decoy Stealth", "Decoy Points", 14],
    ["duolingo", "duolingoSkipClasses", "Missed Lessons", "Missed Lessons", 3],
    ["mettaton", "mettatonRating", "Rating", "Rating", 7],
    ["zoro", "zoroDetermination", "Determination", "Determination", 2],
    ["luche", "lucheSunGlory", "Glory of the Sun", "Glory of the Sun", 2],
    ["kaneki", "kanekiRcCells", "RC Cells", "RC Cells", 5],
  ] as const;

  for (const [heroId, resourceId, name, expectedLabel, value] of cases) {
    const unit = makeUnit({
      id: `P1-${heroId}`,
      heroId,
      charges: heroId === "mettaton" ? {} : { [resourceId]: value },
      mettatonRating: heroId === "mettaton" ? value : undefined,
    });
    const resourceAbility = makeAbility({
      id: resourceId,
      name,
      kind: "passive",
      slot: "none",
      isSpecialCounter: true,
      currentCharges: value,
      chargeUnlimited: true,
    });
    const view = { ...makeView(unit), abilitiesByUnitId: { [unit.id]: [resourceAbility] } };
    const resources = getSpecialHeroResourceViews(unit, view, "P1");
    assert.deepEqual(
      resources.map((resource) => resource.id),
      [resourceId],
    );

    const markup = renderToStaticMarkup(
      <SpecialHeroResourceStrip unit={unit} view={view} viewerRole="P1" />,
    );
    assert.match(markup, new RegExp(`data-special-resource-id="${resourceId}"`));
    assert.match(markup, new RegExp(expectedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    if (resourceId === "chikatiloDecoy") {
      assert.doesNotMatch(markup, /14\/\d+/);
    }
  }
});

test("Chikatilo Decoy is both an uncapped resource and a manual stealth action", () => {
  const decoy = makeAbility({
    id: "chikatiloDecoy",
    name: "Decoy Stealth",
    kind: "active",
    slot: "stealth",
    isSpecialCounter: true,
    chargeUnlimited: true,
    chargeRequired: 3,
    currentCharges: 8,
  });
  assert.equal(shouldRenderManualAbilityButton(decoy), true);
  assert.equal(
    getOrdinaryAbilityCounterView(
      decoy,
      makeUnit({
        heroId: "chikatilo",
        charges: { chikatiloDecoy: 8 },
      }),
    ),
    null,
  );
});

test("ordinary Oni Giri, Light Ray, and Engineering Miracle counters never enter special resources", () => {
  const cases = [
    {
      heroId: "zoro",
      specialId: "zoroDetermination",
      counterId: "zoroOniGiri",
      specialName: "Determination",
    },
    {
      heroId: "luche",
      specialId: "lucheSunGlory",
      counterId: "lucheDivineRay",
      specialName: "Glory of the Sun",
    },
    {
      heroId: "grand-kaiser",
      specialId: null,
      counterId: "kaiserEngineeringMiracle",
      specialName: "",
    },
  ] as const;

  for (const item of cases) {
    const charges = {
      [item.counterId]: 2,
      ...(item.specialId ? { [item.specialId]: 3 } : {}),
    };
    const unit = makeUnit({ id: `P1-${item.heroId}`, heroId: item.heroId, charges });
    const abilities = [
      ...(item.specialId
        ? [
            makeAbility({
              id: item.specialId,
              name: item.specialName,
              kind: "passive",
              slot: "none",
              isSpecialCounter: true,
              currentCharges: 3,
            }),
          ]
        : []),
      makeAbility({
        id: item.counterId,
        name: item.counterId,
        kind: "impulse",
        slot: "none",
        isSpecialCounter: false,
        currentCharges: 2,
      }),
    ];
    const view = { ...makeView(unit), abilitiesByUnitId: { [unit.id]: abilities } };
    const ids = getSpecialHeroResourceViews(unit, view, "P1").map((resource) => resource.id);
    assert.equal(ids.includes(item.counterId), false, `${item.counterId} is an ability counter`);
    assert.deepEqual(ids, item.specialId ? [item.specialId] : []);
  }
});

test("Light Ray counter renders inside its paid ability card", () => {
  setLanguage("en", { setItem: () => undefined });
  const luche = makeUnit({
    id: "P1-luche-counter",
    heroId: "luche",
    class: "spearman",
    charges: { lucheDivineRay: 2, lucheSunGlory: 2 },
  });
  const lightRay = makeAbility({
    id: LUCHE_DIVINE_RAY_ID,
    name: "Light Ray",
    kind: "impulse",
    slot: "action",
    currentCharges: 2,
    useOptions: [
      {
        id: "heroResource",
        source: { type: "heroResource", resourceId: "lucheSunGlory", amount: 2 },
        sourceName: "Sun",
        currentCharges: 2,
        chargeRequired: 2,
        consumes: { action: true },
        isAvailable: true,
      },
    ],
  });
  const markup = renderToStaticMarkup(
    <BattleAbilityActions
      view={makeView(luche)}
      actionableAbilities={[lightRay]}
      selectedUnit={luche}
      canAct
      economy={luche.turn}
      actionMode={null}
      targetingActive={false}
      onUseAbility={() => undefined}
      onUseLokiLaughtOption={() => undefined}
      onToggleMode={() => undefined}
      onModePreview={() => undefined}
      onHoverAbility={() => undefined}
    />,
  );

  assert.match(markup, /data-ability-card-id="lucheDivineRay"/);
  assert.match(markup, /data-testid="ability-counter-lucheDivineRay"/);
  assert.match(markup, /Counter 2\/2/);
  assert.match(markup, /data-testid="light-ray-mode-picker"/);
  assert.match(markup, /data-light-ray-mode="line"/);
  assert.match(markup, /data-light-ray-mode="aroundSelf"/);
  assert.match(markup, /Line/);
  assert.match(markup, /Around Self/);
  assert.match(markup, /Spend Sun.*Action.*Sun 2/);
});

test("Light Ray line and around-self board flows submit explicit authoritative modes", () => {
  const luche = makeUnit({
    id: "P1-luche-modes",
    heroId: "luche",
    class: "spearman",
    position: { col: 4, row: 4 },
  });
  const view = makeView(luche);
  view.abilitiesByUnitId[luche.id] = [
    makeAbility({
      id: LUCHE_DIVINE_RAY_ID,
      targeting: {
        cells: [{ col: 8, row: 4 }],
        modes: {
          line: { cells: [{ col: 8, row: 4 }] },
          aroundSelf: { cells: [{ col: 5, row: 4 }] },
        },
      },
    }),
  ];
  const sent: unknown[] = [];
  const common = {
    view,
    playerId: "P1",
    joined: true,
    isSpectator: false,
    hasBlockingRoll: false,
    boardSelectionPending: false,
    selectedUnitId: luche.id,
    sendGameAction: (action: unknown) => sent.push(action),
    setActionMode: () => undefined,
    sendAction: () => undefined,
  };
  createCellClickHandler({
    ...common,
    actionMode: "lucheLightRay",
    targetingMode: {
      sourceUnitId: luche.id,
      abilityId: LUCHE_DIVINE_RAY_ID,
      step: "lucheLightRay",
      useSource: { type: "heroResource", resourceId: "lucheSunGlory", amount: 2 },
    },
  } as never)(8, 4);
  createCellClickHandler({
    ...common,
    actionMode: "lucheLightRayAround",
    targetingMode: {
      sourceUnitId: luche.id,
      abilityId: LUCHE_DIVINE_RAY_ID,
      step: "lucheLightRayAround",
      useSource: { type: "heroResource", resourceId: "lucheSunGlory", amount: 2 },
    },
  } as never)(5, 4);
  assert.deepEqual(sent, [
    {
      type: "useAbility",
      unitId: luche.id,
      abilityId: LUCHE_DIVINE_RAY_ID,
      payload: {
        target: { col: 8, row: 4 },
        source: { type: "heroResource", resourceId: "lucheSunGlory", amount: 2 },
        mode: "line",
      },
    },
    {
      type: "useAbility",
      unitId: luche.id,
      abilityId: LUCHE_DIVINE_RAY_ID,
      payload: {
        target: { col: 5, row: 4 },
        source: { type: "heroResource", resourceId: "lucheSunGlory", amount: 2 },
        mode: "aroundSelf",
      },
    },
  ]);
});

test("Engineering Miracle counter renders only in its impulse info card", () => {
  setLanguage("en", { setItem: () => undefined });
  const kaiser = makeUnit({
    id: "P1-grand-kaiser",
    heroId: "grand-kaiser",
    class: "archer",
    charges: { kaiserEngineeringMiracle: 3 },
  });
  const engineering = makeAbility({
    id: "kaiserEngineeringMiracle",
    name: "Engineering Miracle",
    kind: "impulse",
    slot: "none",
    chargeUnlimited: true,
    currentCharges: 3,
    isSpecialCounter: false,
  });
  const markup = renderToStaticMarkup(
    <PassiveImpulseInfo unit={kaiser} abilities={[engineering]} />,
  );

  assert.match(markup, /data-ability-info-id="kaiserEngineeringMiracle"/);
  assert.match(markup, /data-testid="ability-counter-kaiserEngineeringMiracle"/);
  assert.match(markup, /Counter 3\/4/);
  assert.doesNotMatch(markup, /<button/);
  assert.match(markup, /^<details/);
  assert.doesNotMatch(markup, /^<details[^>]*\sopen(?:=|\s|>)/);
});

test("Dora disabled state is one compact row without a nested duplicate button", () => {
  setLanguage("en", { setItem: () => undefined });
  const kaiser = makeUnit({
    id: "P1-grand-kaiser-dora",
    heroId: "grand-kaiser",
    class: "archer",
    charges: { kaiserDora: 0, kaiserEngineeringMiracle: 0 },
  });
  const dora = makeAbility({
    id: "kaiserDora",
    name: "Dora",
    kind: "active",
    slot: "action",
    currentCharges: 0,
    chargeRequired: 2,
    maxCharges: 2,
    isAvailable: false,
    disabledReason: "Not Enough charges",
  });
  const markup = renderToStaticMarkup(
    <BattleAbilityActions
      view={makeView(kaiser)}
      actionableAbilities={[dora]}
      selectedUnit={kaiser}
      canAct
      economy={kaiser.turn}
      actionMode={null}
      targetingActive={false}
      onUseAbility={() => undefined}
      onUseLokiLaughtOption={() => undefined}
      onToggleMode={() => undefined}
      onModePreview={() => undefined}
      onHoverAbility={() => undefined}
    />,
  );

  assert.match(markup, /data-compact-ability-row="kaiserDora"/);
  assert.match(markup, /data-ability-action-id="kaiserDora"[^>]*disabled/);
  assert.equal(markup.match(/<button/g)?.length, 1);
  assert.doesNotMatch(markup, /class="[^"]*ability-card/);
  assert.match(markup, /Action \+ 2 charges/);
  assert.match(markup, /Counter 0\/2/);
  assert.match(markup, /Not enough charges/i);
  assert.match(markup, /<details data-ability-details="kaiserDora"/);
  assert.doesNotMatch(markup, /<details data-ability-details="kaiserDora"[^>]*\sopen/);
});

test("private enemy hero resources are suppressed while public Rating remains visible", () => {
  const zoro = makeUnit({
    id: "P2-zoro-private",
    owner: "P2",
    heroId: "zoro",
    charges: { zoroDetermination: 5 },
  });
  assert.deepEqual(getSpecialHeroResourceViews(zoro, makeView(zoro), "P1"), []);

  const mettaton = makeUnit({
    id: "P2-mettaton-public",
    owner: "P2",
    heroId: "mettaton",
    mettatonRating: 9,
  });
  assert.deepEqual(
    getSpecialHeroResourceViews(mettaton, makeView(mettaton), "P1").map((resource) => [
      resource.id,
      resource.value,
    ]),
    [["mettatonRating", 9]],
  );
});

test("hero audit does not infer special resources from ordinary counters", () => {
  const auditedHeroIds = [
    "grand-kaiser",
    "papyrus",
    "sans",
    "artemida",
    "donKihote",
    "jackRipper",
    "vladTepes",
    "lechy",
    "guts",
    "hassan",
    "riverPerson",
    "asgore",
    "odin",
    "kaladin",
    "genghisKhan",
    "elCidCompeador",
    "jebe",
    "griffith",
    "femto",
  ];
  for (const heroId of auditedHeroIds) {
    const counterId = `${heroId}OrdinaryCounter`;
    const unit = makeUnit({ id: `P1-audit-${heroId}`, heroId, charges: { [counterId]: 4 } });
    const counter = makeAbility({
      id: counterId,
      name: "Ordinary counter",
      kind: "impulse",
      slot: "none",
      currentCharges: 4,
      maxCharges: 4,
      isSpecialCounter: false,
    });
    const view = { ...makeView(unit), abilitiesByUnitId: { [unit.id]: [counter] } };
    assert.deepEqual(getSpecialHeroResourceViews(unit, view, "P1"), [], heroId);
  }
});

test("rules-marked Frisk and Loki currencies remain special resources", () => {
  const cases = [
    ["frisk", "friskPacifism", "Pacifism"],
    ["frisk", "friskGenocide", "Genocide"],
    ["loki", "lokiLaught", "Loki's Laughter"],
  ] as const;
  for (const [heroId, resourceId, name] of cases) {
    const unit = makeUnit({ id: `P1-${resourceId}`, heroId, charges: { [resourceId]: 6 } });
    const resource = makeAbility({
      id: resourceId,
      name,
      kind: "phantasm",
      slot: "none",
      currentCharges: 6,
      isSpecialCounter: true,
      chargeUnlimited: true,
    });
    const view = { ...makeView(unit), abilitiesByUnitId: { [unit.id]: [resource] } };
    assert.deepEqual(
      getSpecialHeroResourceViews(unit, view, "P1").map((item) => item.id),
      [resourceId],
    );
  }
});

test("disabled primary actions show readable reasons", () => {
  setLanguage("en", { setItem: () => undefined });
  const markup = renderToStaticMarkup(
    <BattleActionButtons
      actionMode={null}
      targetingActive={false}
      moveDisabled
      attackDisabled
      searchMoveDisabled
      searchActionDisabled
      stealthDisabled
      attackDisabledReason="No legal target"
      onMoveClick={() => undefined}
      onAttackClick={() => undefined}
      onSearchMoveClick={() => undefined}
      onSearchActionClick={() => undefined}
      onStealthClick={() => undefined}
      onModePreview={() => undefined}
    />,
  );
  assert.match(markup, /Movement already spent/);
  assert.match(markup, /No legal target/);
  assert.match(markup, /Condition not met/);
});
