import { useEffect, useMemo, useRef, useState } from "react";
import type { Coord, GameAction, PlayerView, MoveMode } from "rules";
import { Board } from "./Board";
import { EventLog } from "./EventLog";
import { RightPanel } from "./RightPanel";
import { TurnQueueTracker } from "./TurnQueueTracker";
import { getLocalPlayerId, useGameStore } from "../store";
import { KAISER_DORA_ID } from "../rulesHints";

const DORA_DIRS: Coord[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
  { col: 1, row: 1 },
  { col: 1, row: -1 },
  { col: -1, row: 1 },
  { col: -1, row: -1 },
];

function getUnitAt(view: PlayerView, col: number, row: number) {
  return Object.values(view.units).find(
    (u) => u.position && u.position.col === col && u.position.row === row
  );
}

function getDoraTargetCenters(view: PlayerView, casterId: string): Coord[] {
  const caster = view.units[casterId];
  if (!caster?.position) return [];
  const size = view.boardSize ?? 9;
  const origin = caster.position;
  const targets: Coord[] = [];

  for (const dir of DORA_DIRS) {
    let col = origin.col + dir.col;
    let row = origin.row + dir.row;
    while (col >= 0 && row >= 0 && col < size && row < size) {
      targets.push({ col, row });
      const unit = getUnitAt(view, col, row);
      if (unit && unit.owner !== caster.owner) {
        break;
      }
      col += dir.col;
      row += dir.row;
    }
  }

  return targets;
}

function coordKey(coord: Coord) {
  return `${coord.col},${coord.row}`;
}

function linePath(start: Coord, end: Coord): Coord[] | null {
  const dx = end.col - start.col;
  const dy = end.row - start.row;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (dx === 0 && dy === 0) {
    return [{ col: start.col, row: start.row }];
  }
  if (!(dx === 0 || dy === 0 || absDx === absDy)) {
    return null;
  }
  const steps = Math.max(absDx, absDy);
  const stepCol = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepRow = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  const path: Coord[] = [];
  for (let i = 0; i <= steps; i += 1) {
    path.push({
      col: start.col + stepCol * i,
      row: start.row + stepRow * i,
    });
  }
  return path;
}

function getPendingRollLabel(kind?: string | null) {
  switch (kind) {
    case "attack_attackerRoll":
      return "Attack roll (attacker)";
    case "attack_defenderRoll":
      return "Defense roll";
    case "riderPathAttack_attackerRoll":
      return "Rider path attack roll";
    case "riderPathAttack_defenderRoll":
      return "Rider path defense roll";
    case "tricksterAoE_attackerRoll":
      return "Trickster AoE attack roll";
    case "tricksterAoE_defenderRoll":
      return "Trickster AoE defense roll";
    case "dora_attackerRoll":
      return "Dora attack roll";
    case "dora_defenderRoll":
      return "Dora defense roll";
    case "dora_berserkerDefenseChoice":
      return "Dora berserker defense choice";
    case "kaiserCarpetStrikeCenter":
      return "Carpet Strike center roll";
    case "kaiserCarpetStrikeAttack":
      return "Carpet Strike attack roll";
    case "carpetStrike_defenderRoll":
      return "Carpet Strike defense roll";
    case "carpetStrike_berserkerDefenseChoice":
      return "Carpet Strike berserker defense choice";
    case "vladPlaceStakes":
      return "Place stakes";
    case "vladIntimidateChoice":
      return "Intimidate choice";
    case "vladForestChoice":
      return "Forest choice";
    case "vladForestTarget":
      return "Forest target selection";
    case "vladForest_attackerRoll":
      return "Forest attack roll";
    case "vladForest_defenderRoll":
      return "Forest defense roll";
    case "vladForest_berserkerDefenseChoice":
      return "Forest berserker defense choice";
    case "berserkerDefenseChoice":
      return "Berserker defense choice";
    case "enterStealth":
      return "Stealth roll";
    case "searchStealth":
      return "Search roll";
    case "moveTrickster":
      return "Trickster move roll";
    case "moveBerserker":
      return "Berserker move roll";
    case "initiativeRoll":
      return "Initiative roll";
    default:
      return kind ?? "Roll";
  }
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
    roomMeta,
    seat,
    isHost,
    events,
    clientLog,
    hoveredAbilityId,
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
    sendAction,
    requestMoveOptions,
    setReady,
    startGame,
    switchRole,
    leaveRoom,
  } = useGameStore();

  const [doraPreviewCenter, setDoraPreviewCenter] = useState<Coord | null>(null);
  const [forestPreviewCenter, setForestPreviewCenter] = useState<Coord | null>(null);
  const [stakeSelections, setStakeSelections] = useState<Coord[]>([]);

  const playerId = getLocalPlayerId(role);
  const view = roomState;
  const isSpectator = role === "spectator";
  const pendingRoll = view?.pendingRoll ?? null;
  const pendingMeta = roomMeta?.pendingRoll ?? null;
  const hasBlockingRoll = !!pendingMeta;
  const isStakePlacement = pendingRoll?.kind === "vladPlaceStakes";
  const isForestTarget = pendingRoll?.kind === "vladForestTarget";
  const isIntimidateChoice = pendingRoll?.kind === "vladIntimidateChoice";
  const isForestChoice = pendingRoll?.kind === "vladForestChoice";
  const boardSelectionPending =
    isStakePlacement || isForestTarget || isIntimidateChoice;
  const pendingQueueCount = view?.pendingCombatQueueCount ?? 0;
  const attackContext = pendingRoll?.context as
    | {
        attackerId?: string;
        defenderId?: string;
        attackerDice?: number[];
        tieBreakAttacker?: number[];
        stage?: "initial" | "tieBreak";
      }
    | undefined;
  const attackerDice = Array.isArray(attackContext?.attackerDice)
    ? attackContext?.attackerDice ?? []
    : [];
  const tieBreakAttacker = Array.isArray(attackContext?.tieBreakAttacker)
    ? attackContext?.tieBreakAttacker ?? []
    : [];
  const showAttackerRoll =
    pendingRoll?.kind === "attack_defenderRoll" ||
    pendingRoll?.kind === "riderPathAttack_defenderRoll" ||
    pendingRoll?.kind === "tricksterAoE_defenderRoll" ||
    pendingRoll?.kind === "dora_defenderRoll" ||
    pendingRoll?.kind === "carpetStrike_defenderRoll" ||
    pendingRoll?.kind === "vladForest_defenderRoll" ||
    pendingRoll?.kind === "berserkerDefenseChoice" ||
    pendingRoll?.kind === "dora_berserkerDefenseChoice" ||
    pendingRoll?.kind === "carpetStrike_berserkerDefenseChoice" ||
    pendingRoll?.kind === "vladForest_berserkerDefenseChoice";
  const defenderId = (() => {
    if (!pendingRoll) return undefined;
    if (pendingRoll.kind === "berserkerDefenseChoice") {
      return (pendingRoll.context as { defenderId?: string }).defenderId;
    }
    if (
      pendingRoll.kind === "dora_berserkerDefenseChoice" ||
      pendingRoll.kind === "carpetStrike_berserkerDefenseChoice" ||
      pendingRoll.kind === "vladForest_berserkerDefenseChoice"
    ) {
      const ctx = pendingRoll.context as {
        targetsQueue?: string[];
        currentTargetIndex?: number;
      };
      const targets = Array.isArray(ctx.targetsQueue) ? ctx.targetsQueue : [];
      const idx = typeof ctx.currentTargetIndex === "number" ? ctx.currentTargetIndex : 0;
      return targets[idx];
    }
    return undefined;
  })();
  const defenderCharges =
    defenderId && view?.units[defenderId]
      ? view.units[defenderId].charges?.berserkAutoDefense ?? 0
      : 0;

  const handleLeave = () => {
    if (leavingRoom) return;
    const label = roomId ?? "this room";
    const confirmed = window.confirm(`Leave room ${label}? You will disconnect.`);
    if (!confirmed) return;
    leaveRoom();
  };

  const readyStatus = roomMeta?.ready ?? { P1: false, P2: false };
  const playerReady = seat ? readyStatus[seat] : false;
  const canStartGame =
    !!roomMeta &&
    roomMeta.players.P1 &&
    roomMeta.players.P2 &&
    readyStatus.P1 &&
    readyStatus.P2 &&
    view?.phase === "lobby" &&
    !pendingMeta;

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
    if (pendingMeta) return;

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
    pendingMeta,
    sendAction,
    setSelectedUnit,
  ]);

  const sendGameAction = (action: GameAction) => {
    if (!joined || isSpectator || hasBlockingRoll) return;
    if (!view || view.phase === "lobby") return;
    sendAction(action);
  };

  const requestMove = (unitId: string, mode?: MoveMode) => {
    if (!joined || isSpectator || hasBlockingRoll) return;
    if (!view || view.phase === "lobby") return;
    requestMoveOptions(unitId, mode);
  };

  const selectedUnit =
    view && selectedUnitId ? view.units[selectedUnitId] ?? null : null;

  const pendingMoveForSelected =
    view?.pendingMove && view.pendingMove.unitId === selectedUnitId
      ? view.pendingMove
      : null;

  const stakeContext = isStakePlacement
    ? (pendingRoll?.context as {
        legalPositions?: Coord[];
        count?: number;
      })
    : null;
  const stakeLimit = stakeContext?.count ?? 3;
  const stakeLegalPositions = useMemo(() => {
    if (!isStakePlacement) return [] as Coord[];
    const legal = Array.isArray(stakeContext?.legalPositions)
      ? stakeContext?.legalPositions ?? []
      : [];
    return legal;
  }, [isStakePlacement, stakeContext]);
  const stakeLegalKeys = useMemo(
    () => new Set(stakeLegalPositions.map(coordKey)),
    [stakeLegalPositions]
  );
  const stakeSelectionKeys = useMemo(
    () => new Set(stakeSelections.map(coordKey)),
    [stakeSelections]
  );

  const intimidateOptions = useMemo(() => {
    if (!isIntimidateChoice) return [] as Coord[];
    const ctx = pendingRoll?.context as { options?: Coord[] } | undefined;
    return Array.isArray(ctx?.options) ? ctx?.options ?? [] : [];
  }, [isIntimidateChoice, pendingRoll]);
  const intimidateKeys = useMemo(
    () => new Set(intimidateOptions.map(coordKey)),
    [intimidateOptions]
  );

  const forestTargetCenters = useMemo(() => {
    if (!isForestTarget || !view) return [] as Coord[];
    const centers: Coord[] = [];
    for (let col = 0; col < (view.boardSize ?? 9); col += 1) {
      for (let row = 0; row < (view.boardSize ?? 9); row += 1) {
        centers.push({ col, row });
      }
    }
    return centers;
  }, [isForestTarget, view]);
  const forestTargetKeys = useMemo(
    () => new Set(forestTargetCenters.map(coordKey)),
    [forestTargetCenters]
  );

  const doraTargetCenters = useMemo(() => {
    if (!view || actionMode !== "dora" || !selectedUnit?.position) {
      return [] as Coord[];
    }
    return getDoraTargetCenters(view, selectedUnit.id);
  }, [view, actionMode, selectedUnit]);

  const doraTargetKeys = useMemo(
    () => new Set(doraTargetCenters.map(coordKey)),
    [doraTargetCenters]
  );

  useEffect(() => {
    if (actionMode !== "dora") {
      setDoraPreviewCenter(null);
      return;
    }
    if (!selectedUnitId) {
      setDoraPreviewCenter(null);
    }
  }, [actionMode, selectedUnitId]);

  useEffect(() => {
    if (actionMode !== "dora" || !doraPreviewCenter) return;
    if (!doraTargetKeys.has(coordKey(doraPreviewCenter))) {
      setDoraPreviewCenter(null);
    }
  }, [actionMode, doraPreviewCenter, doraTargetKeys]);

  useEffect(() => {
    if (!isStakePlacement) {
      setStakeSelections([]);
      return;
    }
    setStakeSelections([]);
  }, [isStakePlacement, pendingRoll?.id]);

  useEffect(() => {
    if (!isForestTarget) {
      setForestPreviewCenter(null);
      return;
    }
    setForestPreviewCenter(null);
  }, [isForestTarget, pendingRoll?.id]);

  useEffect(() => {
    if (!isForestTarget || !forestPreviewCenter) return;
    if (!forestTargetKeys.has(coordKey(forestPreviewCenter))) {
      setForestPreviewCenter(null);
    }
  }, [isForestTarget, forestPreviewCenter, forestTargetKeys]);

  const legalMoveCoords = useMemo(() => {
    if (!view || !selectedUnit) return [] as Coord[];
    const isSpecial =
      selectedUnit.class === "trickster" ||
      selectedUnit.class === "berserker" ||
      selectedUnit.transformed;

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
    const highlights: Record<string, "place" | "move" | "attack" | "dora"> = {};

    if (isStakePlacement) {
      for (const coord of stakeLegalPositions) {
        highlights[coordKey(coord)] = "place";
      }
      for (const coord of stakeSelections) {
        highlights[coordKey(coord)] = "move";
      }
      return highlights;
    }

    if (isIntimidateChoice) {
      for (const coord of intimidateOptions) {
        highlights[coordKey(coord)] = "move";
      }
      return highlights;
    }

    if (isForestTarget) {
      for (const coord of forestTargetCenters) {
        highlights[coordKey(coord)] = "dora";
      }
      return highlights;
    }

    if (actionMode === "place") {
      for (const coord of legalPlacementCoords) {
        highlights[coordKey(coord)] = "place";
      }
    }

    if (actionMode === "move") {
      const riderMode =
        !!selectedUnit &&
        (selectedUnit.class === "rider" ||
          pendingMoveForSelected?.mode === "rider" ||
          moveOptions?.mode === "rider");
      if (riderMode && selectedUnit?.position) {
        for (const coord of legalMoveCoords) {
          const path = linePath(selectedUnit.position, coord);
          const cells = path ? path.slice(1) : [coord];
          for (const cell of cells) {
            highlights[coordKey(cell)] = "move";
          }
        }
      } else {
        for (const coord of legalMoveCoords) {
          highlights[coordKey(coord)] = "move";
        }
      }
    }

    if (actionMode === "attack" && view) {
      for (const targetId of legalAttackTargets) {
        const unit = view.units[targetId];
        if (!unit?.position) continue;
        highlights[coordKey(unit.position)] = "attack";
      }
    }

    if (actionMode === "dora") {
      for (const coord of doraTargetCenters) {
        highlights[coordKey(coord)] = "dora";
      }
    }

    return highlights;
  }, [
    actionMode,
    legalPlacementCoords,
    legalMoveCoords,
    legalAttackTargets,
    doraTargetCenters,
    view,
    isStakePlacement,
    stakeLegalPositions,
    stakeSelections,
    isIntimidateChoice,
    intimidateOptions,
    isForestTarget,
    forestTargetCenters,
    selectedUnit,
    pendingMoveForSelected,
    moveOptions,
  ]);

  const handleCellClick = (col: number, row: number) => {
    if (
      !view ||
      !playerId ||
      !joined ||
      isSpectator ||
      (hasBlockingRoll && !boardSelectionPending)
    ) {
      return;
    }
    if (view.phase === "lobby") return;

    if (isStakePlacement) {
      const key = coordKey({ col, row });
      if (!stakeLegalKeys.has(key)) return;
      setStakeSelections((prev) => {
        const exists = prev.some((c) => coordKey(c) === key);
        if (exists) {
          return prev.filter((c) => coordKey(c) !== key);
        }
        if (prev.length >= stakeLimit) return prev;
        return [...prev, { col, row }];
      });
      return;
    }

    if (isIntimidateChoice) {
      const key = coordKey({ col, row });
      if (!intimidateKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "intimidatePush", to: { col, row } },
      } as GameAction);
      return;
    }

    if (isForestTarget) {
      const key = coordKey({ col, row });
      if (!forestTargetKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "forestTarget", center: { col, row } },
      } as GameAction);
      return;
    }

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

    if (actionMode === "dora") {
      if (!doraTargetKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: KAISER_DORA_ID,
        payload: { center: { col, row } },
      });
      setActionMode(null);
      return;
    }
  };

  const handleCellHover = (coord: Coord | null) => {
    if (actionMode === "dora") {
      if (!coord) {
        setDoraPreviewCenter(null);
        return;
      }
      const key = coordKey(coord);
      setDoraPreviewCenter(doraTargetKeys.has(key) ? coord : null);
      return;
    }

    if (isForestTarget) {
      if (!coord) {
        setForestPreviewCenter(null);
        return;
      }
      const key = coordKey(coord);
      setForestPreviewCenter(forestTargetKeys.has(key) ? coord : null);
    }
  };

  const boardPreviewCenter =
    actionMode === "dora"
      ? doraPreviewCenter
      : isForestTarget
      ? forestPreviewCenter
      : null;
  const boardDisabled =
    !joined ||
    isSpectator ||
    view?.phase === "lobby" ||
    (hasBlockingRoll && !boardSelectionPending);
  const allowUnitPick = !boardSelectionPending && actionMode !== "dora";

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
            onClick={handleLeave}
            disabled={leavingRoom}
          >
            {leavingRoom ? "Leaving..." : "Leave"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-sky-50 to-emerald-50 p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 rounded border border-slate-200 bg-white/80 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div>Room: {roomId ?? "-"}</div>
            <div>Role: {role ?? "-"}</div>
            <div>Connected: {connectionStatus === "connected" ? "yes" : "no"}</div>
            <div>Status: {connectionStatus}</div>
            <div>Joined: {joined ? "yes" : "no"}</div>
            <button
              className="rounded bg-slate-200 px-2 py-1 text-[10px]"
              onClick={handleLeave}
              disabled={leavingRoom}
            >
              {leavingRoom ? "Leaving..." : "Leave"}
            </button>
          </div>
          <Board
            view={view}
            playerId={playerId}
            selectedUnitId={selectedUnitId}
            highlightedCells={highlightedCells}
            hoveredAbilityId={hoveredAbilityId}
            doraPreview={
              boardPreviewCenter ? { center: boardPreviewCenter, radius: 1 } : null
            }
            allowUnitSelection={allowUnitPick}
            disabled={boardDisabled}
            onSelectUnit={(id) => {
              setSelectedUnit(id);
              setActionMode(null);
            }}
            onCellClick={handleCellClick}
            onCellHover={handleCellHover}
          />
          {pendingMeta && !pendingRoll && (
            <div className="mt-4 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
              Waiting for {pendingMeta.player} to roll.
            </div>
          )}
          {pendingRoll && (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {isStakePlacement ? (
                <div>
                  <div className="font-semibold">Place 3 stakes</div>
                  <div className="mt-1 text-[11px] text-amber-700">
                    Selected: {stakeSelections.length}/{stakeLimit}
                  </div>
                  {stakeSelections.length > 0 && (
                    <div className="mt-1 text-[10px] text-amber-700">
                      {stakeSelections.map((pos) => `(${pos.col},${pos.row})`).join(", ")}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded bg-emerald-600 px-3 py-1 text-[10px] font-semibold text-white"
                      onClick={() =>
                        pendingRoll &&
                        sendAction({
                          type: "resolvePendingRoll",
                          pendingRollId: pendingRoll.id,
                          choice: { type: "placeStakes", positions: stakeSelections },
                        } as GameAction)
                      }
                      disabled={stakeSelections.length !== stakeLimit}
                    >
                      Place stakes
                    </button>
                    <button
                      className="rounded bg-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-700"
                      onClick={() => setStakeSelections([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : isIntimidateChoice ? (
                <div>
                  <div className="font-semibold">Intimidate: choose a push cell</div>
                  <div className="mt-1 text-[11px] text-amber-700">
                    Click a highlighted cell or skip.
                  </div>
                  <button
                    className="mt-2 rounded bg-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-700"
                    onClick={() =>
                      pendingRoll &&
                      sendAction({
                        type: "resolvePendingRoll",
                        pendingRollId: pendingRoll.id,
                        choice: "skip",
                      } as GameAction)
                    }
                  >
                    Skip
                  </button>
                </div>
              ) : isForestTarget ? (
                <div>
                  <div className="font-semibold">Forest of the Dead</div>
                  <div className="mt-1 text-[11px] text-amber-700">
                    Select the 3x3 center cell.
                  </div>
                </div>
              ) : isForestChoice ? (
                <div>
                  <div className="font-semibold">Forest of the Dead ready</div>
                  <div className="mt-1 text-[11px] text-amber-700">
                    Decide whether to activate the phantasm.
                  </div>
                </div>
              ) : (
                <div>
                  Pending roll: {getPendingRollLabel(pendingRoll.kind)}. Resolve to continue.
                </div>
              )}
              {!isStakePlacement && pendingQueueCount > 0 && (
                <div className="mt-1 text-[11px] text-amber-700">
                  Pending attacks: {pendingQueueCount}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {view.phase === "lobby" && (
            <div className="rounded border border-slate-200 bg-white/80 p-4">
              <div className="text-sm text-slate-500">Room Lobby</div>
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                <div>Room: {roomId ?? "-"}</div>
                <div>
                  P1: {roomMeta?.players.P1 ? "occupied" : "open"}{" "}
                  {readyStatus.P1 ? "(ready)" : "(not ready)"}
                </div>
                <div>
                  P2: {roomMeta?.players.P2 ? "occupied" : "open"}{" "}
                  {readyStatus.P2 ? "(ready)" : "(not ready)"}
                </div>
                <div>Spectators: {roomMeta?.spectators ?? 0}</div>
                <div>
                  You: {role ?? "-"}
                  {seat ? ` (${seat})` : ""} {isHost ? "• host" : ""}
                </div>
              </div>
              {seat && (
                <button
                  className={`mt-3 w-full rounded px-3 py-2 text-xs font-semibold ${
                    playerReady
                      ? "bg-amber-500 text-white"
                      : "bg-teal-500 text-white"
                  }`}
                  onClick={() => setReady(!playerReady)}
                  disabled={!joined || !!pendingMeta}
                >
                  {playerReady ? "Unready" : "Ready"}
                </button>
              )}
              {seat && (
                <button
                  className="mt-2 w-full rounded bg-slate-200 px-3 py-2 text-xs font-semibold"
                  onClick={() => switchRole("spectator")}
                  disabled={!joined || !!pendingMeta}
                >
                  Switch to Spectator
                </button>
              )}
              {isHost && (
                <button
                  className={`mt-3 w-full rounded px-3 py-2 text-xs font-semibold ${
                    canStartGame
                      ? "bg-slate-900 text-white"
                      : "bg-slate-200 text-slate-400"
                  }`}
                  onClick={() => startGame()}
                  disabled={!canStartGame}
                >
                  Start Game
                </button>
              )}
            </div>
          )}
          <TurnQueueTracker view={view} playerId={playerId} />
          <RightPanel
            view={view}
            role={role}
            selectedUnitId={selectedUnitId}
            actionMode={actionMode}
            placeUnitId={placeUnitId}
            moveOptions={moveOptions}
            joined={joined}
            pendingRoll={hasBlockingRoll}
            onHoverAbility={setHoveredAbilityId}
            onSelectUnit={(id) => {
              setSelectedUnit(id);
              setActionMode(null);
            }}
            onSetActionMode={setActionMode}
            onSetPlaceUnit={setPlaceUnitId}
            onMoveRequest={(unitId, mode) => {
              requestMove(unitId, mode);
              if (mode) {
                setMoveOptions(null);
              }
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
      {pendingRoll && playerId && !boardSelectionPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="w-full max-w-sm rounded border border-slate-200 bg-white p-5 shadow-lg">
            <div className="text-sm font-semibold text-slate-800">
              {pendingRoll.kind === "initiativeRoll"
                ? "Roll initiative"
                : isForestChoice
                ? "Forest of the Dead"
                : "Roll required"}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {pendingRoll.kind === "berserkerDefenseChoice" ||
              pendingRoll.kind === "dora_berserkerDefenseChoice" ||
              pendingRoll.kind === "carpetStrike_berserkerDefenseChoice" ||
              pendingRoll.kind === "vladForest_berserkerDefenseChoice"
                ? "Choose berserker defense."
                : isForestChoice
                ? "Activate Forest of the Dead or skip."
                : `Please roll the dice to resolve: ${getPendingRollLabel(
                    pendingRoll.kind
                  )}.`}
            </div>
            {pendingRoll.kind === "initiativeRoll" && (
              <div className="mt-3 rounded bg-slate-50 p-2 text-[11px] text-slate-600">
                {pendingRoll.player === "P2" && view.initiative.P1 !== null && (
                  <div>P1 rolled: {view.initiative.P1}</div>
                )}
                {pendingRoll.player === "P1" && view.initiative.P2 !== null && (
                  <div>P2 rolled: {view.initiative.P2}</div>
                )}
                {pendingRoll.player === "P1" &&
                  view.initiative.P2 === null &&
                  view.initiative.P1 === null && <div>Awaiting your roll.</div>}
              </div>
            )}
            {showAttackerRoll && attackerDice.length > 0 && (
              <div className="mt-3 rounded bg-slate-50 p-2 text-[11px] text-slate-600">
                <div>Attacker roll: [{attackerDice.join(", ")}]</div>
                {tieBreakAttacker.length > 0 && (
                  <div className="mt-1">
                    Tie-break: [{tieBreakAttacker.join(", ")}]
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              {pendingRoll.kind === "berserkerDefenseChoice" ||
              pendingRoll.kind === "dora_berserkerDefenseChoice" ||
              pendingRoll.kind === "carpetStrike_berserkerDefenseChoice" ||
              pendingRoll.kind === "vladForest_berserkerDefenseChoice" ? (
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
              ) : isForestChoice ? (
                <>
                  <button
                    className="flex-1 rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                    onClick={() =>
                      sendAction({
                        type: "resolvePendingRoll",
                        pendingRollId: pendingRoll.id,
                        choice: "activate",
                      } as GameAction)
                    }
                  >
                    Activate
                  </button>
                  <button
                    className="flex-1 rounded bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                    onClick={() =>
                      sendAction({
                        type: "resolvePendingRoll",
                        pendingRollId: pendingRoll.id,
                        choice: "skip",
                      } as GameAction)
                    }
                  >
                    Skip
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
