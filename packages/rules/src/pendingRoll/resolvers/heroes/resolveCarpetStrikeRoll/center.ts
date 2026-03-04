import type { ApplyResult, GameEvent, GameState, PendingRoll } from "../../../../model";
import type { RNG } from "../../../../rng";
import { resolveAoE } from "../../../../aoe";
import { ABILITY_KAISER_CARPET_STRIKE } from "../../../../abilities";
import { clearPendingRoll, evCarpetStrikeAttackRolled, evCarpetStrikeCenter } from "../../../../core";
import { isKaiserTransformed, map2d9ToCoord, rollD9 } from "../../../../actions/shared";
import type { CarpetStrikeAoEContext } from "../../../types";
import { replacePendingRoll } from "../../../builders/buildPendingRoll";
import { rollDice, sumDice } from "../../../utils/rollMath";
import { advanceCarpetStrikeQueue } from "./queue";

export function resolveCarpetStrikeCenterRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const unitId = pending.context.unitId as string | undefined;
  if (!unitId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const caster = state.units[unitId];
  if (!caster || !caster.isAlive || !caster.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const d1 = rollD9(rng);
  const d2 = rollD9(rng);
  const center = map2d9ToCoord(state, d1, d2);

  const aoeRes = resolveAoE(
    state,
    caster.id,
    center,
    {
      radius: 2,
      shape: "chebyshev",
      revealHidden: true,
      abilityId: ABILITY_KAISER_CARPET_STRIKE,
      emitEvent: false,
    },
    rng
  );

  let affectedUnitIds = aoeRes.affectedUnitIds.filter((id) => {
    const unit = aoeRes.nextState.units[id];
    if (!unit || !unit.isAlive) return false;
    if (isKaiserTransformed(unit)) return false;
    if (unit.id === caster.id && caster.bunker?.active) return false;
    return true;
  });

  affectedUnitIds = [...affectedUnitIds].sort();

  const nextState: GameState = {
    ...aoeRes.nextState,
    pendingAoE: {
      casterId: caster.id,
      abilityId: ABILITY_KAISER_CARPET_STRIKE,
      center,
      radius: 2,
      affectedUnitIds,
      revealedUnitIds: aoeRes.revealedUnitIds,
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const events: GameEvent[] = [
    ...aoeRes.events,
    evCarpetStrikeCenter({
      unitId: caster.id,
      dice: [d1, d2],
      sum: d1 + d2,
      center,
      area: { shape: "square", radius: 2 },
    }),
  ];

  const ctx: CarpetStrikeAoEContext = {
    casterId: caster.id,
    center,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };

  const requested = replacePendingRoll(
    nextState,
    caster.owner,
    "kaiserCarpetStrikeAttack",
    ctx,
    caster.id
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}

export function resolveCarpetStrikeAttackRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as CarpetStrikeAoEContext;
  const caster = state.units[ctx.casterId];
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = rollDice(rng, 2);
  const sum = sumDice(attackerDice);
  const affectedUnitIds = Array.isArray(ctx.targetsQueue) ? ctx.targetsQueue : [];

  const events: GameEvent[] = [
    evCarpetStrikeAttackRolled({
      unitId: caster.id,
      dice: attackerDice,
      sum,
      center: ctx.center,
      affectedUnitIds,
    }),
  ];

  const nextCtx: CarpetStrikeAoEContext = {
    ...ctx,
    attackerDice,
    currentTargetIndex: ctx.currentTargetIndex ?? 0,
  };

  return advanceCarpetStrikeQueue(state, nextCtx, events);
}
