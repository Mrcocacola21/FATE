import assert from 'node:assert/strict';
import { INITIAL_RATING } from '../../rating/constants';
import { calculateRating, Glicko2Error } from '../../rating/glicko2';
import type { Glicko2OpponentResult } from '../../rating/types';

export function officialExample() {
  return calculateRating(
    { rating: 1500, ratingDeviation: 200, volatility: 0.06 },
    [
      { opponent: { rating: 1400, ratingDeviation: 30, volatility: 0.06 }, score: 1 },
      { opponent: { rating: 1550, ratingDeviation: 100, volatility: 0.06 }, score: 0 },
      { opponent: { rating: 1700, ratingDeviation: 300, volatility: 0.06 }, score: 0 },
    ],
    { tau: 0.5 },
  );
}
const near = (actual: number, expected: number, tolerance: number) =>
  assert(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);

export function testGlicko2Calculations() {
  const reference = officialExample();
  // The publication rounds intermediate values; full precision differs by ~0.0093.
  near(reference.rating, 1464.06, 0.02);
  near(reference.ratingDeviation, 151.52, 0.005);
  near(reference.volatility, 0.05999, 0.00001);
  // Full-precision regression values catch using old/approximate volatility.
  near(reference.rating, 1464.0506705393013, 0.00000001);
  near(reference.ratingDeviation, 151.51652412385727, 0.00000001);
  near(reference.volatility, 0.059995984286488495, 0.000000000001);
  const original = structuredClone(INITIAL_RATING);
  const win = calculateRating(original, [{ opponent: original, score: 1 }]);
  const loss = calculateRating(original, [{ opponent: original, score: 0 }]);
  const draw = calculateRating(original, [{ opponent: original, score: 0.5 }]);
  assert(win.rating > 1500 && loss.rating < 1500);
  near(win.rating - 1500, 1500 - loss.rating, 1e-10);
  near(draw.rating, 1500, 1e-10);
  assert(
    win.ratingDeviation < original.ratingDeviation &&
      draw.ratingDeviation < original.ratingDeviation,
  );
  for (const after of [win, loss, draw, reference]) {
    assert(after.ratingDeviation > 0 && after.volatility > 0);
    assert(Object.values(after).every(Number.isFinite));
  }
  assert.deepEqual(original, INITIAL_RATING);
  const established = { ...original, ratingDeviation: 30 };
  const low = calculateRating(established, [{ opponent: original, score: 1 }]);
  assert(win.rating - original.rating > low.rating - established.rating);
  const upset = calculateRating(
    { ...established, rating: 1000 },
    Array.from({ length: 10 }, () => ({
      opponent: { ...established, rating: 2000 },
      score: 1 as const,
    })),
  );
  assert(upset.volatility > established.volatility, "large delta exercises alternate bracket");
  const empty = calculateRating(original, []);
  assert.equal(empty.rating, original.rating);
  assert.equal(empty.volatility, original.volatility);
  assert(empty.ratingDeviation > original.ratingDeviation);
  for (const key of ["rating", "ratingDeviation", "volatility"] as const) {
    for (const value of [NaN, Infinity, -Infinity, ...(key === "rating" ? [] : [0, -1])]) {
      const bad = { ...original, [key]: value };
      assert.throws(() => calculateRating(bad, []), Glicko2Error);
      assert.throws(() => calculateRating(original, [{ opponent: bad, score: 1 }]), Glicko2Error);
    }
  }
  for (const score of [-1, 0.1, 2, NaN, Infinity])
    assert.throws(
      () => calculateRating(original, [{ opponent: original, score } as Glicko2OpponentResult]),
      Glicko2Error,
    );
  for (const tau of [0, -1, NaN, Infinity])
    assert.throws(() => calculateRating(original, [], { tau }), Glicko2Error);
  for (const epsilon of [0, -1, NaN, Infinity])
    assert.throws(() => calculateRating(original, [], { epsilon }), Glicko2Error);
  for (const maxIterations of [0, -1, 1.5, Infinity])
    assert.throws(() => calculateRating(original, [], { maxIterations }), Glicko2Error);
  assert.throws(
    () => calculateRating(original, [{ opponent: original, score: 1 }], { maxIterations: 1 }),
    /did not converge/,
  );
  assert.throws(
    () =>
      calculateRating(original, [
        { opponent: { ...original, rating: Number.MAX_VALUE }, score: 1 },
      ]),
    Glicko2Error,
  );

  return reference;
}
