import type { ApplyResult, GameState, PendingRoll } from "../../../../model";
import type { RNG } from "../../../../rng";
import { resolveAttack } from "../../../../combat";
import { clearPendingRoll } from "../../../../core";
import { maybeRequestIntimidate } from "../../../../actions/heroes/vlad";
import type { IntimidateResume } from "../../../../actions/types";
import { rollDice } from "../../../utils/rollMath";
import type { FalseTrailExplosionContext } from "./shared";
import { advanceFalseTrailExplosionQueue } from "./queue";

function updatePendingAoEFromFalseTrailAttack(
  state: GameState,
  attackerId: string,
  defenderId: string,
  events: ReturnType<typeof resolveAttack>["events"]
): GameState {
  const attackEvent = events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === attackerId &&
      e.defenderId === defenderId
  );
  if (!attackEvent || attackEvent.type !== "attackResolved" || !state.pendingAoE) {
    return state;
  }

  let nextPendingAoE = state.pendingAoE;
  if (attackEvent.damage > 0) {
    const damaged = nextPendingAoE.damagedUnitIds.includes(attackEvent.defenderId)
      ? nextPendingAoE.damagedUnitIds
      : [...nextPendingAoE.damagedUnitIds, attackEvent.defenderId];
    const damageByUnitId = {
      ...nextPendingAoE.damageByUnitId,
      [attackEvent.defenderId]: attackEvent.damage,
    };
    nextPendingAoE = {
      ...nextPendingAoE,
      damagedUnitIds: damaged,
      damageByUnitId,
    };
  }

  const revealedIds = events
    .filter((e) => e.type === "stealthRevealed")
    .map((e) => (e.type === "stealthRevealed" ? e.unitId : ""))
    .filter((id) => id.length > 0);
  if (revealedIds.length > 0) {
    const merged = Array.from(
      new Set([...nextPendingAoE.revealedUnitIds, ...revealedIds])
    );
    nextPendingAoE = { ...nextPendingAoE, revealedUnitIds: merged };
  }

  if (nextPendingAoE !== state.pendingAoE) {
    return { ...state, pendingAoE: nextPendingAoE };
  }
  return state;
}

export function resolveFalseTrailExplosionAttackerRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as FalseTrailExplosionContext;
  const caster = ctx.casterId ? state.units[ctx.casterId] : null;
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = rollDice(rng, 2);
  const nextCtx: FalseTrailExplosionContext = {
    ...ctx,
    attackerDice,
    currentTargetIndex: ctx.currentTargetIndex ?? 0,
  };

  return advanceFalseTrailExplosionQueue(state, nextCtx, []);
}

export function resolveFalseTrailExplosionDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as FalseTrailExplosionContext;
  const caster = ctx.casterId ? state.units[ctx.casterId] : null;
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = Array.isArray(ctx.attackerDice) ? ctx.attackerDice : [];
  if (attackerDice.length < 2) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const targets = Array.isArray(ctx.targetsQueue) ? ctx.targetsQueue : [];
  const idx = ctx.currentTargetIndex ?? 0;
  const targetId = targets[idx];
  if (!targetId) {
    return advanceFalseTrailExplosionQueue(
      clearPendingRoll(state),
      ctx,
      []
    );
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: FalseTrailExplosionContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
    };
    return advanceFalseTrailExplosionQueue(state, nextCtx, []);
  }

  const defenderDice = rollDice(rng, 2);
  const { nextState, events } = resolveAttack(state, {
    attackerId: caster.id,
    defenderId: targetId,
    ignoreRange: true,
    ignoreStealth: true,
    revealStealthedAllies: true,
    revealReason: "aoeHit",
    damageOverride: 1,
    ignoreBonuses: true,
    rolls: {
      attackerDice,
      defenderDice,
    },
  });

  let updatedState = updatePendingAoEFromFalseTrailAttack(
    nextState,
    caster.id,
    targetId,
    events
  );
  const updatedEvents = [...events];

  const nextCtx: FalseTrailExplosionContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };

  const intimidateResume: IntimidateResume = {
    kind: "falseTrailExplosion",
    context: nextCtx as unknown as Record<string, unknown>,
  };
  const intimidate = maybeRequestIntimidate(
    updatedState,
    caster.id,
    targetId,
    updatedEvents,
    intimidateResume
  );
  if (intimidate.requested) {
    return { state: intimidate.state, events: intimidate.events };
  }

  return advanceFalseTrailExplosionQueue(updatedState, nextCtx, updatedEvents);
}
