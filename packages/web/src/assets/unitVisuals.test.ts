import assert from "node:assert/strict";
import test from "node:test";
import { HERO_CATALOG as RULE_HERO_CATALOG, makeEmptyTurnEconomy } from "rules";
import type { UnitState } from "rules";
import { ASSETS, getUnitFigureAsset, getUnitTokenAsset, getUnitVisualVariant } from "./registry";

function makeUnit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: "unit-1",
    owner: "P1",
    class: "archer",
    heroId: "grand-kaiser",
    hp: 7,
    attack: 2,
    position: { col: 1, row: 1 },
    isStealthed: false,
    stealthTurnsLeft: 0,
    stealthAttemptedThisTurn: false,
    turn: makeEmptyTurnEconomy(),
    charges: {},
    cooldowns: {},
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    isAlive: true,
    ...overrides,
  };
}

test("asset registry contains every rules hero id", () => {
  for (const hero of RULE_HERO_CATALOG) {
    assert.ok(ASSETS[hero.id], `missing asset registry entry for ${hero.id}`);
  }
});

test("visible persistent form state resolves matching token variants", () => {
  assert.equal(getUnitTokenAsset(makeUnit({ transformed: true })).id, "engineering-miracle");
  assert.equal(
    getUnitTokenAsset(makeUnit({ heroId: "guts", class: "berserker", gutsBerserkModeActive: true }))
      .id,
    "guts-berserk",
  );
  assert.equal(
    getUnitTokenAsset(
      makeUnit({ heroId: "mettaton", mettatonExUnlocked: true, mettatonNeoUnlocked: true }),
    ).id,
    "mettaton-neo",
  );
  assert.equal(
    getUnitTokenAsset(makeUnit({ heroId: "papyrus", papyrusUnbelieverActive: true })).id,
    "papyrus-unbeliever",
  );
  assert.equal(
    getUnitTokenAsset(makeUnit({ heroId: "sans", sansUnbelieverUnlocked: true })).id,
    "sans-unbeliever",
  );
  assert.equal(
    getUnitTokenAsset(makeUnit({ heroId: "frisk", friskPacifismDisabled: true })).id,
    "frisk-genocide",
  );
  assert.equal(
    getUnitFigureAsset(
      makeUnit({ heroId: "undyne", class: "berserker", undyneImmortalActive: true }),
    ).id,
    "undyne-undying",
  );
});

test("missing optional art falls back safely", () => {
  const asset = getUnitTokenAsset(makeUnit({ heroId: "kaneki", figureId: "kaneki" }));
  assert.equal(asset.isFallback, true);
});

test("a redacted or absent form flag cannot reveal a transformed token", () => {
  const projectedUnit = makeUnit({ transformed: undefined });
  assert.equal(getUnitVisualVariant(projectedUnit), null);
  assert.equal(getUnitTokenAsset(projectedUnit).id, "grand-kaiser");
  assert.equal(getUnitVisualVariant(undefined), null);
  assert.equal(getUnitTokenAsset(undefined).isFallback, true);
});
