import type { FC } from "react";
import { useI18n } from "../../../i18n";

interface BoardControlsProps {
  zoomPercent: number;
  showCoordinates: boolean;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onToggleCoordinates: () => void;
}

export const BoardControls: FC<BoardControlsProps> = ({
  zoomPercent,
  showCoordinates,
  onFit,
  onZoomIn,
  onZoomOut,
  onReset,
  onToggleCoordinates,
}) => {
  const { t } = useI18n();

  return (
    <div
      className="flex min-w-0 flex-wrap items-center justify-end gap-1.5"
      aria-label={t("board.controlsLabel")}
    >
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={onFit}
        title={t("board.fitTitle")}
        aria-label={t("board.fitTitle")}
      >
        {t("board.fit")}
      </button>
      <button
        type="button"
        className="icon-button h-8 w-8 rounded-lg text-sm"
        onClick={onZoomOut}
        title={t("board.zoomOut")}
        aria-label={t("board.zoomOut")}
      >
        -
      </button>
      <span className="status-pill badge-neutral min-w-[3.5rem] justify-center">
        {zoomPercent}%
      </span>
      <button
        type="button"
        className="icon-button h-8 w-8 rounded-lg text-sm"
        onClick={onZoomIn}
        title={t("board.zoomIn")}
        aria-label={t("board.zoomIn")}
      >
        +
      </button>
      <button
        type="button"
        className="icon-button h-8 w-8 rounded-lg text-xs"
        onClick={onReset}
        title={t("board.resetView")}
        aria-label={t("board.resetView")}
      >
        0
      </button>
      <button
        type="button"
        className={`btn btn-sm ${
          showCoordinates ? "btn-secondary" : "btn-ghost border-stone-300/60 dark:border-stone-700"
        }`}
        onClick={onToggleCoordinates}
        title={t("board.toggleCoordinates")}
        aria-label={t("board.toggleCoordinates")}
        aria-pressed={showCoordinates}
      >
        {t("board.coordinatesShort")}
      </button>
    </div>
  );
};
