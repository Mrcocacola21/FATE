import assert from "node:assert/strict";
import test from "node:test";
import { createSfxResolver } from "./resolver";
import { getSoundDefinition, resolveSound, soundVariantIndex } from "./resolver";
import { SOUND_REGISTRY, type SoundKey } from "./registry";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

test("closed core registry uses existing WAV files and unknown keys safely resolve to silence", () => {
  for (const definition of Object.values(SOUND_REGISTRY)) {
    for (const url of definition.sources) assert(existsSync(fileURLToPath(url)), url);
  }
  assert.equal(getSoundDefinition("toString"), undefined);
  assert.equal(resolveSound("common.combat.hitt", "E1"), undefined);
  // @ts-expect-error Core playback keys are closed, including misspellings.
  const typo: SoundKey = "common.combat.hitt";
  assert.equal(resolveSound(typo, "E1"), undefined);
});

test("only an explicitly approved generic fallback can resolve a missing specialized key", () => {
  assert.equal(
    resolveSound("hero.loki.basic.impact", "E1", "common.combat.hit")?.key,
    "common.combat.hit",
  );
  assert.equal(resolveSound("hero.loki.unknown", "E1"), undefined);
  assert.equal(
    resolveSound("common.combat.miss", "E1", "common.combat.hit")?.key,
    "common.combat.miss",
  );
});

test("stable event/key hash selects variants without any RNG", () => {
  const previousRandom = Math.random;
  Math.random = () => {
    throw new Error("presentation must not need random draws");
  };
  try {
    const first = resolveSound("common.combat.hit", "stream:E42")!;
    for (let i = 0; i < 20; i++)
      assert.equal(resolveSound("common.combat.hit", "stream:E42")!.src, first.src);
    const variants = new Set(
      Array.from({ length: 40 }, (_, i) => resolveSound("common.combat.hit", `stream:E${i}`)!.src),
    );
    assert.equal(variants.size, 4);
    assert.equal(soundVariantIndex("E1", "common.combat.hit", 0), 0);
  } finally {
    Math.random = previousRandom;
  }
});
