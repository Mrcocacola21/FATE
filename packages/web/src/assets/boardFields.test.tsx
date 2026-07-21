import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createEmptyGame, makePlayerView, type GameState, type PlayerView } from "rules";
import { Board } from "../components/Board";
import { ActiveFieldInfo } from "../game/components/ActiveFieldInfo";
import { GameTopBar } from "../game/components/GameTopBar";
import { setLanguage } from "../i18n";
import { getActiveBoardFieldVisual, getBoardFieldAsset, type BoardFieldVisualId } from "./registry";

function fieldView(overrides: Partial<GameState> = {}): PlayerView {
  return makePlayerView({ ...createEmptyGame(), ...overrides }, "P1");
}

function renderBoard(view: PlayerView): string {
  return renderToStaticMarkup(
    <Board
      view={view}
      playerId="P1"
      selectedUnitId={null}
      highlightedCells={{}}
      showCoordinates={false}
      onSelectUnit={() => undefined}
      onCellClick={() => undefined}
    />,
  );
}

test("field asset registry resolves the discovered Storm and Bone Field images", () => {
  assert.match(getBoardFieldAsset("lechy_storm"), /fields\/storm\.jpg$/);
  assert.match(getBoardFieldAsset("sans_bone_field"), /fields\/bone\.jpg$/);
});

test("active field detection follows public arena state and ignores expired fields", () => {
  const cases: Array<[Partial<GameState>, BoardFieldVisualId | null]> = [
    [{ arenaId: null }, null],
    [{ arenaId: "storm", arenaEffects: [] }, "lechy_storm"],
    [
      {
        arenaId: "storm",
        arenaEffects: [
          {
            id: "storm",
            effectId: "storm",
            remaining: 2,
            durationUnit: "turn",
            startedTurnNumber: 1,
          },
        ],
      },
      "lechy_storm",
    ],
    [
      {
        arenaId: null,
        arenaEffects: [],
      },
      null,
    ],
    [{ arenaId: "boneField", boneFieldTurnsLeft: 3 }, "sans_bone_field"],
    [{ arenaId: "boneField", boneFieldTurnsLeft: 0 }, null],
  ];

  for (const [state, expected] of cases) {
    assert.equal(getActiveBoardFieldVisual(fieldView(state)), expected);
  }
});

test("normal board omits the field layer while keeping its cell buttons", () => {
  const markup = renderBoard(fieldView());
  assert.doesNotMatch(markup, /data-board-field=/);
  assert.equal((markup.match(/<button/g) ?? []).length, 81);
});

test("Storm renders below intact board cells using its registered background", () => {
  const markup = renderBoard(fieldView({ arenaId: "storm", arenaEffects: [] }));
  assert.match(markup, /data-board-field="lechy_storm"/);
  assert.match(markup, /board-field-surface--lechy_storm/);
  assert.ok(markup.includes(getBoardFieldAsset("lechy_storm")));
  assert.match(markup, /board-field-dim/);
  assert.match(markup, /board-has-field/);
  assert.equal((markup.match(/<button/g) ?? []).length, 81);
  assert.ok(markup.indexOf('data-board-field="lechy_storm"') < markup.indexOf("<button"));
});

test("Bone Field renders below intact board cells and preserves its cell status layer", () => {
  const markup = renderBoard(fieldView({ arenaId: "boneField", boneFieldTurnsLeft: 3 }));
  assert.match(markup, /data-board-field="sans_bone_field"/);
  assert.match(markup, /board-field-surface--sans_bone_field/);
  assert.ok(markup.includes(getBoardFieldAsset("sans_bone_field")));
  assert.match(markup, /bone-field-cell/);
  assert.equal((markup.match(/<button/g) ?? []).length, 81);
});

test("active field rules render localized labels and the implemented rules text", () => {
  setLanguage("en", null);
  const stormMarkup = renderToStaticMarkup(
    <ActiveFieldInfo view={fieldView({ arenaId: "storm", arenaEffects: [] })} />,
  );
  assert.match(stormMarkup, /data-active-field-info="lechy_storm"/);
  assert.match(stormMarkup, /Active field/);
  assert.match(stormMarkup, /Non-exempt ranged units/);

  const boneMarkup = renderToStaticMarkup(
    <ActiveFieldInfo view={fieldView({ arenaId: "boneField", boneFieldTurnsLeft: 3 })} />,
  );
  assert.match(boneMarkup, /data-active-field-info="sans_bone_field"/);
  assert.match(boneMarkup, /Bone Field/);
  assert.match(boneMarkup, /Blue Bone deals 1 damage/);
  assert.match(boneMarkup, /Orange Bone deals 1 damage/);
});

test("the match status badge uses localized active field labels", () => {
  const view = fieldView({ arenaId: "boneField", boneFieldTurnsLeft: 3 });
  const vm = {
    view,
    pendingMeta: null,
    roomMeta: null,
    connectionStatus: "connected",
    role: "player1",
    roomId: "field-test",
    playerId: "P1",
    leavingRoom: false,
    handleLeave: () => undefined,
  };

  setLanguage("en", null);
  const englishMarkup = renderToStaticMarkup(<GameTopBar vm={vm} />);
  assert.match(englishMarkup, /Active field/);
  assert.match(englishMarkup, /Bone Field/);

  setLanguage("uk", null);
  const ukrainianMarkup = renderToStaticMarkup(<GameTopBar vm={vm} />);
  assert.match(ukrainianMarkup, /Активне поле/);
  assert.match(ukrainianMarkup, /Поле кісток/);
  setLanguage("en", null);
});
