import type { Coord, PlayerId, PlayerView, UnitClass } from "rules";
import {
  EL_CID_COMPEADOR_ID,
  EL_CID_KOLADA_ID,
  KALADIN_ID,
  TRICKSTER_AOE_ID,
  TRICKSTER_AOE_RADIUS,
  FOREST_AURA_RADIUS,
  getMaxHp,
} from "../rulesHints";
import { useEffect, useRef, useState, type FC } from "react";
import { HpBar } from "./HpBar";
import {
  getUnitTokenAsset,
  getUnitVisualSignature,
  getUnitVisualVariant,
} from "../assets/registry";
import { useI18n } from "../i18n";
import { getClassLabel, getHeroDisplayName } from "../i18n/displayMetadata";
import { BoardEffectsLayer } from "../game/effects/BoardEffectsLayer";
import { useBoardEffects } from "../game/effects/useBoardEffects";
import { useBoardFit } from "../game/hooks/useBoardFit";
import type { BoardEventBatch, BoardPreviewLine } from "../game/effects/types";

interface BoardProps {
  view: PlayerView;
  playerId: PlayerId | null;
  selectedUnitId: string | null;
  highlightedCells: Record<
    string,
    | "place"
    | "move"
    | "attack"
    | "dora"
    | "attackRange"
    | "previewMove"
    | "previewAttack"
    | "previewAbility"
  >;
  hoveredAbilityId?: string | null;
  doraPreview?: { center: Coord; radius: number } | null;
  disabled?: boolean;
  allowUnitSelection?: boolean;
  allowAnyUnitSelection?: boolean;
  visualEffectsEnabled?: boolean;
  eventBatch?: BoardEventBatch | null;
  effectSessionKey?: string | null;
  previewLine?: BoardPreviewLine | null;
  zoom?: number;
  showCoordinates?: boolean;
  className?: string;
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
  kind:
    | "place"
    | "move"
    | "attack"
    | "dora"
    | "attackRange"
    | "previewMove"
    | "previewAttack"
    | "previewAbility",
) {
  switch (kind) {
    case "place":
      return "bg-emerald-300/35 ring-2 ring-inset ring-emerald-500/70 shadow-[inset_0_0_18px_rgba(16,185,129,0.28)] dark:bg-emerald-500/15";
    case "move":
      return "bg-sky-300/35 ring-2 ring-inset ring-sky-500/70 shadow-[inset_0_0_18px_rgba(14,165,233,0.28)] dark:bg-sky-500/15";
    case "attack":
      return "bg-rose-300/40 ring-2 ring-inset ring-rose-500/75 shadow-[inset_0_0_18px_rgba(244,63,94,0.3)] dark:bg-rose-500/18";
    case "attackRange":
      return "bg-rose-200/30 ring-1 ring-inset ring-rose-500/45 dark:bg-rose-500/12";
    case "dora":
      return "bg-amber-300/35 ring-2 ring-inset ring-amber-500/70 shadow-[inset_0_0_18px_rgba(245,158,11,0.25)] dark:bg-amber-500/15";
    case "previewMove":
      return "bg-sky-300/20 ring-1 ring-sky-500/45 dark:bg-sky-400/10 dark:ring-sky-300/45";
    case "previewAttack":
      return "bg-rose-300/22 ring-1 ring-rose-500/45 dark:bg-rose-400/10 dark:ring-rose-300/45";
    case "previewAbility":
      return "bg-amber-300/22 ring-1 ring-amber-500/45 dark:bg-amber-400/10 dark:ring-amber-300/45";
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
  allowAnyUnitSelection = false,
  visualEffectsEnabled = false,
  eventBatch = null,
  effectSessionKey = null,
  previewLine = null,
  zoom = 1,
  showCoordinates = true,
  className = "",
  disabled = false,
  onCellHover,
  onSelectUnit,
  onCellClick,
}) => {
  const { language, t } = useI18n();
  const size = view.boardSize ?? 9;
  const maxIndex = size - 1;
  const isFlipped = playerId === "P2";
  const {
    ref: boardWrapperRef,
    metrics: { cellSize, labelSize, boardPixelSize, totalPixelSize },
  } = useBoardFit({ boardSize: size, zoom, showCoordinates });
  const [transformingUnitIds, setTransformingUnitIds] = useState<Set<string>>(() => new Set());
  const visualStateRef = useRef<{
    enabled: boolean;
    turnNumber: number;
    units: Map<string, { signature: string; variant: string | null }>;
  } | null>(null);
  const visualEffectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const nextUnits = new Map<string, { signature: string; variant: string | null }>();
    for (const unit of Object.values(view.units)) {
      nextUnits.set(unit.id, {
        signature: getUnitVisualSignature(unit),
        variant: getUnitVisualVariant(unit),
      });
    }

    const previous = visualStateRef.current;
    const shouldBaseline =
      !visualEffectsEnabled ||
      !previous?.enabled ||
      view.turnNumber < (previous?.turnNumber ?? view.turnNumber);

    visualStateRef.current = {
      enabled: visualEffectsEnabled,
      turnNumber: view.turnNumber,
      units: nextUnits,
    };

    if (shouldBaseline) {
      if (!visualEffectsEnabled && previous?.enabled) {
        for (const timer of visualEffectTimersRef.current.values()) {
          clearTimeout(timer);
        }
        visualEffectTimersRef.current.clear();
        setTransformingUnitIds((current) => (current.size > 0 ? new Set() : current));
      }
      return;
    }

    const changedUnitIds: string[] = [];
    for (const [unitId, next] of nextUnits) {
      const before = previous.units.get(unitId);
      if (
        before &&
        before.signature !== next.signature &&
        (before.variant !== null || next.variant !== null)
      ) {
        changedUnitIds.push(unitId);
      }
    }
    if (changedUnitIds.length === 0) return;

    setTransformingUnitIds((current) => {
      const next = new Set(current);
      changedUnitIds.forEach((unitId) => next.add(unitId));
      return next;
    });

    for (const unitId of changedUnitIds) {
      const existingTimer = visualEffectTimersRef.current.get(unitId);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        visualEffectTimersRef.current.delete(unitId);
        setTransformingUnitIds((current) => {
          if (!current.has(unitId)) return current;
          const next = new Set(current);
          next.delete(unitId);
          return next;
        });
      }, 1100);
      visualEffectTimersRef.current.set(unitId, timer);
    }
  }, [view, visualEffectsEnabled]);

  useEffect(
    () => () => {
      for (const timer of visualEffectTimersRef.current.values()) {
        clearTimeout(timer);
      }
      visualEffectTimersRef.current.clear();
    },
    [],
  );

  const { effects: boardEffects, reducedMotion } = useBoardEffects({
    batch: eventBatch,
    view,
    enabled: visualEffectsEnabled,
    sessionKey: effectSessionKey,
  });
  const labelFontSize = Math.max(10, Math.round(cellSize * 0.22));
  const pieceFontSize = Math.max(10, Math.round(cellSize * 0.24));
  const markerFontSize = Math.max(8, Math.round(cellSize * 0.18));
  const badgeSize = Math.round(cellSize * 0.7);
  const tokenInset = Math.max(2, Math.round(cellSize * 0.08));
  const tokenSize = Math.max(16, cellSize - tokenInset * 2);
  const lastKnownSize = Math.round(cellSize * 0.7);
  const hpBarWidth = Math.round(cellSize * 0.7);
  const highlightInset = Math.max(2, Math.round(cellSize * 0.08));
  const toViewCoord = (coord: Coord): Coord =>
    isFlipped ? { col: maxIndex - coord.col, row: maxIndex - coord.row } : coord;
  const toGameCoord = (coord: Coord): Coord =>
    isFlipped ? { col: maxIndex - coord.col, row: maxIndex - coord.row } : coord;

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
    | "place"
    | "move"
    | "attack"
    | "dora"
    | "attackRange"
    | "previewMove"
    | "previewAttack"
    | "previewAbility"
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
    selectedUnitId && view.units[selectedUnitId] ? view.units[selectedUnitId] : null;
  const isMyTurn = playerId ? view.currentPlayer === playerId : false;
  const isActive = selectedUnit ? view.activeUnitId === selectedUnit.id : false;
  const abilityAvailable =
    selectedUnit?.class === "trickster" || selectedUnit?.heroId === KALADIN_ID;
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
    for (let dc = -TRICKSTER_AOE_RADIUS; dc <= TRICKSTER_AOE_RADIUS; dc += 1) {
      for (let dr = -TRICKSTER_AOE_RADIUS; dr <= TRICKSTER_AOE_RADIUS; dr += 1) {
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
    view.pendingAoEPreview?.abilityId === "kaiserCarpetStrike" ? view.pendingAoEPreview : null;
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
  const doraPreviewCenterKey = doraPreview ? coordKey(toViewCoord(doraPreview.center)) : null;

  const rows = [] as JSX.Element[];

  for (let row = size - 1; row >= 0; row -= 1) {
    const cells: JSX.Element[] = [];
    for (let col = 0; col < size; col += 1) {
      const viewCoord = { col, row };
      const gameCoord = toGameCoord(viewCoord);
      const key = coordKey(viewCoord);
      const unit = unitsByPos.get(key);
      const isSelected = unit?.id === selectedUnitId;
      const isActiveUnit = unit?.id === view.activeUnitId;
      const isDoraPreview = doraPreviewKeys.has(key);
      const isDoraPreviewCenter = key === doraPreviewCenterKey;
      const isForestAura = forestAuraKeys.has(key);
      const forestMarkerOwners = forestMarkerOwnersByKey.get(key) ?? [];
      const isForestMarker = forestMarkerOwners.length > 0;
      const isDark = (row + col) % 2 === 1;
      const highlightKind = viewHighlights[key];
      const aoeKind = aoeHighlights.get(key);

      const cellClasses = [
        "relative",
        "border",
        "border-stone-400/35 dark:border-slate-700/55",
        "flex",
        "items-center",
        "justify-center",
        "transition-[width,height,background-color,box-shadow] duration-150 ease-out",
        "focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
        isDark ? "board-cell-dark" : "board-cell-light",
        isSelected
          ? "z-10 ring-[3px] ring-inset ring-amber-500 shadow-[inset_0_0_20px_rgba(245,158,11,0.22)] dark:ring-amber-300"
          : "",
        isActiveUnit && !isSelected
          ? "z-10 ring-2 ring-inset ring-cyan-400 shadow-[inset_0_0_16px_rgba(34,211,238,0.18)] dark:ring-cyan-300"
          : "",
      ].join(" ");

      let content: JSX.Element | null = null;
      const lastKnownCount = lastKnownByPos.get(key) ?? 0;

      if (unit) {
        const isFriendly = playerId ? unit.owner === playerId : false;
        const isHiddenEnemy = !isFriendly && unit.isStealthed;
        const marker = getClassMarker(unit.class);
        const unitView = view.units[unit.id];
        const tokenId = unitView?.figureId ?? unitView?.heroId ?? unit.class;
        const tokenAsset = getUnitTokenAsset(unitView);
        const isTransforming = transformingUnitIds.has(unit.id);
        const previewRelationClass =
          isDoraPreview && selectedUnit
            ? unit.owner === selectedUnit.owner
              ? "ring-4 ring-emerald-400/80"
              : "ring-4 ring-rose-400/85"
            : "";

        const badgeClasses = [
          "relative",
          "rounded-full",
          "flex",
          "items-center",
          "justify-center",
          "font-semibold",
          "border-2 border-white/70 shadow-lg shadow-black/25 dark:border-stone-950",
          previewRelationClass,
          isFriendly ? "bg-emerald-500 text-white" : "bg-rose-500 text-white",
        ].join(" ");

        const tokenClasses = [
          "relative",
          "flex",
          "items-center",
          "justify-center",
          "rounded-xl border border-white/60 shadow-xl shadow-black/25 dark:border-black/70",
          unit.owner === "P1"
            ? "ring-[3px] ring-cyan-400/90 dark:ring-cyan-300/80"
            : "ring-[3px] ring-rose-400/90 dark:ring-rose-300/80",
          previewRelationClass,
          isTransforming ? "unit-transforming" : "",
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
            {tokenAsset.isFallback ? (
              <div
                className={`flex h-full w-full items-center justify-center rounded-xl font-bold text-white shadow-lg shadow-slate-900/20 ${
                  unit.owner === "P1"
                    ? "bg-gradient-to-br from-emerald-500 to-teal-700"
                    : "bg-gradient-to-br from-rose-500 to-red-700"
                }`}
                style={{ fontSize: pieceFontSize }}
                aria-label={t("board.tokenAlt", { unit: getClassLabel(unit.class, t) })}
              >
                {getUnitLabel(unit.class)}
              </div>
            ) : (
              <img
                key={`${unit.id}:${tokenAsset.id}`}
                src={tokenAsset.src}
                alt={t("board.tokenAlt", {
                  unit: getHeroDisplayName(tokenId, getClassLabel(unit.class, t), language),
                })}
                className={`h-full w-full rounded-xl bg-white/90 object-contain shadow-lg shadow-slate-900/20 dark:bg-slate-900/90 ${
                  isTransforming ? "unit-token-changing" : ""
                }`}
                draggable={false}
              />
            )}
            {isTransforming ? (
              <span className="unit-transform-label">{t("visuals.transform")}</span>
            ) : null}
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
        <button
          type="button"
          key={key}
          className={cellClasses}
          style={{ width: cellSize, height: cellSize }}
          disabled={disabled}
          aria-label={t("board.cell", {
            cell: `${String.fromCharCode(65 + gameCoord.col)}${gameCoord.row}`,
            details: unit
              ? `, ${unit.owner} ${getClassLabel(unit.class, t)}${
                  unit.id === view.activeUnitId ? `, ${t("board.activeUnit")}` : ""
                }${unit.id === selectedUnitId ? `, ${t("board.selected")}` : ""}`
              : lastKnownCount > 0
                ? `, ${t("board.lastKnown")}`
                : "",
          })}
          aria-pressed={isSelected}
          onClick={() => {
            if (disabled) return;
            if (
              allowUnitSelection &&
              unit &&
              (allowAnyUnitSelection || (playerId && unit.owner === playerId))
            ) {
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
                highlightKind,
              )}`}
              style={{ inset: highlightInset }}
            />
          )}
          {aoeKind && (
            <div
              className={`pointer-events-none absolute rounded dark:ring-1 dark:ring-neutral-800/70 ${getAoEHighlightClass(
                aoeKind,
              )}`}
              style={{ inset: highlightInset }}
            />
          )}
          {isDoraPreviewCenter && (
            <div
              className="pointer-events-none absolute z-10 rounded ring-2 ring-inset ring-amber-300 shadow-[inset_0_0_18px_rgba(251,191,36,0.45)] dark:ring-amber-200"
              style={{ inset: highlightInset }}
            />
          )}
          {content}
          {isForestMarker && (
            <div
              className="pointer-events-none absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white shadow dark:bg-emerald-400/80 dark:text-emerald-950"
              title={t("board.forestMarker", { owners: forestMarkerOwners.join("/") })}
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
              title={stakeMarkersByPos.get(key) ? t("board.revealedStake") : t("board.hiddenStake")}
            >
              {stakeMarkersByPos.get(key) ? "R" : "S"}
            </div>
          )}
          {unit?.bunkerActive && (
            <div
              className="pointer-events-none absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-200 text-[9px] font-bold text-amber-900 shadow dark:bg-amber-900/60 dark:text-amber-200"
              title={t("board.bunker")}
            >
              B
            </div>
          )}
          {unit?.isStealthed && (
            <div
              className="pointer-events-none absolute bottom-3 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[9px] font-bold text-white shadow dark:bg-violet-400 dark:text-violet-950"
              title={t("board.stealth")}
            >
              S
            </div>
          )}
          {isActiveUnit && (
            <div
              className="pointer-events-none absolute left-1/2 top-0.5 z-20 h-1.5 w-5 -translate-x-1/2 rounded-full bg-amber-400 shadow-sm shadow-amber-900/30 dark:bg-amber-300"
              title={t("game.activeUnit")}
            />
          )}
          {unit && (
            <div className="pointer-events-none absolute bottom-1 left-1 right-1 z-10 flex justify-center">
              <div style={{ width: hpBarWidth }}>
                <HpBar
                  current={view.units[unit.id]?.hp ?? 0}
                  max={getMaxHp(unit.class as UnitClass, view.units[unit.id]?.heroId)}
                  showText={playerId ? unit.owner === playerId : false}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </button>,
      );
    }
    const rowLabel = isFlipped ? maxIndex - row : row;
    rows.push(
      <div key={`row-${row}`} className="flex">
        {showCoordinates ? (
          <div
            className="flex items-center justify-center font-display font-bold text-stone-500 dark:text-stone-400"
            style={{ width: labelSize, height: cellSize, fontSize: labelFontSize }}
          >
            {rowLabel}
          </div>
        ) : null}
        {cells}
      </div>,
    );
  }

  const colLabels = Array.from({ length: size }, (_, idx) => String.fromCharCode(65 + idx));
  if (isFlipped) {
    colLabels.reverse();
  }

  return (
    <div
      ref={boardWrapperRef}
      className={`battlefield-frame scroll-panel h-full w-full min-w-0 overflow-auto ${className}`}
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          className="relative inline-block transition-[width,height] duration-150 ease-out"
          style={{ width: totalPixelSize }}
        >
          {showCoordinates ? (
            <div className="flex">
              <div style={{ width: labelSize, height: labelSize }} />
              {colLabels.map((label, index) => (
                <div
                  key={`col-${label}-${index}`}
                  className="flex items-center justify-center font-display font-bold text-stone-500 dark:text-stone-400"
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
          ) : null}
          {rows}
          <div className="pointer-events-none absolute" style={{ left: labelSize, top: labelSize }}>
            <BoardEffectsLayer
              effects={boardEffects}
              previewLine={previewLine}
              view={view}
              boardSize={size}
              cellSize={cellSize}
              isFlipped={isFlipped}
              reducedMotion={reducedMotion}
              t={t}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
