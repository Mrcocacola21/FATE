import type { UnitClass } from "rules";

// Keep in sync with packages/rules for UI-only helpers.
export const TRICKSTER_AOE_ID = "tricksterAoE";
export const TRICKSTER_AOE_RADIUS = 2;
export const KAISER_DORA_ID = "kaiserDora";
export const VLAD_TEPES_ID = "vladTepes";

const MAX_HP_BY_CLASS: Record<UnitClass, number> = {
  spearman: 5,
  rider: 6,
  knight: 6,
  archer: 5,
  trickster: 4,
  assassin: 4,
  berserker: 8,
};

export function getMaxHp(unitClass: UnitClass, heroId?: string): number {
  let base = MAX_HP_BY_CLASS[unitClass] ?? 1;
  if (heroId === VLAD_TEPES_ID) {
    base += 2;
  }
  return base;
}
