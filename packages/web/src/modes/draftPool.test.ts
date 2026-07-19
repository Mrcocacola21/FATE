import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAFT_CLASSES,
  DRAFT_HERO_POOL,
  HERO_ARTEMIDA_ID,
  HERO_DON_KIHOTE_ID,
  HERO_DUOLINGO_ID,
  HERO_JACK_RIPPER_ID,
  HERO_KANEKI_ID,
  HERO_LUCHE_ID,
  HERO_ZORO_ID,
} from "rules";
import { groupDraftPoolByClass } from "./draftPool";

const STUB_HERO_IDS = [
  HERO_DUOLINGO_ID,
  HERO_LUCHE_ID,
  HERO_DON_KIHOTE_ID,
  HERO_KANEKI_ID,
  HERO_JACK_RIPPER_ID,
  HERO_ZORO_ID,
  HERO_ARTEMIDA_ID,
] as const;

test("Draft UI groups only the authoritative implemented draft pool", () => {
  const grouped = groupDraftPoolByClass(DRAFT_HERO_POOL);
  const visibleHeroIds = new Set(
    [...grouped.values()].flat().map((hero) => hero.heroId)
  );

  for (const heroId of STUB_HERO_IDS) {
    assert.equal(visibleHeroIds.has(heroId), false, `${heroId} must not render`);
  }
  for (const unitClass of DRAFT_CLASSES) {
    const heroes = grouped.get(unitClass) ?? [];
    assert.ok(heroes.length >= 3, `${unitClass} should remain safe for one ban`);
    assert.ok(
      heroes.every(
        (hero) => hero.implemented && hero.draftEnabled && !hero.isBase
      ),
      `${unitClass} should contain only eligible heroes`
    );
  }
});
