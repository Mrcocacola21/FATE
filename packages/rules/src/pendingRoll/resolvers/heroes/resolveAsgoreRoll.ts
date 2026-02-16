import type {
  ApplyResult,
  Coord,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../../model";
import type { RNG } from "../../../rng";
import { rollD6 } from "../../../rng";
import { getUnitAt } from "../../../board";
import { ABILITY_ASGORE_SOUL_PARADE } from "../../../abilities";
import { HERO_ASGORE_ID } from "../../../heroes";
import { clearPendingRoll, makeAttackContext, requestRoll } from "../../../core";
import { evUnitHealed, evUnitMoved } from "../../../core";
import {
  getAsgoreIntegrityDestinations,
  getAsgoreJusticeTargetIds,
  getAsgorePatienceTargetIds,
  getAsgorePerseveranceTargetIds,
} from "../../../actions/heroes/asgore";
import { getUnitBaseMaxHp } from "../../../actions/shared";
import type {
  AsgoreSoulParadeIntegrityDestinationContext,
  AsgoreSoulParadeRollContext,
  AsgoreSoulParadeTargetChoiceContext,
} from "../../types";

function getAsgore(state: GameState, unitId: string): UnitState | null {
  const unit = state.units[unitId];
  if (
    !unit ||
    !unit.isAlive ||
    !unit.position ||
    unit.heroId !== HERO_ASGORE_ID
  ) {
    return null;
  }
  return unit;
}

function requestAsgoreAttack(
  state: GameState,
  asgore: UnitState,
  targetId: string
): ApplyResult {
  const requested = requestRoll(
    clearPendingRoll(state),
    asgore.owner,
    "attack_attackerRoll",
    makeAttackContext({
      attackerId: asgore.id,
      defenderId: targetId,
      ignoreRange: true,
      consumeSlots: false,
      queueKind: "normal",
    }),
    asgore.id
  );
  return requested;
}

function parseTargetChoice(
  choice: ResolveRollChoice | undefined,
  expectedType: string
): string | null {
  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; targetId?: string })
      : undefined;
  if (!payload || payload.type !== expectedType || !payload.targetId) {
    return null;
  }
  return payload.targetId;
}

export function resolveAsgoreSoulParadeRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AsgoreSoulParadeRollContext;
  const asgore = getAsgore(state, ctx.asgoreId);
  if (!asgore) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const outcome = rollD6(rng);

  if (outcome === 1) {
    const updatedAsgore: UnitState = {
      ...asgore,
      asgorePatienceStealthActive: true,
    };
    const stateAfterBuff: GameState = {
      ...state,
      units: {
        ...state.units,
        [updatedAsgore.id]: updatedAsgore,
      },
    };
    const options = getAsgorePatienceTargetIds(stateAfterBuff, updatedAsgore.id);
    if (options.length === 0) {
      return { state: clearPendingRoll(stateAfterBuff), events: [] };
    }
    return requestRoll(
      clearPendingRoll(stateAfterBuff),
      updatedAsgore.owner,
      "asgoreSoulParadePatienceTargetChoice",
      {
        asgoreId: updatedAsgore.id,
        options,
      } satisfies AsgoreSoulParadeTargetChoiceContext,
      updatedAsgore.id
    );
  }

  if (outcome === 2) {
    const updatedAsgore: UnitState = {
      ...asgore,
      asgoreBraveryAutoDefenseReady: true,
    };
    return {
      state: clearPendingRoll({
        ...state,
        units: {
          ...state.units,
          [updatedAsgore.id]: updatedAsgore,
        },
      }),
      events: [],
    };
  }

  if (outcome === 3) {
    const options = getAsgoreIntegrityDestinations(state, asgore.id);
    if (options.length === 0) {
      return { state: clearPendingRoll(state), events: [] };
    }
    return requestRoll(
      clearPendingRoll(state),
      asgore.owner,
      "asgoreSoulParadeIntegrityDestination",
      {
        asgoreId: asgore.id,
        options,
      } satisfies AsgoreSoulParadeIntegrityDestinationContext,
      asgore.id
    );
  }

  if (outcome === 4) {
    const options = getAsgorePerseveranceTargetIds(state, asgore.id);
    if (options.length === 0) {
      return { state: clearPendingRoll(state), events: [] };
    }
    return requestRoll(
      clearPendingRoll(state),
      asgore.owner,
      "asgoreSoulParadePerseveranceTargetChoice",
      {
        asgoreId: asgore.id,
        options,
      } satisfies AsgoreSoulParadeTargetChoiceContext,
      asgore.id
    );
  }

  if (outcome === 5) {
    const maxHp = getUnitBaseMaxHp(asgore);
    const hpAfter = Math.min(maxHp, asgore.hp + 2);
    const healedAmount = Math.max(0, hpAfter - asgore.hp);
    const updatedAsgore: UnitState = {
      ...asgore,
      hp: hpAfter,
    };
    return {
      state: clearPendingRoll({
        ...state,
        units: {
          ...state.units,
          [updatedAsgore.id]: updatedAsgore,
        },
      }),
      events:
        healedAmount > 0
          ? [
              evUnitHealed({
                unitId: updatedAsgore.id,
                amount: healedAmount,
                hpAfter,
                sourceAbilityId: ABILITY_ASGORE_SOUL_PARADE,
              }),
            ]
          : [],
    };
  }

  const options = getAsgoreJusticeTargetIds(state, asgore.id);
  if (options.length === 0) {
    return { state: clearPendingRoll(state), events: [] };
  }
  return requestRoll(
    clearPendingRoll(state),
    asgore.owner,
    "asgoreSoulParadeJusticeTargetChoice",
    {
      asgoreId: asgore.id,
      options,
    } satisfies AsgoreSoulParadeTargetChoiceContext,
    asgore.id
  );
}

export function resolveAsgoreSoulParadePatienceTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as AsgoreSoulParadeTargetChoiceContext;
  const asgore = getAsgore(state, ctx.asgoreId);
  if (!asgore) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const targetId = parseTargetChoice(choice, "asgoreSoulParadePatienceTarget");
  if (!targetId) {
    return { state, events: [] };
  }
  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(targetId)) {
    return { state, events: [] };
  }
  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  return requestAsgoreAttack(state, asgore, targetId);
}

export function resolveAsgoreSoulParadePerseveranceTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AsgoreSoulParadeTargetChoiceContext;
  const asgore = getAsgore(state, ctx.asgoreId);
  if (!asgore) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const targetId = parseTargetChoice(
    choice,
    "asgoreSoulParadePerseveranceTarget"
  );
  if (!targetId) {
    return { state, events: [] };
  }
  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(targetId)) {
    return { state, events: [] };
  }
  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const check = rollD6(rng);
  if (check >= 5) {
    return { state: clearPendingRoll(state), events: [] };
  }

  return {
    state: clearPendingRoll({
      ...state,
      units: {
        ...state.units,
        [target.id]: {
          ...target,
          movementDisabledNextTurn: true,
        },
      },
    }),
    events: [],
  };
}

export function resolveAsgoreSoulParadeJusticeTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as AsgoreSoulParadeTargetChoiceContext;
  const asgore = getAsgore(state, ctx.asgoreId);
  if (!asgore) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const targetId = parseTargetChoice(choice, "asgoreSoulParadeJusticeTarget");
  if (!targetId) {
    return { state, events: [] };
  }
  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(targetId)) {
    return { state, events: [] };
  }
  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  return requestAsgoreAttack(state, asgore, targetId);
}

export function resolveAsgoreSoulParadeIntegrityDestinationChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx =
    pending.context as unknown as AsgoreSoulParadeIntegrityDestinationContext;
  const asgore = getAsgore(state, ctx.asgoreId);
  if (!asgore || !asgore.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; position?: Coord })
      : undefined;
  if (
    !payload ||
    payload.type !== "asgoreSoulParadeIntegrityDestination" ||
    !payload.position
  ) {
    return { state, events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  const key = `${payload.position.col},${payload.position.row}`;
  if (!options.some((coord) => `${coord.col},${coord.row}` === key)) {
    return { state, events: [] };
  }
  if (getUnitAt(state, payload.position)) {
    return { state, events: [] };
  }

  const movedAsgore: UnitState = {
    ...asgore,
    position: { ...payload.position },
  };
  return {
    state: clearPendingRoll({
      ...state,
      units: {
        ...state.units,
        [movedAsgore.id]: movedAsgore,
      },
    }),
    events: [
      evUnitMoved({
        unitId: movedAsgore.id,
        from: { ...asgore.position },
        to: { ...movedAsgore.position! },
      }),
    ],
  };
}
