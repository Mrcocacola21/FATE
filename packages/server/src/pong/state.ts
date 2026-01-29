export type PongPlayerRole = "P1" | "P2" | "spectator";

export type Vec2 = { x: number; y: number };

export type Paddle = {
  x: number; // center x
  y: number; // center y
  w: number;
  h: number;
};

export type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
};

export type PongPhase = "idle" | "playing" | "paused" | "scored";

export type PongState = {
  tick: number;
  phase: PongPhase;
  width: number;
  height: number;
  paddles: { P1: Paddle; P2: Paddle };
  ball: Ball;
  score: { P1: number; P2: number };
  lastServeBy: "P1" | "P2" | null;
};

export function makeInitialState(): PongState {
  const width = 800;
  const height = 450;
  const paddleW = 12;
  const paddleH = 90;
  const paddleYOffset = 20;
  return {
    tick: 0,
    phase: "idle",
    width,
    height,
    paddles: {
      P1: { x: paddleW / 2 + 10, y: height / 2, w: paddleW, h: paddleH },
      P2: { x: width - (paddleW / 2 + 10), y: height / 2, w: paddleW, h: paddleH },
    },
    ball: { x: width / 2, y: height / 2, vx: 0, vy: 0, r: 8 },
    score: { P1: 0, P2: 0 },
    lastServeBy: null,
  };
}
