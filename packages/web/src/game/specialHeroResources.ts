import type { AbilityView, PlayerView, UnitState } from "rules";
import type { PlayerRole } from "../ws";
import {
  CHIKATILO_DECOY_ID,
  DUOLINGO_MISSED_LESSONS_ID,
  FRISK_GENOCIDE_ID,
  FRISK_PACIFISM_ID,
  KANEKI_RC_CELLS_ID,
  LOKI_LAUGHT_ID,
  LUCHE_SUN_GLORY_ID,
  METTATON_RATING_ID,
  ZORO_DETERMINATION_ID,
} from "../rulesHints";

export type SpecialHeroResourceView = {
  id: string;
  label: string;
  value: number | string;
  max?: number;
  description?: string;
  isPrivate?: boolean;
};

type ResourceDefinition = {
  heroId: string;
  abilityId: string;
  fallbackLabel: string;
  max?: number;
  isPrivate: boolean;
  read?: (unit: UnitState) => number | undefined;
};

/**
 * Explicit exceptions and fallbacks for hero-wide currencies. Ordinary ability
 * counters intentionally do not belong here. The projected isSpecialCounter
 * metadata covers future resources without making charge-shaped UI guesses.
 */
const RESOURCE_DEFINITIONS: ResourceDefinition[] = [
  {
    heroId: "chikatilo",
    abilityId: CHIKATILO_DECOY_ID,
    fallbackLabel: "Decoy Points",
    isPrivate: true,
  },
  {
    heroId: "duolingo",
    abilityId: DUOLINGO_MISSED_LESSONS_ID,
    fallbackLabel: "Missed Lessons",
    isPrivate: true,
  },
  {
    heroId: "mettaton",
    abilityId: METTATON_RATING_ID,
    fallbackLabel: "Rating",
    isPrivate: false,
    read: (unit) => unit.mettatonRating,
  },
  {
    heroId: "zoro",
    abilityId: ZORO_DETERMINATION_ID,
    fallbackLabel: "Determination",
    isPrivate: true,
  },
  {
    heroId: "luche",
    abilityId: LUCHE_SUN_GLORY_ID,
    fallbackLabel: "Glory of the Sun",
    isPrivate: true,
  },
  {
    heroId: "kaneki",
    abilityId: KANEKI_RC_CELLS_ID,
    fallbackLabel: "RC Cells",
    isPrivate: true,
  },
  {
    heroId: "frisk",
    abilityId: FRISK_PACIFISM_ID,
    fallbackLabel: "Pacifism",
    isPrivate: true,
  },
  {
    heroId: "frisk",
    abilityId: FRISK_GENOCIDE_ID,
    fallbackLabel: "Genocide",
    isPrivate: true,
  },
  {
    heroId: "loki",
    abilityId: LOKI_LAUGHT_ID,
    fallbackLabel: "Loki's Laughter",
    isPrivate: true,
  },
];

function abilityById(
  gameView: PlayerView,
  unitId: string,
  abilityId: string,
): AbilityView | undefined {
  return gameView.abilitiesByUnitId?.[unitId]?.find((ability) => ability.id === abilityId);
}

function canSeeResource(
  unit: UnitState,
  viewerRole: PlayerRole | null,
  isPrivate: boolean,
): boolean {
  return !isPrivate || viewerRole === unit.owner;
}

export function getSpecialHeroResourceViews(
  unit: UnitState | null | undefined,
  gameView: PlayerView,
  viewerRole: PlayerRole | null,
): SpecialHeroResourceView[] {
  if (!unit?.heroId) return [];

  const resources: SpecialHeroResourceView[] = [];
  const seen = new Set<string>();

  for (const definition of RESOURCE_DEFINITIONS) {
    if (definition.heroId !== unit.heroId) continue;
    if (!canSeeResource(unit, viewerRole, definition.isPrivate)) continue;

    const ability = abilityById(gameView, unit.id, definition.abilityId);
    const value =
      definition.read?.(unit) ?? unit.charges?.[definition.abilityId] ?? ability?.currentCharges;
    if (value === undefined) continue;

    resources.push({
      id: definition.abilityId,
      label:
        definition.abilityId === CHIKATILO_DECOY_ID
          ? definition.fallbackLabel
          : ability?.name ?? definition.fallbackLabel,
      value,
      max:
        definition.max ??
        (ability?.chargeUnlimited ? undefined : ability?.maxCharges),
      description: ability?.description,
      isPrivate: definition.isPrivate,
    });
    seen.add(definition.abilityId);
  }

  // Projected metadata is the source of truth for additional hero-wide
  // currencies. It is available only for the controlling player.
  for (const ability of gameView.abilitiesByUnitId?.[unit.id] ?? []) {
    if (!ability.isSpecialCounter || seen.has(ability.id)) continue;
    if (!canSeeResource(unit, viewerRole, true)) continue;
    const value = unit.charges?.[ability.id] ?? ability.currentCharges;
    if (value === undefined) continue;
    resources.push({
      id: ability.id,
      label: ability.name,
      value,
      max: ability.maxCharges,
      description: ability.description,
      isPrivate: true,
    });
  }

  return resources;
}

export const SPECIAL_HERO_RESOURCE_IDS = new Set(
  RESOURCE_DEFINITIONS.map((definition) => definition.abilityId),
);
