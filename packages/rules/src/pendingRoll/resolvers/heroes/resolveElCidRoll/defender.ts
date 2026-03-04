import type { ApplyResult, GameEvent, GameState, PendingRoll, RollKind } from "../../../../model";
import type { RNG } from "../../../../rng";
import { resolveAttack } from "../../../../combat";
import { clearPendingRoll } from "../../../../core";
import { getPolkovodetsSource, maybeRequestIntimidate } from "../../../../actions/heroes/vlad";
import type { IntimidateResume } from "../../../../actions/types";
import type { ElCidAoEContext } from "../../../types";
import { rollDice } from "../../../utils/rollMath";
import { finalizeElCidAoE, maybeBuildPolkovodetsDamageEvent, updatePendingAoEFromAttack } from "./helpers";
import { advanceElCidAoEQueue } from "./queue";

type ElCidResumeKind = "elCidTisonaAoE" | "elCidKoladaAoE";

export function resolveElCidDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG,
  defenderRollKind: RollKind,
  resumeKind: ElCidResumeKind
): ApplyResult {
  const ctx = pending.context as unknown as ElCidAoEContext;
  const caster = state.units[ctx.casterId];
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
    return finalizeElCidAoE(clearPendingRoll(state), []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: ElCidAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
    };
    return advanceElCidAoEQueue(state, nextCtx, [], defenderRollKind);
  }

  const defenderDice = rollDice(rng, 2);
  const sourceId = getPolkovodetsSource(state, caster.id);
  const damageBonus = sourceId ? 1 : 0;
  const { nextState, events } = resolveAttack(state, {
    attackerId: caster.id,
    defenderId: targetId,
    ignoreRange: true,
    ignoreStealth: true,
    revealStealthedAllies: true,
    revealReason: "aoeHit",
    damageBonus,
    rolls: {
      attackerDice,
      defenderDice,
    },
  });

  let updatedState = updatePendingAoEFromAttack(
    nextState,
    events,
    caster.id,
    targetId
  );
  let updatedEvents: GameEvent[] = [...events];

  const damageEvent = maybeBuildPolkovodetsDamageEvent(
    events,
    caster.id,
    targetId,
    damageBonus,
    sourceId
  );
  if (damageEvent) {
    updatedEvents.push(damageEvent);
  }

  const nextCtx: ElCidAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };

  const intimidateResume: IntimidateResume = {
    kind: resumeKind,
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

  return advanceElCidAoEQueue(
    updatedState,
    nextCtx,
    updatedEvents,
    defenderRollKind
  );
}
