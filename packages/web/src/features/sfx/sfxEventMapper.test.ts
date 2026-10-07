import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyGame,
  projectEventsForRecipient,
  makeEmptyTurnEconomy,
  type GameEvent,
  type ProjectedGameEvent,
  type PlayerView,
  type UnitState,
} from "rules";
import type { PresentationEvent } from "../../game/effects/types";
import { buildCombatVisualPlaybackPlan } from "../../game/effects/combatPlayback";
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
  } as ProjectedGameEvent;

  assert.deepEqual(mapGameEventToSfxEvents(attack, view(loki, papyrus)), [
    { type: "unitAttack", heroId: "loki" },
    { type: "unitHit", heroId: "papyrus" },
  ]);

  // Unidentified historical events do not enter the live audio cue pipeline.
  assert.deepEqual(
    mapEventBatchToSfx({
      events: [attack],
      view: view(loki, papyrus),
      revision: 42,
    }),
    [],
  );
});

function cues(events: PresentationEvent[]) {
  return mapEventBatchToSfx({ events, view: view(), revision: 42, streamId: "stream" });
}
const hitEvent: PresentationEvent = {
  type: "attackResolved",
  eventId: "hit-1",
  attackerId: "attacker",
  defenderId: "target",
  attackerRoll: { dice: [6], sum: 6, isDouble: false },
  defenderRoll: { dice: [1], sum: 1, isDouble: false },
  hit: true,
  damage: 2,
  defenderHpAfter: 0,
  previousHp: 2,
  nextHp: 0,
};

test("confirmed results map exactly one generic hit OR miss independently of unit/hero state", () => {
  assert.deepEqual(
    cues([hitEvent]).map((cue) => cue.key),
    ["common.combat.hit"],
  );
  assert.deepEqual(
    cues([{ ...hitEvent, hit: false } as PresentationEvent]).map((cue) => cue.key),
    ["common.combat.miss"],
  );
  assert.equal(cues([hitEvent])[0].id, "stream:hit-1:audio:common.combat.hit");
});

test("one authoritative roll produces one dice cue; shared AoE attacks cannot invent more", () => {
  const roll: PresentationEvent = {
    type: "rollResolved",
    eventId: "roll-1",
    rollId: "roll",
    rollKind: "tricksterAoE_attackerRoll",
    rollerPlayerId: "P1",
    dice: [4, 5],
    total: 9,
    sides: 6,
    rollIndex: 0,
  };
  const events = [
    roll,
    hitEvent,
    { ...hitEvent, eventId: "hit-2", attackerRollIsNew: false } as PresentationEvent,
  ];
  assert.equal(cues(events).filter((cue) => cue.key === "common.combat.diceRoll").length, 1);
  assert.equal(cues([hitEvent]).filter((cue) => cue.key === "common.combat.diceRoll").length, 0);
});

test("zero HP alone cannot create death audio; only final unitDied does", () => {
  const target = unit("sans");
  target.hp = 0;
  const zeroHp = mapEventBatchToSfx({ events: [], view: view(target), revision: 42 });
  assert.deepEqual(zeroHp, []);
  assert.deepEqual(
    cues([{ type: "unitDied", unitId: "sans", killerId: "attacker", eventId: "death-1" }]).map(
      (cue) => cue.key,
    ),
    ["common.combat.death"],
  );
});

test("hit/death audio aligns with shared impact/death phases in normal and reduced motion", () => {
  for (const reducedMotion of [false, true]) {
    const plan = buildCombatVisualPlaybackPlan({
      batch: {
        streamId: "s",
        revision: 1,
        events: [
          hitEvent,
          { type: "unitDied", unitId: "target", killerId: "attacker", eventId: "death-1" },
        ],
      },
      startingHpByUnitId: { target: 2 },
      startingUnitsByUnitId: {},
      finalView: view(),
      reducedMotion,
    });
    const requests = mapEventBatchToSfx({ ...plan.batch, view: view() });
    const impact = plan.batch.combatCues!.find(cue => cue.kind === "hit")!;
    const hp = plan.queue.find((item) => item.type === "damageHpTween")!;
    const death = plan.queue.find((item) => item.type === "death")!;
    assert.equal(requests[0].delayMs, impact.atMs);
    assert.ok(hp.startsAtMs > impact.atMs);
    assert.equal(requests[1].delayMs, death.startsAtMs);
    assert(requests[0].delayMs! > 0);
  }
});

test("private snare projection and redacted notices cannot produce audio or trigger fallback", () => {
  const state = createEmptyGame();
  const placement: GameEvent = {
    type: "snarePlaced",
    owner: "P1",
    sourceUnitId: "jack",
    cell: { col: 5, row: 6 },
  };
  for (const recipient of ["P2", "spectator"] as const) {
    const projected = projectEventsForRecipient(state, [placement], recipient);
    assert.deepEqual(projected, []);
    assert.deepEqual(cues(projected), []);
  }
  assert.equal(projectEventsForRecipient(state, [placement], "P1").length, 1);
  assert.deepEqual(cues([{ type: "eventRedacted", eventId: "private-notice" }]), []);
  assert.deepEqual(cues([{ ...placement, eventId: "private-owner" }]), []);
});
