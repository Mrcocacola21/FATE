import { useMemo } from "react";
import { selectBoardPreview } from "../../targeting/selectBoardPreview";

export function useGameShellBoardPreview(params: Parameters<typeof selectBoardPreview>[0]) {
  const {
    gameView,
    viewerPlayerId,
    selectedUnitId,
    actionMode,
    hoverActionMode,
    allowActionHoverPreview,
    hoveredAbilityId,
    pendingMoveForSelected,
    moveOptions,
    hasBlockingRoll,
    boardSelectionPending,
  } = params;

  return useMemo(
    () =>
      selectBoardPreview({
        gameView,
        viewerPlayerId,
        selectedUnitId,
        actionMode,
        hoverActionMode,
        allowActionHoverPreview,
        hoveredAbilityId,
        pendingMoveForSelected,
        moveOptions,
        hasBlockingRoll,
        boardSelectionPending,
      }),
    [
      gameView,
      viewerPlayerId,
      selectedUnitId,
      actionMode,
      hoverActionMode,
      allowActionHoverPreview,
      hoveredAbilityId,
      pendingMoveForSelected,
      moveOptions,
      hasBlockingRoll,
      boardSelectionPending,
    ],
  );
}
