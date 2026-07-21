import type { PlayerId, PlayerView } from "rules";
import type { Coord } from "rules";
import type { ActionMode, ActionPreviewMode } from "../../store";
import type { BoardPreview } from "./previewTypes";
import { buildActionPreview, type PreviewMoveOptions } from "./buildActionPreview";
import { buildAbilityPreview } from "./buildAbilityPreview";
import { buildPendingPreview } from "./buildPendingPreview";

export interface SelectBoardPreviewArgs {
  gameView: PlayerView | null | undefined;
  viewerPlayerId: PlayerId | null | undefined;
  selectedUnitId: string | null | undefined;
  actionMode: ActionMode;
  hoverActionMode: ActionPreviewMode | null | undefined;
  allowActionHoverPreview: boolean;
  hoveredAbilityId: string | null | undefined;
  pendingMoveForSelected?: PreviewMoveOptions | null;
  moveOptions?: PreviewMoveOptions | null;
  hasBlockingRoll?: boolean;
  boardSelectionPending?: boolean;
  targetingCell?: Coord | null;
}

export function selectBoardPreview({
  gameView,
  viewerPlayerId,
  selectedUnitId,
  actionMode,
  hoverActionMode,
  allowActionHoverPreview,
  hoveredAbilityId,
  pendingMoveForSelected,
  moveOptions,
  hasBlockingRoll = false,
  boardSelectionPending = false,
  targetingCell,
}: SelectBoardPreviewArgs): BoardPreview | null {
  if (!gameView) return null;

  const pendingPreview = buildPendingPreview(gameView, targetingCell);
  if (pendingPreview) return pendingPreview;

  const activeActionMode = actionMode ?? (allowActionHoverPreview ? hoverActionMode ?? null : null);
  if (activeActionMode && selectedUnitId) {
    return buildActionPreview({
      gameView,
      viewerPlayerId,
      sourceUnitId: selectedUnitId,
      actionMode: activeActionMode,
      pendingMoveForSelected,
      moveOptions,
      targetingCell,
    });
  }

  if (
    hoveredAbilityId &&
    selectedUnitId &&
    !actionMode &&
    !hasBlockingRoll &&
    !boardSelectionPending
  ) {
    return buildAbilityPreview({
      gameView,
      viewerPlayerId,
      sourceUnitId: selectedUnitId,
      abilityId: hoveredAbilityId,
    });
  }

  return null;
}
