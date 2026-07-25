import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  makePlayerView,
  type GameState,
  type UnitState,
} from "rules";
import { setLanguage } from "../../../i18n";
import { BottomSheet } from "../../../ui";
import { PlayersRosterSection } from "./PlayersRosterSection";

function setUnit(state: GameState, unitId: string, patch: Partial<UnitState>): GameState {
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: { ...state.units[unitId], ...patch },
    },
  };
}

function fixture() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  const own = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "archer",
  )!;
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider",
  )!;
  const hiddenEnemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "assassin",
  )!;
  state = setUnit(state, own.id, { hp: 4, position: { col: 1, row: 1 } });
  state = setUnit(state, enemy.id, { hp: 3, position: { col: 7, row: 7 } });
  state = setUnit(state, hiddenEnemy.id, {
    hp: 2,
    position: { col: 6, row: 6 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = { ...state, phase: "battle" };
  return { state, own, enemy, hiddenEnemy };
}

function card(markup: string, unitId: string): string {
  const markerIndex = markup.indexOf(`data-unit-id="${unitId}"`);
  assert.notEqual(markerIndex, -1, `missing roster card for ${unitId}`);
  const start = markup.lastIndexOf("<button", markerIndex);
  const end = markup.indexOf("</button>", markerIndex);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return markup.slice(start, end + "</button>".length);
}

function renderPlayers(state: GameState): string {
  return renderToStaticMarkup(
    <PlayersRosterSection
      view={makePlayerView(state, "P1")}
      selectedUnitId={null}
      onSelectUnit={() => undefined}
    />,
  );
}

test("Players roster shows exact own HP and hides every enemy HP surface", () => {
  setLanguage("en", { setItem: () => undefined });
  const { state, own, enemy, hiddenEnemy } = fixture();
  const markup = renderPlayers(state);
  const ownCard = card(markup, own.id);
  const enemyCard = card(markup, enemy.id);

  assert.match(ownCard, /4\/5 HP/);
  assert.match(ownCard, /role="progressbar"/);
  assert.match(ownCard, /aria-label="[^"]*: 4\/5 HP"/);
  assert.match(ownCard, new RegExp(`data-testid="roster-hp-bar-${own.id}"`));

  assert.match(enemyCard, /HP hidden/);
  assert.match(enemyCard, /Alive/);
  assert.doesNotMatch(enemyCard, /3\/6/);
  assert.doesNotMatch(enemyCard, /50%/);
  assert.doesNotMatch(enemyCard, /role="progressbar"/);
  assert.doesNotMatch(enemyCard, /aria-value/);
  assert.doesNotMatch(enemyCard, /style="[^"]*width/);
  assert.doesNotMatch(enemyCard, /title="[^"]*(HP|3|6)/);
  assert.doesNotMatch(markup, new RegExp(`data-unit-id="${hiddenEnemy.id}"`));
});

test("enemy Players roster card stays HP-safe after damage and defeat", () => {
  setLanguage("en", { setItem: () => undefined });
  const { state, enemy } = fixture();
  const damaged = setUnit(state, enemy.id, { hp: 1 });
  const damagedCard = card(renderPlayers(damaged), enemy.id);

  assert.match(damagedCard, /HP hidden/);
  assert.doesNotMatch(damagedCard, /1\/6|17%|lost 2 HP/i);
  assert.doesNotMatch(damagedCard, /progressbar|aria-value|width:/);

  const defeated = setUnit(damaged, enemy.id, { hp: 0, isAlive: false });
  const defeatedCard = card(renderPlayers(defeated), enemy.id);
  assert.match(defeatedCard, /Defeated/);
  assert.match(defeatedCard, /HP hidden/);
  assert.doesNotMatch(defeatedCard, /0\/6|0%|progressbar|aria-value|width:/);
});

test("mobile Players bottom sheet uses the same HP-safe roster projection", () => {
  setLanguage("en", { setItem: () => undefined });
  const { state, enemy } = fixture();
  const markup = renderToStaticMarkup(
    <BottomSheet open title="Players" onClose={() => undefined}>
      <PlayersRosterSection
        view={makePlayerView(state, "P1")}
        selectedUnitId={enemy.id}
        onSelectUnit={() => undefined}
      />
    </BottomSheet>,
  );
  const enemyCard = card(markup, enemy.id);

  assert.match(markup, /data-testid="mobile-bottom-sheet"/);
  assert.match(enemyCard, /HP hidden/);
  assert.doesNotMatch(enemyCard, /3\/6|50%|progressbar|aria-value|width:/);
});
