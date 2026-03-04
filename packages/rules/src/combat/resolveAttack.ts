import type { GameEvent, GameState, UnitState } from "../model";
import { canDirectlyTargetUnit } from "../visibility";
import {
  HERO_ASGORE_ID,
  HERO_FEMTO_ID,
  HERO_GUTS_ID,
  HERO_ODIN_ID,
  HERO_SANS_ID,
  HERO_UNDYNE_ID,
} from "../heroes";
import { addMettatonRating, buildMettatonRatingChangedEvent, getMettatonRating, hasMettatonGrace } from "../mettaton";
import { canAttackTarget } from "./checks";
import { applyPostAttackRatings } from "./events";
import { buildDiceRoll, recordGenghisAttack } from "./helpers";
import { revealStealthedDefenderIfIgnored, resolveHitDamage, tryResolveAutoDefense } from "./state";
import type { ResolveAttackParams } from "./types";

export function resolveAttack(
  state: GameState,
  params: ResolveAttackParams
): { nextState: GameState; events: GameEvent[] } {
  const attacker = state.units[params.attackerId];
  const defender = state.units[params.defenderId];

  if (!attacker || !defender) {
    return { nextState: state, events: [] };
  }
  if (!attacker.isAlive || !defender.isAlive) {
    return { nextState: state, events: [] };
  }
  if (!attacker.position || !defender.position) {
    return { nextState: state, events: [] };
  }

  if (!params.ignoreStealth && !canDirectlyTargetUnit(state, attacker.id, defender.id)) {
    return { nextState: state, events: [] };
  }

  if (
    !params.ignoreRange &&
    !canAttackTarget(state, attacker, defender, {
      allowFriendlyTarget: params.allowFriendlyTarget,
    })
  ) {
    return { nextState: state, events: [] };
  }

  let units: Record<string, UnitState> = { ...state.units };
  let attackerAfter: UnitState = { ...attacker };
  let defenderAfter: UnitState = { ...defender };
  let events: GameEvent[] = [];

  const autoDefense = tryResolveAutoDefense(
    state,
    params,
    attackerAfter,
    defenderAfter,
    units,
    events
  );
  if (autoDefense.resolved) {
    return { nextState: autoDefense.state, events: autoDefense.events };
  }

  units = autoDefense.units;
  attackerAfter = autoDefense.attackerAfter;
  defenderAfter = autoDefense.defenderAfter;
  events = autoDefense.events;

  const rollInput = params.rolls;
  if (!rollInput) {
    return { nextState: state, events: [] };
  }

  const attackerDice = rollInput.attackerDice ?? [];
  const defenderDice = rollInput.defenderDice ?? [];
  if (
    attackerDice.length < 2 ||
    (!params.autoHit && !params.forceMiss && defenderDice.length < 2)
  ) {
    return { nextState: state, events: [] };
  }

  const tieBreakAttacker = rollInput.tieBreakAttacker ?? [];
  const tieBreakDefender = rollInput.tieBreakDefender ?? [];

  const attackerRoll = buildDiceRoll(attackerDice, tieBreakAttacker);
  const defenderRoll = params.forceMiss
    ? {
        dice: [],
        sum: 0,
        isDouble: false,
      }
    : buildDiceRoll(defenderDice, tieBreakDefender);

  if (
    !params.forceMiss &&
    defenderDice.length > 0 &&
    hasMettatonGrace(defenderAfter)
  ) {
    const graceGain = addMettatonRating(defenderAfter, 1);
    if (graceGain.applied > 0) {
      defenderAfter = graceGain.unit;
      units[defenderAfter.id] = defenderAfter;
      events.push(
        buildMettatonRatingChangedEvent({
          unitId: defenderAfter.id,
          delta: graceGain.applied,
          now: getMettatonRating(defenderAfter),
          reason: "defenseRoll",
        })
      );
    }
  }

  let hit = params.forceMiss
    ? false
    : params.autoHit
    ? true
    : attackerRoll.sum > defenderRoll.sum;

  if (
    !params.autoHit &&
    !params.forceMiss &&
    (defenderAfter.class === "spearman" ||
      defenderAfter.heroId === HERO_FEMTO_ID ||
      defenderAfter.heroId === HERO_ASGORE_ID ||
      defenderAfter.heroId === HERO_ODIN_ID ||
      defenderAfter.heroId === HERO_SANS_ID ||
      defenderAfter.heroId === HERO_UNDYNE_ID) &&
    defenderRoll.isDouble
  ) {
    hit = false;
  }

  if (
    !params.forceMiss &&
    (attackerAfter.class === "knight" ||
      attackerAfter.heroId === HERO_GUTS_ID ||
      attackerAfter.heroId === HERO_ODIN_ID) &&
    attackerRoll.isDouble
  ) {
    hit = true;
  }

  const revealDefender = revealStealthedDefenderIfIgnored(
    state,
    params,
    attackerAfter,
    defenderAfter,
    units,
    events
  );
  state = revealDefender.state;
  defenderAfter = revealDefender.defenderAfter;
  units = revealDefender.units;
  events = revealDefender.events;
  const revealedDefenderPos = revealDefender.revealedDefenderPos;

  const resolvedHit = resolveHitDamage(
    params,
    attackerAfter,
    defenderAfter,
    units,
    events,
    hit
  );
  attackerAfter = resolvedHit.attackerAfter;
  defenderAfter = resolvedHit.defenderAfter;
  units = resolvedHit.units;
  events = resolvedHit.events;
  const damage = resolvedHit.damage;
  const defenderHpAfterEvent = resolvedHit.defenderHpAfterEvent;
  const attackerRevealedToDefender = resolvedHit.attackerRevealedToDefender;
  const revealedAttackerPos = resolvedHit.revealedAttackerPos;

  units[attackerAfter.id] = attackerAfter;
  units[defenderAfter.id] = defenderAfter;

  attackerAfter = recordGenghisAttack(attackerAfter, defenderAfter.id);
  units[attackerAfter.id] = attackerAfter;

  const rating = applyPostAttackRatings(hit, attackerAfter, defenderAfter, units);
  attackerAfter = rating.attackerAfter;
  defenderAfter = rating.defenderAfter;
  units = rating.units;
  const ratingEvents = rating.ratingEvents;

  const updatedLastKnown = {
    ...state.lastKnownPositions,
    P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
  };
  if (revealedDefenderPos) {
    delete updatedLastKnown.P1[defenderAfter.id];
    delete updatedLastKnown.P2[defenderAfter.id];
  }
  if (revealedAttackerPos) {
    delete updatedLastKnown.P1[attackerAfter.id];
    delete updatedLastKnown.P2[attackerAfter.id];
  }

  const nextState: GameState = {
    ...state,
    units,
    knowledge: attackerRevealedToDefender
      ? {
          ...state.knowledge,
          [defenderAfter.owner]: {
            ...(state.knowledge?.[defenderAfter.owner] ?? {}),
            [attackerAfter.id]: true,
          },
        }
      : state.knowledge,
    lastKnownPositions: updatedLastKnown,
  };

  if (attackerRevealedToDefender) {
    events.push({
      type: "stealthRevealed",
      unitId: attackerAfter.id,
      reason: "attacked",
      revealerId: attackerAfter.id,
    });
  }

  events.push({
    type: "attackResolved",
    attackerId: attackerAfter.id,
    defenderId: defenderAfter.id,
    attackerRoll,
    defenderRoll,
    tieBreakDice:
      tieBreakAttacker.length > 0
        ? { attacker: tieBreakAttacker, defender: tieBreakDefender }
        : undefined,
    hit,
    damage,
    defenderHpAfter: defenderHpAfterEvent,
  });
  events.push(...ratingEvents);

  return { nextState, events };
}
