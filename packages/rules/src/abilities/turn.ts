import type { GameEvent, GameState } from "../model";
import { RNG } from "../rng";
import {
  HERO_DUOLINGO_ID,
  HERO_GENGHIS_KHAN_ID,
  HERO_JEBE_ID,
  HERO_KANEKI_ID,
  HERO_LUCHE_ID,
} from "../heroes";
import { addCharges, getAbilitySpec, getCharges } from "./charges";
import { revealStealthedInArea } from "../stealth";
import { ABILITY_BERSERK_AUTO_DEFENSE, ABILITY_DUOLINGO_SKIP_CLASSES, ABILITY_LUCHE_SHINE, ABILITY_KANEKI_RC_CELLS } from "./constants";
import { setCharges } from "./charges";

export function processUnitStartOfTurn(
  state: GameState,
  unitId: string,
  rng: RNG
): { state: GameState; events: GameEvent[] } {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) {
    return { state, events: [] };
  }

  // Keep signature and side-effects unchanged; rng is intentionally unused for now.
  void rng;

  let updated = unit;
  const deltas: Record<string, number> = {};
  const now: Record<string, number> = {};

  for (const abilityId of Object.keys(updated.charges)) {
    const spec = getAbilitySpec(abilityId);
    if (!spec || spec.isSpecialCounter) continue;
    const isChargeable =
      spec.chargeUnlimited === true ||
      spec.maxCharges !== undefined ||
      spec.chargesPerUse !== undefined ||
      spec.chargeCost !== undefined;
    if (!isChargeable) continue;
    const before = getCharges(updated, abilityId);
    updated = addCharges(updated, abilityId, 1);
    const after = getCharges(updated, abilityId);
    if (after !== before) {
      deltas[abilityId] = after - before;
    }
    if (after !== before || abilityId in now) {
      now[abilityId] = after;
    }
  }

  updated = {
    ...updated,
    lastChargedTurn: state.turnNumber,
    blindUntilOwnTurnStart: false,
    immobilizedUntilOwnTurnStart: false,
  };

  if (updated.heroId === HERO_DUOLINGO_ID) {
    const previousHits = Array.from(new Set(updated.duolingoHitTargetsThisTurn ?? []));
    const unlock = getCharges(updated, ABILITY_DUOLINGO_SKIP_CLASSES) >= 12;
    updated = {
      ...updated,
      duolingoHitTargetsLastTurn: previousHits,
      duolingoHitTargetsThisTurn: [],
      duolingoBerserkerUnlocked: updated.duolingoBerserkerUnlocked || unlock,
    };
    if (unlock && updated.charges[ABILITY_BERSERK_AUTO_DEFENSE] === undefined) {
      updated = setCharges(updated, ABILITY_BERSERK_AUTO_DEFENSE, 0);
    }
  }
  if (
    updated.heroId === HERO_KANEKI_ID &&
    getCharges(updated, ABILITY_KANEKI_RC_CELLS) > 5
  ) {
    updated = { ...updated, kanekiCentipedeUnlocked: true };
  }

  if (
    updated.heroId === HERO_GENGHIS_KHAN_ID ||
    updated.heroId === HERO_JEBE_ID
  ) {
    const attackedThisTurn = Array.isArray(updated.genghisKhanAttackedThisTurn)
      ? updated.genghisKhanAttackedThisTurn
      : [];
    updated = {
      ...updated,
      genghisKhanAttackedLastTurn: Array.from(new Set(attackedThisTurn)),
      genghisKhanAttackedThisTurn: [],
    };
  }

  const events: GameEvent[] = [];
  if (Object.keys(deltas).length > 0) {
    events.push({
      type: "chargesUpdated",
      unitId: updated.id,
      deltas,
      now: Object.keys(now).length > 0 ? now : { ...updated.charges },
    });
  }

  let nextState: GameState = {
      ...state,
      jackTraps: (state.jackTraps ?? []).filter(
        (trap) => trap.trappedUnitId !== updated.id
      ),
      units: {
        ...state.units,
        [updated.id]: updated,
      },
    };
  if (updated.heroId === HERO_LUCHE_ID && updated.position) {
    const radiance = revealStealthedInArea(
      nextState,
      updated.position,
      1,
      rng,
      (target) => target.owner !== updated.owner
    );
    nextState = radiance.state;
    events.push({ type: "abilityUsed", unitId: updated.id, abilityId: ABILITY_LUCHE_SHINE });
    events.push(...radiance.events);
  }
  return { state: nextState, events };
}
