import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PendingRoll,
  PlayerId,
  ResolveRollChoice,
} from "../../../model";
import { isInsideBoard } from "../../../model";
import type { RNG } from "../../../rng";
import { coordsEqual } from "../../../board";
import { resolveAoE } from "../../../aoe";
import { revealUnit } from "../../../stealth";
import { ABILITY_VLAD_FOREST } from "../../../abilities";
import { clearPendingRoll, requestRoll } from "../../utils/rollUtils";
import { applyStakeTriggerIfAny, getLegalStakePositions } from "../../utils/stakeUtils";
import {
  activateVladForest,
  requestVladStakesPlacement,
} from "../../heroes/vlad";
import type { IntimidateResume } from "../../types";
import { evAoeResolved, evIntimidateResolved, evStakesPlaced } from "../../utils/events";
import type {
  CarpetStrikeAoEContext,
  DoraAoEContext,
  ElCidAoEContext,
  ForestAoEContext,
  TricksterAoEContext,
} from "../types";
import { advanceCombatQueue, requestElCidDuelistChoice } from "./resolveAttackRoll";
import { advanceTricksterAoEQueue } from "./resolveTricksterRoll";
import { advanceDoraAoEQueue } from "./resolveDoraRoll";
import { advanceCarpetStrikeQueue } from "./resolveCarpetStrikeRoll";
import { advanceForestAoEQueue } from "./resolveForestRoll";
import { advanceElCidAoEQueue } from "./resolveElCidRoll";

export function resolveVladIntimidateChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as {
    defenderId?: string;
    attackerId?: string;
    options?: Coord[];
    resume?: IntimidateResume;
  };
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
  const desired =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type: string; to?: Coord }).to
      : undefined;
  const canPush =
    desired &&
    options.some((opt) => coordsEqual(opt, desired));

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

export function resolveVladPlaceStakes(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as {
    owner?: PlayerId;
    count?: number;
    reason?: "battleStart" | "turnStart";
    legalPositions?: Coord[];
    queue?: PlayerId[];
  };
  const owner = ctx.owner;
  if (!owner) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const request = choice as { type?: string; positions?: Coord[] } | undefined;
  if (!request || request.type !== "placeStakes") {
    return { state, events: [] };
  }

  const positions = Array.isArray(request.positions) ? request.positions : [];
  if (positions.length !== 3) {
    return { state, events: [] };
  }

  const legalPositions =
    Array.isArray(ctx.legalPositions) && ctx.legalPositions.length > 0
      ? ctx.legalPositions
      : getLegalStakePositions(state, owner);
  const legalSet = new Set(legalPositions.map((pos) => `${pos.col},${pos.row}`));

  const unique = new Set(positions.map((pos) => `${pos.col},${pos.row}`));
  if (unique.size !== positions.length) {
    return { state, events: [] };
  }

  for (const pos of positions) {
    if (!legalSet.has(`${pos.col},${pos.row}`)) {
      return { state, events: [] };
    }
  }

  const baseCounter = state.stakeCounter ?? 0;
  const created = positions.map((pos, index) => ({
    id: `stake-${owner}-${baseCounter + index + 1}`,
    owner,
    position: { ...pos },
    createdAt: baseCounter + index + 1,
    isRevealed: false,
  }));

  const nextState: GameState = {
    ...state,
    stakeMarkers: [...state.stakeMarkers, ...created],
    stakeCounter: baseCounter + created.length,
  };

  const events: GameEvent[] = [
    evStakesPlaced({
      owner,
      positions: positions.map((pos) => ({ ...pos })),
      hiddenFromOpponent: true,
    }),
  ];

  const cleared = clearPendingRoll(nextState);
  const queue = Array.isArray(ctx.queue) ? ctx.queue : [];
  if (queue.length > 0) {
    const [nextOwner, ...rest] = queue;
    const requested = requestVladStakesPlacement(
      cleared,
      nextOwner,
      ctx.reason ?? "battleStart",
      rest
    );
    return { state: requested.state, events: [...events, ...requested.events] };
  }

  return { state: cleared, events };
}

export function resolveVladForestChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as {
    unitId?: string;
    owner?: PlayerId;
    canPlaceStakes?: boolean;
  };
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
  const ctx = pending.context as {
    unitId?: string;
    owner?: PlayerId;
  };
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
