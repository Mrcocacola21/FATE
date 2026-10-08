import assert from "node:assert/strict";
import test from "node:test";
import type { DeliveredGameEvent, PlayerView } from "rules";
import type { BoardEventBatch, PresentationEvent } from "../../game/effects/types";
import {
  PresentationSession,
  MAX_PRESENTATION_AGE_MS,
} from "../../game/effects/presentationSession";
import { SfxPlaybackSession, MAX_AUDIO_CUE_LATENESS_MS } from "./sfxPlaybackSession";
import { SfxPlayer } from "./sfxPlayer";
import type { SoundCue } from "./sfxTypes";
import { audioFixture } from "./audioTestUtils";

const view = { units: {}, abilitiesByUnitId: {} } as PlayerView;
const roll: DeliveredGameEvent = {
  type: "rollResolved",
  eventId: "roll-1",
  rollId: "roll",
  rollKind: "attack_attackerRoll",
  rollerPlayerId: "P1",
  dice: [5],
  total: 5,
  sides: 6,
  rollIndex: 0,
};
function batch(event: PresentationEvent = roll, revision = 2): BoardEventBatch {
  return { streamId: "s", revision, events: [event] };
}
function spy() {
  const played: SoundCue[] = [];
  let stops = 0;
  const session = new SfxPlaybackSession({
    play: (cue) => {
      played.push(cue as SoundCue);
      return true;
    },
    stopGameplay: () => {
      stops++;
    },
    isMuted: () => false,
    getVolume: () => 1,
  });
  return { session, played, stops: () => stops };
}

test("defensive cue IDs ignore repeat/rerender while retaining distinct legitimate rolls/deaths", () => {
  const f = spy();
  f.session.schedule(batch(), view);
  f.session.schedule(batch(roll, 3), view);
  f.session.schedule(batch({ ...roll, eventId: "roll-2" }, 4), view);
  const death: PresentationEvent = {
    type: "unitDied",
    unitId: "sans",
    killerId: "attacker",
    eventId: "death-1",
  };
  f.session.schedule(batch(death, 5), view);
  f.session.schedule(batch(death, 6), view);
  assert.deepEqual(
    f.played.map((cue) => cue.key),
    ["common.combat.diceRoll", "common.combat.diceRoll", "common.combat.death"],
  );
});

test("muted and zero-volume scheduled cues are consumed; unmute never replays them", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const f = audioFixture();
  const player = new SfxPlayer(f.manager);
  await player.ensureAudioReady();
  await player.preload("common.combat.diceRoll");
  const session = new SfxPlaybackSession(player);
  player.setMuted(true);
  const mutedBatch = { ...batch(), eventSfxDelaysMs: [100] };
  session.schedule(mutedBatch, view);
  player.setMuted(false);
  session.schedule(mutedBatch, view);
  t.mock.timers.tick(101);
  assert.equal(f.sources.length, 0);
  player.setVolume(0);
  const quietBatch = batch({ ...roll, eventId: "quiet-roll" }, 3);
  session.schedule(quietBatch, view);
  player.setVolume(0.5);
  session.schedule(quietBatch, view);
  assert.equal(f.sources.length, 0);
  session.schedule(batch({ ...roll, eventId: "fresh-roll" }, 4), view);
  assert.equal(f.sources.length, 1);
  session.reset();
});

test("hydration baseline ignores history; next confirmed event plays once through existing ingress", () => {
  const f = spy();
  const ingress = new PresentationSession();
  const binding = { roomId: "room", recipient: "P1" };
  ingress.begin(binding);
  ingress.receive(
    { streamId: "s", revision: 7, events: [{ ...roll, eventId: "roll-1" }] },
    binding,
    view,
  );
  assert.deepEqual(ingress.snapshot({ ...binding, streamId: "s", revision: 7, view }), []);
  const live = { streamId: "s", revision: 8, events: [{ ...roll, eventId: "new-roll" }] };
  for (const accepted of ingress.receive(live, binding, view)) f.session.schedule(accepted, view);
  for (const accepted of ingress.receive(live, binding, view)) f.session.schedule(accepted, view);
  assert.equal(f.played.length, 1);
});

for (const reason of ["role", "stream", "room", "reconnect"] as const) {
  test(`${reason} reset cancels old delayed cues, stops active gameplay and retains buffers`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const f = audioFixture();
    const player = new SfxPlayer(f.manager);
    await player.ensureAudioReady();
    await player.preload("common.combat.diceRoll");
    const session = new SfxPlaybackSession(player);
    const ingress = new PresentationSession();
    const binding = { roomId: "room", recipient: "P1" };
    ingress.begin(binding);
    ingress.snapshot({ ...binding, streamId: "s", revision: 1, view });
    const [accepted] = ingress.receive(
      { streamId: "s", revision: 2, events: [roll] },
      binding,
      view,
    );
    session.schedule(accepted, view);
    session.schedule(
      { ...accepted, events: [{ ...roll, eventId: "later" }], eventSfxDelaysMs: [100] },
      view,
    );
    if (reason === "stream") ingress.snapshot({ ...binding, streamId: "s2", revision: 0, view });
    else
      ingress.begin({
        roomId: reason === "room" ? "room2" : "room",
        recipient: reason === "role" ? "spectator" : "P1",
      });
    assert(accepted.presentationToken!.cancelled);
    session.reset();
    t.mock.timers.tick(200);
    assert.equal(f.sources.length, 1);
    assert.equal(f.sources[0].stops, 1);
    await player.preload("common.combat.diceRoll");
    assert.equal(f.stats().decodes, 4);
  });
}

test("cancelled token drops timer before React reset; expired batches and suspended-tab timers drop", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const f = spy();
  const token = { cancelled: false };
  f.session.schedule({ ...batch(), presentationToken: token, eventSfxDelaysMs: [100] }, view);
  token.cancelled = true;
  t.mock.timers.tick(100);
  assert.equal(f.played.length, 0);
  f.session.schedule(
    {
      ...batch({ ...roll, eventId: "stale" }),
      receivedAt: Date.now() - MAX_PRESENTATION_AGE_MS - 1,
    },
    view,
  );
  assert.equal(f.played.length, 0);
  f.session.schedule(
    { ...batch({ ...roll, eventId: "suspended-tab" }), eventSfxDelaysMs: [100] },
    view,
  );
  t.mock.timers.setTime(Date.now() + MAX_PRESENTATION_AGE_MS + 101);
  t.mock.timers.tick(101);
  assert.equal(f.played.length, 0);
  f.session.reset();
});

test("local presentation previews and batches lacking live stream identity stay silent", () => {
  const f = spy();
  f.session.schedule({ ...batch(), previewId: "preview" }, view);
  f.session.schedule({ ...batch(), streamId: undefined }, view);
  assert.equal(f.played.length, 0);
});

test("500ms timer deadline drops throttled audio while fresh independent events still play", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const f = spy();
  f.session.schedule({ ...batch(), eventSfxDelaysMs: [100] }, view);
  t.mock.timers.setTime(Date.now() + MAX_AUDIO_CUE_LATENESS_MS + 101);
  t.mock.timers.tick(100);
  assert.equal(f.played.length, 0);
  f.session.schedule(batch({ ...roll, eventId: "new-after-resume" }, 3), view);
  assert.equal(f.played.length, 1);
  f.session.reset();
});

test("large scheduled bursts keep timer and cue identity budgets bounded and reset releases every timer", t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const f = spy();
  for (let revision = 1; revision <= 600; revision++) {
    f.session.schedule({ ...batch({ ...roll, eventId: `burst-${revision}` }, revision), eventSfxDelaysMs: [1000] }, view);
  }
  assert.deepEqual(f.session.diagnostics, { scheduledCues: 512, consumedCueIds: 512 });
  f.session.reset();
  assert.deepEqual(f.session.diagnostics, { scheduledCues: 0, consumedCueIds: 0 });
  t.mock.timers.tick(1001);
  assert.equal(f.played.length, 0);
});
