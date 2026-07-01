import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTargetingModeForActionMode,
  transitionActionMode,
} from "./game/selectionState";
import { isActionableAbility } from "./game/components/RightPanel/rightPanelHelpers";

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
