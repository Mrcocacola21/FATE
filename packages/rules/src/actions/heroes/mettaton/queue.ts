import type { ApplyResult, Coord, GameState, UnitState } from "../../../model";
import { evAoeResolved, requestRoll } from "../../../core";
import type { TricksterAoEContext } from "../../types";

export function requestMettatonQueuedAttacks(
  state: GameState,
  caster: UnitState,
  abilityId: string,
  center: Coord,
  affectedUnitIds: string[],
  options?: {
    allowFriendlyTarget?: boolean;
    damageOverride?: number;
    ignoreBonuses?: boolean;
  }
): ApplyResult {
  if (affectedUnitIds.length === 0) {
    return {
      state,
      events: [
        evAoeResolved({
          sourceUnitId: caster.id,
          abilityId,
          casterId: caster.id,
          center,
          radius: 0,
          affectedUnitIds: [],
          revealedUnitIds: [],
          damagedUnitIds: [],
          damageByUnitId: {},
        }),
      ],
    };
  }

  const queuedState: GameState = {
    ...state,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: caster.id,
      abilityId,
      center,
      radius: 0,
      affectedUnitIds,
      revealedUnitIds: [],
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const ctx: TricksterAoEContext = {
    casterId: caster.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
    allowFriendlyTarget: options?.allowFriendlyTarget ?? false,
    ignoreStealth: true,
    revealStealthedAllies: true,
    revealReason: "aoeHit",
    damageOverride: options?.damageOverride,
    ignoreBonuses: options?.ignoreBonuses,
  };

  const requested = requestRoll(
    queuedState,
    caster.owner,
    "tricksterAoE_attackerRoll",
    ctx,
    caster.id
  );
  return { state: requested.state, events: requested.events };
}
