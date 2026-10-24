import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  makePlayerView,
  projectEventsForRecipient,
  type GameState,
  type PlayerId,
} from "rules";
import {
  initKnowledgeForOwners,
  makeRngSequence,
  setUnit,
  toBattleState,
} from "../../../../rules/src/tests/helpers/testUtils";
import {
  advanceVisualResolution,
  createVisualResolutionState,
  type VisualResolutionState,
} from "./visualResolution";
import type { PresentationEvent } from "./types";

const die = (value: number) => (value - 0.5) / 6;
const OUTCOME_TYPES = new Set(["attackResolved", "unitDied", "aoeResolved", "damageBonusApplied"]);

function setupAoE(): { state: GameState; casterId: string } {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  const caster = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "trickster")!;
  const targets = Object.values(state.units).filter((u) => u.owner === "P2").slice(0, 3);
  state = setUnit(state, caster.id, { position: { col: 4, row: 4 } });
  targets.forEach((target, index) => {
    state = setUnit(state, target.id, { position: { col: 3 + index, row: 5 }, hp: 1 });
  });
  return { state: initKnowledgeForOwners(toBattleState(state, "P1", caster.id)), casterId: caster.id };
}

for (const viewer of ["P1", "P2"] as PlayerId[]) {
  test(`${viewer}: AoE outcomes wait for every defender's roll, including a tie-break`, () => {
    // Attack 11; defender 1 ties 11 then loses the 1d6 tie-break; defenders 2 and 3 fail outright.
    const rng = makeRngSequence([
      die(5), die(6),
      die(5), die(6), die(2), die(1),
      die(1), die(1),
      die(1), die(2),
    ]);
    const { state, casterId } = setupAoE();
    let result = applyAction(
      state,
      { type: "useAbility", unitId: casterId, abilityId: "tricksterAoE", payload: { center: { col: 4, row: 4 } } },
      rng,
    );
    let visual: VisualResolutionState = createVisualResolutionState({
      batch: null,
      view: makePlayerView(state, viewer),
      enabled: true,
    });
    const playedBeforeLastRoll: PresentationEvent[] = [];
    let finalPlayed: PresentationEvent[] = [];
    let revision = 0;
    let rollsSeen = 0;
    const deliver = (current: typeof result) => {
      revision += 1;
      const events = projectEventsForRecipient(current.state, current.events, viewer).map(
        (event, index) => ({ ...event, eventId: `r${revision}-${index}` }),
      ) as PresentationEvent[];
      visual = advanceVisualResolution(visual, {
        batch: { streamId: "live", revision, events },
        view: makePlayerView(current.state, viewer),
        enabled: true,
      });
      return visual.visualBatch?.events ?? [];
    };
    deliver(result);
    while (result.state.pendingRoll) {
      const pending = result.state.pendingRoll;
      result = applyAction(
        result.state,
        { type: "resolvePendingRoll", pendingRollId: pending.id, player: pending.player },
        rng,
      );
      const played = deliver(result);
      rollsSeen += played.filter((event) => event.type === "rollResolved").length;
      if (result.state.pendingRoll) playedBeforeLastRoll.push(...played);
      else finalPlayed = played;
    }

    assert.ok(rollsSeen >= 5, "the dice of every defender (and the tie-break) are shown as they happen");
    assert.deepEqual(
      playedBeforeLastRoll.filter((event) => OUTCOME_TYPES.has(event.type)).map((event) => event.type),
      [],
      "no damage, death or AoE result may play while a defender still has to roll",
    );
    const outcomes = finalPlayed.filter((event) => event.type === "attackResolved");
    assert.equal(outcomes.length, 3, "all three outcomes play together after the last roll");
    assert.ok(finalPlayed.some((event) => event.type === "unitDied"));
  });
}
