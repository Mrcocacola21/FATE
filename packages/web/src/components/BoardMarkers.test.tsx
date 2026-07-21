import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  makePlayerView,
  type GameState,
  type PlayerId,
  type PlayerView,
} from "rules";
import { getBoardMarkerAsset } from "../assets/registry";
import { Board } from "./Board";

function markerState(): GameState {
  const state = attachArmy(createEmptyGame(), createDefaultArmy("P1"));
  const unit = Object.values(state.units)[0];
  assert.ok(unit);
  const forestMarker = { owner: "P1" as const, position: { col: 3, row: 4 } };
  return {
    ...state,
    units: {
      ...state.units,
      [unit.id]: { ...unit, position: { col: 5, row: 6 } },
    },
    forestMarkers: [forestMarker],
    forestMarker,
    stakeMarkers: [
      {
        id: "hidden-stake",
        owner: "P1",
        position: { col: 1, row: 2 },
        createdAt: 1,
        isRevealed: false,
      },
      {
        id: "revealed-stake",
        owner: "P1",
        position: { col: 5, row: 6 },
        createdAt: 2,
        isRevealed: true,
      },
    ],
  };
}

function renderBoard(view: PlayerView, playerId: PlayerId): string {
  return renderToStaticMarkup(
    <Board
      view={view}
      playerId={playerId}
      selectedUnitId={null}
      highlightedCells={{}}
      showCoordinates={false}
      onSelectUnit={() => undefined}
      onCellClick={() => undefined}
    />,
  );
}

test("forest markers use the centered forest asset in the decorative marker layer", () => {
  const markup = renderBoard(makePlayerView(markerState(), "P1"), "P1");

  assert.match(markup, /data-board-marker="lechy_forest"/);
  assert.ok(markup.includes(getBoardMarkerAsset("lechy_forest")));
  assert.match(
    markup,
    /board-marker-icon board-marker-icon--forest pointer-events-none absolute left-1\/2 top-1\/2/,
  );
});

test("owner-hidden stakes use muted private art and a gray overlay badge", () => {
  const markup = renderBoard(makePlayerView(markerState(), "P1"), "P1");

  assert.ok(markup.includes(getBoardMarkerAsset("vlad_stake")));
  assert.match(markup, /data-board-marker="vlad_stake_hidden"/);
  assert.match(markup, /board-marker-icon--stake-hidden/);
  assert.match(markup, /data-stake-state="hidden"/);
  assert.match(markup, /stake-state-badge--hidden/);
});

test("revealed stakes keep polished art and a red badge above an occupying token", () => {
  const markup = renderBoard(makePlayerView(markerState(), "P1"), "P1");
  const revealedCell = markup
    .split("</button>")
    .find((cellMarkup) => cellMarkup.includes('data-board-marker="vlad_stake"'));

  assert.ok(revealedCell, "revealed stake cell should render");
  assert.match(revealedCell, /data-board-marker="vlad_stake"/);
  assert.match(revealedCell, /board-marker-icon--stake-revealed/);
  assert.match(
    revealedCell,
    /board-marker-icon--stake[^>]*style="width:(\d+)px;height:\1px"/,
    "stake art should render in a square container",
  );
  assert.match(revealedCell, /rounded-xl border border-white\/60 shadow-xl/);
  assert.match(revealedCell, /data-stake-state="revealed"/);
  assert.match(revealedCell, /stake-state-badge--revealed/);
  assert.match(revealedCell, /z-30/);
  assert.ok(
    revealedCell.indexOf('data-board-marker="vlad_stake"') <
      revealedCell.indexOf("rounded-xl border border-white/60 shadow-xl"),
    "stake art should render behind the occupying token",
  );
  assert.ok(
    revealedCell.indexOf("rounded-xl border border-white/60 shadow-xl") <
      revealedCell.indexOf('data-stake-state="revealed"'),
    "revealed badge should render above the occupying token",
  );
});

test("an opponent receives and renders no unrevealed enemy stake data", () => {
  const opponentView = makePlayerView(markerState(), "P2");
  const markup = renderBoard(opponentView, "P2");

  assert.deepEqual(opponentView.stakeMarkers, [{ position: { col: 5, row: 6 }, isRevealed: true }]);
  assert.doesNotMatch(markup, /data-board-marker="vlad_stake_hidden"/);
  assert.doesNotMatch(markup, /data-stake-state="hidden"/);
  assert.doesNotMatch(markup, /stake-state-badge--hidden/);
  assert.equal((markup.match(/data-board-marker="vlad_stake"/g) ?? []).length, 1);
  assert.equal((markup.match(/data-stake-state="revealed"/g) ?? []).length, 1);
});

test("marker images cannot intercept board cell clicks", () => {
  const markup = renderBoard(makePlayerView(markerState(), "P1"), "P1");

  assert.match(markup, /<button[^>]*type="button"/);
  assert.match(
    markup,
    /class="board-marker-icon board-marker-icon--stake pointer-events-none absolute[^>]*board-marker-icon--stake-revealed[^>]*>[\s\S]*?<img[^>]*>/,
  );
});
