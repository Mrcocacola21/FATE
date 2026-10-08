import { getAbilityUseContext } from "../../core/abilityUse";
import { EVENT_VISIBILITY, intersectVisibility, movementVisibility } from "../../model/events/visibility";
import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PendingReactionMovement,
  PendingRoll,
  ReactionAttackOpportunity,
  ResolveRollChoice,
  UnitState,
} from "../../model";
import type { RNG } from "../../rng";
import { coordsEqual } from "../../board";
import { canAttackTarget } from "../../combat";
import { canDirectlyTargetUnit } from "../../visibility";
import { canSpendSlots, setTurnEconomy } from "../../turnEconomy";
import { makeEmptyTurnEconomy } from "../../model";
import {
  applyStakeTriggerIfAny,
  clearPendingRoll,
  evUnitMoved,
  makeAttackContext,
  requestRoll,
} from "../../core";
import { getRiverDropOptions } from "../heroes/riverPerson/options";
import { getMongolChargeInfluenceCells } from "../../movement/mongolCharge";
import { prepareAttackAttempt } from "../combatActions/prepareAttack";

function canReact(unit: UnitState): boolean {
  return (
    unit.isAlive &&
    unit.hp > 0 &&
    !!unit.position &&
    !unit.sansPendingDeath &&
    canSpendSlots(setTurnEconomy(unit, makeEmptyTurnEconomy()), { attack: true, action: true })
  );
}

function legalTargets(
  state: GameState,
  movement: PendingReactionMovement,
  reactorId: string,
): string[] {
  const reactor = state.units[reactorId];
  const controller = state.units[movement.controllerUnitId];
  if (!reactor || !controller || reactor.owner !== controller.owner || !canReact(reactor))
    return [];
  // The boat and its passenger share a transit cell. The boat is not a line
  // blocker between a touched ally and the enemy being carried on it.
  const atContact =
    movement.source === "tralala"
      ? { ...state, units: { ...state.units, [controller.id]: { ...controller, position: null } } }
      : state;
  return Object.values(state.units)
    .filter(
      (target) =>
        (!movement.targetUnitId || target.id === movement.targetUnitId) &&
        target.isAlive &&
        target.hp > 0 &&
        !target.sansPendingDeath &&
        canDirectlyTargetUnit(atContact, reactor.id, target.id) &&
        canAttackTarget(atContact, reactor, target),
    )
    .sort(
      (a, b) =>
        a.position!.row - b.position!.row ||
        a.position!.col - b.position!.col ||
        a.id.localeCompare(b.id),
    )
    .map((target) => target.id);
}

function reachedOpportunities(
  state: GameState,
  movement: PendingReactionMovement,
): ReactionAttackOpportunity[] {
  const cell = movement.path[movement.stepIndex]!;
  const controller = state.units[movement.controllerUnitId];
  // Compute only this reached slice of the established charge corridor.
  const corridor = getMongolChargeInfluenceCells(movement.path, state.boardSize, [cell]);
  return Object.values(state.units)
    .filter(
      (unit) =>
        unit.id !== controller.id &&
        unit.id !== movement.targetUnitId &&
        unit.owner === controller.owner &&
        unit.position &&
        canReact(unit) &&
        !movement.processedReactorIds.includes(unit.id) &&
        (movement.source === "tralala"
          ? Math.max(
              Math.abs(unit.position.col - cell.col),
              Math.abs(unit.position.row - cell.row),
            ) <= 1
          : corridor.some((candidate) => coordsEqual(candidate, unit.position!))),
    )
    .sort((a, b) =>
      movement.source === "genghis"
        ? a.id.localeCompare(b.id)
        : a.position!.row - b.position!.row ||
          a.position!.col - b.position!.col ||
          a.id.localeCompare(b.id),
    )
    .map((unit) => ({
      reactorUnitId: unit.id,
      targetUnitIds: legalTargets(state, movement, unit.id),
    }))
    .filter((opportunity) => opportunity.targetUnitIds.length > 0);
}

function moveUnit(state: GameState, unitId: string, to: Coord, events: GameEvent[], phase: "pickup" | "travel" | "drop" = "travel"): GameState {
  const unit = state.units[unitId];
  if (!unit?.isAlive || !unit.position || coordsEqual(unit.position, to)) return state;
  const movement = state.pendingReactionMovement;
  events.push(evUnitMoved(state, { unitId, from: unit.position, to,
    provenance: movement?.source === "tralala"
      ? { kind: "tralala", role: unitId === movement.controllerUnitId ? "carrier" : "passenger", phase, stepIndex: movement.stepIndex }
      : { kind: "rider" } }));
  return { ...state, units: { ...state.units, [unitId]: { ...unit, position: { ...to } } } };
}

function finishMovement(
  state: GameState,
  movement: PendingReactionMovement,
  events: GameEvent[],
  rng: RNG,
): ApplyResult {
  const target = movement.targetUnitId ? state.units[movement.targetUnitId] : undefined;
  if (
    movement.source === "tralala" &&
    target?.isAlive &&
    target.hp > 0 &&
    !target.sansPendingDeath
  ) {
    const cell = movement.path[movement.stepIndex]!;
    const options = getRiverDropOptions(state, cell, target.id);
    const drop = movement.dropDestination;
    if (!drop || !options.some((option) => coordsEqual(option, drop))) {
      if (options.length > 0) {
        const requested = requestRoll(
          state,
          state.units[movement.controllerUnitId].owner,
          "reactionDropChoice",
          { options, targetUnitId: target.id },
          movement.controllerUnitId,
        );
        return { state: requested.state, events: [...events, ...requested.events] };
      }
    } else {
      state = moveUnit(state, target.id, drop, events, "drop");
      // A completed drop is a landing, not another interrupted transit step.
      const landing = applyStakeTriggerIfAny(state, state.units[target.id], drop, rng, { entryKind: "landing" });
      state = landing.state;
      events.push(...landing.events);
      events.push({
        type: "riverTraLaLaResolved",
        [EVENT_VISIBILITY]: intersectVisibility(
          movementVisibility(state, movement.controllerUnitId, cell),
          movementVisibility(state, target.id, drop),
        ),
        riverId: movement.controllerUnitId,
        targetId: target.id,
        riverDestination: { ...cell },
        dropDestination: { ...drop },
        touchedAttackerIds: movement.touchedReactorIds,
      });
    }
  }
  appendReactionMovementEnded(state, movement, events, events.some(e => e.type === "riverTraLaLaResolved") ? "completed" : "cancelled");
  return { state: { ...state, pendingReactionMovement: null }, events };
}

export function appendReactionMovementEnded(state: GameState, movement: PendingReactionMovement, events: GameEvent[], reason: "completed" | "cancelled") {
  if (movement.source !== "tralala") return;
  const controller = state.units[movement.controllerUnitId];
  events.push({ type: "reactionMovementEnded", source: movement.source, controllerUnitId: movement.controllerUnitId, reason,
    ...getAbilityUseContext(movement),
    [EVENT_VISIBILITY]: { ...movementVisibility(state, movement.controllerUnitId, controller?.position ?? movement.path[movement.stepIndex]!),
      abilityRecipients: movement.abilitySourceRecipients ?? [] } });
}

/** Resume only after every roll, defense, post-hit choice and pre-death choice. */
export function continueReactionMovement(state: GameState, rng: RNG): ApplyResult {
  const events: GameEvent[] = [];
  if (
    !state.pendingReactionMovement ||
    state.pendingRoll ||
    state.pendingCombatQueue.length ||
    state.pendingAoE
  )
    return { state, events };
  while (state.pendingReactionMovement) {
    let movement = state.pendingReactionMovement;
    const controller = state.units[movement.controllerUnitId];
    const target = movement.targetUnitId ? state.units[movement.targetUnitId] : undefined;
    if (target && (!target.isAlive || target.hp <= 0 || target.sansPendingDeath)) {
      appendReactionMovementEnded(state, movement, events, "cancelled");
      return { state: { ...state, pendingReactionMovement: null }, events };
    }
    if (!controller?.isAlive || controller.hp <= 0 || controller.sansPendingDeath) {
      return finishMovement(state, movement, events, rng);
    }
    if (!movement.stepReached) {
      const cell = movement.path[movement.stepIndex]!;
      state = moveUnit(state, controller.id, cell, events);
      if (target) state = moveUnit(state, target.id, cell, events, movement.stepIndex === 0 ? "pickup" : "travel");
      let stopped = false;
      if (movement.stepIndex > 0) {
        for (const moverId of [controller.id, ...(target ? [target.id] : [])]) {
          const mover = state.units[moverId];
          // Transport shares one transit cell. The other carried body does not
          // suppress either mover's normal stake entry, even while hidden.
          const passenger = target
            ? state.units[moverId === controller.id ? target.id : controller.id]
            : undefined;
          const stakeState = passenger
            ? {
                ...state,
                units: { ...state.units, [passenger.id]: { ...passenger, position: null } },
              }
            : state;
          const triggered = applyStakeTriggerIfAny(stakeState, mover, cell, rng);
          if (triggered.triggered) {
            state = passenger
              ? {
                  ...triggered.state,
                  units: { ...triggered.state.units, [passenger.id]: passenger },
                }
              : triggered.state;
          }
          events.push(...triggered.events);
          if (triggered.triggered) {
            stopped = true;
            break;
          }
        }
      }
      movement = { ...movement, stepReached: true, stopped };
      state = { ...state, pendingReactionMovement: movement };
      if (Object.values(state.units).some((unit) => !!unit.sansPendingDeath))
        return { state, events };
      if (target && (!state.units[target.id].isAlive || state.units[target.id].hp <= 0)) {
        appendReactionMovementEnded(state, movement, events, "cancelled");
        return { state: { ...state, pendingReactionMovement: null }, events };
      }
      if (!state.units[controller.id].isAlive) return finishMovement(state, movement, events, rng);
      const opportunities = reachedOpportunities(state, movement);
      movement = {
        ...movement,
        reactionQueue: opportunities,
        processedReactorIds: [
          ...movement.processedReactorIds,
          ...opportunities.map((entry) => entry.reactorUnitId),
        ],
      };
      state = { ...state, pendingReactionMovement: movement };
    }
    const [first, ...rest] = movement.reactionQueue;
    if (first) {
      const targetUnitIds = legalTargets(state, movement, first.reactorUnitId).filter((id) =>
        first.targetUnitIds.includes(id),
      );
      if (targetUnitIds.length === 0) {
        state = { ...state, pendingReactionMovement: { ...movement, reactionQueue: rest } };
        continue;
      }
      movement = {
        ...movement,
        touchedReactorIds: [...movement.touchedReactorIds, first.reactorUnitId],
      };
      state = { ...state, pendingReactionMovement: movement };
      events.push({
        type: "reactionOpportunity",
        source: movement.source,
        reactorUnitId: first.reactorUnitId,
        targetUnitIds,
      });
      const requested = requestRoll(
        state,
        state.units[first.reactorUnitId].owner,
        "reactionChoice",
        {
          source: movement.source,
          reactorUnitId: first.reactorUnitId,
          targetUnitIds,
          options: targetUnitIds,
        },
        first.reactorUnitId,
      );
      return { state: requested.state, events: [...events, ...requested.events] };
    }
    if (movement.stopped || movement.stepIndex >= movement.path.length - 1)
      return finishMovement(state, movement, events, rng);
    if (
      movement.touchedReactorIds.length > 0 &&
      !events.some((event) => event.type === "reactionMovementResumed")
    ) {
      events.push({
        type: "reactionMovementResumed",
        source: movement.source,
        controllerUnitId: movement.controllerUnitId,
      });
    }
    state = {
      ...state,
      pendingReactionMovement: {
        ...movement,
        stepIndex: movement.stepIndex + 1,
        stepReached: false,
      },
    };
  }
  return { state, events };
}

export function resolveReactionChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
): ApplyResult {
  const movement = state.pendingReactionMovement;
  const opportunity = movement?.reactionQueue[0];
  if (
    !movement ||
    !opportunity ||
    pending.context.reactorUnitId !== opportunity.reactorUnitId ||
    !choice ||
    typeof choice !== "object" ||
    choice.type !== "resolveReactionChoice"
  )
    return { state, events: [] };
  const targets = legalTargets(state, movement, opportunity.reactorUnitId).filter((id) =>
    opportunity.targetUnitIds.includes(id),
  );
  const targetId = choice.targetId ?? (targets.length === 1 ? targets[0] : undefined);
  if (choice.choice === "attack" && (!targetId || !targets.includes(targetId)))
    return { state, events: [] };
  if (choice.choice !== "attack" && choice.choice !== "pass") return { state, events: [] };
  const next = clearPendingRoll({
    ...state,
    pendingReactionMovement: { ...movement, reactionQueue: movement.reactionQueue.slice(1) },
  });
  const events: GameEvent[] = [
    {
      type: "reactionChoiceResolved",
      source: movement.source,
      reactorUnitId: opportunity.reactorUnitId,
      choice: choice.choice,
      targetUnitId: choice.choice === "attack" ? targetId : undefined,
    },
  ];
  if (choice.choice === "pass") return { state: next, events };
  const prepared = prepareAttackAttempt(next, next.units[opportunity.reactorUnitId]);
  const requested = requestRoll(
    prepared.state,
    pending.player,
    "attack_attackerRoll",
    makeAttackContext({
      attackerId: opportunity.reactorUnitId,
      defenderId: targetId!,
      ...getAbilityUseContext(movement),
      consumeSlots: false,
      queueKind: "normal",
      ignoreRange: movement.source === "tralala",
      damageBonusSourceId: movement.source === "genghis" ? movement.controllerUnitId : undefined,
    }),
    opportunity.reactorUnitId,
  );
  return { state: requested.state, events: [...events, ...prepared.events, ...requested.events] };
}

export function resolveReactionDropChoice(
  state: GameState,
  choice: ResolveRollChoice | undefined,
  rng: RNG,
): ApplyResult {
  const movement = state.pendingReactionMovement;
  if (
    !movement?.targetUnitId ||
    !choice ||
    typeof choice !== "object" ||
    choice.type !== "reactionDropDestination" ||
    !getRiverDropOptions(state, movement.path[movement.stepIndex]!, movement.targetUnitId).some(
      (cell) => coordsEqual(cell, choice.position),
    )
  )
    return { state, events: [] };
  return finishMovement(
    clearPendingRoll(state),
    { ...movement, dropDestination: choice.position },
    [],
    rng,
  );
}
