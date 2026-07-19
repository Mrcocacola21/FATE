import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTargetingModeForActionMode,
  shouldClearActionModeAfterConfirmedResult,
  shouldResetLocalBoardUiForSnapshot,
  transitionActionMode,
  transitionMoveOptions,
} from "./game/selectionState";
import { isActionableAbility } from "./game/components/RightPanel/rightPanelHelpers";
import { useGameShellBoardUi } from "./game/gameshell-content/hooks/useGameShellBoardUi";

test("switching from Move to Tisona clears stale move selection", () => {
  const next = transitionActionMode(
    {
      actionMode: "move",
      moveOptions: {
        unitId: "P1-el-cid",
        legalTo: [{ col: 1, row: 1 }],
        mode: "normal",
      },
    },
    "tisona"
  );

  assert.equal(next.actionMode, "tisona");
  assert.equal(next.moveOptions, null);
});

test("leaving Move mode without using movement does not spend movement locally", () => {
  const next = transitionActionMode(
    {
      actionMode: "move",
      moveOptions: {
        unitId: "P1-el-cid",
        legalTo: [{ col: 1, row: 1 }],
        mode: "normal",
      },
    },
    null
  );

  assert.deepStrictEqual(next, {
    actionMode: null,
    moveOptions: null,
  });
});

test("entering an ability action mode creates local targeting mode without spending", () => {
  const targetingMode = buildTargetingModeForActionMode("gutsCannon", "P1-guts");

  assert.deepStrictEqual(targetingMode, {
    sourceUnitId: "P1-guts",
    abilityId: "gutsCannon",
    step: "gutsCannon",
    resourcePreview: { action: true },
  });
});

test("canceling action mode clears local targeting mode", () => {
  const next = transitionActionMode(
    {
      selectedUnitId: "P1-guts",
      actionMode: "gutsCannon",
      targetingMode: {
        sourceUnitId: "P1-guts",
        abilityId: "gutsCannon",
        step: "gutsCannon",
        resourcePreview: { action: true },
      },
      moveOptions: null,
    },
    null
  );

  assert.deepStrictEqual(next, {
    actionMode: null,
    targetingMode: null,
    moveOptions: null,
  });
});

test("Impulse abilities are display-only and not optional action buttons", () => {
  assert.equal(
    isActionableAbility({
      id: "odinSleipnir",
      name: "Sleipnir",
      kind: "impulse",
      description: "",
      slot: "none",
      isAvailable: true,
    }),
    false
  );
});

test("Automatic transformation abilities are not manual action buttons", () => {
  for (const id of ["griffithFemtoRebirth", "mettatonEx", "mettatonNeo"]) {
    assert.equal(
      isActionableAbility({
        id,
        name: id,
        kind: "phantasm",
        description: "",
        slot: "action",
        isAvailable: true,
      }),
      false
    );
  }
});

test("basic attack targeting routes board unit clicks to the target handler", () => {
  const boardUi = useGameShellBoardUi({
    joined: true,
    isSpectator: false,
    view: { phase: "battle" },
    actionMode: "attack",
    boardSelectionPending: false,
    selectedUnit: { heroId: "frisk" },
  });

  assert.equal(boardUi.allowUnitPick, false);
});

test("stale action results do not clear newly entered targeting mode", () => {
  assert.equal(
    shouldClearActionModeAfterConfirmedResult({
      actionMode: "attack",
      lastActionResult: { ok: true },
      lastActionResultAt: 100,
      actionModeStartedAt: 200,
    }),
    false
  );

  assert.equal(
    shouldClearActionModeAfterConfirmedResult({
      actionMode: "attack",
      lastActionResult: { ok: true },
      lastActionResultAt: 300,
      actionModeStartedAt: 200,
    }),
    true
  );

  assert.equal(
    shouldClearActionModeAfterConfirmedResult({
      actionMode: "attack",
      lastActionResult: { ok: false, error: "Target is not legal." },
      lastActionResultAt: 300,
      actionModeStartedAt: 200,
    }),
    true
  );
});

test("authoritative pendingMove snapshots preserve local destination selection", () => {
  assert.equal(
    shouldResetLocalBoardUiForSnapshot({
      lifecycleChanged: false,
      selectionLost: false,
      view: {
        pendingRoll: null,
        pendingMove: {
          unitId: "P1-trickster-1",
          legalTo: [{ col: 5, row: 4 }],
        },
        pendingAoEPreview: null,
      },
    }),
    false
  );
  assert.equal(
    shouldResetLocalBoardUiForSnapshot({
      lifecycleChanged: false,
      selectionLost: false,
      view: {
        pendingRoll: { id: "movement-roll" },
        pendingMove: null,
        pendingAoEPreview: null,
      },
    }),
    true
  );
});

test("movement options returned after a roll restore local move intent", () => {
  const unitId = "P1-undyne";
  const next = transitionMoveOptions(
    {
      selectedUnitId: unitId,
      actionMode: null,
      targetingMode: null,
      moveOptions: null,
    },
    {
      unitId,
      roll: 4,
      legalTo: [{ col: 4, row: 5 }],
      mode: "normal",
    }
  );

  assert.equal(next.actionMode, "move");
  assert.deepStrictEqual(next.targetingMode, {
    sourceUnitId: unitId,
    abilityId: "move",
    step: "move",
    resourcePreview: { move: true },
  });
});

test("movement mode choices do not masquerade as destination options", () => {
  const unitId = "P1-guts";
  const next = transitionMoveOptions(
    {
      selectedUnitId: unitId,
      actionMode: "move",
      targetingMode: buildTargetingModeForActionMode("move", unitId),
      moveOptions: null,
    },
    {
      unitId,
      legalTo: [],
      modes: ["normal", "knight"],
    }
  );

  assert.deepStrictEqual(next, {
    moveOptions: {
      unitId,
      legalTo: [],
      modes: ["normal", "knight"],
    },
  });
});
