import assert from "node:assert/strict";
import {
  applyAction, attachArmy, createDefaultArmy, createEmptyGame, getHeroDefinition,
  projectEventsForRecipient, type GameState, type UnitState,
} from "../../index";
import { getPolkovodetsSource } from "../../actions/heroes/vlad";
import { resolveAttack } from "../../combat/resolveAttack";
import { advanceDoraAoEQueue } from "../../pendingRoll/resolvers/heroes/resolveDoraRoll/queue";
import { advanceCarpetStrikeQueue } from "../../pendingRoll/resolvers/heroes/resolveCarpetStrikeRoll/queue";
import { advanceForestAoEQueue } from "../../pendingRoll/resolvers/heroes/resolveForestRoll/queue";
import { advanceJebeHailOfArrowsQueue } from "../../pendingRoll/resolvers/heroes/resolveJebeRoll/queue";
import { advanceTricksterAoEQueue } from "../../pendingRoll/resolvers/heroes/resolveTricksterRoll";
import { initKnowledgeForOwners, makeRngSequence, resolvePendingRollOnce, setUnit, toBattleState } from "../helpers/testUtils";

const noDice = { next(): number { throw new Error("A defense decision or displacement must not draw dice"); } };

function fixture(heroId: string) {
  const slot = getHeroDefinition(heroId)!.mainClass;
  let state = attachArmy(attachArmy(createEmptyGame(), createDefaultArmy("P1", { [slot]: heroId })), createDefaultArmy("P2"));
  const defender = Object.values(state.units).find(u => u.heroId === heroId)!;
  const attacker = Object.values(state.units).find(u => u.owner === "P2" && u.class === "knight")!;
  state = setUnit(state, defender.id, { position: { col: 4, row: 4 }, isStealthed: false });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 }, isStealthed: false });
  state = initKnowledgeForOwners(toBattleState(state, "P2", attacker.id));
  return { state, defender: state.units[defender.id], attacker: state.units[attacker.id] };
}

export function undyneShiftFixture() {
  const f = fixture("undyne");
  f.state = setUnit(f.state, f.defender.id, { charges: { ...f.defender.charges, berserkAutoDefense: 0 } });
  const declared = applyAction(f.state, { type: "attack", attackerId: f.attacker.id, defenderId: f.defender.id }, noDice);
  const rolled = resolvePendingRollOnce(declared.state, makeRngSequence([0.01, 0.2]));
  const defended = resolvePendingRollOnce(rolled.state, makeRngSequence([0.99, 0.8]));
  assert.equal(defended.state.pendingRoll?.kind, "vladIntimidateChoice");
  assert.equal(defended.state.pendingRoll?.player, "P1");
  const options = defended.state.pendingRoll!.context.options as { col: number; row: number }[];
  assert(options.length > 0);
  const respond = (state: GameState, to?: { col: number; row: number }) => applyAction(state, {
    type: "resolvePendingRoll", pendingRollId: defended.state.pendingRoll!.id, player: "P1",
    ...(to ? { choice: { type: "intimidatePush" as const, to } } : {}),
  }, noDice);
  const shifted = respond(defended.state, options[0]);
  const event = shifted.events.find(e => e.type === "intimidateResolved");
  assert(event?.type === "intimidateResolved");
  assert.equal(event.abilityId, "undyneSwitchDirection");
  assert.deepEqual(shifted.state.units[f.attacker.id].position, options[0]);
  assert.equal(shifted.state.units[f.defender.id].hp, f.defender.hp);
  assert.equal(shifted.state.units[f.attacker.id].turn.moveUsed, false);
  for (const recipient of ["P1", "P2", "spectator"] as const) {
    assert(projectEventsForRecipient(shifted.state, shifted.events, recipient)
      .some(e => e.type === "intimidateResolved" && e.abilityId === "undyneSwitchDirection"));
  }
  for (const rejected of [respond(defended.state), respond(defended.state, { col: -1, row: -1 }), respond(shifted.state, options[0])]) {
    assert(!rejected.events.some(e => e.type === "intimidateResolved"));
  }
  return { before: defended.state, after: shifted.state, events: shifted.events, defenderId: f.defender.id, attackerId: f.attacker.id };
}

export function kaiserAutoDefenseFixture() {
  const f = fixture("grand-kaiser");
  const state = setUnit(f.state, f.defender.id, { transformed: true, charges: { berserkAutoDefense: 6 } });
  const declared = applyAction(state, { type: "attack", attackerId: f.attacker.id, defenderId: f.defender.id }, noDice);
  const rolled = resolvePendingRollOnce(declared.state, makeRngSequence([0.8, 0.6]));
  assert.equal(rolled.state.pendingRoll?.kind, "berserkerDefenseChoice");
  const pending = rolled.state.pendingRoll!;
  const defended = applyAction(rolled.state, { type: "resolvePendingRoll", pendingRollId: pending.id, player: pending.player, choice: "auto" }, noDice);
  assert.equal(defended.state.units[f.defender.id].charges.berserkAutoDefense, 0);
  assert.equal(defended.state.units[f.defender.id].hp, f.defender.hp);
  assert(defended.events.some(e => e.type === "attackResolved" && !e.hit && e.preventedBy === "berserkerAutoDefense"));
  assert(!applyAction(defended.state, { type: "resolvePendingRoll", pendingRollId: pending.id, player: pending.player, choice: "auto" }, noDice)
    .events.some(e => e.type === "attackResolved"));
  return { before: state, after: defended.state, events: [...declared.events, ...rolled.events, ...defended.events], defenderId: f.defender.id };
}

export function testHeroFeatureCorrections() {
  for (const heroId of ["griffith", "grozny"]) {
    const f = fixture(heroId);
    const ally = Object.values(f.state.units).find(u => u.owner === "P1" && u.class === "spearman")!;
    let state = setUnit(f.state, ally.id, { position: { col: 5, row: 4 } });
    state = setUnit(state, f.defender.id, { position: { col: 4, row: 3 } });
    assert.equal(getPolkovodetsSource(state, ally.id), f.defender.id, `${heroId}: diagonal radius one`);
    assert.equal(getPolkovodetsSource(state, f.defender.id), null, "No bonus to self");
    assert.equal(getPolkovodetsSource(state, f.attacker.id), null, "No bonus to enemy");
    for (const change of [
      { position: { col: 3, row: 3 } }, { isAlive: false }, { heroId: "femto" },
    ] satisfies Partial<UnitState>[]) {
      assert.equal(getPolkovodetsSource(setUnit(state, f.defender.id, change), ally.id), null);
    }
    state = setUnit(state, f.attacker.id, { position: { col: 5, row: 5 }, hp: 20 });
    state = initKnowledgeForOwners(toBattleState(state, "P1", ally.id));
    const attack = applyAction(state, { type: "attack", attackerId: ally.id, defenderId: f.attacker.id }, noDice);
    const attackerRolled = resolvePendingRollOnce(attack.state, makeRngSequence([0.99, 0.8]));
    const result = resolvePendingRollOnce(attackerRolled.state, makeRngSequence([0.01, 0.2]));
    const hit = result.events.find(e => e.type === "attackResolved");
    assert(hit?.type === "attackResolved" && hit.hit);
    assert.equal(hit.damage, state.units[ally.id].attack + 1, heroId);
    assert(result.events.some(e => e.type === "damageBonusApplied" && e.fromUnitId === f.defender.id && e.amount === 1));
  }

  const f = fixture("grand-kaiser");
  for (const transformed of [false, true]) for (const charges of [5, 6]) {
    const state = setUnit(f.state, f.defender.id, { transformed, charges: { berserkAutoDefense: charges } });
    const attack = applyAction(state, { type: "attack", attackerId: f.attacker.id, defenderId: f.defender.id }, noDice);
    let draws = 0;
    const rolled = resolvePendingRollOnce(attack.state, { next() { draws++; return draws === 1 ? 0.8 : 0.6; } });
    assert.equal(draws, 2);
    assert.equal(rolled.state.pendingRoll?.kind === "berserkerDefenseChoice", transformed && charges === 6);
    const direct = resolveAttack(state, { attackerId: f.attacker.id, defenderId: f.defender.id, defenderUseBerserkAutoDefense: true,
      rolls: { attackerDice: [6, 5], defenderDice: [1, 2] } });
    assert.equal(direct.events.some(e => e.type === "attackResolved" && e.preventedBy === "berserkerAutoDefense"), transformed && charges === 6);
    const context = { casterId: f.attacker.id, targetsQueue: [f.defender.id], attackerDice: [6, 5], center: { col: 4, row: 4 } };
    const queued = [advanceDoraAoEQueue, advanceCarpetStrikeQueue, advanceForestAoEQueue, advanceJebeHailOfArrowsQueue, advanceTricksterAoEQueue];
    for (const advance of queued) {
      const next = advance(state, context, []);
      assert.equal(next.state.pendingRoll?.kind.endsWith("berserkerDefenseChoice"), transformed && charges === 6, advance.name);
    }
  }
  undyneShiftFixture();
  kaiserAutoDefenseFixture();
  console.log("hero_feature_corrections_commanders_kaiser_defense_and_undyne_shift passed");
}
