import { translateForLanguage, type Language } from "../../../i18n";
import type { AbilityView, MoveMode, PapyrusLineAxis, UnitState } from "rules";
import {
  ASGORE_FIREBALL_ID,
  ASGORE_FIRE_PARADE_ID,
  ASGORE_SOUL_PARADE_ID,
  CHIKATILO_ASSASSIN_MARK_ID,
  EL_CID_DEMON_DUELIST_ID,
  EL_CID_TISONA_ID,
  GROZNY_INVADE_TIME_ID,
  GROZNY_TYRANT_ID,
  GUTS_ARBALET_ID,
  GUTS_BERSERK_MODE_ID,
  GUTS_CANNON_ID,
  GRIFFITH_FEMTO_REBIRTH_ID,
  HASSAN_ASSASSIN_ORDER_ID,
  HASSAN_TRUE_ENEMY_ID,
  JEBE_HAIL_OF_ARROWS_ID,
  JEBE_KHANS_SHOOTER_ID,
  KAISER_DORA_ID,
  KALADIN_FIFTH_ID,
  GENGHIS_KHAN_KHANS_DECREE_ID,
  LECHY_CONFUSE_TERRAIN_ID,
  LECHY_GUIDE_TRAVELER_ID,
  LOKI_LAUGHT_ID,
  METTATON_EX_ID,
  METTATON_LASER_ID,
  METTATON_NEO_ID,
  METTATON_POPPINS_ID,
  ODIN_SLEIPNIR_ID,
  PAPYRUS_COOL_GUY_ID,
  RIVER_PERSON_BOAT_ID,
  RIVER_PERSON_BOATMAN_ID,
  RIVER_PERSON_TRA_LA_LA_ID,
  SANS_GASTER_BLASTER_ID,
  TRICKSTER_AOE_ID,
  UNDYNE_ENERGY_SPEAR_ID,
  UNDYNE_SPEAR_THROW_ID,
  DUOLINGO_PUSH_NOTIFICATION_ID,
  LUCHE_DIVINE_RAY_ID,
  ZORO_ONI_GIRI_ID,
  DON_SORROWFUL_ID,
  DON_WINDMILLS_ID,
  JACK_SNARES_ID,
  JACK_HOLY_MOTHER_ID,
  ARTEMIS_MOON_INSIGHT_ID,
  ARTEMIS_SILVER_SICKLE_ID,
  LUCHE_BURNING_SUN_ID,
  KANEKI_REGENERATION_ID,
  KANEKI_CENTIPEDE_ID,
  ZORO_ASURA_ID,
  DON_MAD_DELUSION_ID,
} from "../../../rulesHints";
import type { ActionPreviewMode } from "../../../store";
import type { Translate } from "../../../i18n";

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
  ODIN_SLEIPNIR_ID,
  GRIFFITH_FEMTO_REBIRTH_ID,
  METTATON_EX_ID,
  METTATON_NEO_ID,
  KANEKI_CENTIPEDE_ID,
  DON_MAD_DELUSION_ID,
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

export function formatMoveMode(
  mode: MoveMode,
  t: Translate,
  baseClass?: UnitState["class"],
): string {
  const classId = mode === "normal" && baseClass ? baseClass : mode;
  return t("game.moveAs", { class: t(`classes.${classId}`) });
}

export function isRangedSingleTargetClass(unitClass: UnitState["class"]): boolean {
  return unitClass === "archer" || unitClass === "spearman" || unitClass === "trickster";
}

export function getAbilityChargeState(
  abilityId: string,
  unitState: UnitState | null,
  abilityMeta?: AbilityView | null,
): AbilityChargeState {
  const current = abilityMeta?.currentCharges ?? unitState?.charges?.[abilityId] ?? 0;
  const required =
    typeof abilityMeta?.chargeRequired === "number" ? abilityMeta.chargeRequired : null;
  const enabled = abilityMeta?.isAvailable ?? false;
  const reason =
    abilityMeta?.disabledReasonCode === "notEnoughCharges" ||
    abilityMeta?.disabledReason === "Not Enough charges"
      ? "game.notEnoughCharges"
      : undefined;

  if (abilityMeta?.chargeUnlimited) {
    return {
      current,
      max: null,
      enabled,
      reason,
    };
  }

  if (required === null) {
    return { current, max: null, enabled, reason };
  }

  const max = typeof abilityMeta?.maxCharges === "number" ? abilityMeta.maxCharges : null;
  return {
    current,
    max,
    enabled,
    reason,
  };
}

export function formatChargeLabel(
  abilityMeta: AbilityView | null | undefined,
  chargeState: AbilityChargeState,
  hideCharges: boolean,
): string | null {
  if (!abilityMeta || hideCharges) return null;
  if (abilityMeta.chargeUnlimited) {
    return `${chargeState.current}`;
  }
  if (chargeState.max !== null) {
    return `${chargeState.current}/${chargeState.max}`;
  }
  return abilityMeta.currentCharges !== undefined ? `${chargeState.current}` : null;
}

export function shouldRenderManualAbilityButton(ability: AbilityView): boolean {
  return (
    ability.kind !== "passive" &&
    (ability.kind !== "impulse" || ability.id === LUCHE_DIVINE_RAY_ID) &&
    !NON_ACTIONABLE_ABILITY_IDS.has(ability.id)
  );
}

// Compatibility name for existing consumers. Manual action surfaces on desktop
// and mobile both flow through this predicate.
export const isActionableAbility = shouldRenderManualAbilityButton;

export function abilityActionMode(abilityId: string): ActionPreviewMode | null {
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
  if (abilityId === ASGORE_FIRE_PARADE_ID) return "asgoreFireParade";
  if (abilityId === GUTS_ARBALET_ID) return "gutsArbalet";
  if (abilityId === GUTS_CANNON_ID) return "gutsCannon";
  if (abilityId === PAPYRUS_COOL_GUY_ID) return "papyrusCoolGuy";
  if (abilityId === SANS_GASTER_BLASTER_ID) return "sansGasterBlaster";
  if (abilityId === UNDYNE_SPEAR_THROW_ID) return "undyneSpearThrow";
  if (abilityId === UNDYNE_ENERGY_SPEAR_ID) return "undyneEnergySpear";
  if (abilityId === METTATON_POPPINS_ID) return "mettatonPoppins";
  if (abilityId === METTATON_LASER_ID) return "mettatonLaser";
  if (abilityId === DUOLINGO_PUSH_NOTIFICATION_ID) return "duolingoPush";
  if (abilityId === LUCHE_DIVINE_RAY_ID) return "lucheLightRay";
  if (abilityId === ZORO_ONI_GIRI_ID) return "zoroOniGiri";
  if (abilityId === DON_SORROWFUL_ID) return "donReaction";
  if (abilityId === DON_WINDMILLS_ID) return "donWindmills";
  if (abilityId === JACK_SNARES_ID) return "jackTrap";
  if (abilityId === JACK_HOLY_MOTHER_ID) return "jackHolyMother";
  if (abilityId === ARTEMIS_MOON_INSIGHT_ID) return "artemisMoonInsight";
  if (abilityId === ARTEMIS_SILVER_SICKLE_ID) return "artemisSilverSickle";
  return null;
}

export function shouldHoverAbilityInActionList(abilityId: string): boolean {
  return (
    abilityId === TRICKSTER_AOE_ID ||
    abilityId === CHIKATILO_ASSASSIN_MARK_ID ||
    abilityId === GUTS_BERSERK_MODE_ID ||
    abilityId === LOKI_LAUGHT_ID ||
    abilityId === RIVER_PERSON_BOAT_ID ||
    abilityId === RIVER_PERSON_BOATMAN_ID ||
    abilityId === RIVER_PERSON_TRA_LA_LA_ID ||
    abilityId === GENGHIS_KHAN_KHANS_DECREE_ID ||
    abilityId === LUCHE_BURNING_SUN_ID ||
    abilityId === KANEKI_REGENERATION_ID ||
    abilityId === ZORO_ASURA_ID ||
    abilityId === ARTEMIS_SILVER_SICKLE_ID
  );
}

/** Players see the axis by its label, never the rules id ("diagMain"). */
function axisLabel(axis: PapyrusLineAxis, language: Language): string {
  const key =
    axis === "row"
      ? "game.rows"
      : axis === "col"
        ? "game.columns"
        : axis === "diagMain"
          ? "game.diagonalMain"
          : "game.diagonalAnti";
  return translateForLanguage(language, key);
}

export function getActionModeHint(
  actionMode: ActionPreviewMode,
  papyrusLineAxis: PapyrusLineAxis,
  undyneAxis: "row" | "col",
  language: Language,
): string {
  switch (actionMode) {
    case "move":
      return translateForLanguage(language, "presentation.rightPanelHelpers.Choose_a_destination");
    case "dora":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Dora_select_a_center_cell_on_the",
      );
    case "artemisMoonInsight":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Moon_Insight_choose_a_x_center_on",
      );
    case "artemisSilverSickle":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Silver_Moon_Sickle_choose_an_endpoint_on",
      );
    case "invadeTime":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Invade_Time_select_any_open_cell_on",
      );
    case "assassinMark":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Select_a_target_for_Killer_s_Mark",
      );
    case "guideTraveler":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Guide_Traveler_select_an_ally_within_trickster",
      );
    case "tisona":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Tisona_select_a_cell_on_the_same",
      );
    case "demonDuelist":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Demon_Duelist_select_an_enemy_in_attack",
      );
    case "jebeHailOfArrows":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Hail_of_Arrows_select_a_center_cell",
      );
    case "jebeKhansShooter":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Khan_s_Shooter_select_an_enemy_in",
      );
    case "hassanTrueEnemy":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.True_Enemy_select_a_unit_to_control",
      );
    case "odinSleipnir":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Sleipnir_select_any_empty_destination_cell",
      );
    case "asgoreFireball":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Fireball_select_an_enemy_in_ranged_attack",
      );
    case "asgoreFireParade":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Fire_Parade_confirm_the_area_around_Asgore",
      );
    case "gutsArbalet":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Hand_Crossbow_select_an_enemy_in_ranged",
      );
    case "gutsCannon":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Hand_Cannon_select_an_enemy_in_ranged",
      );
    case "papyrusCoolGuy":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Cool_Guy_select_any_cell_on_the",
        { value0: axisLabel(papyrusLineAxis, language) },
      );
    case "mettatonPoppins":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Mettaton_Poppins_select_a_x_center_on",
      );
    case "mettatonLaser":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Laser_select_a_cell_on_your_attack",
      );
    case "sansGasterBlaster":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Gaster_Blaster_select_a_cell_on_the",
      );
    case "undyneSpearThrow":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Throw_Spear_select_an_enemy_on_the",
      );
    case "duolingoPush":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Push_Notification_choose_a_creature_then_a",
      );
    case "lucheLightRay":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Light_Ray_choose_a_highlighted_straight_line",
      );
    case "lucheLightRayAround":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Light_Ray_confirm_the_blast_around_Luche",
      );
    case "zoroOniGiri":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Oni_Giri_choose_an_enemy_on_a",
      );
    case "undyneEnergySpear":
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Energy_Spear_select_any_cell_on_the",
        { value0: axisLabel(undyneAxis, language) },
      );
    default:
      return translateForLanguage(
        language,
        "presentation.rightPanelHelpers.Mode_Click_a_highlighted_cell_to_apply",
        { value0: actionMode },
      );
  }
}
