import type { ApplyResult, GameState, UnitState } from "../../../model";
import { ABILITY_FRISK_GENOCIDE, getCharges } from "../../../abilities";
import { HERO_FALSE_TRAIL_TOKEN_ID } from "../../../heroes";
import { endGameWithWinner } from "../../../gameOver";
import { isFrisk } from "./helpers";

export function canTriggerPowerOfFriendshipForFrisk(
  state: GameState,
  frisk: UnitState
): boolean {
  if (!isFrisk(frisk) || !frisk.isAlive || !frisk.position) return false;
  if (frisk.friskPacifismDisabled) return false;
  if (getCharges(frisk, ABILITY_FRISK_GENOCIDE) !== 0) return false;

  const enemiesAlive = Object.values(state.units).filter(
    (unit) =>
      unit.isAlive &&
      !!unit.position &&
      unit.owner !== frisk.owner &&
      unit.heroId !== HERO_FALSE_TRAIL_TOKEN_ID
  ).length;
  return enemiesAlive === 1;
}

function getPowerOfFriendshipSource(state: GameState): UnitState | null {
  if (state.phase === "ended") return null;
  const friskUnits = Object.values(state.units).filter(
    (unit) => isFrisk(unit) && unit.isAlive && !!unit.position
  );
  for (const frisk of friskUnits) {
    if (canTriggerPowerOfFriendshipForFrisk(state, frisk)) {
      return frisk;
    }
  }
  return null;
}

export function tryApplyFriskPowerOfFriendship(
  state: GameState
): ApplyResult | null {
  const frisk = getPowerOfFriendshipSource(state);
  if (!frisk) return null;
  return endGameWithWinner(
    state, [{ type: "friskFriendshipWon", unitId: frisk.id, ...(frisk.position ? {sourceCell: {...frisk.position}} : {}) }], frisk.owner, "unknown",
  );
}
