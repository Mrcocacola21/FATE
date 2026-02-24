import type { AbilityView, MoveMode, PapyrusLineAxis, UnitState } from "rules";
import {
  ASGORE_FIREBALL_ID,
  ASGORE_SOUL_PARADE_ID,
  CHIKATILO_ASSASSIN_MARK_ID,
  EL_CID_DEMON_DUELIST_ID,
  EL_CID_TISONA_ID,
  GROZNY_INVADE_TIME_ID,
  GROZNY_TYRANT_ID,
  GUTS_ARBALET_ID,
  GUTS_CANNON_ID,
  HASSAN_ASSASSIN_ORDER_ID,
  HASSAN_TRUE_ENEMY_ID,
  JEBE_HAIL_OF_ARROWS_ID,
  JEBE_KHANS_SHOOTER_ID,
  KAISER_DORA_ID,
  KALADIN_FIFTH_ID,
  LECHY_CONFUSE_TERRAIN_ID,
  LECHY_GUIDE_TRAVELER_ID,
  METTATON_LASER_ID,
  METTATON_POPPINS_ID,
  ODIN_SLEIPNIR_ID,
  PAPYRUS_COOL_GUY_ID,
  SANS_GASTER_BLASTER_ID,
  TRICKSTER_AOE_ID,
  UNDYNE_ENERGY_SPEAR_ID,
  UNDYNE_SPEAR_THROW_ID,
} from "../../../rulesHints";
import type { ActionPreviewMode } from "../../../store";

export interface AbilityChargeState {
  current: number;
  max: number | null;
  enabled: boolean;
  reason?: string;
}

const NON_ACTIONABLE_ABILITY_IDS = new Set<string>([
  GROZNY_TYRANT_ID,
  LECHY_CONFUSE_TERRAIN_ID,
  HASSAN_ASSASSIN_ORDER_ID,
  ASGORE_SOUL_PARADE_ID,
]);

export function classBadge(unitClass: string): { label: string; marker?: string } {
  switch (unitClass) {
    case "spearman":
      return { label: "Sp" };
    case "rider":
      return { label: "Rd" };
    case "trickster":
      return { label: "Tr" };
    case "assassin":
      return { label: "As", marker: "D" };
    case "berserker":
      return { label: "Be" };
    case "archer":
      return { label: "Ar", marker: "B" };
    case "knight":
      return { label: "Kn" };
    default:
      return { label: unitClass.slice(0, 2) };
  }
}

export function formatMoveMode(mode: MoveMode): string {
  switch (mode) {
    case "normal":
      return "Normal";
    case "rider":
      return "Rider";
    case "berserker":
      return "Berserker";
    case "archer":
      return "Archer";
    case "trickster":
      return "Trickster";
    case "assassin":
      return "Assassin";
    case "spearman":
      return "Spearman";
    case "knight":
      return "Knight";
    default:
      return mode;
  }
}

export function isRangedSingleTargetClass(unitClass: UnitState["class"]): boolean {
  return (
    unitClass === "archer" ||
    unitClass === "spearman" ||
    unitClass === "trickster"
  );
}

export function getAbilityChargeState(
  abilityId: string,
  unitState: UnitState | null,
  abilityMeta?: AbilityView | null
): AbilityChargeState {
  const current =
    abilityMeta?.currentCharges ?? unitState?.charges?.[abilityId] ?? 0;
  if (abilityMeta?.chargeUnlimited) {
    return { current, max: null, enabled: true };
  }

  const required =
    typeof abilityMeta?.chargeRequired === "number"
      ? abilityMeta.chargeRequired
      : null;
  if (required === null) {
    return { current, max: null, enabled: true };
  }

  const max =
    typeof abilityMeta?.maxCharges === "number"
      ? abilityMeta.maxCharges
      : required;
  const enabled = current >= required;
  return {
    current,
    max,
    enabled,
    reason: enabled ? undefined : "Not Enough charges",
  };
}

export function formatChargeLabel(
  abilityMeta: AbilityView | null | undefined,
  chargeState: AbilityChargeState,
  hideCharges: boolean
): string | null {
  if (!abilityMeta || hideCharges) return null;
  if (abilityMeta.chargeUnlimited) {
    return `${chargeState.current}`;
  }
  if (chargeState.max !== null) {
    return `${chargeState.current}/${chargeState.max}`;
  }
  return null;
}

export function isActionableAbility(ability: AbilityView): boolean {
  return ability.kind !== "passive" && !NON_ACTIONABLE_ABILITY_IDS.has(ability.id);
}

export function abilityActionMode(
  abilityId: string
): ActionPreviewMode | null {
  if (abilityId === KAISER_DORA_ID) return "dora";
  if (abilityId === GROZNY_INVADE_TIME_ID) return "invadeTime";
  if (abilityId === CHIKATILO_ASSASSIN_MARK_ID) return "assassinMark";
  if (abilityId === LECHY_GUIDE_TRAVELER_ID) return "guideTraveler";
  if (abilityId === EL_CID_TISONA_ID) return "tisona";
  if (abilityId === EL_CID_DEMON_DUELIST_ID) return "demonDuelist";
  if (abilityId === JEBE_HAIL_OF_ARROWS_ID) return "jebeHailOfArrows";
  if (abilityId === JEBE_KHANS_SHOOTER_ID) return "jebeKhansShooter";
  if (abilityId === HASSAN_TRUE_ENEMY_ID) return "hassanTrueEnemy";
  if (abilityId === KALADIN_FIFTH_ID) return "kaladinFifth";
  if (abilityId === ODIN_SLEIPNIR_ID) return "odinSleipnir";
  if (abilityId === ASGORE_FIREBALL_ID) return "asgoreFireball";
  if (abilityId === GUTS_ARBALET_ID) return "gutsArbalet";
  if (abilityId === GUTS_CANNON_ID) return "gutsCannon";
  if (abilityId === PAPYRUS_COOL_GUY_ID) return "papyrusCoolGuy";
  if (abilityId === SANS_GASTER_BLASTER_ID) return "sansGasterBlaster";
  if (abilityId === UNDYNE_SPEAR_THROW_ID) return "undyneSpearThrow";
  if (abilityId === UNDYNE_ENERGY_SPEAR_ID) return "undyneEnergySpear";
  if (abilityId === METTATON_POPPINS_ID) return "mettatonPoppins";
  if (abilityId === METTATON_LASER_ID) return "mettatonLaser";
  return null;
}

export function shouldHoverAbilityInActionList(abilityId: string): boolean {
  return abilityId === TRICKSTER_AOE_ID;
}

export function getActionModeHint(
  actionMode: ActionPreviewMode,
  papyrusLineAxis: PapyrusLineAxis,
  undyneAxis: "row" | "col"
): string {
  switch (actionMode) {
    case "dora":
      return "Dora: select a center cell on the archer line.";
    case "invadeTime":
      return "Invade Time: select any open cell on the board.";
    case "assassinMark":
      return "Assassin Mark: select a unit within 2 squares.";
    case "guideTraveler":
      return "Guide Traveler: select an ally within trickster range.";
    case "tisona":
      return "Tisona: select a cell on the same row or column.";
    case "demonDuelist":
      return "Demon Duelist: select an enemy in attack range.";
    case "jebeHailOfArrows":
      return "Hail of Arrows: select a center cell on your attack line.";
    case "jebeKhansShooter":
      return "Khan's Shooter: select an enemy in attack range.";
    case "hassanTrueEnemy":
      return "True Enemy: select an enemy within 2 cells.";
    case "odinSleipnir":
      return "Sleipnir: select any empty destination cell.";
    case "asgoreFireball":
      return "Fireball: select an enemy in ranged attack line.";
    case "gutsArbalet":
      return "Hand Crossbow: select an enemy in ranged attack line.";
    case "gutsCannon":
      return "Hand Cannon: select an enemy in ranged attack line.";
    case "papyrusCoolGuy":
      return `Cool Guy: select any cell on the chosen ${papyrusLineAxis} line.`;
    case "mettatonPoppins":
      return "Mettaton Poppins: select a 3x3 center on your attack line.";
    case "mettatonLaser":
      return "Laser: select a cell on your attack line.";
    case "sansGasterBlaster":
      return "Gaster Blaster: select a cell on the shooter line.";
    case "undyneSpearThrow":
      return "Throw Spear: select an enemy on the shooter line.";
    case "undyneEnergySpear":
      return `Energy Spear: select any cell on the chosen ${undyneAxis} line.`;
    default:
      return `Mode: ${actionMode}. Click a highlighted cell to apply.`;
  }
}
