import type {
  AbilitySlot,
  AbilityUseOptionView,
  AbilityView,
  GameState,
  UnitState,
} from "../model";
import {
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_GRAND_KAISER_ID,
  HERO_UNDYNE_ID,
} from "../heroes";
import {
  getMettatonRating,
  isMettaton,
  hasMettatonExUnlocked,
  hasMettatonNeoUnlocked,
} from "../mettaton";
import { hasSansUnbelieverUnlocked, isSans } from "../sans";
import { getAbilitySpec, getCharges, getChargeLimit } from "./charges";
import * as ids from "./constants";
import type { AbilityCost, AbilitySpec } from "./types";
import { collectAbilityIdsForUnit } from "./viewIds";
import { canSpendSlots } from "../turnEconomy";
import {
  getDuolingoPushTargeting,
  getLucheLightRayTargeting,
  getZoroOniGiriTargeting,
} from "./newBatchTargeting";
import {
  CHIKATILO_ASSASSIN_MARK_RANGE,
  getChikatiloMarkedTargetIds,
} from "../chikatiloMark";
import { chebyshev } from "../board";
import { canDirectlyTargetUnit } from "../visibility";
import {
  getLokiChickenTargetIds,
  getLokiMindControlEnemyIds,
  getLokiSpinCandidateIds,
  getLokiTricksterAreaTargetIds,
} from "../actions/heroes/loki/targets";

function getLegalChikatiloMarkTargetIds(
  state: GameState,
  unit: UnitState
): string[] {
  if (!unit.position) return [];
  const marked = new Set(getChikatiloMarkedTargetIds(unit));
  return Object.values(state.units)
    .filter(
      (target) =>
        target.id !== unit.id &&
        target.isAlive &&
        !!target.position &&
        !marked.has(target.id) &&
        canDirectlyTargetUnit(state, unit.id, target.id) &&
        chebyshev(unit.position!, target.position) <= CHIKATILO_ASSASSIN_MARK_RANGE
    )
    .map((target) => target.id)
    .sort();
}

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
  return spec.chargesPerUse ?? spec.chargeCost ?? spec.triggerCharges ?? spec.maxCharges;
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

function getCommonDisabledReason(
  state: GameState,
  unit: UnitState,
  costs?: AbilityCost["consumes"],
): string | undefined {
  if (state.pendingRoll) return "Pending roll must be resolved";
  if (state.phase !== "battle") return "Not in battle";
  if (unit.owner !== state.currentPlayer) return "Not your turn";
  if (state.activeUnitId !== unit.id) return "Not active unit";

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

  return undefined;
}

function getActiveDisabledReason(
  state: GameState,
  unit: UnitState,
  spec: AbilitySpec,
): string | undefined {
  const costs = spec.actionCost?.consumes;
  const commonReason = getCommonDisabledReason(state, unit, costs);
  if (commonReason) return commonReason;
  if (spec.id === ids.ABILITY_RIVER_PERSON_BOAT) {
    if (
      (unit.kaladinMoveLockSources?.length ?? 0) > 0 ||
      (unit.lokiMoveLockSources?.length ?? 0) > 0
    ) {
      return "Movement is blocked";
    }
    if (!canSpendSlots(unit, { move: true })) {
      return "Move slot already used";
    }
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
    !(
      spec.id === ids.ABILITY_KAISER_DORA &&
      unit.heroId === HERO_GRAND_KAISER_ID &&
      unit.transformed
    ) &&
    getCharges(unit, resourceAbilityId) < required
  ) {
    return "Not Enough charges";
  }

  if (spec.id === ids.ABILITY_CHIKATILO_DECOY) {
    if (unit.isStealthed) return "Already in stealth";
    const hasOtherFigure = Object.values(state.units).some(
      (other) =>
        other.isAlive &&
        other.id !== unit.id &&
        other.heroId !== HERO_FALSE_TRAIL_TOKEN_ID
    );
    if (!hasOtherFigure) return "Cannot hide while no other figures remain";
  }

  return undefined;
}

function buildUseOption(
  state: GameState,
  unit: UnitState,
  params: Omit<AbilityUseOptionView, "isAvailable" | "disabledReason"> & {
    hasLegalTargets: boolean;
  },
): AbilityUseOptionView {
  const commonReason = getCommonDisabledReason(state, unit, params.consumes);
  const chargeReason =
    params.chargeRequired !== undefined && (params.currentCharges ?? 0) < params.chargeRequired
      ? "Not Enough charges"
      : undefined;
  const disabledReason =
    commonReason ?? chargeReason ?? (!params.hasLegalTargets ? "No legal targets" : undefined);
  const { hasLegalTargets: _hasLegalTargets, ...option } = params;
  return { ...option, isAvailable: !disabledReason, disabledReason };
}

function buildLokiLaughOption(
  state: GameState,
  unit: UnitState,
  id: string,
  cost: number,
  hasLegalTargets: boolean,
): AbilityUseOptionView {
  const currentCharges = getCharges(unit, ids.ABILITY_LOKI_LAUGHT);
  const disabledReason =
    getCommonDisabledReason(state, unit, { action: true }) ??
    (currentCharges < cost
      ? "Not enough Laugh"
      : !hasLegalTargets
        ? "No legal targets"
        : undefined);
  return {
    id,
    source: {
      type: "heroResource",
      resourceId: ids.ABILITY_LOKI_LAUGHT,
      amount: cost,
    },
    sourceName: "Laugh",
    currentCharges,
    chargeRequired: cost,
    consumes: { action: true },
    isAvailable: !disabledReason,
    disabledReason,
  };
}

export function getAbilityViewsForUnit(state: GameState, unitId: string): AbilityView[] {
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
          : (undyneEnergySpearRequired ?? mettatonRatingRequired ?? chargeRequired);
      const usesMettatonRating =
        id === ids.ABILITY_METTATON_RATING || mettatonRatingRequired !== undefined;
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

      const targeting =
        spec.id === ids.ABILITY_DUOLINGO_PUSH_NOTIFICATION
          ? getDuolingoPushTargeting(state, unit)
          : spec.id === ids.ABILITY_CHIKATILO_ASSASSIN_MARK
            ? { targetIds: getLegalChikatiloMarkTargetIds(state, unit) }
          : spec.id === ids.ABILITY_ZORO_ONI_GIRI
            ? getZoroOniGiriTargeting(state, unit)
            : spec.id === ids.ABILITY_LUCHE_DIVINE_RAY
              ? getLucheLightRayTargeting(state, unit)
              : undefined;
      const hasLegalTargets = targeting
        ? (targeting.targetIds?.length ?? targeting.cells?.length ?? 0) > 0
        : true;
      if (
        spec.id === ids.ABILITY_CHIKATILO_ASSASSIN_MARK &&
        !hasLegalTargets &&
        isAvailable
      ) {
        isAvailable = false;
        disabledReason = "No legal targets";
      }
      let useOptions: AbilityUseOptionView[] | undefined;
      if (spec.id === ids.ABILITY_ZORO_ONI_GIRI) {
        useOptions = [
          buildUseOption(state, unit, {
            id: "abilityCounter",
            source: { type: "abilityCounter", counterId: spec.id },
            sourceName: spec.displayName,
            currentCharges: getCharges(unit, spec.id),
            chargeRequired: 2,
            consumes: { action: true, move: true },
            hasLegalTargets,
          }),
          buildUseOption(state, unit, {
            id: "heroResource",
            source: { type: "heroResource", resourceId: ids.ABILITY_ZORO_DETERMINATION, amount: 2 },
            sourceName:
              getAbilitySpec(ids.ABILITY_ZORO_DETERMINATION)?.displayName ?? "Determination",
            currentCharges: getCharges(unit, ids.ABILITY_ZORO_DETERMINATION),
            chargeRequired: 2,
            consumes: { action: true, move: true },
            hasLegalTargets,
          }),
        ];
      } else if (spec.id === ids.ABILITY_LUCHE_DIVINE_RAY) {
        useOptions = [
          buildUseOption(state, unit, {
            id: "heroResource",
            source: { type: "heroResource", resourceId: ids.ABILITY_LUCHE_SUN_GLORY, amount: 2 },
            sourceName:
              getAbilitySpec(ids.ABILITY_LUCHE_SUN_GLORY)?.displayName ?? "Glory of the Sun",
            currentCharges: getCharges(unit, ids.ABILITY_LUCHE_SUN_GLORY),
            chargeRequired: 2,
            consumes: { action: true },
            hasLegalTargets,
          }),
        ];
      } else if (spec.id === ids.ABILITY_DUOLINGO_PUSH_NOTIFICATION) {
        useOptions = [
          buildUseOption(state, unit, {
            id: "abilityCounter",
            source: { type: "abilityCounter", counterId: spec.id },
            sourceName: spec.displayName,
            currentCharges: getCharges(unit, spec.id),
            chargeRequired: 3,
            consumes: { move: true },
            hasLegalTargets,
          }),
          buildUseOption(state, unit, {
            id: "heroResource",
            source: {
              type: "heroResource",
              resourceId: ids.ABILITY_DUOLINGO_SKIP_CLASSES,
              amount: 3,
            },
            sourceName:
              getAbilitySpec(ids.ABILITY_DUOLINGO_SKIP_CLASSES)?.displayName ?? "Missed Lessons",
            currentCharges: getCharges(unit, ids.ABILITY_DUOLINGO_SKIP_CLASSES),
            chargeRequired: 3,
            consumes: { move: true },
            hasLegalTargets,
          }),
        ];
      } else if (spec.id === ids.ABILITY_LOKI_LAUGHT) {
        useOptions = [
          buildLokiLaughOption(
            state,
            unit,
            "againSomeNonsense",
            3,
            getLokiTricksterAreaTargetIds(state, unit.id).length > 0,
          ),
          buildLokiLaughOption(
            state,
            unit,
            "chicken",
            5,
            getLokiChickenTargetIds(state, unit.id).length > 0,
          ),
          buildLokiLaughOption(
            state,
            unit,
            "mindControl",
            10,
            getLokiMindControlEnemyIds(state, unit.id).length > 0,
          ),
          buildLokiLaughOption(
            state,
            unit,
            "spinTheDrum",
            12,
            getLokiSpinCandidateIds(state, unit.id).length > 0,
          ),
          buildLokiLaughOption(
            state,
            unit,
            "greatLokiJoke",
            15,
            getLokiTricksterAreaTargetIds(state, unit.id).length > 0,
          ),
        ];
      }
      if (useOptions) {
        isAvailable = useOptions.some((option) => option.isAvailable);
        disabledReason = isAvailable ? undefined : useOptions[0]?.disabledReason;
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
        isSpecialCounter: spec.isSpecialCounter === true,
        currentCharges,
        isAvailable,
        disabledReason,
        useOptions,
        targeting,
      } as AbilityView;
    })
    .filter((item): item is AbilityView => item !== null);
}
