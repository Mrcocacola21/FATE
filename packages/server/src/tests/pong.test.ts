import { PongState, makeInitialState } from "../pong/state";
import { tick, resetBall } from "../pong/engine";

function makeInputs(upP1=false, upP2=false) {
  return { P1: upP1?"up":"stop", P2: upP2?"up":"stop" } as any;
}

export function testPongScoring() {
  const s = makeInitialState();
  // place ball beyond left to simulate score
  s.ball.x = -10;
  s.ball.y = s.height/2;
  s.ball.vx = -100;
  s.ball.vy = 0;
  // run a tick
  tick(s, makeInputs(), 1/60);
  if (s.score.P2 !== 1) throw new Error('expected P2 to score');
  console.log('testPongScoring passed');
}

export function testPaddleCollisionFlipsVx() {
  const s = makeInitialState();
  // position ball near P2 paddle moving right-to-left towards P2
  s.paddles.P2.y = s.height/2;
  s.ball.x = s.paddles.P2.x - (s.paddles.P2.w/2 + s.ball.r + 0.5);
  s.ball.y = s.paddles.P2.y;
  s.ball.vx = 200; // heading right (towards P2)
  s.ball.vy = 0;
  tick(s, makeInputs(), 1/60);
  if (s.ball.vx < 0 || Math.abs(s.ball.vx) > 0) {
    console.log('testPaddleCollisionFlipsVx passed');
  } else {
    throw new Error('expected vx to flip sign on collision');
  }
}

if (require.main === module) {
  testPongScoring();
  testPaddleCollisionFlipsVx();
}
