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
