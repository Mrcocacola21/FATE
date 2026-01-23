import { useEffect, useMemo, useRef } from "react";
import type { Coord, GameAction, PlayerView } from "rules";
import { Board } from "./Board";
import { EventLog } from "./EventLog";
import { RightPanel } from "./RightPanel";
import { TurnQueueTracker } from "./TurnQueueTracker";
import { getLocalPlayerId, useGameStore } from "../store";

function getUnitAt(view: PlayerView, col: number, row: number) {
  return Object.values(view.units).find(
    (u) => u.position && u.position.col === col && u.position.row === row
  );
}

function coordKey(coord: Coord) {
  return `${coord.col},${coord.row}`;
}

function isCoordInList(coords: Coord[], col: number, row: number): boolean {
  return coords.some((c) => c.col === col && c.row === row);
}

export function Game() {
  const {
    roomId,
    role,
    connectionStatus,
    joined,
    hasSnapshot,
    roomState,
    events,
    clientLog,
    hoveredAbilityId,
    selectedUnitId,
    actionMode,
    placeUnitId,
    moveOptions,
    lastActionResult,
    lastActionResultAt,
    setSelectedUnit,
    setActionMode,
    setPlaceUnitId,
    setMoveOptions,
    setHoveredAbilityId,
    sendAction,
    requestMoveOptions,
    leaveRoom,
  } = useGameStore();

  const playerId = getLocalPlayerId(role);
  const view = roomState;
  const isSpectator = role === "spectator";
  const pendingRoll = view?.pendingRoll ?? null;
  const hasPendingRoll = !!pendingRoll;
  const defenderId =
    pendingRoll && pendingRoll.kind === "berserkerDefenseChoice"
      ? (pendingRoll.context as { defenderId?: string }).defenderId
      : undefined;
  const defenderCharges =
    defenderId && view?.units[defenderId]
      ? view.units[defenderId].charges?.berserkAutoDefense ?? 0
      : 0;

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
    if (!view.pendingMove || view.pendingMove.unitId !== moveOptions.unitId) {
      setMoveOptions(null);
    }
  }, [view, moveOptions, setMoveOptions]);

  useEffect(() => {
    if (!view || !playerId) return;
    if (!joined || !roomId) return;
    if (isSpectator) return;
    if (view.pendingRoll) return;

    if (view.phase !== "battle") {
      return;
    }

    if (view.activeUnitId) {
      const activeUnit = view.units[view.activeUnitId];
      if (activeUnit && activeUnit.owner === playerId) {
        if (selectedUnitId !== view.activeUnitId) {
          setSelectedUnit(view.activeUnitId);
        }
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
    sendAction({
      type: "unitStartTurn",
      unitId: expectedUnitId,
    });
    setSelectedUnit(expectedUnitId);
  }, [
    view,
    playerId,
    selectedUnitId,
    joined,
    roomId,
    isSpectator,
    sendAction,
    setSelectedUnit,
  ]);

  const sendGameAction = (action: GameAction) => {
    if (!joined || isSpectator || hasPendingRoll) return;
    sendAction(action);
  };

  const requestMove = (unitId: string) => {
    if (!joined || isSpectator || hasPendingRoll) return;
    requestMoveOptions(unitId);
  };

  const selectedUnit =
    view && selectedUnitId ? view.units[selectedUnitId] ?? null : null;

  const pendingMoveForSelected =
    view?.pendingMove && view.pendingMove.unitId === selectedUnitId
      ? view.pendingMove
      : null;

  const legalMoveCoords = useMemo(() => {
    if (!view || !selectedUnit) return [] as Coord[];
    const isSpecial =
      selectedUnit.class === "trickster" || selectedUnit.class === "berserker";

    if (isSpecial) {
      return (
        pendingMoveForSelected?.legalTo ||
        (moveOptions && moveOptions.unitId === selectedUnit.id
          ? moveOptions.legalTo
          : [])
      );
    }

    return view.legal?.movesByUnitId[selectedUnit.id] ?? [];
  }, [view, selectedUnit, pendingMoveForSelected, moveOptions]);

  const legalPlacementCoords = useMemo(() => {
    if (!view || !placeUnitId) return [] as Coord[];
    return view.legal?.placementsByUnitId[placeUnitId] ?? [];
  }, [view, placeUnitId]);

  const legalAttackTargets = useMemo(() => {
    if (!view || !selectedUnit) return [] as string[];
    return view.legal?.attackTargetsByUnitId[selectedUnit.id] ?? [];
  }, [view, selectedUnit]);

  const highlightedCells = useMemo(() => {
    const highlights: Record<string, "place" | "move" | "attack"> = {};

    if (actionMode === "place") {
      for (const coord of legalPlacementCoords) {
        highlights[coordKey(coord)] = "place";
      }
    }

    if (actionMode === "move") {
      for (const coord of legalMoveCoords) {
        highlights[coordKey(coord)] = "move";
      }
    }

    if (actionMode === "attack" && view) {
      for (const targetId of legalAttackTargets) {
        const unit = view.units[targetId];
        if (!unit?.position) continue;
        highlights[coordKey(unit.position)] = "attack";
      }
    }

    return highlights;
  }, [actionMode, legalPlacementCoords, legalMoveCoords, legalAttackTargets, view]);

  const handleCellClick = (col: number, row: number) => {
    if (!view || !playerId || !joined || isSpectator || hasPendingRoll) return;

    if (actionMode === "place" && placeUnitId) {
      if (!isCoordInList(legalPlacementCoords, col, row)) return;
      sendGameAction({
        type: "placeUnit",
        unitId: placeUnitId,
        position: { col, row },
      });
      setActionMode(null);
      setPlaceUnitId(null);
      return;
    }

    if (!selectedUnitId) return;

    if (actionMode === "move") {
      if (!isCoordInList(legalMoveCoords, col, row)) return;
      sendGameAction({
        type: "move",
        unitId: selectedUnitId,
        to: { col, row },
      });
      setActionMode(null);
      setMoveOptions(null);
      return;
    }

    if (actionMode === "attack") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!legalAttackTargets.includes(target.id)) return;
      sendGameAction({
        type: "attack",
        attackerId: selectedUnitId,
        defenderId: target.id,
      });
      setActionMode(null);
      return;
    }
  };

  if (!view || !hasSnapshot) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-sky-50 to-emerald-50 p-6">
        <div className="mx-auto max-w-xl rounded border border-slate-200 bg-white/80 p-6 shadow-sm">
          <h1 className="text-xl font-semibold">FATE</h1>
          <p className="mt-2 text-sm text-slate-500">Waiting for room state...</p>
          <div className="mt-4 text-xs text-slate-500">
            Connected: {connectionStatus === "connected" ? "yes" : "no"} | Status: {connectionStatus} | Joined: {joined ? "yes" : "no"} | Room: {roomId ?? "-"} | Role: {role ?? "-"}
          </div>
          <button
            className="mt-4 rounded bg-slate-200 px-3 py-2 text-xs"
            onClick={() => leaveRoom()}
          >
            Leave
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-sky-50 to-emerald-50 p-6">
      <div className="grid gap-6 lg:grid-cols-[auto_360px]">
        <div className="rounded border border-slate-200 bg-white/80 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div>Room: {roomId ?? "-"}</div>
            <div>Role: {role ?? "-"}</div>
            <div>Connected: {connectionStatus === "connected" ? "yes" : "no"}</div>
            <div>Status: {connectionStatus}</div>
            <div>Joined: {joined ? "yes" : "no"}</div>
            <button
              className="rounded bg-slate-200 px-2 py-1 text-[10px]"
              onClick={() => leaveRoom()}
            >
              Leave
            </button>
          </div>
          <Board
            view={view}
            playerId={playerId}
            selectedUnitId={selectedUnitId}
            highlightedCells={highlightedCells}
            hoveredAbilityId={hoveredAbilityId}
            disabled={!joined || isSpectator || hasPendingRoll}
            onSelectUnit={(id) => {
              setSelectedUnit(id);
              setActionMode(null);
            }}
            onCellClick={handleCellClick}
          />
          {hasPendingRoll && (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Pending roll: {pendingRoll.kind}. Resolve to continue.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <TurnQueueTracker view={view} playerId={playerId} />
          <RightPanel
            view={view}
            role={role}
            selectedUnitId={selectedUnitId}
            actionMode={actionMode}
            placeUnitId={placeUnitId}
            moveOptions={moveOptions}
            joined={joined}
            pendingRoll={hasPendingRoll}
            onHoverAbility={setHoveredAbilityId}
            onSelectUnit={(id) => {
              setSelectedUnit(id);
              setActionMode(null);
            }}
            onSetActionMode={setActionMode}
            onSetPlaceUnit={setPlaceUnitId}
            onMoveRequest={(unitId) => {
              requestMove(unitId);
              setActionMode("move");
            }}
            onSendAction={(action) => {
              sendGameAction(action);
              if (action.type !== "requestMoveOptions") {
                setActionMode(null);
              }
            }}
          />
          <EventLog events={events} clientLog={clientLog} />
        </div>
      </div>
      {pendingRoll && playerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="w-full max-w-sm rounded border border-slate-200 bg-white p-5 shadow-lg">
            <div className="text-sm font-semibold text-slate-800">Roll required</div>
            <div className="mt-2 text-xs text-slate-500">
              {pendingRoll.kind === "berserkerDefenseChoice"
                ? "Choose berserker defense."
                : "Please roll the dice to resolve the action."}
            </div>
            <div className="mt-4 flex gap-2">
              {pendingRoll.kind === "berserkerDefenseChoice" ? (
                <>
                  <button
                    className="flex-1 rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                    onClick={() =>
                      sendAction({
                        type: "resolvePendingRoll",
                        pendingRollId: pendingRoll.id,
                        choice: "roll",
                      } as GameAction)
                    }
                  >
                    Roll Defense
                  </button>
                  <button
                    className="flex-1 rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-white"
                    onClick={() =>
                      sendAction({
                        type: "resolvePendingRoll",
                        pendingRollId: pendingRoll.id,
                        choice: "auto",
                      } as GameAction)
                    }
                    disabled={defenderCharges !== 6}
                  >
                    Auto-dodge (-6)
                  </button>
                </>
              ) : (
                <button
                  className="w-full rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                  onClick={() =>
                    sendAction({
                      type: "resolvePendingRoll",
                      pendingRollId: pendingRoll.id,
                    } as GameAction)
                  }
                >
                  Roll
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
