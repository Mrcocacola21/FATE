import assert from "node:assert/strict";
import test from "node:test";
import { createSfxResolver } from "./resolver";

test("hero resolver prefers an exact registered sound", () => {
  const resolve = createSfxResolver({
    heroes: {
      loki: {
        abilities: {
          lokiLaught: "/assets/loki-laugh.mp3",
        },
      },
    },
    common: {
      combat: {
        lokiLaught: "/assets/common-ability.mp3",
      },
    },
  });

  assert.equal(resolve("loki", "abilities", "lokiLaught"), "/assets/loki-laugh.mp3");
});

test("hero resolver falls back to the matching common category", () => {
  const resolve = createSfxResolver({
    heroes: {},
    common: {
      combat: {
        attack: "/assets/common-attack.wav",
      },
      movement: {
        move: "/assets/common-move.ogg",
      },
      status: {
        orangeBone: "/assets/common-status.mp3",
      },
    },
  });

  assert.equal(resolve("loki", "basic", "attack"), "/assets/common-attack.wav");
  assert.equal(resolve("loki", "basic", "move"), "/assets/common-move.ogg");
  assert.equal(resolve("papyrus", "statuses", "orangeBone"), "/assets/common-status.mp3");
});

test("missing optional SFX resolves to undefined", () => {
  const resolve = createSfxResolver({ heroes: {}, common: {} });
  assert.equal(resolve("jackRipper", "abilities", "jackRipperCoveringTracks"), undefined);
});
