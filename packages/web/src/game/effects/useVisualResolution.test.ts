import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PlayerView } from "rules";
import type { BoardEventBatch } from "./types";
import { useVisualResolution } from "./useVisualResolution";
import { PresentationSession } from "./presentationSession";
import { useBoardEffects } from "./useBoardEffects";
import { useBoardVfx } from "../../features/vfx/useBoardVfx";
import { useBoardSfx } from "../../features/sfx/useBoardSfx";
import { sfxPlayer } from "../../features/sfx/sfxPlayer";
import type { SoundCue } from "../../features/sfx/sfxTypes";
import type { QueuedBoardVfxRequest } from "../../features/vfx/vfxTypes";
import type { QueuedBoardEffect } from "./types";
import { diceResultTiming } from "./diceResultTiming";
import { MAX_PRESENTATION_AGE_MS } from "./presentationSession";

test("sandbox replay retains a complete deferred attack, restores its HP baseline and repeats every sprite", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  let now = 0;
  t.mock.method(performance, "now", () => now);
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id: number) => frames.delete(id), setTimeout, clearTimeout,
  } });
  const cell = { col: 3, row: 4 };
  const before = { boardSize: 9, units: {
    target: { id: "target", owner: "P2", hp: 2, isAlive: true, position: cell },
  } } as unknown as PlayerView;
  const after = { ...before, units: { target: { ...before.units.target, hp: 0, isAlive: false, position: null } } };
  let output: ReturnType<typeof useVisualResolution>;
  let sprites: QueuedBoardVfxRequest[] = [];
  const captured: BoardEventBatch[] = [];
  const onReplayReady = (batch: BoardEventBatch) => captured.push(batch);
  let renderer: ReactTestRenderer | undefined;
  function Harness({ batches, view }: { batches: BoardEventBatch[]; view: PlayerView }) {
    output = useVisualResolution({ batch: null, batches, view, enabled: true, sessionKey: "sandbox", onReplayReady });
    sprites = useBoardVfx({ batch: output.batch, view, enabled: true, sessionKey: "sandbox" }).effects;
    return null;
  }
  const current = () => output;
  const update = (batches: BoardEventBatch[], view: PlayerView = after) => act(() => renderer!.update(createElement(Harness, { batches, view })));
  const finish = () => act(() => {
    now += 10000;
    t.mock.timers.tick(10000);
    const entry = frames.entries().next().value;
    assert.ok(entry);
    frames.delete(entry[0]);
    entry[1](now);
  });
  try {
    act(() => { renderer = create(createElement(Harness, { batches: [], view: before })); });
    update([{ streamId: "S", revision: 0, events: [{
      type: "rollResolved", eventId: "roll", rollId: "attack-roll", rollKind: "attack_attackerRoll",
      rollerPlayerId: "P1", rollIndex: 0, dice: [5, 4], sides: 6, total: 9,
    }] }], { ...before, pendingCombatQueueCount: 1 } as PlayerView);
    assert.equal(captured.length, 0, "manual dice must wait for the complete attack before enabling replay");
    update([], { ...before, pendingCombatQueueCount: 1 } as PlayerView);
    finish();
    update([{ streamId: "S", revision: 1, events: [{
      type: "attackResolved", eventId: "hit", chainId: "chain", deferVisuals: true,
      attackerId: "source", defenderId: "target", targetCell: cell,
      attackerRoll: { dice: [5, 4], sum: 9, isDouble: false },
      defenderRoll: { dice: [1, 2], sum: 3, isDouble: false },
      hit: true, damage: 2, previousHp: 2, nextHp: 0, defenderHpAfter: 0,
    }, { type: "unitDied", eventId: "death", chainId: "chain", deferVisuals: true,
      unitId: "target", killerId: null, deathCell: cell }] }]);
    assert.equal(captured.length, 0);
    update([{ streamId: "S", revision: 2, events: [{ type: "roundStarted", roundNumber: 1,
      eventId: "complete", chainId: "chain", isChainComplete: true }] }]);
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0].events.map(event => event.eventId), ["roll", "hit", "death"]);
    assert.equal(captured[0].replayStartingState?.hp.target, 2);
    const originalIds = new Set(sprites.map(sprite => sprite.id));
    assert.equal(originalIds.size, 2);
    update([]);
    finish();
    assert.equal(current().visualHpByUnitId.target, 0);
    for (let repeat = 0; repeat < 3; repeat++) {
      const replay = { ...captured[0], previewId: `preview:${repeat}`, receivedAt: Date.now() };
      update([replay]);
      assert.equal(current().visualHpByUnitId.target, 2, "replay must start before the fatal hit");
      assert.deepEqual(current().visualUnitsByUnitId.target.position, cell);
      assert.equal(sprites.length, 2, "hit and death sprites must both replay");
      assert(sprites.every(sprite => !originalIds.has(sprite.id)), "preview sprites need independent identities");
      sprites.forEach(sprite => originalIds.add(sprite.id));
      update([]);
      finish();
      assert.equal(current().visualHpByUnitId.target, 0);
      assert.equal(current().batch, null);
      assert.equal(captured.length, 1, "replaying must not replace the saved effect");
    }
    update([{ streamId: "S", revision: 3, events: [] }]);
    assert.equal(captured.length, 1, "debug settings must not erase the last visible effect");
  } finally {
    if (renderer) act(() => renderer!.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("dice queue preserves each readable result, drops stale/hidden work and resumes only fresh post-baseline rolls", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  let now = 0;
  t.mock.method(performance, "now", () => now);
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id: number) => frames.delete(id), setTimeout, clearTimeout,
  } });
  const view = { units: {}, pendingCombatQueueCount: 0 } as unknown as PlayerView;
  const binding = { roomId: "dice", recipient: "P1" };
  const session = new PresentationSession();
  session.begin(binding);
  session.snapshot({ ...binding, streamId: "S", revision: 0 });
  const roll = (id: string): import("rules").DeliveredGameEvent => ({
    type: "rollResolved", eventId: id, rollId: id, rollKind: "attack_attackerRoll",
    rollerPlayerId: "P1", rollIndex: 0, dice: [4, 5], sides: 6, total: 9,
  });
  const receive = (revision: number, id: string) => session.receive({ streamId: "S", revision, events: [roll(id)] }, binding, view);
  let output: ReturnType<typeof useVisualResolution>;
  function Harness({ batches, enabled = true }: { batches: BoardEventBatch[]; enabled?: boolean }) {
    output = useVisualResolution({ batch: null, batches, view, enabled, sessionKey: session.key });
    return null;
  }
  const current = () => output;
  let renderer: ReactTestRenderer | undefined;
  const update = (batches: BoardEventBatch[], enabled = true) => act(() => {
    renderer!.update(createElement(Harness, { batches, enabled }));
  });
  const advance = (ms: number) => act(() => {
    now += ms;
    t.mock.timers.tick(ms);
    const entry = frames.entries().next().value;
    assert.ok(entry);
    frames.delete(entry[0]);
    entry[1](now);
  });
  try {
    act(() => { renderer = create(createElement(Harness, { batches: [] })); });
    const accepted = [...receive(1, "first"), ...receive(2, "second"), ...receive(3, "second")];
    update(accepted);
    update([]);
    const timing = diceResultTiming();
    advance(timing.readableAtMs + timing.holdMs - 1);
    assert.equal(current().roll?.roll.rollId, "first");
    advance(1 + timing.exitMs);
    assert.equal(current().roll?.roll.rollId, "second");
    advance(timing.durationMs);
    assert.equal(current().roll, null, "duplicate delivery cannot replay the second card");
    update(receive(4, "hide-me"));
    assert.equal(current().roll?.roll.rollId, "hide-me");
    update([], false);
    t.mock.timers.tick(MAX_PRESENTATION_AGE_MS + 1);
    update(receive(5, "received-while-hidden"), false);
    update([]);
    assert.equal(current().roll, null);
    const stale = receive(6, "stale");
    t.mock.timers.tick(MAX_PRESENTATION_AGE_MS + 1);
    update(stale);
    assert.equal(current().roll, null, "an old queued result cannot burst after resuming");
    session.begin(binding);
    session.snapshot({ ...binding, streamId: "S", revision: 6 });
    update(receive(6, "stale"));
    assert.equal(current().roll, null);
    update(receive(7, "fresh"));
    assert.equal(current().roll?.roll.rollId, "fresh");
  } finally {
    if (renderer) act(() => renderer!.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("all ingress batches received before one React commit reach the ordered playback queue", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
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
  const view = { boardSize: 9, units: {}, pendingCombatQueueCount: 0 } as unknown as PlayerView;
  const consumed: BoardEventBatch[][] = [];
  const onBatchesConsumed = (batches: BoardEventBatch[]) => consumed.push(batches);
  let output: BoardEventBatch | null = null;
  let renderer: ReactTestRenderer | undefined;
  function Harness({ batches }: { batches: BoardEventBatch[] }) {
    output = useVisualResolution({
      batch: null,
      batches,
      onBatchesConsumed,
      view,
      enabled: true,
      sessionKey: "match",
    }).batch;
    return null;
  }
  const revision = () => (output as BoardEventBatch | null)?.revision;
  const finishCurrentPlan = () =>
    act(() => {
      const entry = frames.entries().next().value as [number, FrameRequestCallback];
      assert(entry);
      frames.delete(entry[0]);
      entry[1](performance.now() + 10000);
    });
  try {
    act(() => {
      renderer = create(createElement(Harness, { batches: [] }));
    });
    const batches: BoardEventBatch[] = Array.from({ length: 120 }, (_, index) => 120 + index).map((value) => ({
      streamId: "match",
      revision: value,
      view,
      events: [{ type: "roundStarted", roundNumber: value, eventId: `accepted-${value}` }],
    }));
    act(() => {
      renderer!.update(createElement(Harness, { batches }));
    });
    assert.equal(revision(), 120);
    assert.equal((output as BoardEventBatch | null)?.events[0].eventId, "accepted-120");
    assert.deepEqual(consumed, [batches]);
    // Acknowledge ingress while queued playback still owns every event.
    act(() => {
      renderer!.update(createElement(Harness, { batches: [] }));
    });
    for (let index = 1; index < batches.length; index++) {
      finishCurrentPlan();
      assert.equal(revision(), 120 + index);
      assert.equal((output as BoardEventBatch | null)?.events[0].eventId, `accepted-${120 + index}`);
    }
    finishCurrentPlan();
    assert.equal(output, null);
  } finally {
    if (renderer) act(() => renderer!.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("session reset clears deferred chains and ignores a cancelled animation callback", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
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
  const view = { boardSize: 9, units: {}, pendingCombatQueueCount: 0 } as unknown as PlayerView;
  const binding = { roomId: "room", recipient: "P1" };
  const session = new PresentationSession();
  session.begin(binding);
  session.snapshot({ ...binding, streamId: "S", revision: 499 });
  let output: BoardEventBatch | null = null;
  let renderer: ReactTestRenderer | undefined;
  function Harness({ batches, sessionKey }: { batches: BoardEventBatch[]; sessionKey: string }) {
    output = useVisualResolution({ batch: null, batches, view, enabled: true, sessionKey }).batch;
    return null;
  }
  try {
    act(() => {
      renderer = create(createElement(Harness, { batches: [], sessionKey: session.key }));
    });
    const deferred = session.receive(
      {
        streamId: "S",
        revision: 500,
        events: [
          {
            type: "roundStarted",
            roundNumber: 1,
            eventId: "private-A",
            chainId: "chain",
            deferVisuals: true,
          },
        ],
      },
      binding,
    );
    act(() => {
      renderer!.update(createElement(Harness, { batches: deferred, sessionKey: session.key }));
    });
    assert.equal(output, null);
    const immediate = session.receive(
      {
        streamId: "S",
        revision: 501,
        events: [
          {
            type: "roundStarted",
            roundNumber: 2,
            eventId: "B",
          },
        ],
      },
      binding,
    );
    act(() => {
      renderer!.update(createElement(Harness, { batches: immediate, sessionKey: session.key }));
    });
    assert.equal((output as BoardEventBatch | null)?.revision, 501);
    const lateFrame = frames.values().next().value!;
    const oldKey = session.key;
    const spectator = { ...binding, recipient: "spectator" };
    session.begin(spectator);
    session.snapshot({ ...spectator, streamId: "S", revision: 502 });
    act(() => {
      renderer!.update(createElement(Harness, { batches: [], sessionKey: session.key }));
    });
    assert.notEqual(session.key, oldKey);
    assert.equal(output, null);
    act(() => lateFrame(performance.now() + 10000));
    assert.equal(output, null);
    // A late completion cannot resurrect the previous recipient's buffered A.
    const complete = session.receive(
      {
        streamId: "S",
        revision: 503,
        events: [
          {
            type: "combatVisualBatchReady",
            chainId: "chain",
            visualBatchId: "chain",
            isChainComplete: true,
            deferVisuals: false,
            eventId: "completion",
          },
        ],
      },
      spectator,
    );
    act(() => {
      renderer!.update(createElement(Harness, { batches: complete, sessionKey: session.key }));
    });
    assert.equal(output, null);
  } finally {
    if (renderer) act(() => renderer!.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("room/role/stream reset cancels a real pending HP/death plan across every board consumer", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      },
      cancelAnimationFrame: (id: number) => frames.delete(id),
      setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
      clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
    },
  });
  const played: string[] = [];
  t.mock.method(sfxPlayer, "play", (cue: SoundCue | string | undefined) => {
    played.push((cue as SoundCue).key);
    return true;
  });
  t.mock.method(sfxPlayer, "stopGameplay", () => undefined);
  const cell = { col: 3, row: 4 };
  const before = {
    boardSize: 9,
    units: { target: { id: "target", owner: "P2", hp: 2, isAlive: true, position: cell } },
  } as unknown as PlayerView;
  const after = {
    ...before,
    units: { target: { ...before.units.target, hp: 0, isAlive: false, position: null } },
  };
  let output: ReturnType<typeof useVisualResolution>;
  let sprites: QueuedBoardVfxRequest[] = [];
  let text: QueuedBoardEffect[] = [];
  const current = () => output;
  function Harness({
    batches,
    sessionKey,
    view,
  }: {
    batches: BoardEventBatch[];
    sessionKey: string;
    view: PlayerView;
  }) {
    output = useVisualResolution({ batch: null, batches, sessionKey, view, enabled: true });
    sprites = useBoardVfx({ batch: output.batch, sessionKey, view, enabled: true }).effects;
    text = useBoardEffects({ batch: output.batch, sessionKey, view, enabled: true }).effects;
    useBoardSfx({ batch: output.batch, sessionKey, view, enabled: true });
    return null;
  }
  try {
    for (const change of ["room", "role", "stream"]) {
      let renderer: ReactTestRenderer | undefined;
      const token = { cancelled: false };
      const batch: BoardEventBatch = {
        streamId: "old",
        revision: 1,
        view: after,
        presentationToken: token,
        events: [
          {
            type: "attackResolved",
            eventId: `${change}-hit`,
            defenderId: "target",
            targetCell: cell,
            attackerRoll: { dice: [5, 4], sum: 9, isDouble: false },
            defenderRoll: { dice: [1, 2], sum: 3, isDouble: false },
            hit: true,
            damage: 2,
            previousHp: 2,
            nextHp: 0,
            defenderHpAfter: 0,
          },
          {
            type: "unitDied",
            eventId: `${change}-death`,
            unitId: "target",
            killerId: null,
            deathCell: cell,
          },
        ],
      };
      try {
        act(() => {
          renderer = create(
            createElement(Harness, { batches: [], sessionKey: "old", view: before }),
          );
        });
        act(() =>
          renderer!.update(
            createElement(Harness, { batches: [batch], sessionKey: "old", view: after }),
          ),
        );
        assert.equal(current().visualHpByUnitId.target, 2);
        assert.equal(sprites.length, 2);
        assert.ok(text.length > 0);
        const oldFrame = frames.values().next().value!;
        assert.ok(oldFrame);
        token.cancelled = true;
        act(() =>
          renderer!.update(
            createElement(Harness, { batches: [], sessionKey: change, view: before }),
          ),
        );
        assert.equal(current().batch, null);
        assert.equal(current().visualHpByUnitId.target, 2);
        assert.deepEqual(sprites, []);
        assert.deepEqual(text, []);
        t.mock.timers.tick(5000);
        act(() => oldFrame(performance.now() + 5000));
        assert.deepEqual(played, []);
        assert.equal(current().visualHpByUnitId.target, 2);
        assert.ok(current().visualUnitsByUnitId.target.position);
      } finally {
        if (renderer) act(() => renderer!.unmount());
      }
    }
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
