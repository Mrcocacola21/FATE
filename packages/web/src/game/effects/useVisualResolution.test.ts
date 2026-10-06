import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PlayerView } from "rules";
import type { BoardEventBatch } from "./types";
import { useVisualResolution } from "./useVisualResolution";

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
