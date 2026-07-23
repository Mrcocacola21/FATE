import { useCallback, useEffect, useState, type FC } from "react";
import { Board } from "../../../components/Board";
import { PanelCard } from "../../../components/ui";
import { clampBoardZoom } from "../../hooks/useBoardFit";
import { BoardControls } from "./BoardControls";
import { useI18n } from "../../../i18n";
import { getClassLabel, getHeroDisplayName } from "../../../i18n/displayMetadata";
import { getOniGiriPreviewLines } from "../../targeting/oniGiriPreviewLines";
import { getSelectableAttackTargetsAtCell } from "../helpers";

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
  const { language, t } = useI18n();
  const [boardZoom, setBoardZoom] = useState(readStoredBoardZoom);
  const [showCoordinates, setShowCoordinates] = useState(readStoredBoardCoordinates);
  const [attackTargetPicker, setAttackTargetPicker] = useState<{
    col: number;
    row: number;
    targetIds: string[];
  } | null>(null);
  const zoomPercent = Math.round(boardZoom * 100);

  const selectableUnitTargetIds: string[] =
    vm.activeUnitTargetIds ??
    (vm.actionMode === "attack"
      ? vm.papyrusLongBoneAttackTargetIds?.length > 0
        ? vm.papyrusLongBoneAttackTargetIds
        : (vm.legalAttackTargets ?? [])
      : []);

  useEffect(() => {
    setAttackTargetPicker(null);
  }, [vm.actionMode, vm.selectedUnitId, vm.pendingRoll?.id]);

  const handleBoardCellClick = (col: number, row: number) => {
    const targets =
      vm.getUnitTargetsAtCell?.(col, row) ??
      getSelectableAttackTargetsAtCell(vm.view, col, row, selectableUnitTargetIds);
    if (targets.length > 1) {
      setAttackTargetPicker({ col, row, targetIds: targets.map((target: { id: string }) => target.id) });
      return;
    }
    setAttackTargetPicker(null);
    vm.handleCellClick(col, row, targets[0]?.id);
  };

  const chooseAttackTarget = (targetId: string) => {
    if (!attackTargetPicker) return;
    vm.handleCellClick(attackTargetPicker.col, attackTargetPicker.row, targetId);
    setAttackTargetPicker(null);
  };

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
    (vm.actionMode === "mettatonLaser" || vm.actionMode === "sansGasterBlaster")
      ? [
          {
            from: vm.selectedUnit.position,
            to: vm.boardPreviewCenter,
            tone: "magic" as const,
          },
        ]
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
    <PanelCard
      variant="hud"
      className={`relative flex h-full min-w-0 flex-col overflow-hidden ${mobile ? "mobile-board-panel" : ""}`}
    >
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
        <div
          className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-stone-500 dark:text-stone-400 ${mobile ? "mobile-board-legend" : ""}`}
        >
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
          preferredUnitIds={selectableUnitTargetIds}
          doraPreview={
            vm.boardPreviewCenter && vm.actionMode !== "undyneEnergySpear"
              ? {
                  center: vm.boardPreviewCenter,
                  radius:
                    vm.actionMode === "kaladinFifth"
                      ? 2
                      : vm.actionMode === "mettatonLaser" || vm.actionMode === "sansGasterBlaster"
                        ? 0
                        : 1,
                }
              : null
          }
          linePreview={
            vm.actionMode === "undyneEnergySpear" && vm.boardPreviewCenter
              ? {
                  target: vm.boardPreviewCenter,
                  axis: vm.papyrusLineAxis === "col" ? "col" : "row",
                }
              : null
          }
          allowUnitSelection={vm.allowUnitPick}
          allowAnyUnitSelection={vm.canControlTestRoom || vm.hasBlockingRoll}
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
          onCellClick={handleBoardCellClick}
          onCellHover={vm.handleCellHover}
        />
      </div>
      {attackTargetPicker ? (
        <div
          className="absolute bottom-4 left-1/2 z-50 w-max max-w-[calc(100%_-_2rem)] -translate-x-1/2 rounded-xl border border-rose-400/60 bg-stone-50/95 p-2 shadow-2xl backdrop-blur dark:bg-stone-950/95"
          data-attack-target-picker
          role="dialog"
          aria-label={t("game.selectTarget")}
        >
          <div className="mb-1 text-center text-xs font-bold text-stone-600 dark:text-stone-300">
            {t("game.selectTarget")}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {attackTargetPicker.targetIds.map((targetId) => {
              const target = vm.view.units[targetId];
              if (!target) return null;
              const fallback = getClassLabel(target.class, t);
              const name = getHeroDisplayName(
                target.figureId ?? target.heroId ?? target.class,
                fallback,
                language,
              );
              return (
                <button
                  key={targetId}
                  type="button"
                  className="btn btn-danger min-h-10 px-3 py-2 text-sm"
                  data-attack-target-id={targetId}
                  onClick={() => chooseAttackTarget(targetId)}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </PanelCard>
  );
};
