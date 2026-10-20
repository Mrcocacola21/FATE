import type { PlayerId, PlayerView, UnitState } from "rules";
import { expansionEffect } from "./expansionRegistry";
import { BASIC_EXPANSION_HEROES } from "./expansionPresentation";
import type { ExpansionEffectId } from "./expansionCatalog.generated";
import { isVisibleCommander } from "./commanderSupport";

// Match getPolkovodetsSource, including its exclusions. Griffith and Grozny
// have commissioned art but do not currently grant this rule effect.
export interface ExpansionStatusArt { effectId: ExpansionEffectId; scaleCells: number }
export function expansionStatusArt(view: PlayerView, unit: UnitState, playerId: PlayerId | null): ExpansionStatusArt[] {
  if (!unit.isAlive || !unit.position || (unit.isStealthed && unit.owner !== playerId)) return [];
  const result: ExpansionStatusArt[] = [];
  const add = (hero: string, role: string, scaleCells = 1) => {
    const effectId = BASIC_EXPANSION_HEROES.has(hero) ? expansionEffect(hero, role) : undefined;
    if (effectId) result.push({ effectId, scaleCells });
  };
  // All eight neighbors, including diagonals: the actual Chebyshev radius one.
  if (unit.heroId && isVisibleCommander(unit, playerId)) add(unit.heroId, "commander_aura", 3);
  const hasSource = (ids: readonly string[] | undefined, hero: string) => ids?.some(id =>
    view.units[id]?.heroId === hero && view.units[id]?.isAlive && view.units[id]?.position &&
    (!view.units[id].isStealthed || view.units[id].owner === playerId));
  if (hasSource(unit.kaladinMoveLockSources, "kaladin")) add("kaladin", "liberation_bind");
  if (hasSource(unit.lokiMoveLockSources, "loki")) add("loki", "entangled_status");
  if (unit.blindUntilOwnTurnStart && unit.blindSourceId && hasSource([unit.blindSourceId], "luche")) add("luche", "blind_status");
  if (unit.immobilizedUntilOwnTurnStart && unit.immobilizedSourceId && hasSource([unit.immobilizedSourceId], "jackRipper")) add("jackRipper", "snare_bound");
  if (unit.movementDisabledNextTurn && unit.movementDisabledSourceId && hasSource([unit.movementDisabledSourceId], "vladTepes")) add("vladTepes", "forest_root");
  const bone = unit.papyrusBoneStatus;
  if (bone && hasSource([bone.sourceUnitId], "papyrus")) add("papyrus", `${bone.kind}_bone_status`);
  return result;
}
