import type { Coord, PlayerId, PlayerView, UnitClass, UnitState } from "rules";
import { FOREST_AURA_RADIUS, getMaxHp } from "../rulesHints";
import type { FC } from "react";
import { HpBar } from "./HpBar";
import {
  getBoardMarkerAsset,
  getActiveBoardFieldVisual,
  getBoardFieldAsset,
  getUnitTokenAsset,
} from "../assets/registry";
import { useI18n } from "../i18n";
import { getClassLabel, getHeroDisplayName } from "../i18n/displayMetadata";
import { BoardEffectsLayer } from "../game/effects/BoardEffectsLayer";
import { useBoardEffects } from "../game/effects/useBoardEffects";
import { useVisualResolution } from "../game/effects/useVisualResolution";
import { CombatRollFeedback } from "../game/effects/CombatRollFeedback";
import { isGameplayProjectedUnit } from "../game/effects/combatPlayback";
import { cellToBoardPoint } from "../features/vfx/vfxGeometry";
import { useBoardFit } from "../game/hooks/useBoardFit";
import type { BoardEventBatch, BoardPreviewLine } from "../game/effects/types";
import { getActiveBoneStatus, type ActiveBoneStatus } from "../game/boneStatus";
import { VfxLayer } from "../features/vfx/VfxLayer";
import { BOARD_LAYER_STYLES } from "../features/vfx/vfxRegistry";
import type { QueuedBoardVfxRequest } from "../features/vfx/vfxTypes";
import { useBoardVfx } from "../features/vfx/useBoardVfx";
import { useBoardSfx } from "../features/sfx/useBoardSfx";
import { UnitStatusVfx } from "../features/vfx/UnitStatusVfx";
import { resolveUnitStatuses, resolvePersistentGroundStatuses } from "../features/vfx/persistentStatuses";
import {
  buildPreviewCellMap,
  type BoardPreview,
  type PreviewCellKind,
  type PreviewCellState,
} from "../game/targeting/previewTypes";

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
  boardPreview?: BoardPreview | null;
  preferredUnitIds?: readonly string[];
  doraPreview?: { center: Coord; radius: number } | null;
  linePreview?: { target: Coord; axis: "row" | "col" } | null;
  disabled?: boolean;
  allowUnitSelection?: boolean;
  allowAnyUnitSelection?: boolean;
  visualEffectsEnabled?: boolean;
  eventBatch?: BoardEventBatch | null;
  eventBatches?: BoardEventBatch[];
  onEventBatchesConsumed?: (batches: BoardEventBatch[]) => void;
  effectSessionKey?: string | null;
  previewLines?: readonly BoardPreviewLine[];
  /** Debug-only normalized cues, isolated from the live event/session pipeline. */
  previewVfx?: QueuedBoardVfxRequest[];
  previewReducedMotion?: boolean;
  previewIsFlipped?: boolean;
  zoom?: number;
  showCoordinates?: boolean;
  className?: string;
  onCellHover?: (coord: Coord | null) => void;
  onSelectUnit: (unitId: string | null) => void;
  onCellClick: (col: number, row: number, preferredTargetId?: string) => void;
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
      return "board-target board-target--place";
    case "move":
      return "board-target board-target--move";
    case "attack":
      return "board-target board-target--attack";
    case "attackRange":
      return "board-target board-target--attackRange";
    case "dora":
      return "board-target board-target--dora";
    case "previewMove":
      return "board-target board-target--previewMove";
    case "previewAttack":
      return "board-target board-target--previewAttack";
    case "previewAbility":
      return "board-target board-target--previewAbility";
    default:
      return "";
  }
}

function getAoEHighlightClass(kind: "aoe" | "aoeDisabled") {
  return kind === "aoe"
    ? "bg-amber-400/25 dark:bg-amber-500/12"
    : "bg-slate-400/20 dark:bg-neutral-500/10";
}

function getPreviewCellClass(kind: PreviewCellKind) {
  // Keep complete class names visible to Tailwind's production content scan.
  const classes: Record<PreviewCellKind, string> = {
    source: "board-target board-preview--source",
    validTarget: "board-target board-preview--validTarget",
    invalidTarget: "board-target board-preview--invalidTarget",
    validMove: "board-target board-preview--validMove",
    area: "board-target board-preview--area",
    line: "board-target board-preview--line",
    blocked: "board-target board-preview--blocked",
    pickup: "board-target board-preview--pickup",
    drop: "board-target board-preview--drop",
    danger: "board-target board-preview--danger",
    affected: "board-target board-preview--affected",
  };
  return classes[kind];
}

const PREVIEW_KIND_ORDER: PreviewCellKind[] = [
  "area",
  "line",
  "validMove",
  "pickup",
  "drop",
  "affected",
  "danger",
  "blocked",
  "invalidTarget",
  "validTarget",
  "source",
];

const FOREST_MARKER_ASSET = getBoardMarkerAsset("lechy_forest");
const STAKE_MARKER_ASSET = getBoardMarkerAsset("vlad_stake");
const JACK_TRAP_MARKER_ASSET = getBoardMarkerAsset("jack_trap");

function orderedPreviewKinds(state: PreviewCellState | undefined): PreviewCellKind[] {
  if (!state) return [];
  return PREVIEW_KIND_ORDER.filter((kind) => state.kinds.includes(kind));
}

function getPreviewKindLabelKey(kind: PreviewCellKind): string {
  return `preview.cellKinds.${kind}`;
}

function coordKey(coord: Coord): string {
  return `${coord.col},${coord.row}`;
}

export function getBoardLinePreviewCells(
  size: number,
  target: Coord,
  axis: "row" | "col",
): Coord[] {
  return Array.from({ length: size }, (_, index) =>
    axis === "row" ? { col: index, row: target.row } : { col: target.col, row: index },
  );
}

export const Board: FC<BoardProps> = ({
  view,
  playerId,
  selectedUnitId,
  highlightedCells,
  boardPreview = null,
  preferredUnitIds = [],
  doraPreview = null,
  linePreview = null,
  allowUnitSelection = true,
  allowAnyUnitSelection = false,
  visualEffectsEnabled = false,
  eventBatch = null,
  eventBatches,
  onEventBatchesConsumed,
  effectSessionKey = null,
  previewLines = [],
  previewVfx,
  previewReducedMotion,
  previewIsFlipped,
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
  const activeFieldId = getActiveBoardFieldVisual(view);
  const renderedFieldId = activeFieldId;
  const maxIndex = size - 1;
  const isFlipped = previewIsFlipped ?? (playerId === "P2");
  const {
    ref: boardWrapperRef,
    metrics: { cellSize, labelSize, boardPixelSize, totalPixelSize },
  } = useBoardFit({ boardSize: size, zoom, showCoordinates });
  const visualResolution = useVisualResolution({
    batch: eventBatch,
    batches: eventBatches,
    onBatchesConsumed: onEventBatchesConsumed,
    view,
    enabled: visualEffectsEnabled,
    sessionKey: effectSessionKey,
  });
  const renderedUnits = visualResolution.visualUnitsByUnitId;
  const { effects: boardEffects, reducedMotion } = useBoardEffects({
    batch: visualResolution.batch,
    view,
    enabled: visualEffectsEnabled,
    sessionKey: effectSessionKey,
  });
  const { effects: boardVfx, reducedMotion: vfxReducedMotion } = useBoardVfx({
    batch: visualResolution.batch,
    view,
    enabled: visualEffectsEnabled,
    sessionKey: effectSessionKey,
  });
  useBoardSfx({
    batch: visualResolution.batch,
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
    Array<{
      id: string;
      owner: PlayerId;
      class: string;
      isVisualOnly: boolean;
      isStealthed: boolean;
      blindUntilOwnTurnStart?: boolean;
      immobilizedUntilOwnTurnStart?: boolean;
      chikatiloMarkStatus?: UnitState["chikatiloMarkStatus"];
      boneStatus: ActiveBoneStatus | null;
    }>
  >();
  const groundStatusesByPos = new Map(resolvePersistentGroundStatuses(view).map(status =>
    [coordKey(toViewCoord(status.cell)), status],
  ));
  const lastKnownByPos = new Map<string, number>();
  const stakeMarkersByPos = new Map<string, boolean>();
  const jackTrapStatesByPos = new Map<string, boolean>();
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

  for (const unit of Object.values(renderedUnits)) {
    if (!unit.position) continue;
    const current = view.units[unit.id];
    // Combat death ghosts can finish their existing event playback. Loss of
    // visibility/stasis permission removes old current-position tokens immediately.
    if (!current || (current.isAlive && !current.position)) continue;
    const viewPos = toViewCoord(unit.position);
    const key = coordKey(viewPos);
    const occupants = unitsByPos.get(key) ?? [];
    occupants.push({
      id: unit.id,
      owner: unit.owner,
      class: unit.class,
      isVisualOnly: !isGameplayProjectedUnit(view, unit.id),
      isStealthed: current.isStealthed,
      blindUntilOwnTurnStart: current.blindUntilOwnTurnStart,
      immobilizedUntilOwnTurnStart: current.immobilizedUntilOwnTurnStart,
      chikatiloMarkStatus: current.chikatiloMarkStatus,
      boneStatus: getActiveBoneStatus(current),
    });
    unitsByPos.set(key, occupants);
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
  for (const trap of view.jackTraps ?? []) {
    if (trap.isTriggered) continue;
    const key = coordKey(toViewCoord(trap.position));
    const existing = jackTrapStatesByPos.get(key) ?? false;
    jackTrapStatesByPos.set(key, existing || trap.isRevealed);
  }
  for (const [key, kind] of Object.entries(highlightedCells)) {
    const [colRaw, rowRaw] = key.split(",");
    const col = Number(colRaw);
    const row = Number(rowRaw);
    if (Number.isNaN(col) || Number.isNaN(row)) continue;
    const viewPos = toViewCoord({ col, row });
    viewHighlights[coordKey(viewPos)] = kind;
  }
  const previewHighlights = new Map<string, PreviewCellState>();
  for (const [key, state] of buildPreviewCellMap(boardPreview)) {
    const [colRaw, rowRaw] = key.split(",");
    const col = Number(colRaw);
    const row = Number(rowRaw);
    if (Number.isNaN(col) || Number.isNaN(row)) continue;
    const viewPos = toViewCoord({ col, row });
    const viewKey = coordKey(viewPos);
    const existing = previewHighlights.get(viewKey);
    if (!existing) {
      previewHighlights.set(viewKey, {
        kinds: [...state.kinds],
        labelKeys: [...state.labelKeys],
      });
      continue;
    }
    for (const kind of state.kinds) {
      if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
    }
    for (const labelKey of state.labelKeys) {
      if (!existing.labelKeys.includes(labelKey)) existing.labelKeys.push(labelKey);
    }
  }

  const selectedUnit =
    selectedUnitId && view.units[selectedUnitId] ? view.units[selectedUnitId] : null;
  const activeUnitForBoneField = view.activeUnitId ? view.units[view.activeUnitId] : null;
  const activeSansBoneFieldTone = activeUnitForBoneField?.position
    ? (activeUnitForBoneField.sansBoneFieldStatus?.kind ?? null)
    : null;

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

  if (linePreview) {
    const kind: "aoe" | "aoeDisabled" = disabled ? "aoeDisabled" : "aoe";
    for (const coord of getBoardLinePreviewCells(size, linePreview.target, linePreview.axis)) {
      aoeHighlights.set(coordKey(toViewCoord(coord)), kind);
    }
  }
  const doraPreviewCenterKey = doraPreview ? coordKey(toViewCoord(doraPreview.center)) : null;

  const rows = [] as JSX.Element[];
  const preferredUnitIdSet = new Set(preferredUnitIds);

  for (let row = size - 1; row >= 0; row -= 1) {
    const cells: JSX.Element[] = [];
    for (let col = 0; col < size; col += 1) {
      const viewCoord = { col, row };
      const gameCoord = toGameCoord(viewCoord);
      const key = coordKey(viewCoord);
      const occupants = unitsByPos.get(key) ?? [];
      const transport = visualResolution.transportAttachments.find(attachment =>
        occupants.some(occupant => occupant.id === attachment.carrierId) &&
        occupants.some(occupant => occupant.id === attachment.passengerId));
      const unit =
        (transport ? occupants.find(occupant => occupant.id === transport.carrierId) : undefined) ??
        occupants.find(
          (occupant) => !occupant.isVisualOnly && preferredUnitIdSet.has(occupant.id),
        ) ??
        [...occupants].reverse().find((occupant) => !occupant.isVisualOnly) ??
        occupants[occupants.length - 1];
      const isGameplayUnit = !!unit && !unit.isVisualOnly;
      const motion = unit ? visualResolution.visualMotionByUnitId[unit.id] : undefined;
      const transportPassenger = transport ? renderedUnits[transport.passengerId] : undefined;
      const passengerAsset = transportPassenger && view.units[transportPassenger.id] ? getUnitTokenAsset(view.units[transportPassenger.id]) : null;
      const passengerMotion = transportPassenger ? visualResolution.visualMotionByUnitId[transportPassenger.id] : undefined;
      const passengerOffset = transportPassenger?.position && unit ? (() => {
        const carrierPoint = cellToBoardPoint(motion?.position ?? renderedUnits[unit.id].position!, size, cellSize, isFlipped);
        const passengerPoint = cellToBoardPoint(passengerMotion?.position ?? transportPassenger.position, size, cellSize, isFlipped);
        return `translate(${passengerPoint.x - carrierPoint.x}px, ${passengerPoint.y - carrierPoint.y}px)`;
      })() : undefined;
      const motionStyle =
        motion && unit
          ? (() => {
              const base = cellToBoardPoint(
                renderedUnits[unit.id].position!,
                size,
                cellSize,
                isFlipped,
              );
              const point = cellToBoardPoint(motion.position, size, cellSize, isFlipped);
              return {
                transform: `translate(${point.x - base.x}px, ${point.y - base.y}px)`,
                opacity: motion.opacity,
                pointerEvents: "none" as const,
              };
            })()
          : undefined;
      const isSelected = isGameplayUnit && unit.id === selectedUnitId;
      const isActiveUnit = isGameplayUnit && unit.id === view.activeUnitId;
      const markStatus = unit?.chikatiloMarkStatus;
      const boneStatus = unit?.boneStatus ?? null;
      const isDoraPreview = doraPreviewKeys.has(key);
      const isDoraPreviewCenter = key === doraPreviewCenterKey;
      const isForestAura = forestAuraKeys.has(key);
      const forestMarkerOwners = forestMarkerOwnersByKey.get(key) ?? [];
      const isForestMarker = forestMarkerOwners.length > 0;
      const isDark = (row + col) % 2 === 1;
      const highlightKind = viewHighlights[key];
      const aoeKind = aoeHighlights.get(key);
      const previewState = previewHighlights.get(key);
      const previewKinds = orderedPreviewKinds(previewState);

      const cellClasses = [
        "board-cell relative",
        "border",
        "flex",
        "items-center",
        "justify-center",
        "transition-[background-color,box-shadow] duration-150 ease-out",
        "focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
        isDark ? "board-cell-dark" : "board-cell-light",
        isSelected || isActiveUnit ? "z-10" : "",
      ].join(" ");

      let content: JSX.Element | null = null;
      const lastKnownCount = lastKnownByPos.get(key) ?? 0;
      const previewDetails = previewState
        ? Array.from(
            new Set([
              ...previewState.kinds.map((kind) => t(getPreviewKindLabelKey(kind))),
              ...previewState.labelKeys.map((labelKey) => t(labelKey)),
            ]),
          )
        : [];
      const canExposeUnitStatus =
        !!unit && (!unit.isStealthed || (!!playerId && unit.owner === playerId));
      const cellDetails = unit
        ? `, ${unit.owner} ${getClassLabel(unit.class, t)}${
            unit.id === view.activeUnitId ? `, ${t("board.activeUnit")}` : ""
          }${unit.id === selectedUnitId ? `, ${t("board.selected")}` : ""}${
            markStatus
              ? `, ${
                  markStatus.exactTrackingActive
                    ? t("board.assassinMarkTracked")
                    : t("board.assassinMark")
                }`
              : ""
          }${
            boneStatus && canExposeUnitStatus
              ? `, ${t(boneStatus.kind === "blue" ? "game.blueBone" : "game.orangeBone")}`
              : ""
          }${unit.blindUntilOwnTurnStart && canExposeUnitStatus ? `, ${t("game.blind")}` : ""}${
            unit.immobilizedUntilOwnTurnStart && canExposeUnitStatus
              ? `, ${t("board.wrappedInSnares")}`
              : ""
          }`
        : lastKnownCount > 0
          ? `, ${t("board.lastKnown")}`
          : "";
      const currentStatusLabels = unit && view.units[unit.id]
        ? resolveUnitStatuses(view.units[unit.id], playerId, view).map(status => t(status.labelKey)) : [];
      const details = [...previewDetails, ...currentStatusLabels,
        ...(groundStatusesByPos.has(key) ? [t("persistentStatus.crater")] : [])];
      const previewDetailsText = details.length > 0 ? `, ${details.join(", ")}` : "";

      if (unit) {
        const isFriendly = playerId ? unit.owner === playerId : false;
        const isHiddenEnemy = !isFriendly && unit.isStealthed;
        const isTrackedHiddenEnemy = isHiddenEnemy && unit.chikatiloMarkStatus?.exactTrackingActive;
        const marker = getClassMarker(unit.class);
        const unitView = view.units[unit.id] ?? renderedUnits[unit.id];
        const tokenId = unitView?.figureId ?? unitView?.heroId ?? unit.class;
        const tokenAsset = getUnitTokenAsset(unitView);
        const unitVisualState = visualResolution.visualStateByUnitId[unit.id] ?? "idle";
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
          isTrackedHiddenEnemy
            ? "bg-amber-300 text-amber-950 ring-4 ring-amber-500/85"
            : isFriendly
              ? "bg-emerald-500 text-white"
              : "bg-rose-500 text-white",
        ].join(" ");

        const tokenClasses = [
          "relative",
          "flex",
          "items-center",
          "justify-center",
          "unit-token border",
          previewRelationClass,
          !unit.isVisualOnly && boneStatus ? `unit-bone-status unit-bone-status--${boneStatus.kind}` : "",
          `unit-visual-${unitVisualState}`,
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
            data-unit-visual-state={unitVisualState}
            data-owner={unit.owner}
            data-visual-ghost={unit.isVisualOnly ? "true" : undefined}
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
                className="h-full w-full rounded-xl bg-white/90 object-contain shadow-lg shadow-slate-900/20 dark:bg-slate-900/90"
                draggable={false}
              />
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
        <button
          type="button"
          key={key}
          className={cellClasses}
          style={{ width: cellSize, height: cellSize }}
          disabled={disabled}
          aria-label={t("board.cell", {
            cell: `${String.fromCharCode(65 + gameCoord.col)}${gameCoord.row}`,
            details: `${cellDetails}${previewDetailsText}`,
          })}
          aria-pressed={isSelected}
          data-active={isActiveUnit ? "true" : undefined}
          data-highlight={highlightKind}
          data-unit-id={unit?.id}
          data-visual-ghost={unit?.isVisualOnly ? "true" : undefined}
          onClick={() => {
            if (disabled) return;
            if (
              allowUnitSelection &&
              isGameplayUnit &&
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
          {groundStatusesByPos.has(key) && <span className="persistent-crater-cell"
            data-ground-status="crater" data-ground-status-id={groundStatusesByPos.get(key)!.id} aria-hidden="true" />}
          {view.arenaId === "boneField" ? (
            <div
              className={`bone-field-cell bone-field-cell--${activeSansBoneFieldTone ?? "neutral"}`}
              data-bone-field-tone={activeSansBoneFieldTone ?? "neutral"}
              aria-hidden="true"
            />
          ) : null}
          {isForestAura && (
            <div
              className="pointer-events-none absolute rounded bg-emerald-200/25 ring-1 ring-emerald-200/40 dark:bg-emerald-900/25 dark:ring-emerald-700/40"
              style={{ inset: highlightInset }}
            />
          )}
          {highlightKind && (
            <div
              className={`board-decision pointer-events-none absolute rounded ${getHighlightClass(highlightKind)}`}
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
          {previewKinds.map((kind) => (
            <div
              key={kind}
              className={`board-decision pointer-events-none absolute rounded ${getPreviewCellClass(kind)}`}
              style={{ inset: highlightInset }}
            />
          ))}
          {previewKinds.includes("validTarget") && (
            <span
              className="pointer-events-none absolute left-1 top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white/80 shadow dark:bg-rose-300 dark:ring-slate-950/80"
              aria-hidden="true"
            />
          )}
          {previewKinds.includes("invalidTarget") && (
            <span
              className="pointer-events-none absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-slate-600 bg-slate-100/70 shadow dark:border-slate-200 dark:bg-slate-950/70"
              aria-hidden="true"
            />
          )}
          {previewKinds.includes("pickup") && (
            <span
              className="pointer-events-none absolute bottom-1 left-1 h-3 w-3 rounded-full border-2 border-emerald-600 bg-emerald-100/80 shadow dark:border-emerald-200 dark:bg-emerald-950/80"
              aria-hidden="true"
            />
          )}
          {previewKinds.includes("drop") && (
            <span
              className="pointer-events-none absolute bottom-1 right-1 h-3 w-3 rotate-45 border-2 border-indigo-600 bg-indigo-100/80 shadow dark:border-indigo-200 dark:bg-indigo-950/80"
              aria-hidden="true"
            />
          )}
          {previewKinds.includes("blocked") && (
            <span
              className="pointer-events-none absolute left-2 right-2 top-1/2 -rotate-45 border-t-2 border-slate-700 shadow dark:border-slate-100"
              aria-hidden="true"
            />
          )}
          {isDoraPreviewCenter && (
            <div
              className="board-decision pointer-events-none absolute rounded ring-2 ring-inset ring-amber-300 shadow-[inset_0_0_18px_rgba(251,191,36,0.45)] dark:ring-amber-200"
              style={{ inset: highlightInset }}
            />
          )}
          {isForestMarker && (
            <div
              className="board-marker-icon board-marker-icon--forest pointer-events-none absolute left-1/2 top-1/2 flex items-center justify-center"
              style={{
                width: Math.round(cellSize * 0.82),
                height: Math.round(cellSize * 0.82),
              }}
              role="img"
              aria-label={t("board.forestMarker", { owners: forestMarkerOwners.join("/") })}
              title={t("board.forestMarker", { owners: forestMarkerOwners.join("/") })}
              data-board-marker="lechy_forest"
            >
              <img src={FOREST_MARKER_ASSET} alt="" draggable={false} />
              {forestMarkerOwners.length > 1 ? (
                <span className="board-marker-count" aria-hidden="true">
                  {forestMarkerOwners.length}
                </span>
              ) : null}
            </div>
          )}
          {stakeMarkersByPos.has(key) && (
            <div
              className={`board-marker-icon board-marker-icon--stake pointer-events-none absolute left-1/2 top-1/2 flex items-center justify-center ${
                stakeMarkersByPos.get(key)
                  ? "board-marker-icon--stake-revealed"
                  : "board-marker-icon--stake-hidden"
              }`}
              style={{
                width: Math.round(cellSize * (stakeMarkersByPos.get(key) ? 0.66 : 0.6)),
                height: Math.round(cellSize * (stakeMarkersByPos.get(key) ? 0.66 : 0.6)),
              }}
              role="img"
              aria-label={
                stakeMarkersByPos.get(key) ? t("board.revealedStake") : t("board.hiddenStake")
              }
              title={stakeMarkersByPos.get(key) ? t("board.revealedStake") : t("board.hiddenStake")}
              data-board-marker={stakeMarkersByPos.get(key) ? "vlad_stake" : "vlad_stake_hidden"}
            >
              <img src={STAKE_MARKER_ASSET} alt="" draggable={false} />
            </div>
          )}
          {jackTrapStatesByPos.has(key) && (
            <div
              className={`board-marker-icon board-marker-icon--jack-trap pointer-events-none absolute left-1/2 top-1/2 flex items-center justify-center ${
                jackTrapStatesByPos.get(key)
                  ? "board-marker-icon--jack-trap-revealed"
                  : "board-marker-icon--jack-trap-hidden"
              }`}
              style={{
                width: Math.round(cellSize * 0.72),
                height: Math.round(cellSize * 0.72),
              }}
              role="img"
              aria-label={t("board.snare")}
              title={t("board.snare")}
              data-board-marker={
                jackTrapStatesByPos.get(key) ? "jack_snare_revealed" : "jack_snare_hidden"
              }
              data-snare-state={jackTrapStatesByPos.get(key) ? "revealed" : "hidden"}
            >
              <img src={JACK_TRAP_MARKER_ASSET} alt="" draggable={false} />
            </div>
          )}
          <div className="board-unit-content" style={motionStyle} data-movement-mode={motion?.mode}>
            {content}
            {transportPassenger && passengerAsset ? (
              <span className={`pointer-events-none absolute -bottom-1 -right-1 z-20 flex items-center justify-center overflow-hidden rounded-full border-2 border-teal-200 bg-slate-900 shadow unit-visual-${visualResolution.visualStateByUnitId[transportPassenger.id] ?? "idle"}`}
                style={{ width: tokenSize * 0.55, height: tokenSize * 0.55, transform: passengerOffset }}
                data-transport-passenger-id={transportPassenger.id} data-transport-mode={transport?.mode}>
                {passengerAsset.isFallback ? getUnitLabel(transportPassenger.class) :
                  <img src={passengerAsset.src} alt={t("board.tokenAlt", { unit: getClassLabel(transportPassenger.class, t) })}
                    className="h-full w-full object-contain" draggable={false} />}
              </span>
            ) : null}
          </div>
          {isSelected || isActiveUnit ? (
            <span className="board-selection-outline" aria-hidden="true" />
          ) : null}
          {jackTrapStatesByPos.has(key) && (
            <div
              className={`board-outcome stake-state-badge stake-state-badge--hidden pointer-events-none absolute left-1 ${
                stakeMarkersByPos.has(key) ? "top-6" : "top-1"
              } z-30 flex items-center justify-center rounded-full font-bold`}
              style={{
                width: Math.max(16, Math.round(cellSize * 0.23)),
                height: Math.max(16, Math.round(cellSize * 0.23)),
                fontSize: Math.max(9, Math.round(cellSize * 0.13)),
              }}
              title={t("board.snare")}
              role="img"
              aria-label={t("board.snare")}
              data-snare-badge="owner-private"
            >
              S
            </div>
          )}
          {stakeMarkersByPos.has(key) && (
            <div
              className={`board-outcome stake-state-badge pointer-events-none absolute left-1 top-1 z-30 flex items-center justify-center rounded-full font-bold ${
                stakeMarkersByPos.get(key)
                  ? "stake-state-badge--revealed"
                  : "stake-state-badge--hidden"
              }`}
              style={{
                width: Math.max(16, Math.round(cellSize * 0.23)),
                height: Math.max(16, Math.round(cellSize * 0.23)),
                fontSize: Math.max(9, Math.round(cellSize * 0.13)),
              }}
              title={stakeMarkersByPos.get(key) ? t("board.revealedStake") : t("board.hiddenStake")}
              role="img"
              aria-label={
                stakeMarkersByPos.get(key) ? t("board.revealedStake") : t("board.hiddenStake")
              }
              data-stake-state={stakeMarkersByPos.get(key) ? "revealed" : "hidden"}
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
            <div
              className="board-outcome pointer-events-none absolute bottom-1 left-1 right-1 flex justify-center"
              style={motionStyle}
            >
              <div style={{ width: hpBarWidth }}>
                <HpBar
                  current={
                    visualResolution.visualHpByUnitId[unit.id] ?? renderedUnits[unit.id]?.hp ?? 0
                  }
                  max={getMaxHp(
                    unit.class as UnitClass,
                    renderedUnits[unit.id]?.heroId,
                    renderedUnits[unit.id]?.transformed,
                  )}
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
      <div key={`row-${row}`} className="board-row relative flex">
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
          className={`board-object relative inline-block ${
            renderedFieldId ? "board-has-field" : ""
          }`}
          style={{ width: totalPixelSize, ...BOARD_LAYER_STYLES }}
        >
          {renderedFieldId ? (
            <div
              className={`board-field-surface board-field-surface--${renderedFieldId}`}
              style={{
                left: labelSize,
                top: labelSize,
                width: boardPixelSize,
                height: boardPixelSize,
              }}
              data-board-field={renderedFieldId}
              data-active={activeFieldId === renderedFieldId ? "true" : "false"}
              aria-hidden="true"
            >
              <div
                className={`board-field-background board-field-background--${renderedFieldId}`}
                style={{ backgroundImage: `url(${getBoardFieldAsset(renderedFieldId)})` }}
              />
              <div className="board-field-dim" />
              <div className="board-field-edge" />
            </div>
          ) : null}
          {showCoordinates ? (
            <div className="relative z-10 flex">
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
          <CombatRollFeedback cue={visualResolution.roll} t={t} top={labelSize + 4} />
          <div className="pointer-events-none absolute" style={{ left: labelSize, top: labelSize }}>
            <UnitStatusVfx
              view={view}
              playerId={playerId}
              visualUnits={renderedUnits}
              motion={visualResolution.visualMotionByUnitId}
              boardSize={size}
              cellSize={cellSize}
              isFlipped={isFlipped}
              reducedMotion={previewReducedMotion ?? reducedMotion}
              t={t}
            />
            <BoardEffectsLayer
              effects={boardEffects}
              previewLines={previewLines}
              view={view}
              boardSize={size}
              cellSize={cellSize}
              isFlipped={isFlipped}
              reducedMotion={reducedMotion}
              t={t}
            />
            <VfxLayer
              effects={previewVfx ?? boardVfx}
              view={view}
              boardSize={size}
              cellSize={cellSize}
              isFlipped={isFlipped}
              reducedMotion={previewReducedMotion ?? vfxReducedMotion}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
