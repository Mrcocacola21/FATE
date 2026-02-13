import type { Coord, PlayerId, PlayerView } from "rules";
import {
  EL_CID_COMPEADOR_ID,
  EL_CID_KOLADA_ID,
  TRICKSTER_AOE_ID,
  TRICKSTER_AOE_RADIUS,
  FOREST_AURA_RADIUS,
  getMaxHp,
} from "../rulesHints";
import { useEffect, useRef, useState, type FC } from "react";
import { HpBar } from "./HpBar";
import { getTokenSrc } from "../assets/registry";

const MIN_CELL_SIZE = 32;
const MAX_CELL_SIZE = 96;
const LABEL_RATIO = 0.6;

interface BoardProps {
  view: PlayerView;
  playerId: PlayerId | null;
  selectedUnitId: string | null;
  highlightedCells: Record<
    string,
    "place" | "move" | "attack" | "dora" | "attackRange"
  >;
  hoveredAbilityId?: string | null;
  doraPreview?: { center: Coord; radius: number } | null;
  disabled?: boolean;
  allowUnitSelection?: boolean;
  onCellHover?: (coord: Coord | null) => void;
  onSelectUnit: (unitId: string | null) => void;
  onCellClick: (col: number, row: number) => void;
}

function getUnitLabel(unitClass: string): string {
  return unitClass.charAt(0).toUpperCase();
}

function getClassMarker(unitClass: string): string | null {
  if (unitClass === "assassin") return "D";
  if (unitClass === "archer") return "B";
  return null;
}

function getHighlightClass(
  kind: "place" | "move" | "attack" | "dora" | "attackRange"
) {
  switch (kind) {
    case "place":
      return "bg-emerald-300/35 dark:bg-emerald-500/15";
    case "move":
      return "bg-sky-300/35 dark:bg-sky-500/15";
    case "attack":
      return "bg-rose-300/40 dark:bg-rose-500/18";
    case "attackRange":
      return "bg-rose-200/35 dark:bg-rose-500/12";
    case "dora":
      return "bg-amber-300/35 dark:bg-amber-500/15";
    default:
      return "";
  }
}

function getAoEHighlightClass(kind: "aoe" | "aoeDisabled") {
  return kind === "aoe"
    ? "bg-amber-400/25 dark:bg-amber-500/12"
    : "bg-slate-400/20 dark:bg-neutral-500/10";
}

function coordKey(coord: Coord): string {
  return `${coord.col},${coord.row}`;
}

export const Board: FC<BoardProps> = ({
  view,
  playerId,
  selectedUnitId,
  highlightedCells,
  hoveredAbilityId,
  doraPreview = null,
  allowUnitSelection = true,
  disabled = false,
  onCellHover,
  onSelectUnit,
  onCellClick,
}) => {
  const size = view.boardSize ?? 9;
  const maxIndex = size - 1;
  const isFlipped = playerId === "P2";
  const boardWrapperRef = useRef<HTMLDivElement | null>(null);
  const [cellSize, setCellSize] = useState(48);
  const [labelSize, setLabelSize] = useState(28);

  useEffect(() => {
    const el = boardWrapperRef.current;
    if (!el) return;

    const computeSizes = (containerWidth: number) => {
      if (!containerWidth || containerWidth <= 0) return;

      const rawCell = Math.floor(containerWidth / (size + LABEL_RATIO));
      let nextCell = Math.max(
        MIN_CELL_SIZE,
        Math.min(MAX_CELL_SIZE, rawCell)
      );
      let nextLabel = Math.round(nextCell * LABEL_RATIO);
      let totalWidth = nextCell * size + nextLabel;

      if (totalWidth > containerWidth && nextCell > MIN_CELL_SIZE) {
        nextCell = Math.max(
          MIN_CELL_SIZE,
          Math.min(MAX_CELL_SIZE, nextCell - 1)
        );
        nextLabel = Math.round(nextCell * LABEL_RATIO);
        totalWidth = nextCell * size + nextLabel;
        if (totalWidth > containerWidth && nextCell > MIN_CELL_SIZE) {
          const fitCell = Math.max(
            MIN_CELL_SIZE,
            Math.min(
              MAX_CELL_SIZE,
              Math.floor(containerWidth / (size + LABEL_RATIO))
            )
          );
          nextCell = fitCell;
          nextLabel = Math.round(nextCell * LABEL_RATIO);
        }
      }

      setCellSize(nextCell);
      setLabelSize(nextLabel);
    };

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? 0;
            computeSizes(width);
          })
        : null;

    if (observer) {
      observer.observe(el);
      computeSizes(el.clientWidth);
      return () => observer.disconnect();
    }

    const handleResize = () => computeSizes(el.clientWidth || window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [size]);

  const boardPixelSize = cellSize * size;
  const labelFontSize = Math.max(10, Math.round(cellSize * 0.22));
  const pieceFontSize = Math.max(10, Math.round(cellSize * 0.24));
  const markerFontSize = Math.max(8, Math.round(cellSize * 0.18));
  const badgeSize = Math.round(cellSize * 0.7);
  const tokenInset = Math.max(2, Math.round(cellSize * 0.08));
  const tokenSize = Math.max(16, cellSize - tokenInset * 2);
  const lastKnownSize = Math.round(cellSize * 0.7);
  const hpBarWidth = Math.round(cellSize * 0.7);
  const highlightInset = Math.max(2, Math.round(cellSize * 0.08));
  const missingTokenSrc = getTokenSrc("_missing");
  const toViewCoord = (coord: Coord): Coord =>
    isFlipped
      ? { col: maxIndex - coord.col, row: maxIndex - coord.row }
      : coord;
  const toGameCoord = (coord: Coord): Coord =>
    isFlipped
      ? { col: maxIndex - coord.col, row: maxIndex - coord.row }
      : coord;

  const unitsByPos = new Map<
    string,
    {
      id: string;
      owner: PlayerId;
      class: string;
      isStealthed: boolean;
      bunkerActive: boolean;
    }
  >();
  const lastKnownByPos = new Map<string, number>();
  const stakeMarkersByPos = new Map<string, boolean>();
  const viewHighlights: Record<
    string,
    "place" | "move" | "attack" | "dora" | "attackRange"
  > = {};
  const aoeHighlights = new Map<string, "aoe" | "aoeDisabled">();
  const doraPreviewKeys = new Set<string>();
  const forestAuraKeys = new Set<string>();
  const forestMarkers =
    Array.isArray(view.forestMarkers) && view.forestMarkers.length > 0
      ? view.forestMarkers
      : view.forestMarker
      ? [view.forestMarker]
      : [];
  const forestMarkerOwnersByKey = new Map<string, PlayerId[]>();

  for (const marker of forestMarkers) {
    const forestMarkerCoord = marker.position;
    const markerView = toViewCoord(forestMarkerCoord);
    const markerKey = coordKey(markerView);
    const owners = forestMarkerOwnersByKey.get(markerKey) ?? [];
    owners.push(marker.owner);
    forestMarkerOwnersByKey.set(markerKey, owners);

    const minCol = Math.max(0, forestMarkerCoord.col - FOREST_AURA_RADIUS);
    const maxCol = Math.min(maxIndex, forestMarkerCoord.col + FOREST_AURA_RADIUS);
    const minRow = Math.max(0, forestMarkerCoord.row - FOREST_AURA_RADIUS);
    const maxRow = Math.min(maxIndex, forestMarkerCoord.row + FOREST_AURA_RADIUS);
    for (let col = minCol; col <= maxCol; col += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        const dx = Math.abs(col - forestMarkerCoord.col);
        const dy = Math.abs(row - forestMarkerCoord.row);
        if (Math.max(dx, dy) > FOREST_AURA_RADIUS) continue;
        const viewPos = toViewCoord({ col, row });
        forestAuraKeys.add(coordKey(viewPos));
      }
    }
  }

  for (const unit of Object.values(view.units)) {
    if (!unit.position) continue;
    const viewPos = toViewCoord(unit.position);
    unitsByPos.set(coordKey(viewPos), {
      id: unit.id,
      owner: unit.owner,
      class: unit.class,
      isStealthed: unit.isStealthed,
      bunkerActive: unit.bunker?.active ?? false,
    });
  }
  for (const coord of Object.values(view.lastKnownPositions ?? {})) {
    const viewPos = toViewCoord(coord);
    const key = coordKey(viewPos);
    lastKnownByPos.set(key, (lastKnownByPos.get(key) ?? 0) + 1);
  }
  for (const marker of view.stakeMarkers ?? []) {
    const viewPos = toViewCoord(marker.position);
    const key = coordKey(viewPos);
    const existing = stakeMarkersByPos.get(key) ?? false;
    stakeMarkersByPos.set(key, existing || marker.isRevealed);
  }
  for (const [key, kind] of Object.entries(highlightedCells)) {
    const [colRaw, rowRaw] = key.split(",");
    const col = Number(colRaw);
    const row = Number(rowRaw);
    if (Number.isNaN(col) || Number.isNaN(row)) continue;
    const viewPos = toViewCoord({ col, row });
    viewHighlights[coordKey(viewPos)] = kind;
  }

  const selectedUnit =
    selectedUnitId && view.units[selectedUnitId]
      ? view.units[selectedUnitId]
      : null;
  const isMyTurn = playerId ? view.currentPlayer === playerId : false;
  const isActive = selectedUnit ? view.activeUnitId === selectedUnit.id : false;
  const abilityAvailable = selectedUnit?.class === "trickster";
  const economy = selectedUnit?.turn ?? {
    moveUsed: false,
    attackUsed: false,
    actionUsed: false,
    stealthUsed: false,
  };
  const abilityEnabled =
    !disabled &&
    isMyTurn &&
    isActive &&
    abilityAvailable &&
    selectedUnit?.owner === playerId &&
    !economy.attackUsed &&
    !economy.actionUsed;

  if (
    hoveredAbilityId === TRICKSTER_AOE_ID &&
    isMyTurn &&
    abilityAvailable &&
    selectedUnit?.position
  ) {
    const kind: "aoe" | "aoeDisabled" = abilityEnabled ? "aoe" : "aoeDisabled";
    for (
      let dc = -TRICKSTER_AOE_RADIUS;
      dc <= TRICKSTER_AOE_RADIUS;
      dc += 1
    ) {
      for (
        let dr = -TRICKSTER_AOE_RADIUS;
        dr <= TRICKSTER_AOE_RADIUS;
        dr += 1
      ) {
        const col = selectedUnit.position.col + dc;
        const row = selectedUnit.position.row + dr;
        if (col < 0 || row < 0 || col >= size || row >= size) continue;
        const viewPos = toViewCoord({ col, row });
        aoeHighlights.set(coordKey(viewPos), kind);
      }
    }
  }

  const showKoladaPreview =
    selectedUnit?.position &&
    selectedUnit.heroId === EL_CID_COMPEADOR_ID &&
    (hoveredAbilityId === EL_CID_KOLADA_ID || (isMyTurn && isActive));
  if (showKoladaPreview && selectedUnit?.position) {
    const kind: "aoe" | "aoeDisabled" = disabled ? "aoeDisabled" : "aoe";
    for (let dc = -1; dc <= 1; dc += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        if (dc === 0 && dr === 0) continue;
        const col = selectedUnit.position.col + dc;
        const row = selectedUnit.position.row + dr;
        if (col < 0 || row < 0 || col >= size || row >= size) continue;
        const viewPos = toViewCoord({ col, row });
        aoeHighlights.set(coordKey(viewPos), kind);
      }
    }
  }

  const carpetPreview =
    view.pendingAoEPreview?.abilityId === "kaiserCarpetStrike"
      ? view.pendingAoEPreview
      : null;
  if (carpetPreview) {
    const kind: "aoe" | "aoeDisabled" = disabled ? "aoeDisabled" : "aoe";
    for (let dc = -carpetPreview.radius; dc <= carpetPreview.radius; dc += 1) {
      for (let dr = -carpetPreview.radius; dr <= carpetPreview.radius; dr += 1) {
        const col = carpetPreview.center.col + dc;
        const row = carpetPreview.center.row + dr;
        if (col < 0 || row < 0 || col >= size || row >= size) continue;
        const viewPos = toViewCoord({ col, row });
        aoeHighlights.set(coordKey(viewPos), kind);
      }
    }
  }

  if (doraPreview) {
    const kind: "aoe" | "aoeDisabled" = disabled ? "aoeDisabled" : "aoe";
    for (let dc = -doraPreview.radius; dc <= doraPreview.radius; dc += 1) {
      for (let dr = -doraPreview.radius; dr <= doraPreview.radius; dr += 1) {
        const col = doraPreview.center.col + dc;
        const row = doraPreview.center.row + dr;
        if (col < 0 || row < 0 || col >= size || row >= size) continue;
        const viewPos = toViewCoord({ col, row });
        const key = coordKey(viewPos);
        aoeHighlights.set(key, kind);
        doraPreviewKeys.add(key);
      }
    }
  }

  const rows = [] as JSX.Element[];

  for (let row = size - 1; row >= 0; row -= 1) {
    const cells: JSX.Element[] = [];
    for (let col = 0; col < size; col += 1) {
      const viewCoord = { col, row };
      const gameCoord = toGameCoord(viewCoord);
      const key = coordKey(viewCoord);
      const unit = unitsByPos.get(key);
      const isSelected = unit?.id === selectedUnitId;
      const isDoraPreview = doraPreviewKeys.has(key);
      const isForestAura = forestAuraKeys.has(key);
      const forestMarkerOwners = forestMarkerOwnersByKey.get(key) ?? [];
      const isForestMarker = forestMarkerOwners.length > 0;
      const isDark = (row + col) % 2 === 1;
      const highlightKind = viewHighlights[key];
      const aoeKind = aoeHighlights.get(key);

      const cellClasses = [
        "relative",
        "border",
        "border-slate-200 dark:border-neutral-800",
        "flex",
        "items-center",
        "justify-center",
        "transition-[width,height] duration-150 ease-out",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
        isDark ? "bg-amber-100 dark:bg-neutral-900" : "bg-white dark:bg-neutral-950",
        isSelected ? "ring-2 ring-teal-500 dark:ring-teal-400/60" : "",
      ].join(" ");

      let content: JSX.Element | null = null;
      const lastKnownCount = lastKnownByPos.get(key) ?? 0;

      if (unit) {
        const isFriendly = playerId ? unit.owner === playerId : false;
        const isHiddenEnemy = !isFriendly && unit.isStealthed;
        const marker = getClassMarker(unit.class);
        const unitView = view.units[unit.id];
        const tokenId = unitView?.figureId ?? unitView?.heroId ?? unit.class;
        const tokenSrc = getTokenSrc(tokenId);
        const isTokenMissing = tokenSrc === missingTokenSrc;

        const badgeClasses = [
          "relative",
          "rounded-full",
          "flex",
          "items-center",
          "justify-center",
          "font-semibold",
          "shadow",
          isDoraPreview ? "ring-2 ring-amber-400" : "",
          isFriendly ? "bg-emerald-500 text-white" : "bg-rose-500 text-white",
        ].join(" ");

        const tokenClasses = [
          "relative",
          "flex",
          "items-center",
          "justify-center",
          isDoraPreview ? "ring-2 ring-amber-400" : "",
        ].join(" ");

        content = isHiddenEnemy ? (
          <div
            className={badgeClasses}
            style={{
              width: badgeSize,
              height: badgeSize,
              fontSize: pieceFontSize,
            }}
          >
            ?
          </div>
        ) : (
          <div
            className={tokenClasses}
            style={{
              width: tokenSize,
              height: tokenSize,
            }}
          >
            <img
              src={tokenSrc}
              alt={`${tokenId} token`}
              className="h-full w-full rounded-lg bg-white/80 object-contain shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900/70 dark:ring-neutral-800"
              draggable={false}
            />
            {isTokenMissing && (
              <span
                className="absolute inset-0 flex items-center justify-center font-semibold text-slate-700 dark:text-slate-200"
                style={{ fontSize: pieceFontSize }}
              >
                {getUnitLabel(unit.class)}
              </span>
            )}
            {marker && (
              <span
                className="absolute -right-1 -top-1 rounded-full bg-white px-1 font-bold text-slate-700 shadow dark:bg-slate-200 dark:text-slate-900"
                style={{ fontSize: markerFontSize }}
              >
                {marker}
              </span>
            )}
          </div>
        );
      } else if (lastKnownCount > 0) {
        const label = lastKnownCount > 1 ? `?${lastKnownCount}` : "?";
        content = (
          <div
            className="flex items-center justify-center rounded-full border border-dashed border-slate-400 font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-300"
            style={{
              width: lastKnownSize,
              height: lastKnownSize,
              fontSize: pieceFontSize,
            }}
          >
            {label}
          </div>
        );
      }

      cells.push(
        <div
          key={key}
          className={cellClasses}
          style={{ width: cellSize, height: cellSize }}
          onClick={() => {
            if (disabled) return;
            if (allowUnitSelection && unit && playerId && unit.owner === playerId) {
              onSelectUnit(unit.id);
              return;
            }
            onCellClick(gameCoord.col, gameCoord.row);
          }}
          onMouseEnter={() => onCellHover?.(gameCoord)}
          onMouseLeave={() => onCellHover?.(null)}
        >
          {isForestAura && (
            <div
              className="pointer-events-none absolute rounded bg-emerald-200/25 ring-1 ring-emerald-200/40 dark:bg-emerald-900/25 dark:ring-emerald-700/40"
              style={{ inset: highlightInset }}
            />
          )}
          {highlightKind && (
            <div
              className={`pointer-events-none absolute rounded dark:ring-1 dark:ring-neutral-800/70 ${getHighlightClass(
                highlightKind
              )}`}
              style={{ inset: highlightInset }}
            />
          )}
          {aoeKind && (
            <div
              className={`pointer-events-none absolute rounded dark:ring-1 dark:ring-neutral-800/70 ${getAoEHighlightClass(
                aoeKind
              )}`}
              style={{ inset: highlightInset }}
            />
          )}
          {content}
          {isForestMarker && (
            <div
              className="pointer-events-none absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white shadow dark:bg-emerald-400/80 dark:text-emerald-950"
              title={`Forest marker (${forestMarkerOwners.join("/")})`}
            >
              {forestMarkerOwners.length > 1 ? "F2" : "F"}
            </div>
          )}
          {stakeMarkersByPos.has(key) && (
            <div
              className={`pointer-events-none absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold shadow ${
                stakeMarkersByPos.get(key)
                  ? "bg-emerald-500 text-white"
                  : "bg-emerald-200 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200"
              }`}
              title={
                stakeMarkersByPos.get(key)
                  ? "Revealed stake marker"
                  : "Hidden stake marker"
              }
            >
              {stakeMarkersByPos.get(key) ? "R" : "S"}
            </div>
          )}
          {unit?.bunkerActive && (
            <div
              className="pointer-events-none absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-200 text-[9px] font-bold text-amber-900 shadow dark:bg-amber-900/60 dark:text-amber-200"
              title="In Bunker: incoming hits deal 1 damage."
            >
              B
            </div>
          )}
          {unit && (
            <div className="pointer-events-none absolute bottom-1 left-1 right-1 z-10 flex justify-center">
              <div style={{ width: hpBarWidth }}>
                <HpBar
                  current={view.units[unit.id]?.hp ?? 0}
                  max={getMaxHp(unit.class, view.units[unit.id]?.heroId)}
                  showText={playerId ? unit.owner === playerId : false}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>
      );
    }
    const rowLabel = isFlipped ? maxIndex - row : row;
    rows.push(
      <div key={`row-${row}`} className="flex">
        <div
          className="flex items-center justify-center font-semibold text-slate-500 dark:text-slate-400"
          style={{ width: labelSize, height: cellSize, fontSize: labelFontSize }}
        >
          {rowLabel}
        </div>
        {cells}
      </div>
    );
  }

  const colLabels = Array.from({ length: size }, (_, idx) =>
    String.fromCharCode(65 + idx)
  );
  if (isFlipped) {
    colLabels.reverse();
  }

  return (
    <div ref={boardWrapperRef} className="w-full min-w-0 overflow-x-hidden">
      <div className="flex justify-center">
        <div
          className="inline-block transition-[width,height] duration-150 ease-out"
          style={{ width: boardPixelSize + labelSize, maxWidth: "100%" }}
        >
          <div className="flex">
            <div style={{ width: labelSize, height: labelSize }} />
            {colLabels.map((label, index) => (
              <div
                key={`col-${label}-${index}`}
                className="flex items-center justify-center font-semibold text-slate-500 dark:text-slate-400"
                style={{
                  width: cellSize,
                  height: labelSize,
                  fontSize: labelFontSize,
                }}
              >
                {label}
              </div>
            ))}
          </div>
          {rows}
        </div>
      </div>
    </div>
  );
};
