import type { Coord, MoveMode, PlayerId, PlayerView } from "rules";
import type { ActionMode } from "../../store";
import {
  ASGORE_FIRE_PARADE_ID,
  ASGORE_FIREBALL_ID,
  CHIKATILO_ASSASSIN_MARK_ID,
  GROZNY_INVADE_TIME_ID,
  GUTS_ARBALET_ID,
  GUTS_CANNON_ID,
  HASSAN_TRUE_ENEMY_ID,
  JEBE_KHANS_SHOOTER_ID,
  LECHY_GUIDE_TRAVELER_ID,
  ODIN_SLEIPNIR_ID,
} from "../../rulesHints";
import type { BoardPreview } from "./previewTypes";
import { buildAbilityPreview } from "./buildAbilityPreview";
import { buildMovementPreview } from "./buildPendingPreview";
import { attackRangeCells, openCells } from "./previewGeometry";
import { targetRefsFromIds } from "./previewVisibility";

export interface PreviewMoveOptions {
  unitId: string;
  legalTo: Coord[];
  mode?: MoveMode;
}

export interface BuildActionPreviewArgs {
  gameView: PlayerView | null | undefined;
  viewerPlayerId: PlayerId | null | undefined;
  sourceUnitId: string | null | undefined;
  actionMode: ActionMode;
  moveOptions?: PreviewMoveOptions | null;
  pendingMoveForSelected?: PreviewMoveOptions | null;
}

function abilityIdForPreviewActionMode(actionMode: Exclude<ActionMode, null>): string | null {
  switch (actionMode) {
    case "assassinMark":
      return CHIKATILO_ASSASSIN_MARK_ID;
    case "guideTraveler":
      return LECHY_GUIDE_TRAVELER_ID;
    case "jebeKhansShooter":
      return JEBE_KHANS_SHOOTER_ID;
    case "asgoreFireball":
      return ASGORE_FIREBALL_ID;
    case "asgoreFireParade":
      return ASGORE_FIRE_PARADE_ID;
    case "hassanTrueEnemy":
      return HASSAN_TRUE_ENEMY_ID;
    case "gutsArbalet":
      return GUTS_ARBALET_ID;
    case "gutsCannon":
      return GUTS_CANNON_ID;
    case "invadeTime":
      return GROZNY_INVADE_TIME_ID;
    case "odinSleipnir":
      return ODIN_SLEIPNIR_ID;
    default:
      return null;
  }
}

function buildBasicAttackPreview(
  gameView: PlayerView,
  sourceUnitId: string,
): BoardPreview | null {
  const source = gameView.units[sourceUnitId];
  if (!source?.position) return null;
  const targetIds = gameView.legal?.attackTargetsByUnitId[sourceUnitId] ?? [];
  return {
    kind: "multiStep",
    step: "basicAttack",
    sourceCell: { ...source.position },
    cells: attackRangeCells(gameView, sourceUnitId),
    validTargets: targetRefsFromIds(gameView, targetIds),
    cellKind: source.class === "archer" ? "line" : "area",
    labelKey: "preview.labels.selectTarget",
  };
}

export function buildActionPreview({
  gameView,
  viewerPlayerId,
  sourceUnitId,
  actionMode,
  moveOptions,
  pendingMoveForSelected,
}: BuildActionPreviewArgs): BoardPreview | null {
  if (!gameView || !sourceUnitId || !actionMode) return null;
  const source = gameView.units[sourceUnitId];
  if (!source?.position) return null;

  if (actionMode === "move") {
    const pending =
      pendingMoveForSelected && pendingMoveForSelected.unitId === sourceUnitId
        ? pendingMoveForSelected
        : moveOptions && moveOptions.unitId === sourceUnitId
          ? moveOptions
          : null;
    const legalTo = pending?.legalTo ?? gameView.legal?.movesByUnitId[sourceUnitId] ?? [];
    return buildMovementPreview({
      view: gameView,
      pendingMove: {
        unitId: sourceUnitId,
        legalTo,
        mode: pending?.mode,
      },
      labelKey: "preview.labels.selectDestination",
    });
  }

  if (actionMode === "attack") {
    return buildBasicAttackPreview(gameView, sourceUnitId);
  }

  if (actionMode === "invadeTime" || actionMode === "odinSleipnir") {
    return {
      kind: "movement",
      sourceCell: { ...source.position },
      reachableCells: openCells(gameView),
      labelKey: "preview.labels.selectDestination",
    };
  }

  const abilityId = abilityIdForPreviewActionMode(actionMode);
  if (!abilityId) return null;
  return buildAbilityPreview({
    gameView,
    viewerPlayerId,
    sourceUnitId,
    abilityId,
    targetingStep: actionMode,
  });
}
