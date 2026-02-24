import { useEffect, useState, useRef } from "react";
import type { Coord, GameAction, MoveMode, PapyrusLineAxis } from "rules";
import { PAPYRUS_ID } from "../../../rulesHints";
import { getLocalPlayerId, useGameStore } from "../../../store";
import { previewKindForActionMode } from "../helpers";
import { useGameShellPendingStatus } from "./useGameShellPendingStatus";

export function useGameShellCoreState() {
  const {
    roomId,
    role,
    connectionStatus,
    joined,
    hasSnapshot,
    roomState,
    roomMeta,
    seat,
    isHost,
    events,
    clientLog,
    hoveredAbilityId,
    hoverPreview,
    selectedUnitId,
    actionMode,
    placeUnitId,
    moveOptions,
    lastActionResult,
    lastActionResultAt,
    leavingRoom,
    setSelectedUnit,
    setActionMode,
    setPlaceUnitId,
    setMoveOptions,
    setHoveredAbilityId,
    setHoverPreview,
    sendAction,
    requestMoveOptions,
    setReady,
    startGame,
    switchRole,
    leaveRoom,
  } = useGameStore();

  const [doraPreviewCenter, setDoraPreviewCenter] = useState<Coord | null>(null);
  const [jebeHailPreviewCenter, setJebeHailPreviewCenter] =
    useState<Coord | null>(null);
  const [kaladinFifthPreviewCenter, setKaladinFifthPreviewCenter] =
    useState<Coord | null>(null);
  const [mettatonPoppinsPreviewCenter, setMettatonPoppinsPreviewCenter] =
    useState<Coord | null>(null);
  const [mettatonLaserPreviewTarget, setMettatonLaserPreviewTarget] =
    useState<Coord | null>(null);
  const [sansGasterBlasterPreviewTarget, setSansGasterBlasterPreviewTarget] =
    useState<Coord | null>(null);
  const [undyneEnergySpearPreviewTarget, setUndyneEnergySpearPreviewTarget] =
    useState<Coord | null>(null);
  const [forestPreviewCenter, setForestPreviewCenter] = useState<Coord | null>(null);
  const [stakeSelections, setStakeSelections] = useState<Coord[]>([]);
  const [hassanAssassinOrderSelections, setHassanAssassinOrderSelections] =
    useState<string[]>([]);
  const [tisonaPreviewCoord, setTisonaPreviewCoord] = useState<Coord | null>(null);
  const [papyrusLineAxis, setPapyrusLineAxis] =
    useState<PapyrusLineAxis>("row");

  const playerId = getLocalPlayerId(role);
  const view = roomState;
  const isSpectator = role === "spectator";
  const pending = useGameShellPendingStatus({
    view,
    roomMeta,
    roomId,
    leavingRoom,
    leaveRoom,
    seat,
  });

  const autoAttemptKeyRef = useRef<string | null>(null);
  const autoBlockedKeyRef = useRef<string | null>(null);
  const autoInFlightRef = useRef(false);

  useEffect(() => {
    if (!autoInFlightRef.current) return;
    autoInFlightRef.current = false;
    if (lastActionResult && !lastActionResult.ok) {
      autoBlockedKeyRef.current = autoAttemptKeyRef.current;
    }
  }, [lastActionResultAt, lastActionResult]);

  useEffect(() => {
    if (!view || !moveOptions) return;
    if (moveOptions.modes && moveOptions.modes.length > 0) return;
    if (!view.pendingMove || view.pendingMove.unitId !== moveOptions.unitId) {
      setMoveOptions(null);
    }
  }, [view, moveOptions, setMoveOptions]);

  useEffect(() => {
    if (!view || !playerId) return;
    if (!joined || !roomId) return;
    if (isSpectator) return;
    if (pending.pendingMeta) return;
    if (view.phase !== "battle") return;

    if (view.activeUnitId) {
      const activeUnit = view.units[view.activeUnitId];
      if (activeUnit && activeUnit.owner === playerId && selectedUnitId !== view.activeUnitId) {
        setSelectedUnit(view.activeUnitId);
      }
      return;
    }

    if (view.currentPlayer !== playerId) return;
    const queue = view.turnQueue?.length ? view.turnQueue : view.turnOrder;
    const queueIndex = view.turnQueue?.length
      ? view.turnQueueIndex
      : view.turnOrderIndex;
    const expectedUnitId = queue?.[queueIndex];
    if (!expectedUnitId) return;

    const expectedUnit = view.units[expectedUnitId];
    const autoKey = `${view.turnNumber}-${queueIndex}-${expectedUnitId}`;
    if (autoBlockedKeyRef.current === autoKey) return;
    if (autoInFlightRef.current && autoAttemptKeyRef.current === autoKey) return;

    if (!expectedUnit || !expectedUnit.isAlive) {
      autoInFlightRef.current = true;
      autoAttemptKeyRef.current = autoKey;
      sendAction({ type: "endTurn" });
      return;
    }
    if (expectedUnit.owner !== playerId) return;

    autoInFlightRef.current = true;
    autoAttemptKeyRef.current = autoKey;
    sendAction({ type: "unitStartTurn", unitId: expectedUnitId });
    setSelectedUnit(expectedUnitId);
  }, [
    view,
    playerId,
    selectedUnitId,
    joined,
    roomId,
    isSpectator,
    pending.pendingMeta,
    sendAction,
    setSelectedUnit,
  ]);

  const sendGameAction = (action: GameAction) => {
    if (!joined || isSpectator || pending.hasBlockingRoll) return;
    if (!view || view.phase === "lobby") return;
    sendAction(action);
  };

  const requestMove = (unitId: string, mode?: MoveMode) => {
    if (!joined || isSpectator || pending.hasBlockingRoll) return;
    if (!view || view.phase === "lobby") return;
    requestMoveOptions(unitId, mode);
  };

  const selectedUnit =
    view && selectedUnitId ? view.units[selectedUnitId] ?? null : null;
  const hoverActionMode =
    hoverPreview?.type === "actionMode" ? hoverPreview.mode : null;
  const allowActionHoverPreview =
    !actionMode &&
    !pending.hasBlockingRoll &&
    !pending.boardSelectionPending &&
    !!hoverActionMode &&
    !!selectedUnit;
  const effectiveActionMode =
    actionMode ?? (allowActionHoverPreview ? hoverActionMode : null);
  const modePreviewKind = allowActionHoverPreview
    ? previewKindForActionMode(hoverActionMode)
    : null;

  useEffect(() => {
    if (hoverPreview?.type !== "actionMode") return;
    if (
      actionMode ||
      pending.hasBlockingRoll ||
      pending.boardSelectionPending ||
      !selectedUnit
    ) {
      setHoverPreview(null);
    }
  }, [
    hoverPreview,
    actionMode,
    pending.hasBlockingRoll,
    pending.boardSelectionPending,
    selectedUnit,
    setHoverPreview,
  ]);

  useEffect(() => {
    if (!selectedUnit || selectedUnit.heroId !== PAPYRUS_ID) return;
    const nextAxis = selectedUnit.papyrusLineAxis ?? "row";
    if (nextAxis !== papyrusLineAxis) {
      setPapyrusLineAxis(nextAxis);
    }
  }, [selectedUnit, papyrusLineAxis]);

  const pendingMoveForSelected =
    view?.pendingMove && view.pendingMove.unitId === selectedUnitId
      ? view.pendingMove
      : null;

  return {
    roomId,
    role,
    connectionStatus,
    joined,
    hasSnapshot,
    view,
    roomMeta,
    seat,
    isHost,
    events,
    clientLog,
    hoveredAbilityId,
    hoverPreview,
    selectedUnitId,
    actionMode,
    placeUnitId,
    moveOptions,
    leavingRoom,
    setSelectedUnit,
    setActionMode,
    setPlaceUnitId,
    setMoveOptions,
    setHoveredAbilityId,
    setHoverPreview,
    sendAction,
    requestMoveOptions,
    setReady,
    startGame,
    switchRole,
    playerId,
    isSpectator,
    pending,
    sendGameAction,
    requestMove,
    selectedUnit,
    hoverActionMode,
    allowActionHoverPreview,
    effectiveActionMode,
    modePreviewKind,
    pendingMoveForSelected,
    doraPreviewCenter,
    setDoraPreviewCenter,
    jebeHailPreviewCenter,
    setJebeHailPreviewCenter,
    kaladinFifthPreviewCenter,
    setKaladinFifthPreviewCenter,
    mettatonPoppinsPreviewCenter,
    setMettatonPoppinsPreviewCenter,
    mettatonLaserPreviewTarget,
    setMettatonLaserPreviewTarget,
    sansGasterBlasterPreviewTarget,
    setSansGasterBlasterPreviewTarget,
    undyneEnergySpearPreviewTarget,
    setUndyneEnergySpearPreviewTarget,
    forestPreviewCenter,
    setForestPreviewCenter,
    stakeSelections,
    setStakeSelections,
    hassanAssassinOrderSelections,
    setHassanAssassinOrderSelections,
    tisonaPreviewCoord,
    setTisonaPreviewCoord,
    papyrusLineAxis,
    setPapyrusLineAxis,
  };
}
