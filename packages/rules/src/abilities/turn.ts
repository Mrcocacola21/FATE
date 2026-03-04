import type { GameEvent, GameState } from "../model";
import { RNG } from "../rng";
import { HERO_GENGHIS_KHAN_ID, HERO_JEBE_ID } from "../heroes";
import { addCharges, getAbilitySpec, getCharges } from "./charges";

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
  };

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

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updated.id]: updated,
      },
    },
    events,
  };
}
