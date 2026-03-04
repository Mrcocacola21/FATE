import type {
  ApplyResult,
  GameEvent,
  GameState,
  PendingRoll,
  ResolveRollChoice,
} from "../../../../model";
import type { RNG } from "../../../../rng";
import { coordsEqual } from "../../../../board";
import { revealUnit } from "../../../../stealth";
import { clearPendingRoll, applyStakeTriggerIfAny } from "../../../../core";
import { evIntimidateResolved } from "../../../../core";
import type {
  CarpetStrikeAoEContext,
  DoraAoEContext,
  ElCidAoEContext,
  ForestAoEContext,
  JebeHailOfArrowsAoEContext,
  TricksterAoEContext,
} from "../../../types";
import {
  advanceCombatQueue,
  continueJebeKhansShooter,
  requestElCidDuelistChoice,
} from "../../core/resolveAttackRoll";
import { advanceTricksterAoEQueue } from "../resolveTricksterRoll";
import { advanceDoraAoEQueue } from "../resolveDoraRoll";
import { advanceCarpetStrikeQueue } from "../resolveCarpetStrikeRoll";
import { advanceForestAoEQueue } from "../resolveForestRoll";
import { advanceElCidAoEQueue } from "../resolveElCidRoll";
import { advanceFalseTrailExplosionQueue } from "../resolveChikatiloRoll";
import { advanceJebeHailOfArrowsQueue } from "../resolveJebeRoll";
import { parseCoordChoice } from "./helpers";
import type { VladIntimidateContext } from "./types";

export function resolveVladIntimidateChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as VladIntimidateContext;
  const defenderId = ctx.defenderId;
  const attackerId = ctx.attackerId;
  if (!defenderId || !attackerId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const defender = state.units[defenderId];
  const attacker = state.units[attackerId];
  if (!defender || !attacker) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  const desired = parseCoordChoice(choice);
  const canPush = desired && options.some((opt) => coordsEqual(opt, desired));

  let updatedState: GameState = clearPendingRoll(state);
  let updatedAttacker = attacker;
  const events: GameEvent[] = [];

  if (canPush && attacker.position) {
    const from = attacker.position;
    const to = desired!;
    updatedAttacker = { ...attacker, position: { ...to } };
    updatedState = {
      ...updatedState,
      units: {
        ...updatedState.units,
        [updatedAttacker.id]: updatedAttacker,
      },
    };
    events.push(evIntimidateResolved({ attackerId, from, to }));

    if (updatedAttacker.isStealthed) {
      const revealed = revealUnit(
        updatedState,
        updatedAttacker.id,
        "forcedDisplacement",
        rng
      );
      updatedState = revealed.state;
      events.push(...revealed.events);
      updatedAttacker = updatedState.units[updatedAttacker.id] ?? updatedAttacker;
    }

    if (updatedAttacker.position) {
      const stakeResult = applyStakeTriggerIfAny(
        updatedState,
        updatedAttacker,
        updatedAttacker.position,
        rng
      );
      if (stakeResult.triggered) {
        updatedState = stakeResult.state;
        updatedAttacker = stakeResult.unit;
        events.push(...stakeResult.events);
      }
    }
  }

  const resume = ctx.resume ?? { kind: "none" };
  switch (resume.kind) {
    case "combatQueue":
      return advanceCombatQueue(updatedState, events);
    case "tricksterAoE":
      return advanceTricksterAoEQueue(
        updatedState,
        resume.context as unknown as TricksterAoEContext,
        events
      );
    case "doraAoE":
      return advanceDoraAoEQueue(
        updatedState,
        resume.context as unknown as DoraAoEContext,
        events
      );
    case "carpetStrike":
      return advanceCarpetStrikeQueue(
        updatedState,
        resume.context as unknown as CarpetStrikeAoEContext,
        events
      );
    case "forestAoE":
      return advanceForestAoEQueue(
        updatedState,
        resume.context as unknown as ForestAoEContext,
        events
      );
    case "elCidTisonaAoE":
      return advanceElCidAoEQueue(
        updatedState,
        resume.context as unknown as ElCidAoEContext,
        events,
        "elCidTisona_defenderRoll"
      );
    case "elCidKoladaAoE":
      return advanceElCidAoEQueue(
        updatedState,
        resume.context as unknown as ElCidAoEContext,
        events,
        "elCidKolada_defenderRoll"
      );
    case "falseTrailExplosion":
      return advanceFalseTrailExplosionQueue(
        updatedState,
        resume.context as any,
        events
      );
    case "jebeHailOfArrowsAoE":
      return advanceJebeHailOfArrowsQueue(
        updatedState,
        resume.context as unknown as JebeHailOfArrowsAoEContext,
        events
      );
    case "jebeKhansShooter":
      return continueJebeKhansShooter(updatedState, events, resume.context);
    case "elCidDuelist": {
      const duelCtx = resume.context as { attackerId?: string; targetId?: string };
      if (!duelCtx.attackerId || !duelCtx.targetId) {
        return { state: updatedState, events };
      }
      return requestElCidDuelistChoice(
        updatedState,
        events,
        duelCtx.attackerId,
        duelCtx.targetId
      );
    }
    default:
      return { state: updatedState, events };
  }
}
