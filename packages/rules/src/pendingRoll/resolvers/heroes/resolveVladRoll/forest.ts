import type {
  ApplyResult,
  Coord,
  GameState,
  PendingRoll,
  ResolveRollChoice,
} from "../../../../model";
import { isInsideBoard } from "../../../../model";
import type { RNG } from "../../../../rng";
import { resolveAoE } from "../../../../aoe";
import { ABILITY_VLAD_FOREST } from "../../../../abilities";
import { clearPendingRoll, requestRoll } from "../../../../core";
import { activateVladForest } from "../../../../actions/heroes/vlad";
import { evAoeResolved } from "../../../../core";
import type { ForestAoEContext } from "../../../types";
import type { VladForestChoiceContext, VladForestTargetContext } from "./types";

export function resolveVladForestChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as VladForestChoiceContext;
  const owner = ctx.owner;
  const unitId = ctx.unitId;
  if (!owner || !unitId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const selection = choice as "activate" | "skip" | undefined;
  const unit = state.units[unitId];
  if (!unit) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (selection === "activate") {
    const cleared = clearPendingRoll(state);
    const activated = activateVladForest(cleared, unitId, owner);
    if (activated.state === cleared && activated.events.length === 0) {
      return { state: cleared, events: [] };
    }
    return activated;
  }

  return { state: clearPendingRoll(state), events: [] };
}

export function resolveVladForestTarget(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as VladForestTargetContext;
  const unitId = ctx.unitId;
  const owner = ctx.owner;
  if (!unitId || !owner) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload = choice as { type?: string; center?: Coord } | undefined;
  if (!payload || payload.type !== "forestTarget") {
    return { state, events: [] };
  }

  const center = payload.center;
  if (!center || !isInsideBoard(center, state.boardSize)) {
    return { state, events: [] };
  }

  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const aoeRes = resolveAoE(
    state,
    unitId,
    center,
    {
      radius: 1,
      shape: "chebyshev",
      revealHidden: true,
      abilityId: ABILITY_VLAD_FOREST,
      emitEvent: false,
    },
    rng
  );

  const affectedUnitIds = aoeRes.affectedUnitIds;
  const revealedUnitIds = aoeRes.revealedUnitIds;

  if (affectedUnitIds.length === 0) {
    return {
      state: clearPendingRoll(aoeRes.nextState),
      events: [
        ...aoeRes.events,
        evAoeResolved({
          sourceUnitId: unitId,
          abilityId: ABILITY_VLAD_FOREST,
          casterId: unitId,
          center,
          radius: 1,
          affectedUnitIds,
          revealedUnitIds,
          damagedUnitIds: [],
          damageByUnitId: {},
        }),
      ],
    };
  }

  const queuedState: GameState = {
    ...aoeRes.nextState,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: unitId,
      abilityId: ABILITY_VLAD_FOREST,
      center,
      radius: 1,
      affectedUnitIds,
      revealedUnitIds,
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const nextCtx: ForestAoEContext = {
    casterId: unitId,
    center,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };

  const requested = requestRoll(
    clearPendingRoll(queuedState),
    owner,
    "vladForest_attackerRoll",
    nextCtx,
    unitId
  );

  return { state: requested.state, events: [...aoeRes.events, ...requested.events] };
}
