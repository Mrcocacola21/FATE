// packages/server/src/commandResult.ts

import type { GameEvent } from "rules";

export type CommandRejectedCode =
  | "BAD_REQUEST"
  | "INVALID_PAYLOAD"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "ROOM_NOT_FOUND"
  | "GAME_ENDED"
  | "NOT_SEATED"
  | "FORBIDDEN"
  | "PENDING_ROLL_REQUIRED"
  | "RULES_REJECTED";

export interface CommandAccepted {
  ok: true;
  stateChanged: boolean;
  events: GameEvent[];
  revision?: number;
  logIndex?: number;
}

export interface CommandRejected {
  ok: false;
  code: CommandRejectedCode | string;
  message?: string;
}

export type CommandResult = CommandAccepted | CommandRejected;

export function accepted(params: {
  stateChanged: boolean;
  events: GameEvent[];
  revision?: number;
  logIndex?: number;
}): CommandAccepted {
  return {
    ok: true,
    stateChanged: params.stateChanged,
    events: params.events,
    revision: params.revision,
    logIndex: params.logIndex,
  };
}

export function rejected(
  code: CommandRejectedCode | string,
  message?: string
): CommandRejected {
  return {
    ok: false,
    code,
    message,
  };
}
