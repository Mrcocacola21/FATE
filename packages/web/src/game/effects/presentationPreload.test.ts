import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerView } from "rules";
import { AssetLoadQueue } from "../../assets/assetLoadQueue";
import { authorizedRoster, rosterVfx } from "./presentationPreload";
import { rosterSoundKeys, soundPreloadPriority } from "../../features/sfx/audioPreload";

test("load budget prioritizes waiting core jobs, handles failure, and caps the queue", async () => {
  const queue = new AssetLoadQueue(1, 3);
  const order: string[] = [];
  let release!: () => void;
  const active = queue.enqueue(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const low = queue.enqueue(async () => {
    order.push("low");
  }, "low");
  const high = queue.enqueue(async () => {
    order.push("core");
    throw new Error("optional failure");
  }, "high");
  const medium = queue.enqueue(async () => {
    order.push("roster");
  }, "medium");
  assert.equal(
    await queue.enqueue(async () => {
      throw new Error("overflow must not run");
    }),
    undefined,
  );
  assert.deepEqual(queue.diagnostics, { active: 1, pending: 3, concurrency: 1 });
  release();
  await Promise.all([active, low, high, medium]);
  assert.deepEqual(order, ["core", "roster", "low"]);
});

test("roster warmup uses projected assigned identities and ignores secret targets/hazard counts", () => {
  const view = {
    units: {},
    rosterUnits: {
      a: { heroId: "grand-kaiser" },
      b: { heroId: "sans" },
      c: { heroId: "jackRipper" },
    },
  } as unknown as PlayerView;
  assert.deepEqual(authorizedRoster(view), ["grand-kaiser", "jackRipper", "sans"]);
  const keys = rosterSoundKeys(authorizedRoster(view));
  assert(keys.length > 0);
  assert(keys.every(key => !key.includes(".transformations.")), "Rare forms remain lazy");
  assert(keys.every((key) => /^hero\.(grand-kaiser|sans|jackRipper)\./.test(key)));
  const effects = rosterVfx(authorizedRoster(view));
  for (const id of ["doraImpact", "carpetImpact", "gasterBeam", "jackCoverTracks"])
    assert(effects.includes(id as (typeof effects)[number]));
  for (const id of ["forestEruption", "fireball", "boat"])
    assert(!effects.includes(id as (typeof effects)[number]));
  assert.equal(soundPreloadPriority("hero.grand-kaiser.abilities.kaiserDora"), "high");
  const privateChanges = {
    ...view,
    pendingDecision: { secretTarget: "asgore" },
    snares: [{ position: { col: 1, row: 8 } }],
    units: { secret: { heroId: "riverPerson" } },
  } as unknown as PlayerView;
  assert.deepEqual(authorizedRoster(privateChanges), authorizedRoster(view));
});
