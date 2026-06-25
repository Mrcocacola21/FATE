import assert from "node:assert/strict";
import test from "node:test";
import { transitionActionMode } from "./game/selectionState";
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
