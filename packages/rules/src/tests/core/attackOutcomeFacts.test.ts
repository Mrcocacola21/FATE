import assert from "node:assert/strict";
import { attackOutcomeFixtures } from "../helpers/attackOutcomeFixtures";
import { projectEventsForRecipient, type GameEvent, type ProjectedGameEvent } from "../../index";
import { EVENT_VISIBILITY } from "../../model/events/visibility";
import { resolveAttack } from "../../combat/resolveAttack";

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
  console.log("attack_outcome_facts: 44 attack routes and River no-attack counterexample; prevention/reduction/path, recipient permissions and unchanged RNG passed");
}
