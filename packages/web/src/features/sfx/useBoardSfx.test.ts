import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PlayerView } from "rules";
import type { BoardEventBatch } from "../../game/effects/types";
import { useBoardSfx } from "./useBoardSfx";
import { sfxPlayer } from "./sfxPlayer";
import type { SoundCue } from "./sfxTypes";

const view = { units: {}, abilitiesByUnitId: {} } as PlayerView;
function batch(id: string, revision: number): BoardEventBatch {
  return {
    streamId: "stream",
    revision,
    events: [{ type: "unitDied", unitId: "target", killerId: null, eventId: id }],
  };
}
function Harness(props: { batch: BoardEventBatch | null; sessionKey?: string; enabled?: boolean }) {
  useBoardSfx({ view, sessionKey: "room", enabled: true, ...props });
  return null;
}

test("hook treats mount/hydration silently and consumes new batches once despite rerenders", (t) => {
  const played: SoundCue[] = [];
  t.mock.method(sfxPlayer, "play", (cue: SoundCue | string | undefined) => {
    played.push(cue as SoundCue);
    return true;
  });
  t.mock.method(sfxPlayer, "stopGameplay", () => undefined);
  let renderer: ReactTestRenderer | undefined;
  try {
    act(() => {
      renderer = create(createElement(Harness, { batch: batch("history", 7) }));
    });
    assert.equal(played.length, 0);
    const live = batch("fresh", 8);
    act(() => renderer!.update(createElement(Harness, { batch: live })));
    act(() => renderer!.update(createElement(Harness, { batch: { ...live } })));
    assert.equal(played.length, 1);
    act(() => renderer!.update(createElement(Harness, { batch: live, sessionKey: "reconnect" })));
    assert.equal(played.length, 1);
    act(() =>
      renderer!.update(
        createElement(Harness, { batch: batch("post-reconnect", 9), sessionKey: "reconnect" }),
      ),
    );
    assert.equal(played.length, 2);
  } finally {
    if (renderer) act(() => renderer!.unmount());
  }
});

test("hook clears pending timers on room/role reset, disable and unmount", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const played: SoundCue[] = [];
  let stops = 0;
  t.mock.method(sfxPlayer, "play", (cue: SoundCue | string | undefined) => {
    played.push(cue as SoundCue);
    return true;
  });
  t.mock.method(sfxPlayer, "stopGameplay", () => {
    stops++;
  });
  let renderer: ReactTestRenderer | undefined;
  const delayed = { ...batch("delayed", 8), eventSfxDelaysMs: [100] };
  try {
    act(() => {
      renderer = create(createElement(Harness, { batch: null }));
    });
    act(() => renderer!.update(createElement(Harness, { batch: delayed })));
    act(() => renderer!.update(createElement(Harness, { batch: null, sessionKey: "spectator" })));
    t.mock.timers.tick(200);
    assert.equal(played.length, 0);
    act(() =>
      renderer!.update(createElement(Harness, { batch: delayed, sessionKey: "spectator" })),
    );
    act(() =>
      renderer!.update(
        createElement(Harness, { batch: delayed, sessionKey: "spectator", enabled: false }),
      ),
    );
    t.mock.timers.tick(200);
    assert.equal(played.length, 0);
    act(() => renderer!.update(createElement(Harness, { batch: null, sessionKey: "live-again" })));
    act(() =>
      renderer!.update(createElement(Harness, { batch: delayed, sessionKey: "live-again" })),
    );
    act(() => renderer!.unmount());
    renderer = undefined;
    t.mock.timers.tick(200);
    assert.equal(played.length, 0);
    assert(stops >= 4);
  } finally {
    if (renderer) act(() => renderer!.unmount());
  }
});
