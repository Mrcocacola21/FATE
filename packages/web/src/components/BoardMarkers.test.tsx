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
import { Board, getBoardLinePreviewCells } from "./Board";
import { BoneStatusPanel } from "../game/boneStatus";
import { setLanguage } from "../i18n";

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
    jackTraps: [
      {
        id: "jack-snare-P1-1",
        sourceUnitId: unit.id,
        owner: "P1",
        position: { col: 2, row: 3 },
        isRevealed: false,
        triggeredTargetIds: [],
      },
      {
        id: "jack-snare-P1-2",
        sourceUnitId: unit.id,
        owner: "P1",
        position: { col: 5, row: 6 },
        isRevealed: true,
        triggeredTargetIds: ["P2-target"],
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

test("line previews cover the selected row or column instead of the path to it", () => {
  assert.deepEqual(getBoardLinePreviewCells(4, { col: 2, row: 1 }, "row"), [
    { col: 0, row: 1 },
    { col: 1, row: 1 },
    { col: 2, row: 1 },
    { col: 3, row: 1 },
  ]);
  assert.deepEqual(getBoardLinePreviewCells(4, { col: 2, row: 1 }, "col"), [
    { col: 2, row: 0 },
    { col: 2, row: 1 },
    { col: 2, row: 2 },
    { col: 2, row: 3 },
  ]);
});

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

test("Jack snares use private gray and revealed red S badges without leaking hidden markers", () => {
  const ownerMarkup = renderBoard(makePlayerView(markerState(), "P1"), "P1");
  assert.match(ownerMarkup, /data-board-marker="jack_snare_hidden"/);
  assert.match(ownerMarkup, /data-snare-state="hidden"/);
  assert.match(ownerMarkup, /stake-state-badge--hidden/);
  assert.match(ownerMarkup, /data-board-marker="jack_snare_revealed"/);
  assert.match(ownerMarkup, /data-snare-state="revealed"/);
  assert.match(ownerMarkup, /stake-state-badge--revealed/);
  assert.match(ownerMarkup, /pointer-events-none/);
  assert.match(ownerMarkup, /absolute left-1 top-1 z-30/);
  assert.match(ownerMarkup, />S<\/div>/);
  assert.match(
    ownerMarkup,
    /stake-state-badge pointer-events-none absolute left-1 top-6 z-30/,
    "a co-located Vlad stake is offset below Jack's top-left snare badge",
  );

  const opponentMarkup = renderBoard(makePlayerView(markerState(), "P2"), "P2");
  assert.doesNotMatch(opponentMarkup, /data-board-marker="jack_snare_hidden"/);
  assert.doesNotMatch(opponentMarkup, /data-snare-state="hidden"/);
  assert.match(opponentMarkup, /data-board-marker="jack_snare_revealed"/);
  assert.match(opponentMarkup, /data-snare-state="revealed"/);
});

test("Blue and Orange Bone render directly on visible board tokens", () => {
  const base = markerState();
  const [first, second] = Object.values(base.units);
  assert.ok(first);
  assert.ok(second);
  const state: GameState = {
    ...base,
    units: {
      ...base.units,
      [first.id]: {
        ...first,
        position: { col: 1, row: 1 },
        papyrusBoneStatus: {
          sourceUnitId: "papyrus",
          kind: "blue",
          expiresOnSourceOwnTurn: 2,
        },
      },
      [second.id]: {
        ...second,
        position: { col: 2, row: 2 },
        sansBoneFieldStatus: { kind: "orange", turnNumber: base.turnNumber },
      },
    },
  };

  const markup = renderBoard(makePlayerView(state, "P1"), "P1");
  assert.match(markup, /data-bone-status="blue"/);
  assert.match(markup, /data-bone-source="papyrus"/);
  assert.match(markup, /data-bone-status="orange"/);
  assert.match(markup, /data-bone-source="sansBoneField"/);
});

test("Blind renders as a visible status badge on the affected board figure", () => {
  setLanguage("en", null);
  const base = markerState();
  const unit = Object.values(base.units)[0];
  assert.ok(unit);
  const state: GameState = {
    ...base,
    units: {
      ...base.units,
      [unit.id]: {
        ...unit,
        blindUntilOwnTurnStart: true,
        blindExpiresAfterOwnTurn: 1,
      },
    },
  };
  const markup = renderBoard(makePlayerView(state, "P1"), "P1");
  assert.match(markup, /data-blind-status="active"/);
  assert.match(markup, /aria-label="Blind: targeting limited to radius 1"/);
});

test("transformed Papyrus Orange Bone uses the orange token treatment", () => {
  const base = markerState();
  const target = Object.values(base.units)[0];
  assert.ok(target);
  const state: GameState = {
    ...base,
    units: {
      ...base.units,
      [target.id]: {
        ...target,
        position: { col: 3, row: 3 },
        papyrusBoneStatus: {
          sourceUnitId: "unbeliever-papyrus",
          kind: "orange",
          expiresOnSourceOwnTurn: 4,
        },
      },
    },
  };

  const markup = renderBoard(makePlayerView(state, "P1"), "P1");
  assert.match(markup, /data-bone-status="orange"/);
  assert.match(markup, /data-bone-source="papyrus"/);
  assert.match(markup, /unit-bone-status--orange/);
});

test("the current Sans field status wins if both bone status records coexist", () => {
  const base = markerState();
  const target = Object.values(base.units)[0];
  assert.ok(target);
  const state: GameState = {
    ...base,
    units: {
      ...base.units,
      [target.id]: {
        ...target,
        position: { col: 4, row: 4 },
        papyrusBoneStatus: {
          sourceUnitId: "papyrus",
          kind: "blue",
          expiresOnSourceOwnTurn: 3,
        },
        sansBoneFieldStatus: { kind: "orange", turnNumber: base.turnNumber },
      },
    },
  };

  const markup = renderBoard(makePlayerView(state, "P1"), "P1");
  assert.equal((markup.match(/data-bone-status=/g) ?? []).length, 1);
  assert.match(markup, /data-bone-status="orange"/);
});

test("bone status does not identify a stealthed enemy token", () => {
  const base = markerState();
  const target = Object.values(base.units)[0];
  assert.ok(target);
  const state: GameState = {
    ...base,
    units: {
      ...base.units,
      [target.id]: {
        ...target,
        position: { col: 4, row: 4 },
        isStealthed: true,
        papyrusBoneStatus: {
          sourceUnitId: "papyrus",
          kind: "blue",
          expiresOnSourceOwnTurn: 3,
        },
      },
    },
  };

  const markup = renderBoard(makePlayerView(state, "P2"), "P2");
  assert.doesNotMatch(markup, /data-bone-status=/);
});

test("Bone Field cells use a faint field pattern distinct from unit badges", () => {
  const base = markerState();
  const target = Object.values(base.units)[0];
  assert.ok(target);
  const state: GameState = {
    ...base,
    arenaId: "boneField",
    activeUnitId: target.id,
    units: {
      ...base.units,
      [target.id]: {
        ...target,
        position: { col: 4, row: 4 },
        sansBoneFieldStatus: { kind: "blue", turnNumber: base.turnNumber },
      },
    },
  };

  const markup = renderBoard(makePlayerView(state, "P1"), "P1");
  assert.match(markup, /class="bone-field-cell bone-field-cell--blue"/);
  assert.match(markup, /data-bone-field-tone="blue"/);
  assert.match(markup, /data-bone-status="blue"/);
});

test("the selected-unit bone panel shows explicit localized rules reminders", () => {
  setLanguage("en", null);
  const base = markerState();
  const target = Object.values(base.units)[0];
  assert.ok(target);
  const blueMarkup = renderToStaticMarkup(
    <BoneStatusPanel
      unit={{
        ...target,
        papyrusBoneStatus: {
          sourceUnitId: "papyrus",
          kind: "blue",
          expiresOnSourceOwnTurn: 2,
        },
      }}
    />,
  );
  assert.match(blueMarkup, /Blue Bone/);
  assert.match(blueMarkup, /spends its move action/);
  assert.match(blueMarkup, /Applied by Papyrus/);

  const orangeMarkup = renderToStaticMarkup(
    <BoneStatusPanel
      unit={{
        ...target,
        sansBoneFieldStatus: { kind: "orange", turnNumber: base.turnNumber },
      }}
    />,
  );
  assert.match(orangeMarkup, /Orange Bone/);
  assert.match(orangeMarkup, /first action this unit takes on its turn must be Movement/);
  assert.match(orangeMarkup, /Sans&#x27;s Bone Field/);

  setLanguage("uk", null);
  const ukrainianMarkup = renderToStaticMarkup(
    <BoneStatusPanel
      unit={{
        ...target,
        sansBoneFieldStatus: { kind: "blue", turnNumber: base.turnNumber },
      }}
    />,
  );
  assert.match(ukrainianMarkup, /Синя кістка/);
  assert.match(ukrainianMarkup, /витрачає дію переміщення/);
  assert.match(ukrainianMarkup, /Полем кісток Санса/);
  setLanguage("en", null);
});
