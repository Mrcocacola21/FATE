import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  makePlayerView,
  makeSpectatorView,
  type GameState,
  type PlayerId,
} from "rules";
import { setLanguage } from "../../../i18n";
import {
  BattleEndScreen,
  getBattleEndOverlayState,
  getBattleEndPerspective,
} from "./BattleEndScreen";

function endedState(): GameState {
  let state = attachArmy(createEmptyGame(), createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  return {
    ...state,
    phase: "ended",
    turnNumber: 9,
    gameOver: {
      winnerPlayerId: "P1",
      loserPlayerId: "P2",
      reason: "allEnemyUnitsDefeated",
      endedAtRevision: 12,
      endedAtTurn: 9,
    },
    units: Object.fromEntries(
      Object.entries(state.units).map(([id, unit]) => [
        id,
        unit.owner === "P2" ? { ...unit, hp: 0, isAlive: false } : unit,
      ])
    ),
  };
}

function markupFor(role: PlayerId | "spectator") {
  const state = endedState();
  const view = role === "spectator" ? makeSpectatorView(state) : makePlayerView(state, role);
  return renderToStaticMarkup(
    <BattleEndScreen
      vm={{
        view,
        role,
        seat: role === "spectator" ? null : role,
        roomMeta: { playerNames: { P1: "Aster", P2: "Bram" } },
        leavingRoom: false,
        handleLeave: () => undefined,
      }}
    />
  );
}

test("battle end screen selects winner loser and spectator perspectives", () => {
  setLanguage("en", null);
  const result = endedState().gameOver!;
  assert.equal(getBattleEndPerspective(result, "P1"), "winner");
  assert.equal(getBattleEndPerspective(result, "P2"), "loser");
  assert.equal(getBattleEndPerspective(result, null), "spectator");
  assert.match(markupFor("P1"), />Victory</);
  assert.match(markupFor("P1"), />You won</);
  assert.match(markupFor("P2"), />Defeat</);
  assert.match(markupFor("P2"), />You lost</);
  assert.match(markupFor("spectator"), />Battle Ended</);
  assert.match(markupFor("spectator"), />Aster wins</);
});

test("battle end screen contains compact summary and supported actions", () => {
  setLanguage("en", null);
  const markup = markupFor("P1");
  assert.match(markup, /data-testid="battle-end-overlay"/);
  assert.match(markup, /All enemy units defeated/);
  assert.match(markup, /Survivors/);
  assert.match(markup, /Defeated/);
  assert.match(markup, /Turn 9/);
  assert.match(markup, /data-testid="battle-end-view-board"/);
  assert.match(markup, /data-testid="battle-end-leave"/);
  assert.match(markup, /max-h-dvh/);
  assert.match(markup, /overflow-y-auto/);
  assert.match(markup, /min-h-12/);
});

test("View Board dismisses results and Results reopens them", () => {
  assert.equal(getBattleEndOverlayState(true, "viewBoard"), false);
  assert.equal(getBattleEndOverlayState(false, "results"), true);
  assert.equal(getBattleEndOverlayState(false, "resultArrived"), true);
});
