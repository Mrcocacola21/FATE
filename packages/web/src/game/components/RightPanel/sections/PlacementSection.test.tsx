import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameAction, UnitState } from "rules";
import { getPlacementUnitLabel } from "../../../../i18n/displayMetadata";
import { setLanguage, translate } from "../../../../i18n";
import { handlePlacementCellClick } from "../../../gameshell-content/cellHandlers";
import { PlacementSection, PlacementUnitRow } from "./PlacementSection";

function makeUnit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: "P1-rider-1",
    owner: "P1",
    class: "rider",
    hp: 6,
    attack: 2,
    position: null,
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

test("placement labels localize base, hero, transformed, and safe token figures", () => {
  const base = makeUnit();
  const hero = makeUnit({
    id: "P1-assassin-4",
    class: "assassin",
    figureId: "frisk",
    heroId: "frisk",
  });
  const transformed = makeUnit({
    id: "P1-knight-7",
    class: "knight",
    figureId: "femto",
    heroId: "femto",
    transformed: true,
  });
  const token = makeUnit({
    id: "P1-assassin-4-false-trail",
    class: "assassin",
    figureId: "falseTrailToken",
    heroId: "falseTrailToken",
  });
  const unknownProjectedFigure = makeUnit({
    figureId: "private-service-figure",
    heroId: "private-service-figure",
  });

  setLanguage("en", { setItem: () => undefined });
  assert.equal(getPlacementUnitLabel(base, { language: "en", t: translate }), "Base Rider (Rider)");
  assert.equal(getPlacementUnitLabel(hero, { language: "en", t: translate }), "Frisk (Assassin)");
  assert.equal(getPlacementUnitLabel(transformed, { language: "en", t: translate }), "Femto (Knight)");
  assert.equal(
    getPlacementUnitLabel(token, { language: "en", t: translate }),
    "False Trail token (Assassin)",
  );
  assert.equal(
    getPlacementUnitLabel(unknownProjectedFigure, { language: "en", t: translate }),
    "Base Rider (Rider)",
  );

  setLanguage("uk", { setItem: () => undefined });
  assert.equal(
    getPlacementUnitLabel(base, { language: "uk", t: translate }),
    "Базовий вершник (Вершник)",
  );
  assert.equal(
    getPlacementUnitLabel(hero, { language: "uk", t: translate }),
    "Фріск (Убивця)",
  );
  setLanguage("en", { setItem: () => undefined });
});

test("placement panel renders readable labels without service ids and keeps selection highlighted", () => {
  setLanguage("en", { setItem: () => undefined });
  const base = makeUnit();
  const hero = makeUnit({
    id: "P1-assassin-4",
    class: "assassin",
    figureId: "frisk",
    heroId: "frisk",
  });

  const markup = renderToStaticMarkup(
    <PlacementSection
      unplacedUnits={[base, hero]}
      friendlyUnits={[base, hero]}
      placeUnitId={hero.id}
      actionMode="place"
      placementEnabled
      joined
      pendingRoll={false}
      isSpectator={false}
      isMyTurn
      onSetPlaceUnit={() => undefined}
      onSetActionMode={() => undefined}
    />,
  );

  assert.match(markup, /Base Rider \(Rider\)/);
  assert.match(markup, /Frisk \(Assassin\)/);
  assert.doesNotMatch(markup, /P1-rider-1|P1-assassin-4/);
  assert.match(markup, /aria-pressed="true"/);
});

test("clicking a placement row selects its internal unit id", () => {
  const unit = makeUnit({ id: "P1-spearman-2", class: "spearman" });
  let selectedUnitId: string | null = null;
  const row = PlacementUnitRow({
    unit,
    label: "Base Spearman (Spearman)",
    selected: false,
    disabled: false,
    onSelect: (unitId) => {
      selectedUnitId = unitId;
    },
  });

  assert(isValidElement(row));
  (row.props as { onClick: () => void }).onClick();
  assert.equal(selectedUnitId, "P1-spearman-2");
});

test("placing the selected figure sends the unchanged internal unit id", () => {
  const sent: GameAction[] = [];
  const actionModes: Array<string | null> = [];
  const placementSelections: Array<string | null> = [];

  const handled = handlePlacementCellClick(
    {
      actionMode: "place",
      placeUnitId: "P1-spearman-2",
      legalPlacementCoords: [{ col: 2, row: 1 }],
      sendGameAction: (action) => sent.push(action),
      setActionMode: (mode) => actionModes.push(mode),
      setPlaceUnitId: (unitId) => placementSelections.push(unitId),
    },
    { col: 2, row: 1 },
  );

  assert.equal(handled, true);
  assert.deepEqual(sent, [
    {
      type: "placeUnit",
      unitId: "P1-spearman-2",
      position: { col: 2, row: 1 },
    },
  ]);
  assert.deepEqual(actionModes, [null]);
  assert.deepEqual(placementSelections, [null]);
});
