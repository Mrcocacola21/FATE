import type { PlayerId, PlayerView, UnitState } from "rules";
import { hasCommanderAura } from "../../../../rules/src/unitFeatures";

// Matches getPolkovodetsSource in rules/actions/heroes/vlad.ts. Only projected,
// permitted sources are considered here; never infer a concealed commander.
export function isVisibleCommander(unit: UnitState, playerId: PlayerId | null): boolean {
  return Boolean(unit.isAlive && unit.position && hasCommanderAura(unit) &&
    (!unit.isStealthed || unit.owner === playerId));
}

export function hasCommanderSupport(unit: UnitState, units: PlayerView["units"] | undefined, playerId: PlayerId | null): boolean {
  if (!unit.isAlive || !unit.position || unit.heroId === "falseTrailToken" || (unit.isStealthed && unit.owner !== playerId)) return false;
  const position = unit.position;
  return Object.values(units ?? {}).some(source => source.id !== unit.id && source.owner === unit.owner &&
    isVisibleCommander(source, playerId) && source.position &&
    Math.max(Math.abs(source.position.col - position.col), Math.abs(source.position.row - position.row)) <= 1);
}
