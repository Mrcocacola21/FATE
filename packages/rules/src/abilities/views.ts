import type { AbilitySlot, AbilityView, GameState, UnitState } from "../model";
import { HERO_GRAND_KAISER_ID, HERO_UNDYNE_ID } from "../heroes";
import {
  getMettatonRating,
  isMettaton,
  hasMettatonExUnlocked,
  hasMettatonNeoUnlocked,
} from "../mettaton";
import { hasSansUnbelieverUnlocked, isSans } from "../sans";
import { getAbilitySpec, getCharges, getChargeLimit } from "./charges";
import * as ids from "./constants";
import type { AbilitySpec } from "./types";
import { collectAbilityIdsForUnit } from "./viewIds";
import { canSpendSlots } from "../turnEconomy";

function getSlotFromCost(spec: AbilitySpec): AbilitySlot {
  if (spec.id === ids.ABILITY_RIVER_PERSON_BOAT) return "move";
  const costs = spec.actionCost?.consumes;
  if (costs?.action) return "action";
  if (costs?.move) return "move";
  if (costs?.attack) return "attack";
  if (costs?.stealth) return "stealth";
  return "none";
}

function getChargeRequired(spec: AbilitySpec): number | undefined {
  const external = getExternalResource(spec.id);
  if (external) return external.required;
  return (
    spec.chargesPerUse ??
    spec.chargeCost ??
    spec.triggerCharges ??
    spec.maxCharges
  );
}

function getExternalResource(abilityId: string): { abilityId: string; required: number } | null {
  switch (abilityId) {
    case ids.ABILITY_DUOLINGO_PUSH_NOTIFICATION:
      return { abilityId: ids.ABILITY_DUOLINGO_SKIP_CLASSES, required: 3 };
    case ids.ABILITY_DUOLINGO_BERSERKER:
      return { abilityId: ids.ABILITY_DUOLINGO_SKIP_CLASSES, required: 12 };
    case ids.ABILITY_LUCHE_DIVINE_RAY:
      return { abilityId: ids.ABILITY_LUCHE_SUN_GLORY, required: 2 };
    case ids.ABILITY_LUCHE_BURNING_SUN:
      return { abilityId: ids.ABILITY_LUCHE_SUN_GLORY, required: 5 };
    case ids.ABILITY_KANEKI_REGENERATION:
      return { abilityId: ids.ABILITY_KANEKI_RC_CELLS, required: 1 };
    case ids.ABILITY_KANEKI_SCOLOPENDRA:
      return { abilityId: ids.ABILITY_KANEKI_RC_CELLS, required: 6 };
    case ids.ABILITY_ZORO_ONI_GIRI:
      return { abilityId: ids.ABILITY_ZORO_DETERMINATION, required: 2 };
    case ids.ABILITY_ZORO_ASURA:
      return { abilityId: ids.ABILITY_ZORO_DETERMINATION, required: 6 };
    default:
      return null;
  }
}

function getActiveDisabledReason(
  state: GameState,
  unit: UnitState,
  spec: AbilitySpec
): string | undefined {
  if (state.pendingRoll) return "Pending roll must be resolved";
  if (state.phase !== "battle") return "Not in battle";
  if (unit.owner !== state.currentPlayer) return "Not your turn";
  if (state.activeUnitId !== unit.id) return "Not active unit";

  const costs = spec.actionCost?.consumes;
  if (spec.id === ids.ABILITY_RIVER_PERSON_BOAT) {
    if ((unit.kaladinMoveLockSources?.length ?? 0) > 0) {
      return "Movement is blocked";
    }
    if ((unit.lokiMoveLockSources?.length ?? 0) > 0) {
      return "Movement is blocked";
    }
    if (!canSpendSlots(unit, { move: true })) {
      return "Move slot already used";
    }
  }
  if (costs?.action && unit.turn?.actionUsed) {
    return "Action slot already used";
  }
  if (costs?.move && unit.turn?.moveUsed) {
    return "Move slot already used";
  }
  if (costs?.move && (unit.kaladinMoveLockSources?.length ?? 0) > 0) {
    return "Movement is blocked";
  }
  if (costs?.move && (unit.lokiMoveLockSources?.length ?? 0) > 0) {
    return "Movement is blocked";
  }
  if (costs?.attack && unit.turn?.attackUsed) {
    return "Attack slot already used";
  }
  if (costs?.stealth && unit.turn?.stealthUsed) {
    return "Stealth slot already used";
  }
  if ((unit.lokiChickenSources?.length ?? 0) > 0) {
    return "Chicken: this unit can only move";
  }

  if (isMettaton(unit)) {
    if (spec.id === ids.ABILITY_METTATON_LASER && !hasMettatonExUnlocked(unit)) {
      return "Requires Mettaton EX";
    }
    if (
      (spec.id === ids.ABILITY_METTATON_EX && hasMettatonExUnlocked(unit)) ||
      (spec.id === ids.ABILITY_METTATON_NEO && hasMettatonNeoUnlocked(unit))
    ) {
      return "Already transformed";
    }
    const requiredRating =
      spec.id === ids.ABILITY_METTATON_POPPINS
        ? 3
        : spec.id === ids.ABILITY_METTATON_LASER
        ? 3
        : spec.id === ids.ABILITY_METTATON_EX
        ? 5
        : spec.id === ids.ABILITY_METTATON_NEO
        ? 10
        : spec.id === ids.ABILITY_METTATON_FINAL_CHORD
        ? 12
        : undefined;
    if (requiredRating !== undefined && getMettatonRating(unit) < requiredRating) {
      return `Need Rating ${requiredRating}`;
    }
  }

  if (isSans(unit)) {
    if (
      (spec.id === ids.ABILITY_SANS_BONE_FIELD || spec.id === ids.ABILITY_SANS_SLEEP) &&
      !hasSansUnbelieverUnlocked(unit)
    ) {
      return "Requires Unbeliever Sans";
    }
  }

  const required = getChargeRequired(spec);
  const resourceAbilityId = getExternalResource(spec.id)?.abilityId ?? spec.id;
  if (
    required !== undefined &&
    spec.id !== ids.ABILITY_KAISER_ENGINEERING_MIRACLE &&
    !(spec.id === ids.ABILITY_KAISER_DORA && unit.heroId === HERO_GRAND_KAISER_ID && unit.transformed) &&
    getCharges(unit, resourceAbilityId) < required
  ) {
    return "Not Enough charges";
  }

  return undefined;
}

export function getAbilityViewsForUnit(
  state: GameState,
  unitId: string
): AbilityView[] {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) return [];

  return collectAbilityIdsForUnit(unit)
    .map((id) => {
      const spec = getAbilitySpec(id);
      if (!spec) return null;
      const chargeRequired = getChargeRequired(spec);
      const externalResource = getExternalResource(id);
      const mettatonRatingRequired =
        isMettaton(unit) && id === ids.ABILITY_METTATON_POPPINS
          ? 3
          : isMettaton(unit) && id === ids.ABILITY_METTATON_LASER
          ? 3
          : isMettaton(unit) && id === ids.ABILITY_METTATON_EX
          ? 5
          : isMettaton(unit) && id === ids.ABILITY_METTATON_NEO
          ? 10
          : isMettaton(unit) && id === ids.ABILITY_METTATON_FINAL_CHORD
          ? 12
          : undefined;
      const undyneEnergySpearRequired =
        unit.heroId === HERO_UNDYNE_ID &&
        id === ids.ABILITY_UNDYNE_ENERGY_SPEAR &&
        unit.undyneImmortalActive
          ? 0
          : undefined;
      const effectiveChargeRequired =
        id === ids.ABILITY_PAPYRUS_COOL_GUY && unit.papyrusUnbelieverActive
          ? 3
          : undyneEnergySpearRequired ?? mettatonRatingRequired ?? chargeRequired;
      const usesMettatonRating =
        id === ids.ABILITY_METTATON_RATING ||
        mettatonRatingRequired !== undefined;
      const hasCharges =
        externalResource !== null ||
        spec.chargeUnlimited === true ||
        getChargeLimit(id) !== null ||
        effectiveChargeRequired !== undefined ||
        usesMettatonRating;
      const currentCharges = hasCharges
        ? usesMettatonRating
          ? getMettatonRating(unit)
          : getCharges(unit, externalResource?.abilityId ?? id)
        : undefined;
      const maxCharges = getChargeLimit(externalResource?.abilityId ?? id) ?? undefined;
      const chargeUnlimited =
        spec.chargeUnlimited === true ||
        (externalResource
          ? getAbilitySpec(externalResource.abilityId)?.chargeUnlimited === true
          : false) ||
        usesMettatonRating
          ? true
          : undefined;

      let isAvailable = true;
      let disabledReason: string | undefined = undefined;

      if (spec.kind === "active") {
        disabledReason = getActiveDisabledReason(state, unit, spec);
        isAvailable = !disabledReason;
      } else if (spec.kind === "impulse" || spec.id === ids.ABILITY_GENGHIS_KHAN_MONGOL_CHARGE) {
        if (
          isSans(unit) &&
          spec.id === ids.ABILITY_SANS_BONE_FIELD &&
          !hasSansUnbelieverUnlocked(unit)
        ) {
          isAvailable = false;
          disabledReason = "Requires Unbeliever Sans";
        } else if (spec.id === ids.ABILITY_KAISER_ENGINEERING_MIRACLE && unit.transformed) {
          isAvailable = false;
          disabledReason = "Already transformed";
        } else if (
          isMettaton(unit) &&
          ((spec.id === ids.ABILITY_METTATON_EX && hasMettatonExUnlocked(unit)) ||
            (spec.id === ids.ABILITY_METTATON_NEO && hasMettatonNeoUnlocked(unit)))
        ) {
          isAvailable = false;
          disabledReason = "Already transformed";
        } else if (
          effectiveChargeRequired !== undefined &&
          (currentCharges ?? 0) < effectiveChargeRequired
        ) {
          isAvailable = false;
          disabledReason =
            mettatonRatingRequired !== undefined
              ? `Need Rating ${effectiveChargeRequired}`
              : "Not Enough charges";
        }
      } else if (spec.kind === "phantasm") {
        if (
          effectiveChargeRequired !== undefined &&
          (currentCharges ?? 0) < effectiveChargeRequired
        ) {
          isAvailable = false;
          disabledReason =
            mettatonRatingRequired !== undefined
              ? `Need Rating ${effectiveChargeRequired}`
              : "Not Enough charges";
        }
      }
      if (spec.id === ids.ABILITY_ODIN_MUNINN) {
        const required = getChargeRequired(spec);
        if (required !== undefined && getCharges(unit, spec.id) < required) {
          isAvailable = false;
          disabledReason = "Not Enough charges";
        }
      }
      if (spec.id === ids.ABILITY_FRISK_PACIFISM && unit.friskPacifismDisabled) {
        isAvailable = false;
        disabledReason = "Pacifism lost (One Path)";
      }
      if (spec.kind !== "passive" && (unit.lokiChickenSources?.length ?? 0) > 0) {
        isAvailable = false;
        disabledReason = "Chicken: this unit can only move";
      }
      if (
        spec.id === ids.ABILITY_DON_KIHOTE_SORROWFUL_COUNTENANCE &&
        !unit.donSorrowfulReactionAvailable
      ) {
        isAvailable = false;
        disabledReason = "Available only after a failed defense";
      }
      if (
        spec.id === ids.ABILITY_JACK_RIPPER_SNARES &&
        unit.jackTrapPlacedTurnNumber === state.turnNumber
      ) {
        isAvailable = false;
        disabledReason = "Trap already placed this turn";
      }
      if (spec.id === ids.ABILITY_JACK_RIPPER_DISMEMBERMENT) {
        const hasTargetOnOwnTrap = (state.jackTraps ?? []).some((trap) => {
          if (trap.sourceUnitId !== unit.id) return false;
          return Object.values(state.units).some(
            (target) =>
              target.isAlive &&
              target.owner !== unit.owner &&
              target.position?.col === trap.position.col &&
              target.position?.row === trap.position.row,
          );
        });
        if (unit.jackHolyMotherUsed || !hasTargetOnOwnTrap) {
          isAvailable = false;
          disabledReason = unit.jackHolyMotherUsed
            ? "Already used this game"
            : "Requires an enemy on your trap";
        }
      }
      if (spec.id === ids.ABILITY_LUCHE_DIVINE_RAY) {
        disabledReason = getActiveDisabledReason(state, unit, spec);
        isAvailable = !disabledReason;
      }

      return {
        id,
        name: spec.displayName,
        kind: spec.kind,
        description: spec.description,
        slot: getSlotFromCost(spec),
        targetRange: spec.targetRange,
        chargeRequired: effectiveChargeRequired,
        maxCharges,
        chargeUnlimited,
        currentCharges,
        isAvailable,
        disabledReason,
      } as AbilityView;
    })
    .filter((item): item is AbilityView => item !== null);
}
