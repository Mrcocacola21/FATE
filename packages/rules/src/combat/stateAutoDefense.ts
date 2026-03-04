import type { GameEvent, GameState, UnitState } from "../model";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_ODIN_MUNINN,
  canUseAbility,
  consumeAbilityCharges,
  getAbilitySpec,
  getCharges,
} from "../abilities";
import {
  HERO_FEMTO_ID,
  HERO_ODIN_ID,
  HERO_PAPYRUS_ID,
} from "../heroes";
import {
  addMettatonRating,
  buildMettatonRatingChangedEvent,
  getMettatonRating,
  hasMettatonBerserkerFeature,
  isMettaton,
} from "../mettaton";
import { buildDiceRoll, recordGenghisAttack } from "./helpers";
import type { AutoDefenseResolution, ResolveAttackParams } from "./types";

export function tryResolveAutoDefense(
  state: GameState,
  params: ResolveAttackParams,
  attackerAfter: UnitState,
  defenderAfter: UnitState,
  units: Record<string, UnitState>,
  events: GameEvent[]
): AutoDefenseResolution {
  const wantsBerserkAutoDefense =
    params.defenderUseBerserkAutoDefense === true;
  const wantsMuninnAutoDefense = params.defenderUseMuninnAutoDefense === true;

  let autoDefenseAbilityId: string | null = null;
  if (
    wantsBerserkAutoDefense &&
    (defenderAfter.class === "berserker" ||
      defenderAfter.heroId === HERO_FEMTO_ID ||
      (defenderAfter.heroId === HERO_PAPYRUS_ID &&
        defenderAfter.papyrusUnbelieverActive) ||
      hasMettatonBerserkerFeature(defenderAfter))
  ) {
    autoDefenseAbilityId = ABILITY_BERSERK_AUTO_DEFENSE;
  } else if (wantsMuninnAutoDefense && defenderAfter.heroId === HERO_ODIN_ID) {
    autoDefenseAbilityId = ABILITY_ODIN_MUNINN;
  }

  if (!autoDefenseAbilityId) {
    return {
      resolved: false,
      state,
      attackerAfter,
      defenderAfter,
      units,
      events,
    };
  }

  const spec = getAbilitySpec(autoDefenseAbilityId);
  const currentCharges = getCharges(defenderAfter, autoDefenseAbilityId);
  const requiredCharges =
    spec?.maxCharges ?? spec?.chargesPerUse ?? spec?.chargeCost ?? 0;

  if (
    !spec ||
    currentCharges !== requiredCharges ||
    !canUseAbility(defenderAfter, autoDefenseAbilityId)
  ) {
    return {
      resolved: false,
      state,
      attackerAfter,
      defenderAfter,
      units,
      events,
    };
  }

  defenderAfter = consumeAbilityCharges(defenderAfter, autoDefenseAbilityId);
  units[attackerAfter.id] = attackerAfter;
  units[defenderAfter.id] = defenderAfter;

  events.push({
    type: "abilityUsed",
    unitId: defenderAfter.id,
    abilityId: autoDefenseAbilityId,
  });

  const rollInput = params.rolls;
  const attackerRoll = rollInput
    ? buildDiceRoll(
        rollInput.attackerDice ?? [],
        rollInput.tieBreakAttacker ?? []
      )
    : {
        dice: [],
        sum: 0,
        isDouble: false,
      };
  const defenderRoll = {
    dice: [],
    sum: 0,
    isDouble: false,
  };

  events.push({
    type: "attackResolved",
    attackerId: attackerAfter.id,
    defenderId: defenderAfter.id,
    attackerRoll,
    defenderRoll,
    hit: false,
    damage: 0,
    defenderHpAfter: defenderAfter.hp,
  });

  if (isMettaton(defenderAfter)) {
    const defenseGain = addMettatonRating(defenderAfter, 1);
    if (defenseGain.applied > 0) {
      defenderAfter = defenseGain.unit;
      units[defenderAfter.id] = defenderAfter;
      events.push(
        buildMettatonRatingChangedEvent({
          unitId: defenderAfter.id,
          delta: defenseGain.applied,
          now: getMettatonRating(defenderAfter),
          reason: "defenseSuccess",
        })
      );
    }
  }

  attackerAfter = recordGenghisAttack(attackerAfter, defenderAfter.id);
  units[attackerAfter.id] = attackerAfter;

  return {
    resolved: true,
    state: {
      ...state,
      units,
    },
    attackerAfter,
    defenderAfter,
    units,
    events,
  };
}
