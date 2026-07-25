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
  let intrinsic: UnitClass[];
  if (unit.heroId === "mettaton") {
    intrinsic = unit.mettatonNeoUnlocked ? ["rider", "berserker"] : ["rider"];
  } else if (unit.heroId === "guts") {
    intrinsic = unit.gutsBerserkModeActive
      ? ["berserker", "knight", "assassin"]
      : ["berserker", "knight"];
  } else if (unit.heroId === "kaladin") {
    intrinsic = ["spearman", "trickster", "berserker"];
  } else if (unit.heroId === "kaneki") {
    intrinsic = uniqueClasses([
      unit.class,
      "assassin",
      ...(unit.kanekiCentipedeUnlocked ? (["rider"] as UnitClass[]) : []),
    ]);
  } else if (unit.heroId === "duolingo" && unit.duolingoBerserkerUnlocked) {
    intrinsic = uniqueClasses([unit.class, "berserker"]);
  } else if (unit.heroId === "artemida") {
    intrinsic = uniqueClasses([unit.class, "trickster"]);
  } else if (unit.heroId === "undyne") {
    intrinsic = uniqueClasses([unit.class, "spearman"]);
  } else if (unit.heroId === "grand-kaiser" && unit.transformed) {
    intrinsic = ["archer", "rider", "berserker"];
  } else {
    intrinsic = [unit.class];
  }

  if (
    unit.heroId !== "grozny" ||
    new Set(unit.tyrantFinishedAllyIds ?? []).size < 2
  ) {
    return intrinsic;
  }
  return uniqueClasses([
    ...intrinsic,
    ...(unit.tyrantMovementSources ?? []).flatMap(
      (source) => source.movementClasses,
    ),
  ]);
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
