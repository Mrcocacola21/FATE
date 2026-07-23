import assert from "node:assert/strict";
import test from "node:test";
import { makeEmptyTurnEconomy, type GameEvent, type PlayerView, type UnitState } from "rules";
import { mapEventBatchToSfx, mapGameEventToSfxEvents, mapSfxEventToLookup } from "./sfxEventMapper";

function unit(heroId: string): UnitState {
  return {
    id: heroId,
    heroId,
    owner: "P1",
    class: "trickster",
    hp: 5,
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
  };
}

function view(...units: UnitState[]): PlayerView {
  return {
    units: Object.fromEntries(units.map((entry) => [entry.id, entry])),
    abilitiesByUnitId: {},
  } as PlayerView;
}

test("normalized events map to stable hero SFX keys", () => {
  assert.deepEqual(
    mapSfxEventToLookup({
      type: "phantasmUsed",
      heroId: "loki",
      phantasmId: "lokiLaught",
    }),
    {
      sfxKey: "hero.loki.phantasms.lokiLaught",
      heroId: "loki",
      category: "phantasms",
      key: "lokiLaught",
      commonCategory: "combat",
      genericCommonKey: "phantasm",
    },
  );

  assert.equal(
    mapSfxEventToLookup({
      type: "statusApplied",
      heroId: "papyrus",
      statusId: "orangeBone",
    }).sfxKey,
    "hero.papyrus.statuses.orangeBone",
  );
});

test("rules ability metadata routes phantasms separately from abilities", () => {
  const loki = unit("loki");
  const lokiView = view(loki);
  lokiView.abilitiesByUnitId[loki.id] = [
    {
      id: "lokiLaught",
      name: "Loki's Laugh",
      description: "",
      kind: "phantasm",
      slot: "action",
      isAvailable: true,
    },
  ];
  const events = mapGameEventToSfxEvents(
    { type: "abilityUsed", unitId: loki.id, abilityId: "lokiLaught" },
    lokiView,
  );

  assert.deepEqual(events, [{ type: "phantasmUsed", heroId: "loki", phantasmId: "lokiLaught" }]);
});

test("combat events map attack, hit, death, and delayed-chain-safe requests", () => {
  const loki = unit("loki");
  const papyrus = unit("papyrus");
  const attack = {
    type: "attackResolved",
    attackerId: loki.id,
    defenderId: papyrus.id,
    attackerRoll: { dice: [6], sum: 6 },
    defenderRoll: { dice: [1], sum: 1 },
    hit: true,
    damage: 2,
    defenderHpAfter: 3,
  } as GameEvent;

  assert.deepEqual(mapGameEventToSfxEvents(attack, view(loki, papyrus)), [
    { type: "unitAttack", heroId: "loki" },
    { type: "unitHit", heroId: "papyrus" },
  ]);

  // The production registry intentionally contains no nonexistent imports yet.
  // A fully mapped batch therefore skips playback without throwing.
  assert.deepEqual(
    mapEventBatchToSfx({
      events: [attack],
      view: view(loki, papyrus),
      logIndex: 42,
    }),
    [],
  );
});
