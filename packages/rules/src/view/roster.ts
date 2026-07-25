import { HERO_GRAND_KAISER_ID, getHeroDefinition } from "../heroes";
import { PlayerId, ProjectedUnitForRoster, UnitState } from "../model";
import { getUnitDefinition } from "../units";

function getRosterMaxHp(unit: UnitState): number {
  if (unit.heroId === HERO_GRAND_KAISER_ID && unit.transformed) {
    return getUnitDefinition("berserker").maxHp;
  }
  return getHeroDefinition(unit.heroId)?.baseHpOverride ?? getUnitDefinition(unit.class).maxHp;
}

function projectRosterUnit(
  unit: UnitState,
  viewer: PlayerId | "spectator",
): ProjectedUnitForRoster {
  const exactHp = unit.owner === viewer;
  return {
    id: unit.id,
    owner: unit.owner,
    class: unit.class,
    figureId: unit.figureId,
    heroId: unit.heroId,
    transformed: unit.transformed,
    isAlive: unit.isAlive,
    isPlaced: unit.position !== null,
    isStealthed: unit.isStealthed,
    blindUntilOwnTurnStart: unit.blindUntilOwnTurnStart,
    isChicken: (unit.lokiChickenSources?.length ?? 0) > 0,
    duolingoBerserkerUnlocked: unit.duolingoBerserkerUnlocked,
    gutsBerserkModeActive: unit.gutsBerserkModeActive,
    kanekiCentipedeUnlocked: unit.kanekiCentipedeUnlocked,
    mettatonExUnlocked: unit.mettatonExUnlocked,
    mettatonNeoUnlocked: unit.mettatonNeoUnlocked,
    papyrusUnbelieverActive: unit.papyrusUnbelieverActive,
    sansUnbelieverUnlocked: unit.sansUnbelieverUnlocked,
    undyneImmortalActive: unit.undyneImmortalActive,
    friskPacifismDisabled: unit.friskPacifismDisabled,
    hpVisibility: exactHp ? "exact" : "hidden",
    ...(exactHp ? { hp: unit.hp, maxHp: getRosterMaxHp(unit) } : {}),
  };
}

/**
 * Build Players-tab summaries from an already recipient-safe unit projection.
 * This deliberately cannot re-introduce hidden units, private identities, or
 * authoritative HP that were omitted from the recipient's normal view.
 */
export function projectRosterUnits(
  projectedUnits: Record<string, UnitState>,
  viewer: PlayerId | "spectator",
): Record<string, ProjectedUnitForRoster> {
  return Object.fromEntries(
    Object.values(projectedUnits).map((unit) => [unit.id, projectRosterUnit(unit, viewer)]),
  );
}
