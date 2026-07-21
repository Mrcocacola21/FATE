import type { MoveMode, PlayerView, UnitClass, UnitState } from "rules";

export interface MovementModeOption {
  id: MoveMode;
  classId: UnitClass;
  isAvailable: boolean;
  reason?: string;
}

function uniqueClasses(classes: UnitClass[]): UnitClass[] {
  return [...new Set(classes)];
}

function movementClassesForProjectedUnit(unit: UnitState): UnitClass[] {
  if (unit.heroId === "mettaton") {
    return unit.mettatonNeoUnlocked ? ["rider", "berserker"] : ["rider"];
  }
  if (unit.heroId === "guts") {
    return unit.gutsBerserkModeActive
      ? ["berserker", "knight", "assassin"]
      : ["berserker", "knight"];
  }
  if (unit.heroId === "kaladin") return ["spearman", "trickster", "berserker"];
  if (unit.heroId === "kaneki") {
    return uniqueClasses([
      unit.class,
      "assassin",
      ...(unit.kanekiCentipedeUnlocked ? (["rider"] as UnitClass[]) : []),
    ]);
  }
  if (unit.heroId === "duolingo" && unit.duolingoBerserkerUnlocked) {
    return uniqueClasses([unit.class, "berserker"]);
  }
  if (unit.heroId === "artemida") return uniqueClasses([unit.class, "trickster"]);
  if (unit.heroId === "undyne") return uniqueClasses([unit.class, "spearman"]);
  if (unit.heroId === "grand-kaiser" && unit.transformed) {
    return ["archer", "rider", "berserker"];
  }
  return [unit.class];
}

/**
 * Mirrors the authoritative rules capability list while preserving the
 * protocol's `normal` identifier for a unit's base movement class.
 */
export function getAvailableMovementModes(
  unit: UnitState,
  gameView?: Pick<PlayerView, "legalIntents"> | null,
): MovementModeOption[] {
  const canMove = gameView?.legalIntents?.canMove !== false;
  return movementClassesForProjectedUnit(unit).map((classId) => ({
    id: classId === unit.class ? "normal" : classId,
    classId,
    isAvailable: canMove,
    reason: canMove ? undefined : "Movement unavailable",
  }));
}

export function shouldRequestMovementOptions(
  unit: UnitState,
  gameView?: Pick<PlayerView, "legalIntents"> | null,
): boolean {
  const options = getAvailableMovementModes(unit, gameView);
  return (
    options.length > 1 ||
    options.some((option) => option.classId === "trickster" || option.classId === "berserker")
  );
}
