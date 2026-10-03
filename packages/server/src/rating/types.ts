export interface Glicko2Rating {
  rating: number;
  ratingDeviation: number;
  volatility: number;
}

export interface Glicko2OpponentResult {
  opponent: Glicko2Rating;
  score: 0 | 0.5 | 1;
}

export interface Glicko2Options {
  tau: number;
  epsilon: number;
  maxIterations: number;
}
