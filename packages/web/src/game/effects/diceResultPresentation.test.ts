import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlayerView } from "rules";
import { setLanguage, translate } from "../../i18n";
import { CombatRollFeedback } from "./CombatRollFeedback";
import { buildCombatVisualPlaybackPlan, combatVisualPlaybackFrame } from "./combatPlayback";
import {
  DICE_RESULT_HOLD_MS,
  DICE_RESULT_PAIR_STAGGER_MS,
  diceResultTiming,
} from "./diceResultTiming";
import { mapEventBatchToSfx } from "../../features/sfx/sfxEventMapper";
import { setBattleUiMode } from "../../ui/battleUiPreference";
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
  // Classic copy names the roller by seat ("P2"); the minimal default uses the player name.
  setBattleUiMode("classic");
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
  setBattleUiMode("minimal");
});

for (const reducedMotion of [false, true]) {
  test(`${reducedMotion ? "reduced" : "normal"} motion: paired dice share a reveal and contact waits for the readable defense`, (t) => {
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
    // Long enough to read both results (playtest feedback), still well under two seconds.
    assert.ok(timing.holdMs >= 1000 && timing.durationMs <= 2000);
    const sample = () => combatVisualPlaybackFrame(p, Date.now());
    assert.equal(sample().roll?.roll.rollId, "a");
    t.mock.timers.tick(DICE_RESULT_PAIR_STAGGER_MS);
    assert.equal(sample().roll?.roll.rollId, "d");
    assert.equal(
      sample().roll?.pairedRoll?.rollId,
      "a",
      "both results survive even if RAF skipped the attack frame",
    );
    assert.equal(sample().roll?.outcome, undefined);
    const outcome = p.batch.combatCues!.find((cue) => cue.kind === "hit")!;
    assert.equal(outcome.atMs, DICE_RESULT_PAIR_STAGGER_MS + timing.durationMs);
    assert.ok(outcome.atMs < timing.durationMs * 2);
    const attack = p.queue.find((item) => item.type === "attack")!;
    assert.ok(attack.startsAtMs < outcome.atMs, "windup overlaps the dice hold");
    t.mock.timers.tick(outcome.atMs - Date.now() - 1);
    assert.equal(sample().roll?.outcome, undefined, "dice comparison cannot predict hit/block");
    t.mock.timers.tick(1);
    assert.equal(
      sample().roll?.outcome,
      "hit",
      "winner is highlighted only at authoritative contact",
    );
    const sounds = mapEventBatchToSfx({ ...p.batch, view });
    assert.deepEqual(
      sounds
        .filter((sound) => sound.key === "common.combat.diceRoll")
        .map((sound) => sound.delayMs),
      [0, DICE_RESULT_PAIR_STAGGER_MS],
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

test("area defenders keep individual readable holds while sharing the attack evidence", () => {
  const p = plan([
    roll("shared-attack"),
    roll("first-defense", true),
    roll("second-defense", true),
  ]);
  const cues = p.batch.combatCues!.filter((cue) => cue.kind === "roll");
  assert.equal(cues[1].atMs, DICE_RESULT_PAIR_STAGGER_MS);
  assert.equal(cues[2].atMs, cues[1].atMs + cues[1].durationMs);
  assert.equal(
    combatVisualPlaybackFrame(p, cues[2].atMs).roll?.pairedRoll?.rollId,
    "shared-attack",
  );
});
