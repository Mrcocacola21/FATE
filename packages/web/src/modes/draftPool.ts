import type { HeroDraftMeta, UnitClass } from "rules";

/** Groups the authoritative pool received from the server without rebuilding eligibility. */
export function groupDraftPoolByClass(
  draftPool: readonly HeroDraftMeta[]
): Map<UnitClass, HeroDraftMeta[]> {
  const grouped = new Map<UnitClass, HeroDraftMeta[]>();
  for (const hero of draftPool) {
    const heroes = grouped.get(hero.primaryClass) ?? [];
    heroes.push(hero);
    grouped.set(hero.primaryClass, heroes);
  }
  return grouped;
}
