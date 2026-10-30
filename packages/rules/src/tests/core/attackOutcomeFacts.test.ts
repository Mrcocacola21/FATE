import assert from "node:assert/strict";
import { attackOutcomeFixtures } from "../helpers/attackOutcomeFixtures";
import { projectEventsForRecipient, type GameEvent, type ProjectedGameEvent } from "../../index";
import { EVENT_VISIBILITY } from "../../model/events/visibility";
import { resolveAttack } from "../../combat/resolveAttack";
import { applyAction, attachArmy, createDefaultArmy, createEmptyGame, getHeroDefinition } from "../../index";
import { initKnowledgeForOwners, makeRngSequence, resolvePendingRollOnce, setUnit, toBattleState } from "../helpers/testUtils";

export function testAttackOutcomeFacts() {
  const fixtures = attackOutcomeFixtures();
  assert.equal(fixtures.length, 45);
  for (const f of fixtures) {
    const attacks = f.events.filter(event => event.type === "attackResolved");
    if (f.id === "outcome.rider.riverPerson") {
      assert.equal(attacks.length, 0, "River movement has no incidental path attacks in rules");
      assert.deepEqual(f.after.units[f.sourceId].position, { col: 6, row: 4 });
      assert.equal(f.rngCalls, 0); continue;
    }
    assert.equal(attacks.length, f.id.includes(".rider.") ? 2 : 1, f.id);
    assert.deepEqual(attacks.map(event => event.defenderId), f.targetIds, f.id);
    if (f.id.includes(".rider.")) {
      assert(attacks.every(event => event.attackSignature === "riderPath" && !event.isBasicAttack));
      assert.deepEqual(attacks.map(event => event.hit), [true, false]);
      assert.equal(f.rngCalls, 8, "two attack/defense rolls; no extra random roll for path VFX");
    } else if (f.id.startsWith("outcome.miss.")) {
      assert.equal(attacks[0].hit, false);
      assert.equal(attacks[0].preventedBy, undefined);
      assert.equal(attacks[0].spearmanEvaded, undefined);
      assert.equal(f.rngCalls, 4);
    }
    for (const recipient of ["P1", "P2", "spectator"] as const) {
      const projected = projectEventsForRecipient(f.after, f.events, recipient).filter(event => event.type === "attackResolved");
      assert.equal(projected.length, attacks.length, `${f.id}/${recipient}`);
      projected.forEach((event, index) => {
        assert.deepEqual(event.preventedBy, attacks[index].preventedBy);
        assert.deepEqual(event.damageReductions, attacks[index].damageReductions);
        assert.equal(event.attackSignature, attacks[index].attackSignature);
        assert.deepEqual(event.targetCell, attacks[index].targetCell);
      });
    }
    if (f.id.includes("reduction.")) {
      assert.equal(attacks[0].hit, true); assert.equal(attacks[0].damage, 1);
      assert.deepEqual(attacks[0].damageReductions, [{ abilityId: f.id.endsWith("guts") ? "gutsBerserkMode" : "undyneUndying", amount: 3 }]);
      assert.equal(f.after.units[f.targetIds[0]].hp, f.before.units[f.targetIds[0]].hp - 1);
      const normal = resolveAttack({ ...f.before, units: { ...f.before.units, [f.sourceId]: { ...f.before.units[f.sourceId], attack: 1 } } },
        { attackerId: f.sourceId, defenderId: f.targetIds[0], rolls: { attackerDice: [6, 5], defenderDice: [1, 2] } });
      const outcome = normal.events.find(event => event.type === "attackResolved")!;
      assert(outcome.type === "attackResolved"); assert.equal(outcome.damage, 1);
      assert.equal(outcome.damageReductions, undefined, "merely being in a form is not a reduction");
      const privateFact: GameEvent = { ...attacks[0], [EVENT_VISIBILITY]: { recipients: [], sourceCellRecipients: ["P1"], targetCellRecipients: ["P2"] } };
      const owner = projectEventsForRecipient(f.after, [privateFact], "P2")[0];
      assert(owner.type === "attackResolved"); assert.deepEqual(owner.damageReductions, attacks[0].damageReductions);
      for (const recipient of ["P1", "spectator"] as const) {
        const limited: ProjectedGameEvent = projectEventsForRecipient(f.after, [privateFact], recipient)[0];
        assert(limited.type === "attackResolved"); assert.equal(limited.targetCell, undefined);
        assert.equal(limited.damageReductions, undefined);
      }
    }
  }
  for (const [id, reason, calls] of [["berserker.guts", "berserkerAutoDefense", 2], ["muninn.odin", "odinMuninn", 4],
    ["bravery.asgore", "asgoreBravery", 2]] as const) {
    const f = fixtures.find(f => f.id === `outcome.${id}`)!;
    const event = f.events.find(event => event.type === "attackResolved")!;
    assert(event.type === "attackResolved"); assert.equal(event.preventedBy, reason);
    assert.equal(event.hit, false); assert.equal(event.damage, 0); assert.equal(f.rngCalls, calls);
    assert.equal(f.after.units[f.targetIds[0]].hp, f.before.units[f.targetIds[0]].hp);
    const privateFact: GameEvent = { ...event, [EVENT_VISIBILITY]: { recipients: [], sourceCellRecipients: ["P1"], targetCellRecipients: ["P2"] } };
    for (const recipient of ["P1", "spectator"] as const) {
      const projected: ProjectedGameEvent = projectEventsForRecipient(f.after, [privateFact], recipient)[0];
      assert(projected.type === "attackResolved"); assert.equal(projected.preventedBy, undefined);
    }
  }
  // Doubles that decide the outcome say so on the event, and the reason reaches every viewer.
  const doubleCase = (attackerHero: string, defenderHero: string, attackerDice: number[], defenderDice: number[]) => {
    let state = attachArmy(
      attachArmy(createEmptyGame(), createDefaultArmy("P1", { [getHeroDefinition(attackerHero)!.mainClass]: attackerHero })),
      createDefaultArmy("P2", { [getHeroDefinition(defenderHero)!.mainClass]: defenderHero }),
    );
    const attacker = Object.values(state.units).find(u => u.owner === "P1" && u.heroId === attackerHero)!;
    const defender = Object.values(state.units).find(u => u.owner === "P2" && u.heroId === defenderHero)!;
    state = setUnit(state, attacker.id, { position: { col: 3, row: 4 } });
    state = setUnit(state, defender.id, { position: { col: 4, row: 4 } });
    const { nextState, events } = resolveAttack(toBattleState(state, "P1", attacker.id), {
      attackerId: attacker.id, defenderId: defender.id, ignoreRange: true, rolls: { attackerDice, defenderDice },
    });
    const event = events.find(item => item.type === "attackResolved")!;
    assert(event.type === "attackResolved");
    const seen: ProjectedGameEvent = projectEventsForRecipient(nextState, [event], "P2")[0];
    assert(seen.type === "attackResolved"); assert.equal(seen.doubleAutoHit, event.doubleAutoHit);
    return event;
  };
  // Artemis's 3+3 beats Grozny's 6+1 only through her double.
  const arrow = doubleCase("artemida", "grozny", [3, 3], [6, 1]);
  assert.equal(arrow.hit, true); assert.equal(arrow.doubleAutoHit, true); assert.equal(arrow.spearmanEvaded, undefined);
  const plain = doubleCase("artemida", "grozny", [6, 2], [1, 2]);
  assert.equal(plain.hit, true); assert.equal(plain.doubleAutoHit, undefined);
  const noPassive = doubleCase("grozny", "artemida", [3, 3], [6, 1]);
  assert.equal(noPassive.hit, false); assert.equal(noPassive.doubleAutoHit, undefined);
  const dodge = doubleCase("grozny", "luche", [6, 5], [1, 1]);
  assert.equal(dodge.hit, false); assert.equal(dodge.spearmanEvaded, true); assert.equal(dodge.doubleAutoHit, undefined);
  // Both doubles: the attacker's wins, so only the hit is reported.
  const both = doubleCase("artemida", "luche", [2, 2], [5, 5]);
  assert.equal(both.hit, true); assert.equal(both.doubleAutoHit, true); assert.equal(both.spearmanEvaded, undefined);

  // Rider path with repeated tie-breaks: only the final totals decide, a lost one deals nothing.
  const riderTieBreak = (dice: number[]) => {
    let state = attachArmy(
      attachArmy(createEmptyGame(), createDefaultArmy("P1", { rider: "donKihote" })),
      createDefaultArmy("P2", { berserker: "grozny" }),
    );
    const don = Object.values(state.units).find(u => u.heroId === "donKihote")!;
    const grozny = Object.values(state.units).find(u => u.heroId === "grozny")!;
    state = setUnit(state, don.id, { position: { col: 0, row: 4 } });
    state = setUnit(state, grozny.id, { position: { col: 2, row: 4 } });
    state = initKnowledgeForOwners(toBattleState(state, "P1", don.id));
    const rng = makeRngSequence(dice.map(die => (die - 0.5) / 6));
    let result = applyAction(state, { type: "requestMoveOptions", unitId: don.id, mode: "rider" }, rng);
    const events = [...result.events];
    while (result.state.pendingRoll) { result = resolvePendingRollOnce(result.state, rng); events.push(...result.events); }
    result = applyAction(result.state, { type: "move", unitId: don.id, to: { col: 4, row: 4 } }, rng);
    events.push(...result.events);
    for (let step = 0; result.state.pendingRoll; step++) {
      assert(step < 16, "rider chain did not finish");
      result = resolvePendingRollOnce(result.state, rng); events.push(...result.events);
    }
    const attacks = events.filter(event => event.type === "attackResolved");
    assert.equal(attacks.length, 1);
    const attack = attacks[0];
    assert(attack.type === "attackResolved");
    return { attack, hpLost: state.units[grozny.id].hp - result.state.units[grozny.id].hp,
      donHpLost: state.units[don.id].hp - result.state.units[don.id].hp };
  };
  // 11:11, then 16:16, then Don rolls 3 and Grozny 5: a miss with no damage to anyone.
  const lost = riderTieBreak([5, 6, 5, 6, 5, 5, 3, 5]);
  assert.equal(lost.attack.attackerRoll.sum, 19); assert.equal(lost.attack.defenderRoll.sum, 21);
  assert.deepEqual(lost.attack.tieBreakDice, { attacker: [5, 3], defender: [5, 5] });
  assert.equal(lost.attack.hit, false); assert.equal(lost.attack.damage, 0);
  assert.equal(lost.hpLost, 0); assert.equal(lost.donHpLost, 0);
  // Doubles on the opening roll change nothing here: neither a rider nor a berserker has that trait.
  const lostDoubles = riderTieBreak([5, 5, 5, 5, 6, 6, 3, 5]);
  assert.equal(lostDoubles.attack.hit, false); assert.equal(lostDoubles.hpLost, 0);
  assert.equal(lostDoubles.attack.doubleAutoHit, undefined); assert.equal(lostDoubles.attack.spearmanEvaded, undefined);
  // The same roll the other way round is a hit that really deals the damage.
  const won = riderTieBreak([5, 6, 5, 6, 5, 5, 5, 3]);
  assert.equal(won.attack.hit, true); assert.equal(won.hpLost, won.attack.damage); assert(won.attack.damage > 0);

  console.log("attack_outcome_facts: 44 attack routes and River no-attack counterexample; prevention/reduction/path, recipient permissions and unchanged RNG passed");
}
