import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactElement } from "react";
import { createSafeClassDraftState } from "rules";
import { gameShellFixture, type GameShellFixture } from "../../testHelpers/gameShellFixture";
import { DraftScreen } from "../../../modes/DraftScreen";
import { ResponsiveMatchLayout } from "../../../layout/ResponsiveMatchLayout";
import { GameLoadingState } from "./GameLoadingState";
import { GameShellLayout } from "./GameShellLayout";

function screen(fields: GameShellFixture) {
  const layout = GameShellLayout({ vm: gameShellFixture(fields) });
  assert(isValidElement(layout));
  return (layout as ReactElement<{ children: ReactElement[] }>).props.children[0];
}

const draft = createSafeClassDraftState();
const lobby = {
  phase: "lobby" as const,
  pendingRoll: null,
  initiative: { P1: null, P2: null, winner: null },
};
const pending = { id: "initiative-p1", kind: "initiativeRoll" as const, player: "P1" as const };

test("completed draft stays on the draft screen until authoritative gameplay arrives", () => {
  const fields = {
    hasSnapshot: true,
    view: lobby,
    roomMeta: { gameMode: "draft" as const, draftState: draft, pendingRoll: null },
  };
  assert.equal(screen(fields).type, DraftScreen);
  const complete = { ...fields, roomMeta: { ...fields.roomMeta, draftState: { ...draft, phase: "complete" as const } } };
  assert.equal(screen(complete).type, DraftScreen);
  assert.equal(screen({ ...complete, roomMeta: { ...complete.roomMeta, pendingRoll: pending } }).type, ResponsiveMatchLayout);
  assert.equal(screen({ ...complete, view: { ...lobby, phase: "placement" } }).type, ResponsiveMatchLayout);
});

test("public initiative snapshot opens gameplay for both seats even if draft metadata is delayed or cleared", () => {
  for (const seat of ["P1", "P2"] as const) {
    for (const draftState of [draft, null]) {
      assert.equal(screen({
        seat,
        hasSnapshot: true,
        view: lobby,
        roomMeta: { gameMode: "draft", draftState, pendingRoll: pending },
      }).type, ResponsiveMatchLayout);
    }
  }
});

test("missing snapshot retains the room loading screen", () => {
  assert.equal(screen({ roomId: "same-room", hasSnapshot: false, view: null }).type, GameLoadingState);
});
