import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlayerView } from "rules";
import { pairCombatRoll, type CombatRollCue } from "./combatExchange";
import { CombatRollFeedback } from "./CombatRollFeedback";
import { previousFor, useCombatExchange } from "./useCombatExchange";
import { useVisualResolution } from "./useVisualResolution";
import { translate } from "../../i18n";
import { diceResultTiming } from "./diceResultTiming";
import type { BoardEventBatch } from "./types";

function cue(id: string, defense = false, dice = [4, 5], chainId?: string): CombatRollCue {
  return {
    kind: "roll",
    id,
    atMs: 0,
    durationMs: diceResultTiming().durationMs,
    eventIndex: 0,
    roll: {
      type: "rollResolved",
      rollId: id,
      rollIndex: 0,
      rollKind: defense ? "attack_defenderRoll" : "attack_attackerRoll",
      rollerPlayerId: defense ? "P2" : "P1",
      unitId: defense ? "target" : "attacker",
      dice,
      sides: 6,
      total: dice.reduce((sum, die) => sum + die, 0),
      chainId,
    },
  };
}

test("one exchange shows both actual rolls; tiebreaks, chains and hidden evidence cannot reuse an unrelated result", () => {
  const attack = cue("attack");
  const defense = cue("defense", true, [2, 6]);
  const display = pairCombatRoll(attack, defense);
  const markup = renderToStaticMarkup(
    createElement(CombatRollFeedback, { cue: display, t: translate }),
  );
  assert.equal((markup.match(/data-combat-die=/g) ?? []).length, 4);
  assert.match(markup, /4 \+ 5 = 9/);
  assert.match(markup, /2 \+ 6 = 8/);
  assert.doesNotMatch(markup, /data-roll-winner/);
  assert.match(
    renderToStaticMarkup(
      createElement(CombatRollFeedback, { cue: { ...display, outcome: "miss" }, t: translate }),
    ),
    /data-roll-side="defense" data-roll-winner="true"/,
  );
  assert.equal(pairCombatRoll(attack, cue("tie-defense", true, [6])).pairedRoll, undefined);
  assert.equal(
    pairCombatRoll(cue("A", false, [4, 5], "A"), cue("B", true, [2, 6], "B")).pairedRoll,
    undefined,
  );
  const area = {
    ...attack,
    roll: { ...attack.roll, rollKind: "kaiserCarpetStrikeCenter" as const, sides: 9 },
  };
  assert.equal(pairCombatRoll(area, defense).pairedRoll, undefined);
  assert.equal(pairCombatRoll(null, defense).pairedRoll, undefined);
  const nextAttack = cue("next");
  assert.equal(pairCombatRoll(display, nextAttack).pairedRoll, undefined);
  const tieAttack = cue("tie-attack", false, [5]);
  assert.equal(
    pairCombatRoll(tieAttack, cue("tie-defense", true, [6])).pairedRoll?.rollId,
    "tie-attack",
  );
});

test("live split deliveries retain the attack during a slow manual response, prepare the visible actor, then sync winner and HP to contact", (t) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  let now = 0;
  t.mock.method(performance, "now", () => now);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      },
      cancelAnimationFrame: (id: number) => frames.delete(id),
      setTimeout,
      clearTimeout,
    },
  });
  const before = {
    boardSize: 9,
    units: {
      attacker: {
        id: "attacker",
        owner: "P1",
        class: "knight",
        hp: 6,
        isAlive: true,
        position: { col: 2, row: 1 },
      },
      target: {
        id: "target",
        owner: "P2",
        class: "spearman",
        hp: 5,
        isAlive: true,
        position: { col: 2, row: 2 },
      },
    },
    pendingRoll: null,
    pendingCombatQueueCount: 0,
  } as unknown as PlayerView;
  const waiting: PlayerView = {
    ...before,
    pendingDecision: {
      type: "pendingDecision",
      ownerPlayerId: "P2",
      viewerCanRespond: true,
      decisionType: "attack_defenderRoll",
    },
  };
  const after = {
    ...before,
    units: { ...before.units, target: { ...before.units.target, hp: 3 } },
  };
  let result: ReturnType<typeof useCombatExchange>;
  let playback: ReturnType<typeof useVisualResolution>;
  function Harness({
    batches,
    view = before,
    sessionKey = "match",
    enabled = true,
  }: {
    batches: BoardEventBatch[];
    view?: PlayerView;
    sessionKey?: string;
    enabled?: boolean;
  }) {
    playback = useVisualResolution({ batch: null, batches, view, sessionKey, enabled });
    result = useCombatExchange({
      cue: playback.roll,
      batch: playback.batch,
      view,
      sessionKey,
      enabled,
    });
    return null;
  }
  const current = () => ({ ...result, hp: playback.visualHpByUnitId.target });
  let renderer: ReactTestRenderer | undefined;
  const update = (props: Parameters<typeof Harness>[0]) =>
    act(() => renderer!.update(createElement(Harness, props)));
  const advance = (ms: number) =>
    act(() => {
      now += ms;
      const entry = frames.entries().next().value!;
      assert.ok(entry);
      frames.delete(entry[0]);
      entry[1](now);
    });
  const attackBatch: BoardEventBatch = {
    streamId: "live",
    revision: 1,
    events: [cue("attack").roll],
  };
  try {
    act(() => {
      renderer = create(createElement(Harness, { batches: [] }));
    });
    update({ batches: [attackBatch], view: waiting });
    assert.equal(current().preparingUnitId, "attacker");
    advance(5000);
    assert.equal(
      current().display?.roll.rollId,
      "attack",
      "result remains visible for a human response",
    );
    assert.equal(current().display?.persistent, true);
    const outcome = {
      type: "attackResolved" as const,
      eventId: "hit",
      attackerId: "attacker",
      defenderId: "target",
      sourceCell: before.units.attacker.position,
      targetCell: before.units.target.position,
      isBasicAttack: true,
      attackerRoll: { dice: [4, 5], sum: 9, isDouble: false },
      defenderRoll: { dice: [2, 6], sum: 8, isDouble: false },
      hit: true,
      damage: 2,
      previousHp: 5,
      nextHp: 3,
      defenderHpAfter: 3,
    };
    update({ batches: [], view: after });
    assert.equal(
      current().display?.roll.rollId,
      "attack",
      "the panel survives the snapshot/actionResult gap",
    );
    assert.equal(
      current().display?.pairedRoll,
      undefined,
      "a snapshot alone cannot invent the defense dice",
    );
    update({
      batches: [
        { streamId: "live", revision: 2, events: [cue("defense", true, [2, 6]).roll, outcome] },
      ],
      view: after,
    });
    assert.equal(current().display?.pairedRoll?.rollId, "attack");
    assert.equal(current().hp, 5);
    assert.equal(current().display?.outcome, undefined);
    advance(diceResultTiming().durationMs);
    assert.equal(current().display?.outcome, "hit");
    assert.equal(current().preparingUnitId, null);
    assert.equal(current().hp, 5, "HP waits for the impact pause");
    advance(1000);
    assert.equal(current().hp, 3);
    assert.equal(current().display, null);
    update({
      batches: [{ ...attackBatch, revision: 3, events: [cue("next").roll] }],
      view: waiting,
    });
    advance(5000);
    assert.equal(current().display?.roll.rollId, "next");
    update({ batches: [], view: waiting, sessionKey: "new-match" });
    assert.equal(current().display, null, "session reset clears even a held manual exchange");
    update({ batches: [{ ...attackBatch, revision: 4 }], view: waiting, sessionKey: "new-match" });
    assert.ok(current().display);
    update({ batches: [], view: waiting, sessionKey: "new-match", enabled: false });
    assert.equal(current().display, null);
    assert.equal(current().preparingUnitId, null);
  } finally {
    if (renderer) act(() => renderer!.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

function aoeCue(id: string, defense: boolean, dice: number[], unitId: string, chainId = "chain-aoe"): CombatRollCue {
  const base = cue(id, defense, dice, chainId);
  return {
    ...base,
    roll: {
      ...base.roll,
      rollKind: defense ? "tricksterAoE_defenderRoll" : "tricksterAoE_attackerRoll",
      unitId,
      abilityUseId: "use-aoe",
    },
  };
}

test("every defender of a shared-roll AoE shows the one attack roll, even after the first outcome", () => {
  const attack = aoeCue("aoe-attack", false, [5, 6], "attacker");
  const firstDefense = aoeCue("aoe-def-1", true, [3, 3], "target-1");
  const first = pairCombatRoll(previousFor(null, null, "match", firstDefense) ?? attack, firstDefense);
  assert.equal(first.pairedRoll?.rollId, "aoe-attack");
  const remembered = { key: "match", roll: attack.roll };
  for (const id of ["aoe-def-2", "aoe-def-3"]) {
    const defense = aoeCue(id, true, [2, 4], id);
    // The first outcome cleared the held exchange; the remembered shared attack still pairs.
    const display = pairCombatRoll(previousFor(null, remembered, "match", defense), defense);
    assert.equal(display.pairedRoll?.rollId, "aoe-attack", `${id} must show the shared attack roll`);
    const markup = renderToStaticMarkup(createElement(CombatRollFeedback, { cue: display, t: translate }));
    assert.match(markup, /5 \+ 6 = 11/);
    assert.doesNotMatch(markup, /combat-roll-feedback__waiting/);
  }
  const unrelated = aoeCue("other-def", true, [2, 4], "x", "chain-other");
  assert.equal(
    pairCombatRoll(previousFor(null, remembered, "match", unrelated), unrelated).pairedRoll,
    undefined,
    "a remembered attack never pairs with another chain",
  );
  assert.equal(previousFor(null, remembered, "new-match", unrelated), null, "session reset forgets it");
});

test("a shared-roll AoE tie-break shows both 1d6 dice under the tie-break title", () => {
  const attackDie = aoeCue("tb-attack", false, [2], "attacker");
  const defenseDie = aoeCue("tb-defense", true, [1], "target-1");
  const display = pairCombatRoll(attackDie, defenseDie);
  assert.equal(display.pairedRoll?.rollId, "tb-attack");
  const markup = renderToStaticMarkup(createElement(CombatRollFeedback, { cue: display, t: translate }));
  assert.equal((markup.match(/data-combat-die=/g) ?? []).length, 2);
  assert.match(markup, new RegExp(translate("diceResult.tieBreak")));
});
