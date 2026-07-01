import type { Coord, PlayerId, PlayerView, UnitState } from "rules";
import type { TargetRef } from "./previewTypes";

export function canViewerSeeUnit(
  gameView: PlayerView | null | undefined,
  _viewerPlayerId: PlayerId | null | undefined,
  unitId: string,
): boolean {
  const unit = gameView?.units[unitId];
  return !!unit?.isAlive && !!unit.position;
}

export function canViewerKnowExactCell(
  gameView: PlayerView | null | undefined,
  viewerPlayerId: PlayerId | null | undefined,
  unitId: string,
): boolean {
  return canViewerSeeUnit(gameView, viewerPlayerId, unitId);
}

export function canViewerTargetHiddenUnit(
  gameView: PlayerView | null | undefined,
  viewerPlayerId: PlayerId | null | undefined,
  unitId: string,
  allowedTargetIds?: ReadonlySet<string>,
): boolean {
  if (!canViewerKnowExactCell(gameView, viewerPlayerId, unitId)) return false;
  if (allowedTargetIds && !allowedTargetIds.has(unitId)) return false;
  return true;
}

export function targetRefForUnit(unit: UnitState, disabled = false): TargetRef | null {
  if (!unit.isAlive || !unit.position) return null;
  return {
    type: "unit",
    unitId: unit.id,
    cell: { ...unit.position },
    disabled,
  };
}

export function targetRefsFromIds(
  gameView: PlayerView,
  targetIds: string[],
  disabled = false,
): TargetRef[] {
  const refs: TargetRef[] = [];
  for (const targetId of targetIds) {
    const unit = gameView.units[targetId];
    const ref = unit ? targetRefForUnit(unit, disabled) : null;
    if (ref) refs.push(ref);
  }
  return refs;
}

export function visibleUnitTargets(
  gameView: PlayerView,
  predicate: (unit: UnitState) => boolean,
  disabled = false,
): TargetRef[] {
  const refs: TargetRef[] = [];
  for (const unit of Object.values(gameView.units)) {
    if (!unit.isAlive || !unit.position) continue;
    if (!predicate(unit)) continue;
    const ref = targetRefForUnit(unit, disabled);
    if (ref) refs.push(ref);
  }
  return refs;
}

export function targetCells(targets: TargetRef[]): Coord[] {
  return targets.map((target) => target.cell);
}
