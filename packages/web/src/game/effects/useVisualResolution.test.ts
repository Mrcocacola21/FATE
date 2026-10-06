import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PlayerView } from "rules";
import type { BoardEventBatch } from "./types";
import { useVisualResolution } from "./useVisualResolution";
import { PresentationSession } from "./presentationSession";

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
    const batches: BoardEventBatch[] = [120, 121, 122].map((value) => ({
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
    finishCurrentPlan();
    assert.equal(revision(), 121);
    finishCurrentPlan();
    assert.equal(revision(), 122);
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
