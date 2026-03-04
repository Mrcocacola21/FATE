import type {
  BunkerEnteredEvent,
  BunkerEnterFailedEvent,
  BunkerExitedEvent,
  Coord,
  MoveBlockedEvent,
  MoveMode,
  MoveOptionsGeneratedEvent,
  SearchStealthEvent,
  SearchStealthMode,
  StealthEnteredEvent,
  StealthRevealReason,
  StealthRevealedEvent,
} from "./types";

export function evStealthEntered(params: {
  unitId: string;
  success: boolean;
  roll?: number;
}): StealthEnteredEvent {
  if (params.roll === undefined) {
    return {
      type: "stealthEntered",
      unitId: params.unitId,
      success: params.success,
    };
  }
  return {
    type: "stealthEntered",
    unitId: params.unitId,
    success: params.success,
    roll: params.roll,
  };
}

export function evSearchStealth(params: {
  unitId: string;
  mode: SearchStealthMode;
  rolls: { targetId: string; roll: number; success: boolean }[];
}): SearchStealthEvent {
  return {
    type: "searchStealth",
    unitId: params.unitId,
    mode: params.mode,
    rolls: params.rolls,
  };
}

export function evStealthRevealed(params: {
  unitId: string;
  reason: StealthRevealReason;
  revealerId?: string;
}): StealthRevealedEvent {
  return {
    type: "stealthRevealed",
    unitId: params.unitId,
    reason: params.reason,
    revealerId: params.revealerId,
  };
}

export function evMoveOptionsGenerated(params: {
  unitId: string;
  roll: number | undefined;
  legalTo: Coord[];
  mode?: MoveMode;
  modes?: MoveMode[];
}): MoveOptionsGeneratedEvent {
  const event: MoveOptionsGeneratedEvent = {
    type: "moveOptionsGenerated",
    unitId: params.unitId,
    roll: params.roll,
    legalTo: params.legalTo,
  };
  if (params.mode !== undefined) {
    event.mode = params.mode;
  }
  if (params.modes !== undefined) {
    event.modes = params.modes;
  }
  return event;
}

export function evMoveBlocked(params: {
  unitId: string;
  reason: "noLegalDestinations";
}): MoveBlockedEvent {
  return {
    type: "moveBlocked",
    unitId: params.unitId,
    reason: params.reason,
  };
}

export function evBunkerEntered(params: {
  unitId: string;
  roll: number;
}): BunkerEnteredEvent {
  return {
    type: "bunkerEntered",
    unitId: params.unitId,
    roll: params.roll,
  };
}

export function evBunkerEnterFailed(params: {
  unitId: string;
  roll: number;
}): BunkerEnterFailedEvent {
  return {
    type: "bunkerEnterFailed",
    unitId: params.unitId,
    roll: params.roll,
  };
}

export function evBunkerExited(params: {
  unitId: string;
  reason: "timerExpired" | "attacked" | "transformed";
}): BunkerExitedEvent {
  return {
    type: "bunkerExited",
    unitId: params.unitId,
    reason: params.reason,
  };
}
