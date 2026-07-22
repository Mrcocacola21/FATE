import assert from "node:assert/strict";
import test from "node:test";
import { HERO_CATALOG as RULE_HERO_CATALOG, makeEmptyTurnEconomy } from "rules";
import type { UnitState } from "rules";
import { HERO_CATALOG as FIGURE_SET_HERO_CATALOG } from "../catalog/figures";
import {
  ASSETS,
  getHeroVisualVariants,
  getUnitFigureAsset,
  getUnitTokenAsset,
  getUnitVisualVariant,
} from "./registry";

const NEW_HERO_IDS = [
  "duolingo",
  "luche",
  "kaneki",
  "zoro",
  "donKihote",
  "jackRipper",
  "artemida",
] as const;

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

test("new playable heroes use real figure and token art in every base registry", () => {
  const figureSetIds = new Set(FIGURE_SET_HERO_CATALOG.map((hero) => hero.id));
  for (const heroId of NEW_HERO_IDS) {
    assert.ok(figureSetIds.has(heroId), `${heroId} is missing from the Figure Set catalog`);
    assert.equal(
      getUnitFigureAsset(makeUnit({ heroId, figureId: heroId })).isFallback,
      false,
      `${heroId} still uses fallback figure art`,
    );
    assert.equal(
      getUnitTokenAsset(makeUnit({ heroId, figureId: heroId })).isFallback,
      false,
      `${heroId} still uses fallback token art`,
    );
  }
});

test("visible persistent form state resolves matching token variants", () => {
  const chicken = makeUnit({ lokiChickenSources: ["P1-trickster-loki"] });
  assert.equal(getUnitVisualVariant(chicken), "chicken");
  assert.equal(getUnitTokenAsset(chicken).id, "chicken");
  assert.equal(getUnitTokenAsset(chicken).isFallback, false);
  assert.equal(getUnitFigureAsset(chicken).id, "chicken");
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
  assert.equal(
    getUnitTokenAsset(makeUnit({ heroId: "duolingo", duolingoBerserkerUnlocked: true })).id,
    "duolingo-berserker",
  );
  assert.equal(
    getUnitTokenAsset(makeUnit({ heroId: "kaneki", kanekiCentipedeUnlocked: true })).id,
    "kaneki-centipede",
  );
  assert.equal(
    getUnitFigureAsset(makeUnit({ heroId: "duolingo", duolingoBerserkerUnlocked: true })).id,
    "duolingo-berserker",
  );
  assert.equal(
    getUnitFigureAsset(makeUnit({ heroId: "kaneki", kanekiCentipedeUnlocked: true })).id,
    "kaneki-centipede",
  );
  assert.deepEqual(
    getHeroVisualVariants("duolingo").map((variant) => variant.id),
    ["duolingo-berserker"],
  );
  assert.deepEqual(
    getHeroVisualVariants("kaneki").map((variant) => variant.id),
    ["kaneki-centipede"],
  );
});

test("missing optional art falls back safely", () => {
  const asset = getUnitTokenAsset(makeUnit({ heroId: "unknownHero", figureId: "unknownHero" }));
  assert.equal(asset.isFallback, true);
});

test("a redacted or absent form flag cannot reveal a transformed token", () => {
  const projectedUnit = makeUnit({ transformed: undefined });
  assert.equal(getUnitVisualVariant(projectedUnit), null);
  assert.equal(getUnitTokenAsset(projectedUnit).id, "grand-kaiser");
  assert.equal(getUnitVisualVariant(undefined), null);
  assert.equal(getUnitTokenAsset(undefined).isFallback, true);
});

test("expired Chicken status restores original unit art", () => {
  const transformed = makeUnit({ heroId: "loki", figureId: "loki", lokiChickenSources: ["loki"] });
  const restored = { ...transformed, lokiChickenSources: undefined };
  assert.equal(getUnitTokenAsset(transformed).id, "chicken");
  assert.equal(getUnitTokenAsset(restored).id, "loki");
});
