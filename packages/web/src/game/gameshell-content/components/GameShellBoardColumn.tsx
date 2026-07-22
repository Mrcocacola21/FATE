import { useCallback, useEffect, useState, type FC } from "react";
import { Board } from "../../../components/Board";
import { PanelCard } from "../../../components/ui";
import { clampBoardZoom } from "../../hooks/useBoardFit";
import { BoardControls } from "./BoardControls";
import { useI18n } from "../../../i18n";
import { getOniGiriPreviewLines } from "../../targeting/oniGiriPreviewLines";

interface GameShellBoardColumnProps {
  vm: any;
  mobile?: boolean;
}

const BOARD_ZOOM_STORAGE_KEY = "FATE_BOARD_ZOOM";
const BOARD_COORDINATES_STORAGE_KEY = "FATE_BOARD_COORDINATES";

function readStoredBoardZoom() {
  if (typeof window === "undefined") return 1;
  const stored = window.localStorage.getItem(BOARD_ZOOM_STORAGE_KEY);
  return stored ? clampBoardZoom(Number(stored)) : 1;
}

function readStoredBoardCoordinates() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(BOARD_COORDINATES_STORAGE_KEY) !== "false";
}

export const GameShellBoardColumn: FC<GameShellBoardColumnProps> = ({ vm, mobile = false }) => {
  const { t } = useI18n();
  const [boardZoom, setBoardZoom] = useState(readStoredBoardZoom);
  const [showCoordinates, setShowCoordinates] = useState(readStoredBoardCoordinates);
  const zoomPercent = Math.round(boardZoom * 100);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BOARD_ZOOM_STORAGE_KEY, String(boardZoom));
  }, [boardZoom]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BOARD_COORDINATES_STORAGE_KEY, String(showCoordinates));
  }, [showCoordinates]);

  const fitBoard = useCallback(() => setBoardZoom(1), []);
  const zoomIn = useCallback(
    () => setBoardZoom((current) => clampBoardZoom(Number((current + 0.1).toFixed(2)))),
    [],
  );
  const zoomOut = useCallback(
    () => setBoardZoom((current) => clampBoardZoom(Number((current - 0.1).toFixed(2)))),
    [],
  );
  const resetView = useCallback(() => {
    setBoardZoom(1);
    setShowCoordinates(true);
  }, []);

  const previewLines = [
    ...(vm.actionMode === "zoroOniGiri" && vm.selectedUnitId
      ? getOniGiriPreviewLines(vm.view, vm.selectedUnitId, vm.newHeroAbilityTargetId)
      : []),
    ...(vm.boardPreviewCenter &&
    vm.selectedUnit?.position &&
    (vm.actionMode === "mettatonLaser" ||
      vm.actionMode === "sansGasterBlaster" ||
      vm.actionMode === "undyneEnergySpear")
      ? [{
          from: vm.selectedUnit.position,
          to: vm.boardPreviewCenter,
          tone: "magic" as const,
        }]
      : []),
  ];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        fitBoard();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fitBoard, zoomIn, zoomOut]);

  return (
    <PanelCard variant="hud" className={`relative flex h-full min-w-0 flex-col overflow-hidden ${mobile ? "mobile-board-panel" : ""}`}>
      <div className="mobile-board-header shrink-0 border-b border-amber-900/10 px-3 py-2 dark:border-amber-500/15 sm:px-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="section-kicker">{t("game.tacticalArena")}</div>
            <h2 className="section-title mt-0.5 text-base">{t("board.battlefield")}</h2>
          </div>
          <BoardControls
            zoomPercent={zoomPercent}
            showCoordinates={showCoordinates}
            onFit={fitBoard}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={resetView}
            onToggleCoordinates={() => setShowCoordinates((current) => !current)}
          />
        </div>
        <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-stone-500 dark:text-stone-400 ${mobile ? "mobile-board-legend" : ""}`}>
          {[
            [t("game.legalMove"), "bg-sky-400 ring-sky-500"],
            [t("game.legalAttack"), "bg-rose-400 ring-rose-500"],
            [t("game.abilityArea"), "bg-amber-400 ring-amber-500"],
          ].map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ring-1 ${color}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="mobile-board-canvas min-h-0 flex-1 p-2 sm:p-3">
        <Board
          view={vm.view}
          playerId={vm.playerId}
          selectedUnitId={vm.selectedUnitId}
          highlightedCells={vm.highlightedCells}
          hoveredAbilityId={vm.hoveredAbilityId}
          boardPreview={vm.boardPreview}
          doraPreview={
            vm.boardPreviewCenter
              ? {
                  center: vm.boardPreviewCenter,
                  radius:
                    vm.actionMode === "kaladinFifth"
                      ? 2
                      : vm.actionMode === "mettatonLaser" ||
                          vm.actionMode === "sansGasterBlaster" ||
                          vm.actionMode === "undyneEnergySpear"
                        ? 0
                        : 1,
                }
              : null
          }
          allowUnitSelection={vm.allowUnitPick}
          allowAnyUnitSelection={vm.canControlTestRoom}
          visualEffectsEnabled={vm.connectionStatus === "connected" && vm.hasSnapshot}
          eventBatch={vm.latestEventBatch}
          effectSessionKey={vm.roomId}
          zoom={boardZoom}
          showCoordinates={showCoordinates}
          previewLines={previewLines}
          disabled={vm.boardDisabled}
          onSelectUnit={(id) => {
            vm.setSelectedUnit(id);
            vm.setActionMode(null);
          }}
          onCellClick={vm.handleCellClick}
          onCellHover={vm.handleCellHover}
        />
      </div>
    </PanelCard>
  );
};
