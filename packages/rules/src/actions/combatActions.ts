import type { ApplyResult, GameAction, GameEvent, GameState, UnitState } from "../model";
import type { RNG } from "../rng";
import { rollD6 } from "../rng";
import { resolveAttack } from "../combat";
import { canSpendSlots, spendSlots } from "../turnEconomy";
import { clearPendingRoll, replacePendingRoll, requestRoll } from "../shared/rollUtils";
import { isKaiser } from "./shared";
import { HERO_FALSE_TRAIL_TOKEN_ID } from "../heroes";
import { exitBunkerForUnit } from "./heroes/kaiser";
import { getPolkovodetsSource } from "./heroes/vlad";
import type { AttackRollContext } from "./types";
import { makeAttackContext } from "../shared/combatCtx";
import { evAoeResolved, evDamageBonusApplied } from "../shared/events";

export { makeAttackContext };

export function applyAttack(
  state: GameState,
  action: Extract<GameAction, { type: "attack" }>,
  rng: RNG
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const attacker = state.units[action.attackerId];
  const defender = state.units[action.defenderId];
  if (!attacker || !defender) {
    return { state, events: [] };
  }
  if (attacker.heroId === HERO_FALSE_TRAIL_TOKEN_ID) {
    return { state, events: [] };
  }

  if (attacker.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  if (state.activeUnitId !== attacker.id) {
    return { state, events: [] };
  }

  // 🚫 Тратил слот атаки
  if (!canSpendSlots(attacker, { attack: true, action: true })) {
    return { state, events: [] };
  }

  let workingState = state;
  let workingAttacker = attacker;
  let preEvents: GameEvent[] = [];

  if (isKaiser(attacker) && attacker.bunker?.active) {
    const exited = exitBunkerForUnit(state, attacker, "attacked");
    workingState = exited.state;
    workingAttacker = exited.unit;
    preEvents = exited.events;
  }

  const auraSource = getPolkovodetsSource(workingState, workingAttacker.id);
  const context = makeAttackContext({
    attackerId: workingAttacker.id,
    defenderId: defender.id,
    damageBonusSourceId: auraSource ?? undefined,
    consumeSlots: true,
    queueKind: "normal",
  });

  const requested = requestRoll(
    workingState,
    workingAttacker.owner,
    "attack_attackerRoll",
    context,
    workingAttacker.id
  );

  return { state: requested.state, events: [...preEvents, ...requested.events] };
}

export function rollDice(rng: RNG, count: number): number[] {
  const rolls: number[] = [];
  for (let i = 0; i < count; i += 1) {
    rolls.push(rollD6(rng));
  }
  return rolls;
}

export function sumDice(dice: number[]): number {
  return dice.reduce((acc, v) => acc + v, 0);
}

export function finalizeAttackFromContext(
  state: GameState,
  context: AttackRollContext,
  useAutoDefense: boolean
): ApplyResult {
  const rolls = {
    attackerDice: context.attackerDice ?? [],
    defenderDice: context.defenderDice ?? [],
    tieBreakAttacker: context.tieBreakAttacker ?? [],
    tieBreakDefender: context.tieBreakDefender ?? [],
  };

  const sourceId =
    context.damageBonusSourceId ?? getPolkovodetsSource(state, context.attackerId);
  const polkovodetsBonus = sourceId ? 1 : 0;
  const damageBonus = polkovodetsBonus;

  const { nextState, events } = resolveAttack(state, {
    attackerId: context.attackerId,
    defenderId: context.defenderId,
    defenderUseBerserkAutoDefense: useAutoDefense,
    ignoreRange: context.ignoreRange,
    ignoreStealth: context.ignoreStealth,
    revealStealthedAllies: context.revealStealthedAllies,
    revealReason: context.revealReason,
    damageBonus,
    rolls,
  });

  let updatedEvents = [...events];
  const attackEvent = events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === context.attackerId &&
      e.defenderId === context.defenderId
  );
  if (
    attackEvent &&
    attackEvent.type === "attackResolved" &&
    attackEvent.hit &&
    polkovodetsBonus > 0 &&
    sourceId
  ) {
    updatedEvents.push(
      evDamageBonusApplied({
        unitId: context.attackerId,
        amount: polkovodetsBonus,
        source: "polkovodets",
        fromUnitId: sourceId,
      })
    );
  }

  const attackResolved = events.some((e) => e.type === "attackResolved");
  let updatedState = nextState;

  if (attackResolved && context.consumeSlots) {
    const attackerAfter = updatedState.units[context.attackerId];
    if (attackerAfter) {
      const updatedAttacker: UnitState = spendSlots(attackerAfter, {
        attack: true,
        action: true,
      });
      updatedState = {
        ...updatedState,
        units: {
          ...updatedState.units,
          [updatedAttacker.id]: updatedAttacker,
        },
      };
    }
  }

  if (attackResolved && context.queueKind === "aoe" && updatedState.pendingAoE) {
    const attackEvent = events.find(
      (e) =>
        e.type === "attackResolved" &&
        e.attackerId === context.attackerId &&
        e.defenderId === context.defenderId
    );
    let nextPendingAoE = updatedState.pendingAoE;
    if (attackEvent && attackEvent.type === "attackResolved") {
      const shouldRecord = attackEvent.damage > 0;
      if (shouldRecord) {
        const damaged = nextPendingAoE.damagedUnitIds.includes(
          attackEvent.defenderId
        )
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

    if (nextPendingAoE !== updatedState.pendingAoE) {
      updatedState = { ...updatedState, pendingAoE: nextPendingAoE };
    }
  }

  return { state: clearPendingRoll(updatedState), events: updatedEvents };
}

export function advanceCombatQueue(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  const queue = state.pendingCombatQueue ?? [];
  if (queue.length === 0) {
    if (state.pendingAoE) {
      const aoe = state.pendingAoE;
      const nextState: GameState = { ...state, pendingAoE: null };
      return {
        state: nextState,
        events: [
          ...events,
          evAoeResolved({
            sourceUnitId: aoe.casterId,
            abilityId: aoe.abilityId,
            casterId: aoe.casterId,
            center: aoe.center,
            radius: aoe.radius,
            affectedUnitIds: aoe.affectedUnitIds,
            revealedUnitIds: aoe.revealedUnitIds,
            damagedUnitIds: aoe.damagedUnitIds,
            damageByUnitId: aoe.damageByUnitId,
          }),
        ],
      };
    }
    return { state, events };
  }

  const [, ...rest] = queue;
  let nextState: GameState = { ...state, pendingCombatQueue: rest };
  let nextEvents = [...events];

  if (rest.length === 0) {
    if (nextState.pendingAoE) {
      const aoe = nextState.pendingAoE;
      nextState = { ...nextState, pendingAoE: null };
      nextEvents.push(
        evAoeResolved({
          sourceUnitId: aoe.casterId,
          abilityId: aoe.abilityId,
          casterId: aoe.casterId,
          center: aoe.center,
          radius: aoe.radius,
          affectedUnitIds: aoe.affectedUnitIds,
          revealedUnitIds: aoe.revealedUnitIds,
          damagedUnitIds: aoe.damagedUnitIds,
          damageByUnitId: aoe.damageByUnitId,
        })
      );
    }
    return { state: nextState, events: nextEvents };
  }

  const nextEntry = rest[0];
  const attacker = nextState.units[nextEntry.attackerId];
  const defender = nextState.units[nextEntry.defenderId];
  if (!attacker || !defender) {
    return advanceCombatQueue(nextState, nextEvents);
  }

  const ctx = makeAttackContext({
    attackerId: nextEntry.attackerId,
    defenderId: nextEntry.defenderId,
    ignoreRange: nextEntry.ignoreRange,
    ignoreStealth: nextEntry.ignoreStealth,
    damageBonus: nextEntry.damageBonus,
    damageBonusSourceId: nextEntry.damageBonusSourceId,
    consumeSlots: nextEntry.consumeSlots ?? false,
    queueKind: nextEntry.kind,
  });

  const rollKind =
    nextEntry.kind === "riderPath"
      ? "riderPathAttack_attackerRoll"
      : "attack_attackerRoll";

  const requested = replacePendingRoll(
    nextState,
    attacker.owner,
    rollKind,
    ctx,
    attacker.id
  );

  nextEvents = [...nextEvents, ...requested.events];
  return { state: requested.state, events: nextEvents };
}

