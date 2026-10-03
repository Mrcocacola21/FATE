import { GLICKO2_CENTER, GLICKO2_OPTIONS, GLICKO2_SCALE } from "./constants";
import type { Glicko2OpponentResult, Glicko2Options, Glicko2Rating } from "./types";

export class Glicko2Error extends Error {
  readonly code = "RATING_CALCULATION_FAILED";
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Glicko2Error("Non-finite Glicko-2 computation");
  return value;
}

function positive(value: number): number {
  if (finite(value) <= 0) throw new Glicko2Error("Glicko-2 value must be positive");
  return value;
}

export function validateRating(state: Glicko2Rating): void {
  finite(state.rating);
  positive(state.ratingDeviation);
  positive(state.volatility);
}

/** Official revised Illinois iteration (Glickman, March 2022, step 5).
 * https://glicko.net/glicko/glicko2.pdf
 * Volatility is a root-finding problem; both bracketing and convergence are bounded. */
function updateVolatility(
  phi: number,
  sigma: number,
  variance: number,
  delta: number,
  options: Glicko2Options,
): number {
  const a = finite(2 * Math.log(sigma));
  const phiSquared = finite(phi * phi);
  const deltaSquared = finite(delta * delta);
  const tauSquared = positive(options.tau * options.tau);
  const f = (x: number): number => {
    const exp = positive(Math.exp(x));
    const denominator = positive(phiSquared + variance + exp);
    // Dividing separately avoids squaring a potentially large denominator.
    return finite(
      ((exp / denominator) * ((deltaSquared - phiSquared - variance - exp) / denominator)) / 2 -
        (x - a) / tauSquared,
    );
  };
  let A = a;
  let B: number;
  if (deltaSquared > phiSquared + variance) {
    B = finite(Math.log(deltaSquared - phiSquared - variance));
  } else {
    let k = 1;
    while (f(a - k * options.tau) < 0) {
      if (k >= options.maxIterations)
        throw new Glicko2Error("Volatility bracketing did not converge");
      k++;
    }
    B = finite(a - k * options.tau);
  }
  let fA = f(A),
    fB = f(B);
  let iterations = 0;
  while (Math.abs(B - A) > options.epsilon) {
    if (iterations++ >= options.maxIterations)
      throw new Glicko2Error("Volatility iteration did not converge");
    const C = finite(A + ((A - B) * fA) / (fB - fA));
    const fC = f(C);
    if (fC === 0 || fB === 0 || Math.sign(fC) !== Math.sign(fB)) {
      A = B;
      fA = fB;
    } else fA /= 2;
    B = C;
    fB = fC;
  }
  return positive(Math.exp(A / 2));
}

/** Pure rating-period update on external rating/RD; formulas operate on internal mu/phi.
 * FATE calls this with one opponent per completed rated match. An empty period is
 * supported mathematically, but FATE does not schedule time-based inactivity periods. */
export function calculateRating(
  state: Glicko2Rating,
  results: readonly Glicko2OpponentResult[],
  configuration: Partial<Glicko2Options> = {},
): Glicko2Rating {
  validateRating(state);
  const options = { ...GLICKO2_OPTIONS, ...configuration };
  positive(options.tau);
  positive(options.epsilon);
  if (!Number.isSafeInteger(options.maxIterations) || options.maxIterations < 1)
    throw new Glicko2Error("Invalid Glicko-2 iteration limit");
  const mu = finite((state.rating - GLICKO2_CENTER) / GLICKO2_SCALE);
  const phi = positive(state.ratingDeviation / GLICKO2_SCALE);
  let information = 0,
    improvement = 0;
  for (const { opponent, score } of results) {
    validateRating(opponent);
    if (score !== 0 && score !== 0.5 && score !== 1)
      throw new Glicko2Error("Invalid Glicko-2 score");
    const opponentMu = finite((opponent.rating - GLICKO2_CENTER) / GLICKO2_SCALE);
    const opponentPhi = positive(opponent.ratingDeviation / GLICKO2_SCALE);
    const g = positive(1 / Math.hypot(1, (Math.sqrt(3) * opponentPhi) / Math.PI));
    const x = finite(g * (mu - opponentMu));
    const exp = Math.exp(-Math.abs(x));
    const expected = x >= 0 ? 1 / (1 + exp) : exp / (1 + exp);
    // E(1-E) computed without subtractive cancellation when E is near one.
    information += (g * g * exp) / ((1 + exp) * (1 + exp));
    improvement += g * (score - expected);
  }
  const volatility = results.length
    ? updateVolatility(
        phi,
        state.volatility,
        positive(1 / positive(information)),
        finite(improvement / information),
        options,
      )
    : state.volatility;
  const phiStar = positive(Math.hypot(phi, volatility));
  const nextPhi = results.length
    ? positive(1 / Math.sqrt(1 / (phiStar * phiStar) + information))
    : phiStar;
  const next = {
    rating: finite(GLICKO2_CENTER + GLICKO2_SCALE * finite(mu + nextPhi * nextPhi * improvement)),
    ratingDeviation: positive(GLICKO2_SCALE * nextPhi),
    volatility,
  };
  validateRating(next);
  return next;
}
