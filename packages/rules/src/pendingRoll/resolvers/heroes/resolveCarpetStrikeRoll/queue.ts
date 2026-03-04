import type { ApplyResult, GameEvent, GameState } from "../../../../model";
import { clearPendingRoll, requestRoll } from "../../../../core";
import { ABILITY_BERSERK_AUTO_DEFENSE } from "../../../../abilities";
import { HERO_FEMTO_ID, HERO_PAPYRUS_ID } from "../../../../heroes";
import { hasMettatonBerserkerFeature } from "../../../../mettaton";
import type { CarpetStrikeAoEContext } from "../../../types";
import { finalizeCarpetStrikeAoE } from "./helpers";

export function advanceCarpetStrikeQueue(
  state: GameState,
  context: CarpetStrikeAoEContext,
  events: GameEvent[]
): ApplyResult {
  const baseState = clearPendingRoll(state);
  const targets = Array.isArray(context.targetsQueue)
    ? context.targetsQueue
    : [];
  let idx = context.currentTargetIndex ?? 0;

  while (idx < targets.length) {
    const targetId = targets[idx];
    const target = baseState.units[targetId];
    if (target && target.isAlive) {
      const nextCtx: CarpetStrikeAoEContext = {
        ...context,
        currentTargetIndex: idx,
      };
      const attackerDice = Array.isArray(nextCtx.attackerDice)
        ? nextCtx.attackerDice
        : [];
      const charges = target.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
      if (
        (target.class === "berserker" ||
          target.heroId === HERO_FEMTO_ID ||
          (target.heroId === HERO_PAPYRUS_ID &&
            target.papyrusUnbelieverActive) ||
          hasMettatonBerserkerFeature(target)) &&
        charges === 6 &&
        attackerDice.length >= 2
      ) {
        const requested = requestRoll(
          baseState,
          target.owner,
          "carpetStrike_berserkerDefenseChoice",
          nextCtx,
          target.id
        );
        return { state: requested.state, events: [...events, ...requested.events] };
      }
      const requested = requestRoll(
        baseState,
        target.owner,
        "carpetStrike_defenderRoll",
        nextCtx,
        target.id
      );
      return { state: requested.state, events: [...events, ...requested.events] };
    }
    idx += 1;
  }

  return finalizeCarpetStrikeAoE(baseState, events);
}
