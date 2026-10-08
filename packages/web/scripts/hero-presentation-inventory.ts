import { HERO_CATALOG, getHeroMeta, getAbilitySpec, type UnitState } from "rules";
import { collectAbilityIdsForUnit } from "../../rules/src/abilities/viewIds";

/** Catalog plus runtime forms; ability IDs come from canonical metadata and
 * projected unlock variants, never the asset directory. Dev/report use only. */
export function heroPresentationInventory() {
  return [
    ...HERO_CATALOG,
    { id: "falseTrailToken", name: "False Trail token", mainClass: "assassin" as const },
  ].map((hero) => {
    const meta = getHeroMeta(hero.id);
    const variants = [
      {},
      {
        transformed: true,
        papyrusUnbelieverActive: true,
        sansUnbelieverUnlocked: true,
        mettatonExUnlocked: true,
        mettatonNeoUnlocked: true,
        gutsBerserkModeActive: true,
      },
    ];
    const ids = new Set([
      ...(meta?.abilities.map((a) => a.id) ?? []),
      ...variants.flatMap((variant) =>
        collectAbilityIdsForUnit({
          heroId: hero.id,
          class: hero.mainClass,
          ...variant,
        } as UnitState),
      ),
    ]);
    return {
      ...hero,
      abilities: [...ids].map((id) => ({
        id,
        spec: getAbilitySpec(id),
        meta: meta?.abilities.find((ability) => ability.id === id),
      })),
    };
  });
}
