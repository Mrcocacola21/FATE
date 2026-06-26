import { useEffect, useRef, useState } from "react";

export const BOARD_LABEL_RATIO = 0.6;
export const BOARD_MIN_CELL_SIZE = 42;
export const BOARD_COMPACT_MIN_CELL_SIZE = 32;
export const BOARD_DEFAULT_MAX_CELL_SIZE = 88;
export const BOARD_ZOOM_MAX_CELL_SIZE = 112;

export interface BoardFitMetrics {
  cellSize: number;
  labelSize: number;
  boardPixelSize: number;
  totalPixelSize: number;
}

export interface BoardFitInput {
  boardSize: number;
  containerWidth: number;
  containerHeight: number;
  zoom?: number;
  showCoordinates?: boolean;
  labelRatio?: number;
  minCellSize?: number;
  compactMinCellSize?: number;
  defaultMaxCellSize?: number;
  zoomMaxCellSize?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function clampBoardZoom(value: number) {
  return clamp(Number.isFinite(value) ? value : 1, 0.75, 1.35);
}

export function calculateBoardFitMetrics({
  boardSize,
  containerWidth,
  containerHeight,
  zoom = 1,
  showCoordinates = true,
  labelRatio = BOARD_LABEL_RATIO,
  minCellSize = BOARD_MIN_CELL_SIZE,
  compactMinCellSize = BOARD_COMPACT_MIN_CELL_SIZE,
  defaultMaxCellSize = BOARD_DEFAULT_MAX_CELL_SIZE,
  zoomMaxCellSize = BOARD_ZOOM_MAX_CELL_SIZE,
}: BoardFitInput): BoardFitMetrics {
  const safeBoardSize = Math.max(1, boardSize);
  const safeWidth = Math.max(0, containerWidth);
  const safeHeight = Math.max(0, containerHeight || containerWidth);
  const effectiveLabelRatio = showCoordinates ? labelRatio : 0;
  const totalCells = safeBoardSize + effectiveLabelRatio;
  const fitCell = Math.floor(Math.min(safeWidth / totalCells, safeHeight / totalCells));
  const responsiveMinCell = fitCell < minCellSize ? compactMinCellSize : minCellSize;
  const safeZoom = clampBoardZoom(zoom);
  const maxCellSize = safeZoom > 1 ? zoomMaxCellSize : defaultMaxCellSize;
  const cellSize = clamp(Math.floor(fitCell * safeZoom), responsiveMinCell, maxCellSize);
  const labelSize = showCoordinates ? Math.round(cellSize * labelRatio) : 0;
  const boardPixelSize = cellSize * safeBoardSize;

  return {
    cellSize,
    labelSize,
    boardPixelSize,
    totalPixelSize: boardPixelSize + labelSize,
  };
}

export function useBoardFit({
  boardSize,
  zoom,
  showCoordinates,
}: {
  boardSize: number;
  zoom: number;
  showCoordinates: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<BoardFitMetrics>(() =>
    calculateBoardFitMetrics({
      boardSize,
      containerWidth: 640,
      containerHeight: 640,
      zoom,
      showCoordinates,
    }),
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const computeSizes = (containerWidth: number, containerHeight: number) => {
      if (!containerWidth || containerWidth <= 0) return;
      setMetrics(
        calculateBoardFitMetrics({
          boardSize,
          containerWidth,
          containerHeight,
          zoom,
          showCoordinates,
        }),
      );
    };

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            computeSizes(rect?.width ?? 0, rect?.height ?? 0);
          })
        : null;

    if (observer) {
      observer.observe(el);
      computeSizes(el.clientWidth, el.clientHeight);
      return () => observer.disconnect();
    }

    const handleResize = () => computeSizes(el.clientWidth || window.innerWidth, el.clientHeight);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [boardSize, zoom, showCoordinates]);

  return { ref, metrics };
}
