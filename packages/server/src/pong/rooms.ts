import { PongState, makeInitialState } from "./state";
import { tick, resetBall, PongInputs } from "./engine";
import { logPong, shouldLogTick } from "./logger";

export type PongBroadcast = (roomId: string, msg: any) => void;

export class PongRoom {
  id: string;
  state: PongState;
  inputs: PongInputs;
  logger: any;
  tickInterval: NodeJS.Timeout | null = null;
  broadcast: PongBroadcast;
  broadcastInterval: NodeJS.Timeout | null = null;
  lastBroadcastState: PongState | null = null;

  constructor(id: string, broadcast: PongBroadcast, logger?: any) {
    this.id = id;
    this.state = makeInitialState();
    this.inputs = { P1: "stop", P2: "stop" };
    this.broadcast = broadcast;
    this.logger = logger ?? console;
  }

  start() {
    if (this.tickInterval) return;
    // deterministic tick: 60Hz
    const dt = 1 / 60;
    this.state.phase = "playing";
    resetBall(this.state, "P2");
    let tickCounter = 0;
    this.tickInterval = setInterval(() => {
      try {
        tick(this.state, this.inputs, dt);
        tickCounter += 1;
        // throttled tick logging: once per 60 ticks (approx 1s)
        if (shouldLogTick() && tickCounter % 60 === 0) {
          logPong(this.logger, {
            tag: "pong:tick",
            roomId: this.id,
            tick: this.state.tick,
            ball: { x: this.state.ball.x, y: this.state.ball.y, vx: this.state.ball.vx, vy: this.state.ball.vy },
            paddles: { P1y: this.state.paddles.P1.y, P2y: this.state.paddles.P2.y },
            score: this.state.score,
          });
        }

        // handle scored state
        if (this.state.phase === "scored") {
          // determine out side
          const out = this.state.ball.x < 0 ? "left" : "right";
          const scorer = out === "left" ? "P2" : "P1";
          logPong(this.logger, { tag: "pong:score", roomId: this.id, scorer, score: this.state.score, out });
          // pause and reset after 0.8s
          this.state.phase = "paused" as any;
          setTimeout(() => {
            // serve towards the player who conceded (alternate behaviour)
            const serveTo = scorer === "P1" ? "P2" : "P1";
            resetBall(this.state, serveTo as any);
            this.state.phase = "playing";
            logPong(this.logger, { tag: "pong:start", roomId: this.id });
          }, 800);
        }
      } catch (e) {
        logPong(this.logger, { tag: "pong:error", roomId: this.id, code: "tick_error", message: String(e), err: e });
      }
    }, 1000 / 60);
    // broadcast 25 Hz
    this.broadcastInterval = setInterval(() => {
      this.broadcast(this.id, { type: "pongState", state: this.snapshot() });
    }, 1000 / 25);
  }

  stop() {
    if (this.tickInterval) clearInterval(this.tickInterval as any);
    this.tickInterval = null;
    if (this.broadcastInterval) clearInterval(this.broadcastInterval as any);
    this.broadcastInterval = null;
    this.state.phase = "idle";
  }

  setInput(player: "P1" | "P2", dir: "up" | "down" | "stop") {
    const prev = this.inputs[player];
    if (prev !== dir) {
      this.inputs[player] = dir;
      logPong(this.logger, { tag: "pong:input", roomId: this.id, player, dir });
    }
  }

  snapshot() {
    // shallow clone
    return {
      tick: this.state.tick,
      phase: this.state.phase,
      width: this.state.width,
      height: this.state.height,
      paddles: this.state.paddles,
      ball: this.state.ball,
      score: this.state.score,
    } as const;
  }

  serve(to: "P1" | "P2" | null = null) {
    resetBall(this.state, to);
    this.state.phase = "playing";
  }
}

const rooms = new Map<string, PongRoom>();

export function createPongRoom(id: string, broadcast: PongBroadcast, logger?: any) {
  if (rooms.has(id)) return rooms.get(id)!;
  const r = new PongRoom(id, broadcast, logger);
  rooms.set(id, r);
  return r;
}

export function getPongRoom(id: string) {
  return rooms.get(id) ?? null;
}

export function stopPongRoom(id: string) {
  const r = rooms.get(id);
  if (!r) return;
  r.stop();
  rooms.delete(id);
}
