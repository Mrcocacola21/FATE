import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { heroPresentationInventory } from "../../../scripts/hero-presentation-inventory";
import { heroAbilityCoverage } from "./heroAbilityCoverage";
import {
  REMAINING_AREAS,
  REMAINING_CASTS,
  REMAINING_HIT_ACCENTS,
} from "./remainingHeroPresentation";
import { SOUND_REGISTRY } from "../../assets/sfx/registry";
import { vfxRegistry, validateVfxRegistry } from "../../features/vfx/vfxRegistry";

test("canonical roster, unlocked forms and token abilities all have explicit coverage", () => {
  const inventory = heroPresentationInventory();
  assert.equal(
    inventory.length,
    30,
    "29 catalog heroes/forms plus runtime token; review roster changes",
  );
  for (const hero of inventory) {
    assert.ok(hero.abilities.length, hero.id);
    for (const { id, spec } of hero.abilities) {
      assert.ok(spec, `Missing canonical spec: ${hero.id}/${id}`);
      const coverage = heroAbilityCoverage(id);
      assert.ok(coverage, `Unclassified ability: ${hero.id}/${id}`);
      assert.ok(coverage.events && coverage.template && coverage.visibility && coverage.notes, id);
      if (spec.kind === "passive") assert.notEqual(coverage.template, "CAST", id);
    }
  }
  assert.equal(heroAbilityCoverage("futureUnregisteredHeroAbility"), undefined);
});

test("signature configs reference real validated assets; no missing files are guessed", () => {
  assert.deepEqual(validateVfxRegistry(), []);
  const effects = new Set(
    [...Object.values(REMAINING_CASTS), ...Object.values(REMAINING_AREAS)]
      .map((config) => config.vfx)
      .concat(Object.values(REMAINING_HIT_ACCENTS)),
  );
  for (const effect of effects) assert.ok(vfxRegistry[effect], effect);
  for (const signature of [...Object.values(REMAINING_CASTS), ...Object.values(REMAINING_AREAS)]) {
    if (!signature.sfx) continue;
    const sound = SOUND_REGISTRY[signature.sfx];
    assert.ok(sound, signature.sfx);
    for (const variant of sound.sources) assert.ok(existsSync(fileURLToPath(variant)), variant);
  }
  for (const definition of Object.values(vfxRegistry)) {
    for (const layer of definition.layers ?? [definition]) {
      if (layer.asset?.startsWith("file:")) {
        assert.ok(existsSync(fileURLToPath(layer.asset)), layer.asset);
        if (
          layer.asset.includes("/vfx/heroes/") &&
          layer.frameWidth &&
          layer.frameHeight &&
          layer.frames
        ) {
          const png = readFileSync(fileURLToPath(layer.asset));
          assert.equal(png.toString("ascii", 12, 16), "IHDR", layer.asset);
          assert.equal(
            png.readUInt32BE(16),
            layer.frameWidth * layer.frames,
            `${definition.id}: strip width`,
          );
          assert.equal(png.readUInt32BE(20), layer.frameHeight, `${definition.id}: strip height`);
        }
      }
    }
  }
});

test("maintained coverage document includes every actual hero/ability and explicit gaps", () => {
  const doc = readFileSync(
    new URL("../../assets/HERO_PRESENTATION_COVERAGE.md", import.meta.url),
    "utf8",
  );
  for (const hero of heroPresentationInventory())
    for (const ability of hero.abilities)
      assert.ok(doc.includes(`\`${hero.id}/${ability.id}\``), `${hero.id}/${ability.id}`);
  for (const classification of [
    "COMPLETE",
    "GENERIC_ONLY",
    "INTENTIONALLY_SILENT",
    "BLOCKED_BY_EVENT_DATA",
  ])
    assert.ok(doc.includes(classification));
});
