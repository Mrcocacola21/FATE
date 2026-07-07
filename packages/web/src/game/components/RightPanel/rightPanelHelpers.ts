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

export function formatMoveMode(mode: MoveMode, t: Translate): string {
  return t(`classes.${mode}`);
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
  const required =
    typeof abilityMeta?.chargeRequired === "number"
      ? abilityMeta.chargeRequired
      : null;
  const enabled = required === null || current >= required;

  if (abilityMeta?.chargeUnlimited) {
    return {
      current,
      max: null,
      enabled,
      reason: enabled ? undefined : "game.notEnoughCharges",
    };
  }

  if (required === null) {
    return { current, max: null, enabled: true };
  }

  const max =
    typeof abilityMeta?.maxCharges === "number"
      ? abilityMeta.maxCharges
      : null;
  return {
    current,
    max,
    enabled,
    reason: enabled ? undefined : "game.notEnoughCharges",
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
  return abilityMeta.currentCharges !== undefined ? `${chargeState.current}` : null;
}

export function isActionableAbility(ability: AbilityView): boolean {
  return (
    ability.kind !== "passive" &&
    ability.kind !== "impulse" &&
    !NON_ACTIONABLE_ABILITY_IDS.has(ability.id)
  );
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
  return (
    abilityId === TRICKSTER_AOE_ID ||
    abilityId === ASGORE_FIRE_PARADE_ID ||
    abilityId === CHIKATILO_ASSASSIN_MARK_ID ||
    abilityId === GUTS_BERSERK_MODE_ID ||
    abilityId === LOKI_LAUGHT_ID ||
    abilityId === RIVER_PERSON_BOAT_ID ||
    abilityId === RIVER_PERSON_BOATMAN_ID ||
    abilityId === RIVER_PERSON_TRA_LA_LA_ID ||
    abilityId === GENGHIS_KHAN_KHANS_DECREE_ID
  );
}

export function getActionModeHint(
  actionMode: ActionPreviewMode,
  papyrusLineAxis: PapyrusLineAxis,
  undyneAxis: "row" | "col",
  language: "en" | "uk",
): string {
  const uk = language === "uk";
  switch (actionMode) {
    case "dora":
      return uk ? "Дора: оберіть центральну клітинку на лінії лучника." : "Dora: select a center cell on the archer line.";
    case "invadeTime":
      return uk ? "Час вторгнення: оберіть будь-яку вільну клітинку." : "Invade Time: select any open cell on the board.";
    case "assassinMark":
      return uk
        ? "Оберіть ціль для Мітки вбивці."
        : "Select a target for Assassin's Mark.";
    case "guideTraveler":
      return uk ? "Провідник: оберіть союзника в радіусі трикстера." : "Guide Traveler: select an ally within trickster range.";
    case "tisona":
      return uk ? "Тісона: оберіть клітинку в тому самому рядку або стовпці." : "Tisona: select a cell on the same row or column.";
    case "demonDuelist":
      return uk ? "Демон-дуелянт: оберіть ворога в дальності атаки." : "Demon Duelist: select an enemy in attack range.";
    case "jebeHailOfArrows":
      return uk ? "Град стріл: оберіть центр на лінії атаки." : "Hail of Arrows: select a center cell on your attack line.";
    case "jebeKhansShooter":
      return uk ? "Стрілець хана: оберіть ворога в дальності атаки." : "Khan's Shooter: select an enemy in attack range.";
    case "hassanTrueEnemy":
      return uk
        ? "\u0421\u043f\u0440\u0430\u0432\u0436\u043d\u0456\u0439 \u0432\u043e\u0440\u043e\u0433: \u043e\u0431\u0435\u0440\u0456\u0442\u044c \u0444\u0456\u0433\u0443\u0440\u0443 \u0434\u043b\u044f \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044e."
        : "True Enemy: select a unit to control.";
    case "odinSleipnir":
      return uk ? "Слейпнір: оберіть будь-яку вільну клітинку." : "Sleipnir: select any empty destination cell.";
    case "asgoreFireball":
      return uk ? "Вогняна куля: оберіть ворога на лінії дальньої атаки." : "Fireball: select an enemy in ranged attack line.";
    case "gutsArbalet":
      return uk ? "Ручний арбалет: оберіть ворога на лінії дальньої атаки." : "Hand Crossbow: select an enemy in ranged attack line.";
    case "gutsCannon":
      return uk ? "Ручна гармата: оберіть ворога на лінії дальньої атаки." : "Hand Cannon: select an enemy in ranged attack line.";
    case "papyrusCoolGuy":
      return uk ? `Крутий хлопець: оберіть клітинку на лінії ${papyrusLineAxis}.` : `Cool Guy: select any cell on the chosen ${papyrusLineAxis} line.`;
    case "mettatonPoppins":
      return uk ? "Меттатон Поппінс: оберіть центр 3×3 на лінії атаки." : "Mettaton Poppins: select a 3x3 center on your attack line.";
    case "mettatonLaser":
      return uk ? "Лазер: оберіть клітинку на лінії атаки." : "Laser: select a cell on your attack line.";
    case "sansGasterBlaster":
      return uk ? "Ґастер-бластер: оберіть клітинку на лінії пострілу." : "Gaster Blaster: select a cell on the shooter line.";
    case "undyneSpearThrow":
      return uk ? "Кидок списа: оберіть ворога на лінії пострілу." : "Throw Spear: select an enemy on the shooter line.";
    case "undyneEnergySpear":
      return uk ? `Енергетичний спис: оберіть клітинку на лінії ${undyneAxis}.` : `Energy Spear: select any cell on the chosen ${undyneAxis} line.`;
    default:
      return uk ? `Режим: ${actionMode}. Оберіть підсвічену клітинку.` : `Mode: ${actionMode}. Click a highlighted cell to apply.`;
  }
}
