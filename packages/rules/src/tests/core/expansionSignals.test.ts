import assert from "node:assert/strict";
import {
  applyAction, attachArmy, createDefaultArmy, createEmptyGame, projectEventsForRecipient,
  type GameEvent, type GameState, type UnitClass,
} from "../../index";
import { initKnowledgeForOwners, resolveAllPendingRollsWithEvents, setUnit, toBattleState } from "../helpers/testUtils";
import { applyNewBatchPostAction } from "../../actions/heroes/newBatchPost";
import { processUnitStartOfTurn } from "../../abilities/turn";
import { applyStormStartOfTurn } from "../../actions/heroes/lechy/storm";
import { unitSignalAnchor } from "../../core/heroSignals";

const noDice = { next(): number { throw new Error("VFX signals must not consume RNG"); } };
function fixture(hero: string, slot: UnitClass) {
  let state = attachArmy(attachArmy(createEmptyGame(), createDefaultArmy("P1", { [slot]: hero })), createDefaultArmy("P2"));
  const actor = Object.values(state.units).find(u => u.heroId === hero)!;
  const target = Object.values(state.units).find(u => u.owner === "P2" && u.class === "knight")!;
  state = setUnit(state, actor.id, { position: { col: 4, row: 4 }, isStealthed: false });
  state = setUnit(state, target.id, { position: { col: 4, row: 5 }, isStealthed: false });
  state = initKnowledgeForOwners(toBattleState(state, "P1", actor.id));
  return { state, actor: state.units[actor.id], target: state.units[target.id] };
}
function miss(attackerId: string, defenderId: string): Extract<GameEvent, { type: "attackResolved" }> {
  return { type: "attackResolved", attackerId, defenderId, sourceCell: { col: 4, row: 4 }, targetCell: { col: 4, row: 5 },
    attackerRoll: { dice: [], sum: 0, isDouble: false }, defenderRoll: { dice: [], sum: 0, isDouble: false },
    hit: false, damage: 0, defenderHpAfter: 5 };
}

export function expansionSignalFixtures() {
  const loki = fixture("loki", "trickster");
  const lokiState = setUnit(loki.state, loki.actor.id, { charges: { ...loki.actor.charges, lokiLaught: 15 } });
  const menu = applyAction(lokiState, { type: "useAbility", unitId: loki.actor.id, abilityId: "lokiLaught" }, noDice);
  assert.equal(menu.state.pendingRoll?.kind, "lokiLaughtChoice");
  const pending = menu.state.pendingRoll!;
  const choose = (state: GameState, option: "greatLokiJoke" | "againSomeNonsense") => applyAction(state,
    { type: "resolvePendingRoll", pendingRollId: pending.id, player: pending.player, choice: { type: "lokiLaughtOption", option } }, noDice);
  const joke = choose(menu.state, "greatLokiJoke");
  assert.equal(joke.events.filter(e => e.type === "lokiGreatJokeCommitted").length, 1);
  assert.equal(joke.state.units[loki.actor.id].charges.lokiLaught, 0);
  assert.equal(joke.state.pendingRoll?.kind, "tricksterAoE_attackerRoll");
  assert(!joke.events.some(e => e.type === "lokiChickenApplied"));
  for (const rejected of [choose(setUnit(menu.state, loki.actor.id, { charges: { lokiLaught: 14 } }), "greatLokiJoke"),
    choose(menu.state, "againSomeNonsense"), choose(joke.state, "greatLokiJoke")])
    assert(!rejected.events.some(e => e.type === "lokiGreatJokeCommitted"));

  const duo = fixture("duolingo", "trickster");
  const duoState = setUnit(duo.state, duo.actor.id, { charges: { ...duo.actor.charges, duolingoSkipClasses: 11 }, duolingoBerserkerUnlocked: false });
  const missed = miss(duo.actor.id, duo.target.id);
  const unlock = applyNewBatchPostAction(duoState, duoState, [missed], noDice);
  assert.equal(unlock.events.filter(e => e.type === "duolingoBerserkerUnlocked").length, 1);
  assert.equal(unlock.state.units[duo.actor.id].charges.duolingoSkipClasses, 12);
  assert(unlock.state.units[duo.actor.id].duolingoBerserkerUnlocked);
  assert(!applyNewBatchPostAction(unlock.state, unlock.state, [missed], noDice).events.some(e => e.type === "duolingoBerserkerUnlocked"));
  assert(!applyNewBatchPostAction(duoState, duoState, [{ ...missed, hit: true }], noDice).events.some(e => e.type === "duolingoBerserkerUnlocked"));
  const turnState = setUnit(duoState, duo.actor.id, { charges: { duolingoSkipClasses: 12 } });
  const turn = processUnitStartOfTurn(turnState, duo.actor.id, noDice);
  assert.equal(turn.events.filter(e => e.type === "duolingoBerserkerUnlocked").length, 1);
  assert(!processUnitStartOfTurn(turn.state, duo.actor.id, noDice).events.some(e => e.type === "duolingoBerserkerUnlocked"));
  assert(!processUnitStartOfTurn(unlock.state, duo.actor.id, noDice).events.some(e => e.type === "duolingoBerserkerUnlocked"));

  const frisk = fixture("frisk", "assassin");
  let friskState = setUnit(frisk.state, frisk.actor.id, { friskCleanSoulShield: true, charges: { friskPacifism: 0, friskGenocide: 0 } });
  friskState = initKnowledgeForOwners(toBattleState(friskState, "P2", frisk.target.id));
  const attack = applyAction(friskState, { type: "attack", attackerId: frisk.target.id, defenderId: frisk.actor.id }, noDice);
  let draws = 0;
  const broken = resolveAllPendingRollsWithEvents(attack.state, { next() { draws++; return 0.8; } });
  assert.equal(draws, 2, "Clean Soul consumes only the existing attacker dice");
  const result = broken.events.find(e => e.type === "attackResolved");
  assert(result?.type === "attackResolved");
  assert.equal(result.defenseSignature, "friskCleanSoulBreak");
  assert.equal(result.hit, false); assert.equal(result.damage, 0);
  assert.equal(broken.state.units[frisk.actor.id].hp, friskState.units[frisk.actor.id].hp);
  assert.equal(broken.state.units[frisk.actor.id].friskCleanSoulShield, false);
  assert(!applyAction(broken.state, { type: "resolvePendingRoll", pendingRollId: attack.state.pendingRoll!.id, player: "P2" }, noDice)
    .events.some(e => e.type === "attackResolved" && e.defenseSignature === "friskCleanSoulBreak"));

  const river = fixture("riverPerson", "rider");
  const riverState = { ...river.state, arenaId: "storm", arenaEffects: [] };
  const ward = applyStormStartOfTurn(riverState, river.actor.id);
  assert.equal(ward.events.filter(e => e.type === "riverStormWard").length, 1);
  assert.equal(ward.state.units[river.actor.id].hp, river.actor.hp);
  assert.equal(ward.state.pendingRoll, riverState.pendingRoll);
  assert(!applyStormStartOfTurn(ward.state, river.actor.id).events.some(e => e.type === "riverStormWard"));
  for (const state of [{ ...riverState, arenaId: null },
    { ...riverState, forestMarkers: [{ owner: "P1" as const, position: river.actor.position! }] },
    setUnit(riverState, river.actor.id, { isAlive: false }), setUnit(riverState, river.actor.id, { position: null })])
    assert(!applyStormStartOfTurn(state, river.actor.id).events.some(e => e.type === "riverStormWard"));
  const ordinary = applyStormStartOfTurn(riverState, river.target.id);
  assert.equal(ordinary.state.pendingRoll?.kind, "lechyStormStartTurnRoll");
  assert(!ordinary.events.some(e => e.type === "riverStormWard"));
  return [
    { state: joke.state, before: menu.state, events: joke.events, effectId: "expansion.loki.great_joke" },
    { state: unlock.state, before: duoState, events: unlock.events, effectId: "expansion.duolingo.berserker_unlock" },
    { state: broken.state, before: friskState, events: [...attack.events, ...broken.events], effectId: "expansion.frisk.clean_soul_break" },
    { state: ward.state, before: riverState, events: ward.events, effectId: "expansion.riverPerson.storm_ward" },
  ];
}

export function testExpansionSignals() {
  const don = fixture("donKihote", "rider");
  const dead = setUnit(don.state, don.actor.id, { isAlive: false, hp: 0, position: null });
  const initial = applyNewBatchPostAction(don.state, dead,
    [{ type: "unitDied", unitId: don.actor.id, killerId: don.target.id }], noDice);
  assert.equal(initial.state.pendingRoll?.kind, "donMadDelusionDirection");
  assert(!initial.events.some(e => e.type === "unitDeathFinalized"));
  const pending = initial.state.pendingRoll!;
  const chooseDirection = (col: number, row: number, player = pending.player) => applyAction(initial.state,
    { type: "resolvePendingRoll", pendingRollId: pending.id, player,
      choice: { type: "donMadDelusionDirection", direction: { col, row } } }, noDice);
  assert(!chooseDirection(2, 0).events.some(e => e.type === "unitDeathFinalized"));
  assert(!chooseDirection(-1, 0, "P2").events.some(e => e.type === "unitDeathFinalized"));
  const finished = chooseDirection(-1, 0); // Empty ray still completes Madness before death.
  assert.equal(finished.events.filter(e => e.type === "unitDeathFinalized").length, 1);
  assert.equal(finished.state.units[don.actor.id].isAlive, false);
  assert.equal(finished.state.units[don.actor.id].position, null);
  for (const recipient of ["P1", "P2", "spectator"] as const) {
    const event = projectEventsForRecipient(finished.state, finished.events, recipient)
      .find(e => e.type === "unitDeathFinalized");
    assert(event?.type === "unitDeathFinalized");
    assert.deepEqual(event.sourceCell, don.actor.position);
  }
  assert(!applyAction(finished.state, { type: "resolvePendingRoll", pendingRollId: pending.id,
    player: pending.player, choice: { type: "donMadDelusionDirection", direction: { col: -1, row: 0 } } }, noDice)
    .events.some(e => e.type === "unitDeathFinalized"));
  for (const fixture of expansionSignalFixtures()) for (const recipient of ["P1", "P2", "spectator"] as const) {
    const projected = projectEventsForRecipient(fixture.state, fixture.events, recipient);
    assert(projected.some(e => e.type === "lokiGreatJokeCommitted" || e.type === "duolingoBerserkerUnlocked" ||
      e.type === "riverStormWard" || (e.type === "attackResolved" && e.defenseSignature === "friskCleanSoulBreak")));
    assert(!JSON.stringify(projected).includes("eventVisibility"));
  }
  const hidden = fixture("loki", "trickster");
  const state = setUnit(hidden.state, hidden.actor.id, { isStealthed: true });
  const events: GameEvent[] = [
    { type: "lokiGreatJokeCommitted", ...unitSignalAnchor(state, hidden.actor.id), radius: 1 },
    { type: "duolingoBerserkerUnlocked", ...unitSignalAnchor(state, hidden.actor.id) },
    { type: "riverStormWard", ...unitSignalAnchor(state, hidden.actor.id), turnNumber: state.turnNumber },
  ];
  // A later reveal cannot authorize the original hidden signal/anchor.
  const revealed = setUnit(state, hidden.actor.id, { isStealthed: false });
  assert.equal(projectEventsForRecipient(revealed, events, "P1").length, 3);
  assert.deepEqual(projectEventsForRecipient(revealed, events, "P2"), []);
  assert.deepEqual(projectEventsForRecipient(revealed, events, "spectator"), []);
  console.log("expansion_signals_branch_transition_rng_and_projection passed");
}
