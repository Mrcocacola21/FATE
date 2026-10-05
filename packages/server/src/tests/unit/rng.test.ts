import assert from "node:assert/strict";
import test from "node:test";
import { SeededRNG, roll2D6, applyAction, createEmptyGame, createDefaultArmy, attachArmy } from "rules";

test("seeded rolls repeat and serialized RNG continues identically, including uint32 zero", () => {
  for (const seed of [0, 1, 37, 0xffffffff]) {
    const a = new SeededRNG(seed), b = new SeededRNG(seed);
    assert.deepEqual(Array.from({ length: 100 }, () => roll2D6(a)), Array.from({ length: 100 }, () => roll2D6(b)));
    const resumed = SeededRNG.fromState(a.exportState());
    assert.deepEqual(Array.from({ length: 100 }, () => a.next()), Array.from({ length: 100 }, () => resumed.next()));
  }
  const zero = SeededRNG.fromState({ algorithm: "lcg32-numerical-recipes-v1", state: 0 });
  assert.equal(zero.next(), 1013904223 / 0x100000000);
});

test("invalid RNG snapshots fail instead of silently changing replay continuation", () => {
  for (const state of [-1, 0x100000000, 1.5, NaN, Infinity])
    assert.throws(() => SeededRNG.fromState({ algorithm: "lcg32-numerical-recipes-v1", state }), /INVALID_SEEDED_RNG_STATE/);
});

test("identical state, seed and actual initiative/roll actions produce identical domain transitions", () => {
  let state = attachArmy(attachArmy(createEmptyGame(), createDefaultArmy("P1")), createDefaultArmy("P2"));
  state = { ...state, hostPlayerId: "P1", seats: { P1: true, P2: true }, playersReady: { P1: true, P2: true } };
  const before = structuredClone(state);
  const play = () => {
    const rng = new SeededRNG(37);
    let result = applyAction(structuredClone(state), { type: "startGame" }, rng);
    assert(result.state.pendingRoll);
    for (let rolls = 0; result.state.pendingRoll && rolls < 10; rolls++) {
      const pending = result.state.pendingRoll;
      result = applyAction(result.state, {
        type: "resolvePendingRoll", player: pending.player, pendingRollId: pending.id,
        ...(pending.kind === "ruleDeclarationChoice" ? { choice: { type: "chooseRuleDeclaration" as const, ruleId: "normal_rule" as const } } : {}),
      }, rng);
      assert.notEqual(result.state, state);
    }
    assert.equal(result.state.phase, "placement");
    return { result, rng: rng.exportState() };
  };
  assert.deepEqual(play(), play());
  assert.deepEqual(state, before);
});
