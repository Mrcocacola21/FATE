import { PongState, makeInitialState, Ball, Paddle } from "./state";

export type InputDir = "up" | "down" | "stop";

export type PongInputs = { P1: InputDir; P2: InputDir };

const PADDLE_SPEED = 360; // units / s
const INIT_BALL_SPEED = 280; // units / s

export function resetBall(state: PongState, serveTo: "P1" | "P2" | null = null) {
  state.ball.x = state.width / 2;
  state.ball.y = state.height / 2;
  state.ball.r = 8;
  // choose random angle within +-30 deg toward receiving side
  const angleDeg = (Math.random() * 60 - 30) * (serveTo === "P1" ? -1 : 1);
  const ang = (angleDeg * Math.PI) / 180;
  const dir = serveTo === "P1" ? -1 : 1;
  state.ball.vx = INIT_BALL_SPEED * Math.cos(ang) * dir;
  state.ball.vy = INIT_BALL_SPEED * Math.sin(ang);
}

export function tick(state: PongState, inputs: PongInputs, dt: number) {
  state.tick += 1;

  // Move paddles
  for (const side of ["P1", "P2"] as ("P1" | "P2")[]) {
    const dir = inputs[side];
    const pad = state.paddles[side];
    if (dir === "up") {
      pad.y -= PADDLE_SPEED * dt;
    } else if (dir === "down") {
      pad.y += PADDLE_SPEED * dt;
    }
    // clamp
    const halfH = pad.h / 2;
    if (pad.y - halfH < 0) pad.y = halfH;
    if (pad.y + halfH > state.height) pad.y = state.height - halfH;
  }

  // Move ball
  state.ball.x += state.ball.vx * dt;
  state.ball.y += state.ball.vy * dt;

  // Top/bottom bounce
  if (state.ball.y - state.ball.r < 0) {
    state.ball.y = state.ball.r;
    state.ball.vy = -state.ball.vy;
  } else if (state.ball.y + state.ball.r > state.height) {
    state.ball.y = state.height - state.ball.r;
    state.ball.vy = -state.ball.vy;
  }

  // Paddle collisions
  // P1
  checkPaddleCollision(state, state.paddles.P1, -1);
  // P2
  checkPaddleCollision(state, state.paddles.P2, 1);

  // Score
  if (state.ball.x - state.ball.r < 0) {
    // P2 scores
    state.score.P2 += 1;
    state.phase = "scored";
    state.lastServeBy = "P1";
  } else if (state.ball.x + state.ball.r > state.width) {
    state.score.P1 += 1;
    state.phase = "scored";
    state.lastServeBy = "P2";
  }
}

function checkPaddleCollision(state: PongState, paddle: Paddle, side: number) {
  // side: -1 for P1 (left), +1 for P2 (right)
  const ball = state.ball;
  const halfW = paddle.w / 2;
  const halfH = paddle.h / 2;
  const paddleLeft = paddle.x - halfW;
  const paddleRight = paddle.x + halfW;
  const paddleTop = paddle.y - halfH;
  const paddleBottom = paddle.y + halfH;

  if (
    ball.x + ball.r * (side === -1 ? -1 : 1) * -1 <= paddleRight &&
    ball.x - ball.r <= paddleRight &&
    ball.x + ball.r >= paddleLeft &&
    ball.y >= paddleTop &&
    ball.y <= paddleBottom
  ) {
    // reflect X
    ball.vx = -ball.vx;
    // add spin based on hit position
    const offset = (ball.y - paddle.y) / halfH; // -1..1
    ball.vy += offset * 120; // tweak spin
    // nudge ball outside paddle
    if (side === -1) {
      ball.x = paddleRight + ball.r + 0.1;
    } else {
      ball.x = paddleLeft - ball.r - 0.1;
    }
    // slightly increase speed
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    const newSpeed = Math.min(speed * 1.02, 800);
    const normx = ball.vx / speed;
    const normy = ball.vy / speed;
    ball.vx = normx * newSpeed;
    ball.vy = normy * newSpeed;
  }
}
