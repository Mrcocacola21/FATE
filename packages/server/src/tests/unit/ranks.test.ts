import assert from "node:assert/strict";
import test from "node:test";
import { RATING_TIERS, getRatingTier, getRankProgress } from "../../rating/rankTiers";

test("rank boundaries use full precision, including values rounding across every tier", () => {
  const boundaries = [350, 700, 1100, 1600, 1750, 1850, 2000];
  for (const [index, boundary] of boundaries.entries()) {
    assert.equal(getRatingTier(boundary - 0.000001), RATING_TIERS[index].id);
    assert.equal(getRatingTier(boundary), RATING_TIERS[index + 1].id);
    assert.equal(getRatingTier(boundary + 0.000001), RATING_TIERS[index + 1].id);
    assert(getRankProgress(boundary - 0.000001).ratingToNext > 0);
  }
  assert.equal(getRankProgress(-100).progress, null);
  assert.equal(getRankProgress(-100).ratingToNext, 450);
  assert.equal(getRankProgress(2000).isMaxRank, true);
  assert.equal(getRankProgress(2000).nextTier, null);
});
