import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlayerView } from "rules";
import { setLanguage, translate } from "../../i18n";
import { CombatRollFeedback } from "./CombatRollFeedback";
import { buildCombatVisualPlaybackPlan, combatVisualPlaybackFrame } from "./combatPlayback";
import { DICE_RESULT_HOLD_MS, diceResultTiming } from "./diceResultTiming";
import { mapEventBatchToSfx } from "../../features/sfx/sfxEventMapper";
import type { PresentationEvent } from "./types";

const view = { boardSize: 9, units: {}, pendingCombatQueueCount: 0 } as unknown as PlayerView;
function roll(
  id: string,
  defense = false,
  dice = [4, 5],
): Extract<PresentationEvent, { type: "rollResolved" }> {
  return {
    type: "rollResolved",
    eventId: id,
    rollId: id,
    rollIndex: 0,
    rollKind: defense ? "attack_defenderRoll" : "attack_attackerRoll",
    rollerPlayerId: defense ? "P2" : "P1",
    dice,
    sides: 6,
    total: dice.reduce((sum, value) => sum + value, 0),
  };
}
function plan(events: PresentationEvent[], reducedMotion = false) {
  return buildCombatVisualPlaybackPlan({
    batch: { streamId: "dice", revision: 1, events },
    startingHpByUnitId: {},
    startingUnitsByUnitId: {},
    finalView: view,
    reducedMotion,
  });
}

test("attacker and defender get equally prominent authoritative dice, totals and localized context", () => {
  for (const language of ["en", "uk"] as const) {
    setLanguage(language, null);
    for (const defense of [false, true]) {
      const event = roll(defense ? "defender" : "attacker", defense, defense ? [2, 6] : [4, 5]);
      const cue = combatVisualPlaybackFrame(plan([event]), 0).roll!;
      const markup = renderToStaticMarkup(
        createElement(CombatRollFeedback, { cue, t: translate, playerId: event.rollerPlayerId }),
      );
      assert.equal((markup.match(/data-combat-die=/g) ?? []).length, 2);
      event.dice.forEach((value, index) => {
        assert.ok(markup.includes(`data-combat-die="${value}"`));
        assert.ok(
          markup.includes(translate("diceResult.die", { index: index + 1, sides: 6, value })),
        );
      });
      assert.ok(
        markup.includes(
          translate(defense ? "pending.context.defenseRoll" : "pending.context.attackRoll"),
        ),
      );
      assert.ok(markup.includes(translate("diceResult.yourRoll")));
      assert.ok(markup.includes(`${event.dice.join(" + ")} = ${event.total}`));
      assert.ok(markup.includes(`data-combat-total="${defense ? 8 : 9}"`));
      assert.match(markup, /role="status" aria-live="polite" aria-atomic="true"/);
      assert.doesNotMatch(markup, /role="dialog"|<button|HIT|BLOCKED|DODGED|SHIELD/);
      const observer = renderToStaticMarkup(
        createElement(CombatRollFeedback, { cue, t: translate }),
      );
      assert.ok(
        observer.includes(
          translate("diceResult.playerRoll", { player: event.rollerPlayerId }).replace(
            /'/g,
            "&#x27;",
          ),
        ),
      );
      assert.ok(!observer.includes(translate("diceResult.yourRoll")));
    }
  }
  setLanguage("en", null);
});

for (const reducedMotion of [false, true]) {
  test(`${reducedMotion ? "reduced" : "normal"} motion: each result has the full readable hold before ordered exit and outcome`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 0 });
    const events: PresentationEvent[] = [
      roll("a"),
      roll("d", true, [2, 6]),
      {
        type: "attackResolved",
        eventId: "outcome",
        attackerId: "a",
        defenderId: "d",
        attackerRoll: { dice: [4, 5], sum: 9, isDouble: false },
        defenderRoll: { dice: [2, 6], sum: 8, isDouble: false },
        hit: true,
        damage: 0,
        defenderHpAfter: 5,
      },
    ];
    const p = plan(events, reducedMotion);
    const timing = diceResultTiming(reducedMotion);
    assert.equal(timing.holdMs, DICE_RESULT_HOLD_MS);
    assert.ok(timing.holdMs >= 2500 && timing.holdMs <= 3000);
    const sample = () => combatVisualPlaybackFrame(p, Date.now());
    for (const id of ["a", "d"]) {
      assert.equal(sample().roll?.roll.rollId, id);
      t.mock.timers.tick(timing.readableAtMs);
      assert.equal(sample().roll?.roll.rollId, id);
      t.mock.timers.tick(DICE_RESULT_HOLD_MS - 1);
      assert.equal(sample().roll?.roll.rollId, id);
      assert.equal(sample().complete, false);
      t.mock.timers.tick(1);
      if (timing.exitMs) {
        assert.equal(sample().roll?.roll.rollId, id, "hold ends before exit, not before reveal");
        t.mock.timers.tick(timing.exitMs);
      }
    }
    assert.equal(sample().roll, null);
    const outcome = p.batch.combatCues!.find((cue) => cue.kind === "hit")!;
    assert.ok(outcome.atMs >= timing.durationMs * 2);
    const sounds = mapEventBatchToSfx({ ...p.batch, view });
    assert.deepEqual(
      sounds
        .filter((sound) => sound.key === "common.combat.diceRoll")
        .map((sound) => sound.delayMs),
      [0, timing.durationMs],
    );
    assert.equal(sounds.find((sound) => sound.key === "common.combat.hit")!.delayMs, outcome.atMs);
  });
}

test("1d6 tiebreaks and 2d9 area centers use exact counts, sides and values without six-sided pip art", () => {
  setLanguage("en", null);
  for (const defense of [false, true]) {
    const event = roll("tie", defense, [6]);
    const cue = combatVisualPlaybackFrame(plan([event]), 0).roll!;
    const markup = renderToStaticMarkup(createElement(CombatRollFeedback, { cue, t: translate }));
    assert.match(markup, /Tiebreaker Roll/);
    assert.match(markup, defense ? /Defense Roll/ : /Attack Roll/);
    assert.match(markup, />1d6</);
    assert.equal((markup.match(/data-combat-die=/g) ?? []).length, 1);
  }
  const area = {
    ...roll("center", false, [8, 9]),
    sides: 9,
    rollKind: "kaiserCarpetStrikeCenter" as const,
  };
  const cue = combatVisualPlaybackFrame(plan([area]), 0).roll!;
  const markup = renderToStaticMarkup(createElement(CombatRollFeedback, { cue, t: translate }));
  assert.match(markup, /Area Center Roll/);
  assert.match(markup, />2d9</);
  assert.match(markup, /8 \+ 9 = 17/);
  assert.match(markup, /data-combat-total="17"/);
  assert.doesNotMatch(markup, /pip|Tiebreaker/);
});

test("distinct equal-valued rolls retain separate consecutive cards, with no fabricated result from a redacted event", () => {
  const p = plan([roll("one"), { type: "eventRedacted", eventId: "hidden" }, roll("two")]);
  assert.equal(p.batch.combatCues!.length, 2);
  assert.equal(combatVisualPlaybackFrame(p, 0).roll?.roll.rollId, "one");
  assert.equal(
    combatVisualPlaybackFrame(p, diceResultTiming().durationMs).roll?.roll.rollId,
    "two",
  );
  assert.equal(combatVisualPlaybackFrame(p, p.durationMs).roll, null);
});
