import type { UnitState } from "../model";
import {
  HERO_ARTEMIDA_ID,
  HERO_DON_KIHOTE_ID,
  HERO_DUOLINGO_ID,
  HERO_JACK_RIPPER_ID,
  HERO_KANEKI_ID,
  HERO_LUCHE_ID,
  HERO_ZORO_ID,
} from "../heroes";
import * as ids from "./constants";

export function appendLegacyHeroAbilityIds(
  unit: UnitState,
  abilityIds: string[]
): void {
  if (unit.heroId === HERO_DUOLINGO_ID) {
    abilityIds.push(
      ids.ABILITY_DUOLINGO_STRICK,
      ids.ABILITY_DUOLINGO_PUSH_NOTIFICATION,
      ids.ABILITY_DUOLINGO_SKIP_CLASSES,
      ids.ABILITY_DUOLINGO_BERSERKER
    );
  }
  if (unit.heroId === HERO_LUCHE_ID) {
    abilityIds.push(
      ids.ABILITY_LUCHE_SUN_GLORY,
      ids.ABILITY_LUCHE_SHINE,
      ids.ABILITY_LUCHE_DIVINE_RAY,
      ids.ABILITY_LUCHE_BURNING_SUN
    );
  }
  if (unit.heroId === HERO_KANEKI_ID) {
    abilityIds.push(
      ids.ABILITY_KANEKI_RINKAKU_KAGUNE,
      ids.ABILITY_KANEKI_RC_CELLS,
      ids.ABILITY_KANEKI_SCOLOPENDRA
    );
  }
  if (unit.heroId === HERO_ZORO_ID) {
    abilityIds.push(
      ids.ABILITY_ZORO_DETERMINATION,
      ids.ABILITY_ZORO_ONI_GIRI,
      ids.ABILITY_ZORO_3_SWORD_STYLE,
      ids.ABILITY_ZORO_ASURA
    );
  }
  if (unit.heroId === HERO_DON_KIHOTE_ID) {
    abilityIds.push(
      ids.ABILITY_DON_KIHOTE_SORROWFUL_COUNTENANCE,
      ids.ABILITY_DON_KIHOTE_WINDMILLS,
      ids.ABILITY_DON_KIHOTE_MADNESS,
      ids.ABILITY_VLAD_POLKOVODETS
    );
  }
  if (unit.heroId === HERO_JACK_RIPPER_ID) {
    abilityIds.push(
      ids.ABILITY_JACK_RIPPER_SURGERY,
      ids.ABILITY_JACK_RIPPER_SNARES,
      ids.ABILITY_JACK_RIPPER_DISMEMBERMENT,
      ids.ABILITY_JACK_RIPPER_LEGEND_KILLER
    );
  }
  if (unit.heroId === HERO_ARTEMIDA_ID) {
    abilityIds.push(
      ids.ABILITY_ARTEMIDA_ACCURATE_ARROW,
      ids.ABILITY_ARTEMIDA_MOONLIGHT_SHINE,
      ids.ABILITY_ARTEMIDA_SILVER_CRESCENT,
      ids.ABILITY_ARTEMIDA_NATURE_MOVEMENT
    );
  }
}
