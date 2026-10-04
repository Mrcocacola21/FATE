import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { RANK_ASSETS, getRankPresentation } from "./rankAssets";
import { en, uk, setLanguage, translate } from "../i18n";

test("all eight tiers resolve to the actual approved PNG files and localized labels", () => {
  const files = {
    SHADOW: "shadow.png",
    CRESCENT: "crescent.png",
    HALF: "half.png",
    FULL: "full.png",
    ECLIPSE: "eclipse.png",
    BLACK_MOON: "blackmoon.png",
    NOVA: "nova.png",
    DESTINY: "destiny.png",
  };
  assert.deepEqual(Object.keys(RANK_ASSETS).sort(), Object.keys(files).sort());
  for (const [tier, filename] of Object.entries(files)) {
    const entry = getRankPresentation(tier)!;
    assert.equal(entry.id, tier);
    assert.equal(new URL(entry.asset).pathname.split("/").pop(), filename);
    const png = fs.readFileSync(new URL(entry.asset));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    for (const language of ["en", "uk"] as const) {
      setLanguage(language, null);
      assert.notEqual(translate(entry.labelKey), entry.labelKey);
    }
  }
  assert.equal(en.ranks.blackMoon, "Black Moon");
  assert.equal(uk.ranks.blackMoon, "Чорний місяць");
  setLanguage("en", null);
});

test("missing, malformed, future and inherited names never resolve to a medal", () => {
  for (const rank of [
    null,
    undefined,
    "",
    "FUTURE",
    "eclipse",
    "__proto__",
    "constructor",
    1578,
    {},
  ]) {
    assert.equal(getRankPresentation(rank), null);
  }
});
