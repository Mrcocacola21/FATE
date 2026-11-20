import assert from "node:assert/strict";
import test from "node:test";
import { MenuMusic, type MusicTrack } from "./menuMusic";

function fakeTrack(duration = 60): MusicTrack {
  return {
    src: "",
    volume: 1,
    currentTime: 0,
    duration,
    paused: true,
    loop: true,
    preload: "none",
    play() {
      this.paused = false;
    },
    pause() {
      this.paused = true;
    },
  };
}

function setup(duration = 60) {
  const tracks: MusicTrack[] = [];
  let tick: (() => void) | null = null;
  const music = new MenuMusic("theme.mp3", {
    createTrack: () => {
      const track = fakeTrack(duration);
      tracks.push(track);
      return track;
    },
    crossfadeSeconds: 4,
    musicGain: 0.5,
    tickMs: 100,
    setTimer: (fn) => {
      tick = fn;
      return 1;
    },
    clearTimer: () => {
      tick = null;
    },
  });
  const run = (ticks: number, advanceSeconds = 0) => {
    for (let i = 0; i < ticks; i++) {
      for (const track of tracks) if (!track.paused) track.currentTime += advanceSeconds;
      tick?.();
    }
  };
  return { music, tracks, run, ticking: () => tick !== null };
}

test("nothing plays until the player interacts with the page", () => {
  const { music, tracks } = setup();
  music.setLevel(false, 1);
  music.setWanted(true);
  assert(
    tracks.every((track) => track.paused),
    "browsers block audio before a gesture",
  );
  music.unlock();
  assert.equal(tracks[0].paused, false);
  assert.equal(tracks[0].loop, false, "looping is done by the crossfade, not the element");
});

test("menus fade the theme up to the music level, battles fade it out and stop it", () => {
  const { music, tracks, run, ticking } = setup();
  music.setLevel(false, 0.8);
  music.unlock();
  music.setWanted(true);
  run(20);
  assert.equal(tracks[0].volume, 0.8 * 0.5, "music sits under interface sounds");
  music.setWanted(false);
  run(3);
  assert(tracks[0].volume > 0 && tracks[0].volume < 0.4, "fades rather than cuts");
  run(10);
  assert.equal(tracks[0].volume, 0);
  assert(tracks.every((track) => track.paused));
  assert(!ticking(), "no timer runs while silent");
});

test("mute and volume follow the shared sound settings", () => {
  const { music, tracks, run } = setup();
  music.unlock();
  music.setWanted(true);
  music.setLevel(false, 1);
  run(20);
  music.setLevel(true, 1);
  assert.equal(tracks[0].volume, 0);
  music.setLevel(false, 0.4);
  assert.equal(tracks[0].volume, 0.4 * 0.5);
});

test("the ending fades into a fresh start instead of cutting", () => {
  const { music, tracks, run } = setup(30);
  music.setLevel(false, 1);
  music.unlock();
  music.setWanted(true);
  run(16);
  tracks[0].currentTime = 26.5;
  run(1, 0.1);
  assert.equal(tracks[1].paused, false, "the second player starts during the ending");
  assert.equal(tracks[1].currentTime, 0);
  run(20, 0.1);
  const mid = tracks[0].volume + tracks[1].volume;
  assert(tracks[0].volume > 0 && tracks[1].volume > 0, "both are heard during the overlap");
  assert(mid >= 0.5, "no dip in the middle of the crossfade");
  run(30, 0.1);
  assert.equal(tracks[0].paused, true, "the finished player stops");
  assert.equal(tracks[1].volume, 0.5);
});

test("a hidden tab pauses the theme and it resumes when the tab returns", () => {
  const { music, tracks, run } = setup();
  music.setLevel(false, 1);
  music.unlock();
  music.setWanted(true);
  run(5);
  music.setHidden(true);
  assert(tracks.every((track) => track.paused));
  music.setHidden(false);
  assert.equal(tracks[0].paused, false);
});
