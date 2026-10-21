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
  HERO_ODIN_ID,
  getHeroDefinition,
} from "../heroes";
import {
  addMettatonRating,
  buildMettatonRatingChangedEvent,
  getMettatonRating,
  isMettaton,
} from "../mettaton";
import { buildDiceRoll, recordGenghisAttack } from "./helpers";
import type { AutoDefenseResolution, ResolveAttackParams } from "./types";
import { getUnitDefinition } from "../units";
import { hasBerserkerAutoDefense } from "../unitFeatures";
import { EVENT_VISIBILITY, movementVisibility } from "../model/events/visibility";

export function tryResolveAutoDefense(
  state: GameState,
  params: ResolveAttackParams,
  attackerAfter: UnitState,
  defenderAfter: UnitState,
  units: Record<string, UnitState>,
  events: GameEvent[],
  anchorState: GameState = state
): AutoDefenseResolution {
  const wantsBerserkAutoDefense =
    params.defenderUseBerserkAutoDefense === true;
  const wantsMuninnAutoDefense = params.defenderUseMuninnAutoDefense === true;

  let autoDefenseAbilityId: string | null = null;
  if (
    wantsBerserkAutoDefense &&
    hasBerserkerAutoDefense(defenderAfter)
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
    sourceCell: { ...attackerAfter.position! },
    targetCell: { ...defenderAfter.position! },
    [EVENT_VISIBILITY]: {
      recipients: [],
      sourceCellRecipients: movementVisibility(anchorState, attackerAfter.id, attackerAfter.position!).recipients,
      targetCellRecipients: movementVisibility(anchorState, defenderAfter.id, defenderAfter.position!).recipients,
    },
    attackerId: attackerAfter.id,
    defenderId: defenderAfter.id,
    attackerRoll,
    defenderRoll,
    ...(params.attackerRollIsNew === false ? { attackerRollIsNew: false } : {}),
    hit: false,
    preventedBy: autoDefenseAbilityId === ABILITY_ODIN_MUNINN ? "odinMuninn" : "berserkerAutoDefense",
    damage: 0,
    defenderHpAfter: defenderAfter.hp,
    previousHp: defenderAfter.hp,
    nextHp: defenderAfter.hp,
    maxHp:
      getHeroDefinition(defenderAfter.heroId)?.baseHpOverride ??
      getUnitDefinition(defenderAfter.class).maxHp,
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
