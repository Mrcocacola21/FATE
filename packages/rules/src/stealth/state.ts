import type { StealthDurationState, UnitState } from "../model";

export const DEFAULT_MAX_OWN_TURN_STARTS_HIDDEN = 3;

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : null;
}

export function getStealthDurationState(unit: UnitState): StealthDurationState {
  const stored = unit.stealthDuration;
  const maxOwnTurnStartsHidden =
    nonNegativeInteger(stored?.maxOwnTurnStartsHidden) ?? DEFAULT_MAX_OWN_TURN_STARTS_HIDDEN;
  const storedOwnTurnStarts = nonNegativeInteger(stored?.ownTurnStartsWhileHidden);
  const legacyTurnsLeft = nonNegativeInteger(unit.stealthTurnsLeft);
  // A hidden legacy unit with zero remaining may be an affected Loki/granted
  // class that entered with a class-level zero. Prefer a fresh duration over
  // revealing early when the authoritative per-unit metadata is absent.
  const ownTurnStartsWhileHidden =
    storedOwnTurnStarts ??
    (legacyTurnsLeft === null || legacyTurnsLeft === 0
      ? 0
      : Math.max(0, maxOwnTurnStartsHidden - Math.min(maxOwnTurnStartsHidden, legacyTurnsLeft)));

  return {
    ownTurnStartsWhileHidden,
    maxOwnTurnStartsHidden,
    lastProcessedOwnTurnStart: nonNegativeInteger(stored?.lastProcessedOwnTurnStart) ?? undefined,
    kind: stored?.kind === "falseTrail" ? "falseTrail" : "normal",
  };
}

export function enterUnitStealth(
  unit: UnitState,
  options?: {
    kind?: StealthDurationState["kind"];
    maxOwnTurnStartsHidden?: number;
  },
): UnitState {
  const maxOwnTurnStartsHidden =
    nonNegativeInteger(options?.maxOwnTurnStartsHidden) ?? DEFAULT_MAX_OWN_TURN_STARTS_HIDDEN;

  return {
    ...unit,
    isStealthed: true,
    stealthTurnsLeft: maxOwnTurnStartsHidden,
    stealthDuration: {
      ownTurnStartsWhileHidden: 0,
      maxOwnTurnStartsHidden,
      kind: options?.kind === "falseTrail" ? "falseTrail" : "normal",
    },
  };
}

export function clearUnitStealth(unit: UnitState): UnitState {
  return {
    ...unit,
    isStealthed: false,
    stealthTurnsLeft: 0,
    stealthDuration: undefined,
  };
}
