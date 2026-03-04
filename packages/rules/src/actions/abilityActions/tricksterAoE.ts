import type { ApplyResult, GameState, UnitState } from "../../model";
import type { RNG } from "../../rng";
import { resolveAoE } from "../../aoe";
import { TRICKSTER_AOE_RADIUS } from "../../abilities";
import { requestRoll, evAoeResolved } from "../../core";
import type { TricksterAoEContext } from "../types";

export function applyTricksterAoEAfterUse(
  state: GameState,
  unit: UnitState,
  center: { col: number; row: number },
  abilityId: string,
  rng: RNG
): ApplyResult {
  const res = resolveAoE(
    state,
    unit.id,
    center,
    {
      radius: TRICKSTER_AOE_RADIUS,
      shape: "chebyshev",
      revealHidden: false,
      targetFilter: (target, caster) => target.id !== caster.id,
      abilityId,
      emitEvent: false,
    },
    rng
  );

  const affectedUnitIds = res.affectedUnitIds.filter((id) => id !== unit.id);
  const revealedUnitIds: string[] = [];

  if (affectedUnitIds.length === 0) {
    return {
      state: res.nextState,
      events: [
        ...res.events,
        evAoeResolved({
          sourceUnitId: unit.id,
          abilityId,
          casterId: unit.id,
          center,
          radius: TRICKSTER_AOE_RADIUS,
          affectedUnitIds,
          revealedUnitIds,
          damagedUnitIds: [],
          damageByUnitId: {},
        }),
      ],
    };
  }

  const queuedState: GameState = {
    ...res.nextState,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: unit.id,
      abilityId,
      center,
      radius: TRICKSTER_AOE_RADIUS,
      affectedUnitIds,
      revealedUnitIds,
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const ctx: TricksterAoEContext = {
    casterId: unit.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };

  const requested = requestRoll(
    queuedState,
    unit.owner,
    "tricksterAoE_attackerRoll",
    ctx,
    unit.id
  );

  return {
    state: requested.state,
    events: [...res.events, ...requested.events],
  };
}
