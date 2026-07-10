import assert from "node:assert/strict";
import test from "node:test";
import { mapEventBatchToVfx } from "./vfxEventMapper";
import { visibleUnitPositions } from "./vfxGeometry";
import { vfxRegistry } from "./vfxRegistry";
import {
  createVfxPreviewView,
  previewScenarioById,
  VFX_PREVIEW_SCENARIOS,
} from "./vfxPreviewScenarios";

test("VFX preview scenarios cover every registered effect", () => {
  const covered = new Set(
    VFX_PREVIEW_SCENARIOS.flatMap((scenario) => scenario.expectedEffectIds),
  );

  assert.deepEqual(
    Object.keys(vfxRegistry)
      .filter((effectId) => !covered.has(effectId as keyof typeof vfxRegistry))
      .sort(),
    [],
  );
});

test("VFX preview scenarios use the real event mapper path", () => {
  const view = createVfxPreviewView();
  const previousPositions = visibleUnitPositions(view);

  for (const [index, scenario] of VFX_PREVIEW_SCENARIOS.entries()) {
    const effects = mapEventBatchToVfx({
      events: scenario.events,
      view,
      previousPositions,
      logIndex: index + 1,
    });
    const effectIds = new Set(effects.map((effect) => effect.effectId));

    for (const expected of scenario.expectedEffectIds) {
      assert.equal(
        effectIds.has(expected),
        true,
        `${scenario.id} should produce ${expected}`,
      );
    }
  }
});

test("VFX preview scenarios exercise cell, unit, area, line, and path geometry", () => {
  const view = createVfxPreviewView();
  const previousPositions = visibleUnitPositions(view);
  const placements = new Set<string>();

  VFX_PREVIEW_SCENARIOS.forEach((scenario, index) => {
    mapEventBatchToVfx({
      events: scenario.events,
      view,
      previousPositions,
      logIndex: index + 1,
    }).forEach((effect) => placements.add(effect.placement));
  });

  assert.deepEqual([...placements].sort(), ["area", "cell", "line", "path", "unit"]);
});

test("VFX preview lookup is stable for capture script ids", () => {
  assert.equal(previewScenarioById("search-reveal")?.label, "Search Reveal");
  assert.equal(previewScenarioById("shield")?.expectedEffectIds.includes("shield"), true);
  assert.equal(previewScenarioById("missing"), undefined);
});
