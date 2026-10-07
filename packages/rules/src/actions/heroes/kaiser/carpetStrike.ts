import { commitAbilityUse } from "../../../core/abilityUse";
import { evAbilityUsed } from "../../../core";
import type { ApplyResult, GameEvent, GameState } from "../../../model";
import { ABILITY_KAISER_CARPET_STRIKE, getCharges, spendCharges } from "../../../abilities";
import { requestRoll } from "../../../core";
import { evCarpetStrikeTriggered } from "../../../core";
import { HERO_GRAND_KAISER_ID } from "../../../heroes";

export function maybeTriggerCarpetStrike(
  state: GameState,
  unitId: string
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || unit.heroId !== HERO_GRAND_KAISER_ID) {
    return { state, events: [] };
  }

  const charges = getCharges(unit, ABILITY_KAISER_CARPET_STRIKE);
  if (charges < 3) {
    return { state, events: [] };
  }

  const spent = spendCharges(unit, ABILITY_KAISER_CARPET_STRIKE, 3);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const use = commitAbilityUse(state, unit.id, ABILITY_KAISER_CARPET_STRIKE);
  const updatedState: GameState = {
    ...use.state,
    units: {
      ...state.units,
      [unit.id]: spent.unit,
    },
  };

  const requested = requestRoll(
    updatedState,
    unit.owner,
    "kaiserCarpetStrikeCenter",
    { unitId: unit.id, ...use.use },
    unit.id
  );

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: unit.id, abilityId: ABILITY_KAISER_CARPET_STRIKE, abilityUseId: use.use.abilityUseId, recipients: use.use.abilitySourceRecipients }),
    evCarpetStrikeTriggered({ unitId: unit.id }),
    ...requested.events,
  ];

  return { state: requested.state, events };
}
