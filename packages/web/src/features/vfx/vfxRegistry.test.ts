import assert from "node:assert/strict";
import test from "node:test";
import { validateVfxRegistry, vfxRegistry } from "./vfxRegistry";

test("VFX registry metadata is complete for curated assets", () => {
  assert.deepEqual(validateVfxRegistry(), []);
  assert.equal(vfxRegistry.portal.assetType, "proceduralPortal");
  assert.equal(vfxRegistry.markApply.frameWidth, 192);
  assert.equal(vfxRegistry.fireParade.sourcePack, "kenney_particle-pack");
});

test("runtime registry imports curated assets rather than raw vendor folders", () => {
  for (const definition of Object.values(vfxRegistry)) {
    if (!("asset" in definition)) continue;
    assert.ok(definition.asset.length > 0);
    assert.ok(!definition.asset.includes("/vendor/"));
    assert.ok(!definition.sourceFile.includes("480x480"));
  }
});
