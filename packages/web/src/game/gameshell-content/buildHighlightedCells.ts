import type { Coord, MoveMode, PlayerView, UnitState } from "rules";
import type { ActionMode } from "../../store";
import {
  type CellHighlightKind,
  coordKey,
  getOrthogonalLineCells,
  linePath,
} from "./helpers";

type MoveModeSource = {
  mode?: MoveMode;
};

export interface BuildHighlightedCellsArgs {
  effectiveActionMode: ActionMode;
  modePreviewKind: "previewMove" | "previewAttack" | "previewAbility" | null;
  legalPlacementCoords: Coord[];
  legalMoveCoords: Coord[];
  legalAttackTargets: string[];
  attackPreviewCells: Coord[];
  papyrusLongBoneAttackTargetIds: string[];
  doraTargetCenters: Coord[];
  view: PlayerView | null;
  isStakePlacement: boolean;
  stakeLegalPositions: Coord[];
  stakeSelections: Coord[];
  isIntimidateChoice: boolean;
  intimidateOptions: Coord[];
  isForestTarget: boolean;
  forestTargetCenters: Coord[];
  isForestMoveDestination: boolean;
  forestMoveDestinationOptions: Coord[];
  isFemtoDivineMoveDestination: boolean;
  femtoDivineMoveOptions: Coord[];
  isRiverBoatCarryChoice: boolean;
  riverBoatCarryOptionKeys: Set<string>;
  isRiverBoatDropDestination: boolean;
  riverBoatDropDestinationOptions: Coord[];
  isRiverTraLaLaTargetChoice: boolean;
  riverTraLaLaTargetKeys: Set<string>;
  isRiverTraLaLaDestinationChoice: boolean;
  riverTraLaLaDestinationOptions: Coord[];
  isChikatiloPlacement: boolean;
  chikatiloPlacementCoords: Coord[];
  isGuideTravelerPlacement: boolean;
  guideTravelerPlacementCoords: Coord[];
  isJebeKhansShooterTargetChoice: boolean;
  jebeKhansShooterTargetKeys: Set<string>;
  isHassanTrueEnemyTargetChoice: boolean;
  hassanTrueEnemyTargetKeys: Set<string>;
  isAsgoreSoulParadePatienceTargetChoice: boolean;
  asgorePatienceTargetKeys: Set<string>;
  isAsgoreSoulParadePerseveranceTargetChoice: boolean;
  asgorePerseveranceTargetKeys: Set<string>;
  isAsgoreSoulParadeJusticeTargetChoice: boolean;
  asgoreJusticeTargetKeys: Set<string>;
  isAsgoreSoulParadeIntegrityDestination: boolean;
  asgoreIntegrityDestinationOptions: Coord[];
  isHassanAssassinOrderSelection: boolean;
  hassanAssassinOrderEligibleKeys: Set<string>;
  hassanAssassinOrderSelections: string[];
  isLokiChickenTargetChoice: boolean;
  lokiChickenTargetKeys: Set<string>;
  isLokiMindControlEnemyChoice: boolean;
  lokiMindControlEnemyKeys: Set<string>;
  isLokiMindControlTargetChoice: boolean;
  lokiMindControlTargetKeys: Set<string>;
  isFriskPacifismHugsTargetChoice: boolean;
  friskPacifismHugsTargetKeys: Set<string>;
  isFriskWarmWordsTargetChoice: boolean;
  friskWarmWordsTargetKeys: Set<string>;
  hassanTrueEnemyCandidateKeys: Set<string>;
  selectedUnit: UnitState | null;
  pendingMoveForSelected: MoveModeSource | null;
  moveOptions: MoveModeSource | null;
  jebeHailTargetCenters: Coord[];
  kaladinFifthTargetCenters: Coord[];
  tisonaTargetCells: Coord[];
  tisonaPreviewCoord: Coord | null;
  assassinMarkTargetKeys: Set<string>;
  guideTravelerTargetKeys: Set<string>;
  invadeTimeTargets: Coord[];
  gutsRangedTargetKeys: Set<string>;
  asgoreFireballTargetKeys: Set<string>;
}

export function buildHighlightedCells({
  effectiveActionMode,
  modePreviewKind,
  legalPlacementCoords,
  legalMoveCoords,
  legalAttackTargets,
  attackPreviewCells,
  papyrusLongBoneAttackTargetIds,
  doraTargetCenters,
  view,
  isStakePlacement,
  stakeLegalPositions,
  stakeSelections,
  isIntimidateChoice,
  intimidateOptions,
  isForestTarget,
  forestTargetCenters,
  isForestMoveDestination,
  forestMoveDestinationOptions,
  isFemtoDivineMoveDestination,
  femtoDivineMoveOptions,
  isRiverBoatCarryChoice,
  riverBoatCarryOptionKeys,
  isRiverBoatDropDestination,
  riverBoatDropDestinationOptions,
  isRiverTraLaLaTargetChoice,
  riverTraLaLaTargetKeys,
  isRiverTraLaLaDestinationChoice,
  riverTraLaLaDestinationOptions,
  isChikatiloPlacement,
  chikatiloPlacementCoords,
  isGuideTravelerPlacement,
  guideTravelerPlacementCoords,
  isJebeKhansShooterTargetChoice,
  jebeKhansShooterTargetKeys,
  isHassanTrueEnemyTargetChoice,
  hassanTrueEnemyTargetKeys,
  isAsgoreSoulParadePatienceTargetChoice,
  asgorePatienceTargetKeys,
  isAsgoreSoulParadePerseveranceTargetChoice,
  asgorePerseveranceTargetKeys,
  isAsgoreSoulParadeJusticeTargetChoice,
  asgoreJusticeTargetKeys,
  isAsgoreSoulParadeIntegrityDestination,
  asgoreIntegrityDestinationOptions,
  isHassanAssassinOrderSelection,
  hassanAssassinOrderEligibleKeys,
  hassanAssassinOrderSelections,
  isLokiChickenTargetChoice,
  lokiChickenTargetKeys,
  isLokiMindControlEnemyChoice,
  lokiMindControlEnemyKeys,
  isLokiMindControlTargetChoice,
  lokiMindControlTargetKeys,
  isFriskPacifismHugsTargetChoice,
  friskPacifismHugsTargetKeys,
  isFriskWarmWordsTargetChoice,
  friskWarmWordsTargetKeys,
  hassanTrueEnemyCandidateKeys,
  selectedUnit,
  pendingMoveForSelected,
  moveOptions,
  jebeHailTargetCenters,
  kaladinFifthTargetCenters,
  tisonaTargetCells,
  tisonaPreviewCoord,
  assassinMarkTargetKeys,
  guideTravelerTargetKeys,
  invadeTimeTargets,
  gutsRangedTargetKeys,
  asgoreFireballTargetKeys,
}: BuildHighlightedCellsArgs): Record<string, CellHighlightKind> {
  const highlights: Record<string, CellHighlightKind> = {};
  const modeKind = (fallback: "move" | "attack" | "dora"): CellHighlightKind =>
    modePreviewKind ?? fallback;

  if (isStakePlacement) {
    for (const coord of stakeLegalPositions) {
      highlights[coordKey(coord)] = "place";
    }
    for (const coord of stakeSelections) {
      highlights[coordKey(coord)] = "move";
    }
    return highlights;
  }

  if (isIntimidateChoice) {
    for (const coord of intimidateOptions) {
      highlights[coordKey(coord)] = "move";
    }
    return highlights;
  }

  if (isForestTarget) {
    for (const coord of forestTargetCenters) {
      highlights[coordKey(coord)] = "dora";
    }
    return highlights;
  }

  if (isForestMoveDestination) {
    for (const coord of forestMoveDestinationOptions) {
      highlights[coordKey(coord)] = "move";
    }
    return highlights;
  }

  if (isFemtoDivineMoveDestination) {
    for (const coord of femtoDivineMoveOptions) {
      highlights[coordKey(coord)] = "move";
    }
    return highlights;
  }

  if (isRiverBoatCarryChoice) {
    for (const key of riverBoatCarryOptionKeys) {
      highlights[key] = "place";
    }
    return highlights;
  }

  if (isRiverBoatDropDestination) {
    for (const coord of riverBoatDropDestinationOptions) {
      highlights[coordKey(coord)] = "move";
    }
    return highlights;
  }

  if (isRiverTraLaLaTargetChoice) {
    for (const key of riverTraLaLaTargetKeys) {
      highlights[key] = "attack";
    }
    return highlights;
  }

  if (isRiverTraLaLaDestinationChoice) {
    for (const coord of riverTraLaLaDestinationOptions) {
      highlights[coordKey(coord)] = "move";
    }
    return highlights;
  }

  if (isChikatiloPlacement) {
    for (const coord of chikatiloPlacementCoords) {
      highlights[coordKey(coord)] = "place";
    }
    return highlights;
  }

  if (isGuideTravelerPlacement) {
    for (const coord of guideTravelerPlacementCoords) {
      highlights[coordKey(coord)] = "place";
    }
    return highlights;
  }

  if (isJebeKhansShooterTargetChoice) {
    for (const key of jebeKhansShooterTargetKeys) {
      highlights[key] = "attack";
    }
    return highlights;
  }

  if (isHassanTrueEnemyTargetChoice) {
    for (const key of hassanTrueEnemyTargetKeys) {
      highlights[key] = "attack";
    }
    return highlights;
  }

  if (isAsgoreSoulParadePatienceTargetChoice) {
    for (const key of asgorePatienceTargetKeys) {
      highlights[key] = "attack";
    }
    return highlights;
  }

  if (isAsgoreSoulParadePerseveranceTargetChoice) {
    for (const key of asgorePerseveranceTargetKeys) {
      highlights[key] = "attack";
    }
    return highlights;
  }

  if (isAsgoreSoulParadeJusticeTargetChoice) {
    for (const key of asgoreJusticeTargetKeys) {
      highlights[key] = "attack";
    }
    return highlights;
  }

  if (isAsgoreSoulParadeIntegrityDestination) {
    for (const coord of asgoreIntegrityDestinationOptions) {
      highlights[coordKey(coord)] = "move";
    }
    return highlights;
  }

  if (isLokiChickenTargetChoice) {
    for (const key of lokiChickenTargetKeys) {
      highlights[key] = "attack";
    }
    return highlights;
  }

  if (isLokiMindControlEnemyChoice) {
    for (const key of lokiMindControlEnemyKeys) {
      highlights[key] = "attack";
    }
    return highlights;
  }

  if (isLokiMindControlTargetChoice) {
    for (const key of lokiMindControlTargetKeys) {
      highlights[key] = "attack";
    }
    return highlights;
  }

  if (isFriskPacifismHugsTargetChoice) {
    for (const key of friskPacifismHugsTargetKeys) {
      highlights[key] = "attack";
    }
    return highlights;
  }

  if (isFriskWarmWordsTargetChoice) {
    for (const key of friskWarmWordsTargetKeys) {
      highlights[key] = "attack";
    }
    return highlights;
  }

  if (isHassanAssassinOrderSelection) {
    for (const key of hassanAssassinOrderEligibleKeys) {
      highlights[key] = "place";
    }
    for (const unitId of hassanAssassinOrderSelections) {
      const pos = view?.units[unitId]?.position;
      if (!pos) continue;
      highlights[coordKey(pos)] = "move";
    }
    return highlights;
  }

  if (effectiveActionMode === "place") {
    for (const coord of legalPlacementCoords) {
      highlights[coordKey(coord)] = "place";
    }
  }

  if (effectiveActionMode === "move") {
    const riderMode =
      !!selectedUnit &&
      (selectedUnit.class === "rider" ||
        pendingMoveForSelected?.mode === "rider" ||
        moveOptions?.mode === "rider");
    if (riderMode && selectedUnit?.position) {
      for (const coord of legalMoveCoords) {
        const path = linePath(selectedUnit.position, coord);
        const cells = path ? path.slice(1) : [coord];
        for (const cell of cells) {
          highlights[coordKey(cell)] = modeKind("move");
        }
      }
    } else {
      for (const coord of legalMoveCoords) {
        highlights[coordKey(coord)] = modeKind("move");
      }
    }
  }

  if (
    effectiveActionMode === "invadeTime" ||
    effectiveActionMode === "odinSleipnir"
  ) {
    for (const coord of invadeTimeTargets) {
      highlights[coordKey(coord)] = modeKind("move");
    }
  }

  if (effectiveActionMode === "attack" && view) {
    const attackKind: CellHighlightKind = modePreviewKind ?? "previewAttack";
    for (const coord of attackPreviewCells) {
      highlights[coordKey(coord)] = attackKind;
    }
    const targetIds =
      papyrusLongBoneAttackTargetIds.length > 0
        ? papyrusLongBoneAttackTargetIds
        : legalAttackTargets;
    for (const targetId of targetIds) {
      const unit = view.units[targetId];
      if (!unit?.position) continue;
      highlights[coordKey(unit.position)] = attackKind;
    }
  }

  if (effectiveActionMode === "assassinMark") {
    for (const key of assassinMarkTargetKeys) {
      highlights[key] = modeKind("attack");
    }
  }

  if (effectiveActionMode === "guideTraveler") {
    for (const key of guideTravelerTargetKeys) {
      highlights[key] = modeKind("attack");
    }
  }

  if (effectiveActionMode === "demonDuelist" && view) {
    for (const targetId of legalAttackTargets) {
      const unit = view.units[targetId];
      if (!unit?.position) continue;
      highlights[coordKey(unit.position)] = modeKind("attack");
    }
  }

  if (effectiveActionMode === "dora") {
    for (const coord of doraTargetCenters) {
      highlights[coordKey(coord)] = modeKind("dora");
    }
  }

  if (effectiveActionMode === "papyrusCoolGuy" && view) {
    const size = view.boardSize ?? 9;
    for (let col = 0; col < size; col += 1) {
      for (let row = 0; row < size; row += 1) {
        highlights[coordKey({ col, row })] = modeKind("dora");
      }
    }
  }

  if (effectiveActionMode === "jebeHailOfArrows") {
    for (const coord of jebeHailTargetCenters) {
      highlights[coordKey(coord)] = modeKind("dora");
    }
  }

  if (effectiveActionMode === "kaladinFifth") {
    for (const coord of kaladinFifthTargetCenters) {
      highlights[coordKey(coord)] = modeKind("dora");
    }
  }

  if (effectiveActionMode === "jebeKhansShooter" && view) {
    for (const targetId of legalAttackTargets) {
      const unit = view.units[targetId];
      if (!unit?.position) continue;
      highlights[coordKey(unit.position)] = modeKind("attack");
    }
  }

  if (
    effectiveActionMode === "gutsArbalet" ||
    effectiveActionMode === "gutsCannon"
  ) {
    for (const key of gutsRangedTargetKeys) {
      highlights[key] = modeKind("attack");
    }
  }

  if (effectiveActionMode === "asgoreFireball") {
    for (const key of asgoreFireballTargetKeys) {
      highlights[key] = modeKind("attack");
    }
  }

  if (effectiveActionMode === "hassanTrueEnemy") {
    for (const key of hassanTrueEnemyCandidateKeys) {
      highlights[key] = modeKind("attack");
    }
  }

  if (effectiveActionMode === "tisona" && view && selectedUnit?.position) {
    const size = view.boardSize ?? 9;
    if (tisonaPreviewCoord && !modePreviewKind) {
      const lineCells = getOrthogonalLineCells(
        size,
        selectedUnit.position,
        tisonaPreviewCoord
      );
      for (const coord of lineCells) {
        highlights[coordKey(coord)] = "attackRange";
      }
    }
    for (const coord of tisonaTargetCells) {
      highlights[coordKey(coord)] = modeKind("attack");
    }
  }

  return highlights;
}
