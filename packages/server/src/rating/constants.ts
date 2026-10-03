import type { Glicko2Options, Glicko2Rating } from "./types";

export const INITIAL_RATING: Readonly<Glicko2Rating> = Object.freeze({
  rating: 1500,
  ratingDeviation: 350,
  volatility: 0.06,
});
export const GLICKO2_SCALE = 173.7178;
export const GLICKO2_CENTER = 1500;
export const GLICKO2_OPTIONS: Readonly<Glicko2Options> = Object.freeze({
  tau: 0.5,
  epsilon: 0.000001,
  maxIterations: 100,
});
export const RATING_TRANSACTION_ATTEMPTS = 5;
