import { useEffect, useMemo, useRef, useState } from "react";
import { type Coord, type GameAction, type PlayerView, type MoveMode, type UnitState } from "rules";
import { Board } from "./Board";
import { EventLog } from "./EventLog";
import { RightPanel } from "./RightPanel";
import { TurnQueueTracker } from "./TurnQueueTracker";
import { ThemeToggle } from "./ThemeToggle";
import { getLocalPlayerId, useGameStore } from "../store";
import {
  EL_CID_DEMON_DUELIST_ID,
  EL_CID_TISONA_ID,
  KAISER_DORA_ID,
  GROZNY_INVADE_TIME_ID,
  CHIKATILO_ASSASSIN_MARK_ID,
  CHIKATILO_DECOY_ID,
  HASSAN_TRUE_ENEMY_ID,
  KALADIN_FIFTH_ID,
  KALADIN_ID,
  LECHY_GUIDE_TRAVELER_ID,
  JEBE_HAIL_OF_ARROWS_ID,
  JEBE_KHANS_SHOOTER_ID,
  FEMTO_ID,
  GUTS_ID,
  GUTS_ARBALET_ID,
  GUTS_CANNON_ID,
} from "../rulesHints";

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

function getArcherLikeTargetIds(view: PlayerView, casterId: string): string[] {
  const caster = view.units[casterId];
  if (!caster?.position) return [];
  const size = view.boardSize ?? 9;
  const origin = caster.position;
  const targets: string[] = [];
  const seen = new Set<string>();

  for (const dir of DORA_DIRS) {
    let col = origin.col + dir.col;
    let row = origin.row + dir.row;
    while (col >= 0 && row >= 0 && col < size && row < size) {
      const unit = getUnitAt(view, col, row);
      if (unit && unit.owner !== caster.owner) {
        if (!seen.has(unit.id)) {
          seen.add(unit.id);
          targets.push(unit.id);
        }
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

const COLS = "abcdefghi";

function coordFromNotationSafe(value: string): Coord | null {
  if (value.length !== 2) return null;
  const colChar = value[0]?.toLowerCase() ?? "";
  const rowChar = value[1] ?? "";
  const col = COLS.indexOf(colChar);
  const row = Number.parseInt(rowChar, 10);
  if (col < 0 || Number.isNaN(row)) return null;
  return { col, row };
}

function normalizeCoordInput(value: unknown): Coord | null {
  if (value && typeof value === "object") {
    const colRaw = (value as { col?: unknown }).col;
    const rowRaw = (value as { row?: unknown }).row;
    const col =
      typeof colRaw === "number"
        ? colRaw
        : typeof colRaw === "string"
        ? Number(colRaw)
        : NaN;
    const row =
      typeof rowRaw === "number"
        ? rowRaw
        : typeof rowRaw === "string"
        ? Number(rowRaw)
        : NaN;
    if (Number.isFinite(col) && Number.isFinite(row)) {
      return { col, row };
    }
  }
  if (typeof value === "string") {
    return coordFromNotationSafe(value);
  }
  return null;
}

function normalizeCoordList(value: unknown): Coord[] {
  if (!Array.isArray(value)) return [];
  const coords: Coord[] = [];
  for (const item of value) {
    const parsed = normalizeCoordInput(item);
    if (parsed) coords.push(parsed);
  }
  return coords;
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

function getOrthogonalLineCells(
  size: number,
  origin: Coord,
  target: Coord
): Coord[] {
  const cells: Coord[] = [];
  if (origin.row === target.row) {
    for (let col = 0; col < size; col += 1) {
      if (col === origin.col) continue;
      cells.push({ col, row: origin.row });
    }
    return cells;
  }
  if (origin.col === target.col) {
    for (let row = 0; row < size; row += 1) {
      if (row === origin.row) continue;
      cells.push({ col: origin.col, row });
    }
  }
  return cells;
}

function getAttackRangeCells(view: PlayerView, unitId: string): Coord[] {
  const unit = view.units[unitId];
  if (!unit?.position) return [];
  const size = view.boardSize ?? 9;
  const origin = unit.position;
  const isKaladin = unit.heroId === KALADIN_ID;
  const effectiveClass =
    unit.heroId === FEMTO_ID ||
    (unit.heroId === GUTS_ID && unit.gutsBerserkModeActive)
      ? "spearman"
      : unit.class;
  const cells: Coord[] = [];

  const addCell = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= size || row >= size) return;
    if (col === origin.col && row === origin.row) return;
    cells.push({ col, row });
  };

  if (isKaladin) {
    for (let dc = -1; dc <= 1; dc += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        if (dc === 0 && dr === 0) continue;
        addCell(origin.col + dc, origin.row + dr);
      }
    }
    const reach2 = [
      { col: 2, row: 0 },
      { col: -2, row: 0 },
      { col: 0, row: 2 },
      { col: 0, row: -2 },
      { col: 2, row: 2 },
      { col: 2, row: -2 },
      { col: -2, row: 2 },
      { col: -2, row: -2 },
    ];
    for (const offset of reach2) {
      addCell(origin.col + offset.col, origin.row + offset.row);
    }
    for (let dc = -2; dc <= 2; dc += 1) {
      for (let dr = -2; dr <= 2; dr += 1) {
        if (dc === 0 && dr === 0) continue;
        if (Math.max(Math.abs(dc), Math.abs(dr)) <= 2) {
          addCell(origin.col + dc, origin.row + dr);
        }
      }
    }
    return cells;
  }

  switch (effectiveClass) {
    case "archer": {
      for (const dir of DORA_DIRS) {
        let col = origin.col + dir.col;
        let row = origin.row + dir.row;
        while (col >= 0 && row >= 0 && col < size && row < size) {
          cells.push({ col, row });
          const occupant = getUnitAt(view, col, row);
          if (occupant && occupant.owner !== unit.owner) {
            break;
          }
          col += dir.col;
          row += dir.row;
        }
      }
      break;
    }

    case "spearman": {
      for (let dc = -1; dc <= 1; dc += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          if (dc === 0 && dr === 0) continue;
          addCell(origin.col + dc, origin.row + dr);
        }
      }
      const reach2 = [
        { col: 2, row: 0 },
        { col: -2, row: 0 },
        { col: 0, row: 2 },
        { col: 0, row: -2 },
        { col: 2, row: 2 },
        { col: 2, row: -2 },
        { col: -2, row: 2 },
        { col: -2, row: -2 },
      ];
      for (const offset of reach2) {
        addCell(origin.col + offset.col, origin.row + offset.row);
      }
      break;
    }

    case "trickster": {
      for (let dc = -2; dc <= 2; dc += 1) {
        for (let dr = -2; dr <= 2; dr += 1) {
          if (dc === 0 && dr === 0) continue;
          if (Math.max(Math.abs(dc), Math.abs(dr)) <= 2) {
            addCell(origin.col + dc, origin.row + dr);
          }
        }
      }
      break;
    }

    case "rider":
    case "knight":
    case "assassin":
    case "berserker": {
      for (let dc = -1; dc <= 1; dc += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          if (dc === 0 && dr === 0) continue;
          addCell(origin.col + dc, origin.row + dr);
        }
      }
      break;
    }

    default:
      break;
  }

  return cells;
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
    case "elCidTisona_attackerRoll":
      return "Tisona attack roll";
    case "elCidTisona_defenderRoll":
      return "Tisona defense roll";
    case "elCidKolada_attackerRoll":
      return "Kolada attack roll";
    case "elCidKolada_defenderRoll":
      return "Kolada defense roll";
    case "elCidDuelistChoice":
      return "Demon Duelist choice";
    case "dora_attackerRoll":
      return "Dora attack roll";
    case "dora_defenderRoll":
      return "Dora defense roll";
    case "dora_berserkerDefenseChoice":
      return "Dora berserker defense choice";
    case "jebeHailOfArrows_attackerRoll":
      return "Hail of Arrows attack roll";
    case "jebeHailOfArrows_defenderRoll":
      return "Hail of Arrows defense roll";
    case "jebeHailOfArrows_berserkerDefenseChoice":
      return "Hail of Arrows berserker defense choice";
    case "jebeKhansShooterRicochetRoll":
      return "Khan's Shooter ricochet roll";
    case "jebeKhansShooterTargetChoice":
      return "Khan's Shooter target choice";
    case "hassanTrueEnemyTargetChoice":
      return "True Enemy forced target choice";
    case "hassanAssassinOrderSelection":
      return "Assassin Order selection";
    case "femtoDivineMoveRoll":
      return "Divine Movement roll";
    case "femtoDivineMoveDestination":
      return "Divine Movement destination";
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
    case "chikatiloFalseTrailPlacement":
      return "False Trail placement";
    case "lechyGuideTravelerPlacement":
      return "Guide Traveler placement";
    case "chikatiloDecoyChoice":
      return "Decoy choice";
    case "chikatiloFalseTrailRevealChoice":
      return "False Trail choice";
    case "falseTrailExplosion_attackerRoll":
      return "False Trail explosion attack roll";
    case "falseTrailExplosion_defenderRoll":
      return "False Trail explosion defense roll";
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
    case "forestMoveCheck":
      return "Forest check";
    case "forestMoveDestination":
      return "Forest fallback destination";
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
  const [forestPreviewCenter, setForestPreviewCenter] = useState<Coord | null>(null);
  const [stakeSelections, setStakeSelections] = useState<Coord[]>([]);
  const [hassanAssassinOrderSelections, setHassanAssassinOrderSelections] =
    useState<string[]>([]);
  const [tisonaPreviewCoord, setTisonaPreviewCoord] = useState<Coord | null>(null);

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
  const isForestMoveCheck = pendingRoll?.kind === "forestMoveCheck";
  const isForestMoveDestination = pendingRoll?.kind === "forestMoveDestination";
  const isDuelistChoice = pendingRoll?.kind === "elCidDuelistChoice";
  const isChikatiloPlacement =
    pendingRoll?.kind === "chikatiloFalseTrailPlacement";
  const isGuideTravelerPlacement =
    pendingRoll?.kind === "lechyGuideTravelerPlacement";
  const isJebeKhansShooterTargetChoice =
    pendingRoll?.kind === "jebeKhansShooterTargetChoice";
  const isHassanTrueEnemyTargetChoice =
    pendingRoll?.kind === "hassanTrueEnemyTargetChoice";
  const isHassanAssassinOrderSelection =
    pendingRoll?.kind === "hassanAssassinOrderSelection";
  const isFemtoDivineMoveDestination =
    pendingRoll?.kind === "femtoDivineMoveDestination";
  const isChikatiloRevealChoice =
    pendingRoll?.kind === "chikatiloFalseTrailRevealChoice";
  const isChikatiloDecoyChoice = pendingRoll?.kind === "chikatiloDecoyChoice";
  const boardSelectionPending =
    isStakePlacement ||
    isForestTarget ||
    isForestMoveDestination ||
    isIntimidateChoice ||
    isChikatiloPlacement ||
    isGuideTravelerPlacement ||
    isJebeKhansShooterTargetChoice ||
    isHassanTrueEnemyTargetChoice ||
    isHassanAssassinOrderSelection ||
    isFemtoDivineMoveDestination;
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
    pendingRoll?.kind === "falseTrailExplosion_defenderRoll" ||
    pendingRoll?.kind === "elCidTisona_defenderRoll" ||
    pendingRoll?.kind === "elCidKolada_defenderRoll" ||
    pendingRoll?.kind === "dora_defenderRoll" ||
    pendingRoll?.kind === "jebeHailOfArrows_defenderRoll" ||
    pendingRoll?.kind === "carpetStrike_defenderRoll" ||
    pendingRoll?.kind === "vladForest_defenderRoll" ||
    pendingRoll?.kind === "berserkerDefenseChoice" ||
    pendingRoll?.kind === "dora_berserkerDefenseChoice" ||
    pendingRoll?.kind === "jebeHailOfArrows_berserkerDefenseChoice" ||
    pendingRoll?.kind === "carpetStrike_berserkerDefenseChoice" ||
    pendingRoll?.kind === "vladForest_berserkerDefenseChoice" ||
    pendingRoll?.kind === "chikatiloDecoyChoice";
  const defenderId = (() => {
    if (!pendingRoll) return undefined;
    if (pendingRoll.kind === "berserkerDefenseChoice") {
      return (pendingRoll.context as { defenderId?: string }).defenderId;
    }
    if (
      pendingRoll.kind === "dora_berserkerDefenseChoice" ||
      pendingRoll.kind === "jebeHailOfArrows_berserkerDefenseChoice" ||
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
  const decoyDefenderId = isChikatiloDecoyChoice
    ? (pendingRoll?.context as { defenderId?: string } | undefined)?.defenderId
    : undefined;
  const decoyCharges =
    decoyDefenderId && view?.units[decoyDefenderId]
      ? view.units[decoyDefenderId].charges?.[CHIKATILO_DECOY_ID] ?? 0
      : 0;
  const duelistContext = isDuelistChoice
    ? (pendingRoll?.context as { attackerId?: string; targetId?: string } | undefined)
    : undefined;
  const duelistAttackerId = duelistContext?.attackerId;
  const duelistAttackerHp =
    duelistAttackerId && view?.units[duelistAttackerId]
      ? view.units[duelistAttackerId].hp
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

  const forestMoveDestinationOptions = useMemo(() => {
    if (!isForestMoveDestination) return [] as Coord[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    return normalizeCoordList(ctx?.options);
  }, [isForestMoveDestination, pendingRoll]);
  const forestMoveDestinationKeys = useMemo(
    () => new Set(forestMoveDestinationOptions.map(coordKey)),
    [forestMoveDestinationOptions]
  );

  const femtoDivineMoveOptions = useMemo(() => {
    if (!isFemtoDivineMoveDestination) return [] as Coord[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    return normalizeCoordList(ctx?.options);
  }, [isFemtoDivineMoveDestination, pendingRoll]);
  const femtoDivineMoveKeys = useMemo(
    () => new Set(femtoDivineMoveOptions.map(coordKey)),
    [femtoDivineMoveOptions]
  );

  const chikatiloPlacementCoords = useMemo(() => {
    if (!isChikatiloPlacement) return [] as Coord[];
    const ctx = pendingRoll?.context as
      | {
          legalPositions?: unknown;
          legalCells?: unknown;
          legalTargets?: unknown;
        }
      | undefined;
    const fromPositions = normalizeCoordList(ctx?.legalPositions);
    if (fromPositions.length > 0) return fromPositions;
    const fromCells = normalizeCoordList(ctx?.legalCells);
    if (fromCells.length > 0) return fromCells;
    const fromTargets = normalizeCoordList(ctx?.legalTargets);
    if (fromTargets.length > 0) return fromTargets;
    return [] as Coord[];
  }, [isChikatiloPlacement, pendingRoll]);
  const chikatiloPlacementKeys = useMemo(
    () => new Set(chikatiloPlacementCoords.map(coordKey)),
    [chikatiloPlacementCoords]
  );

  const guideTravelerPlacementCoords = useMemo(() => {
    if (!isGuideTravelerPlacement) return [] as Coord[];
    const ctx = pendingRoll?.context as
      | {
          legalPositions?: unknown;
          legalCells?: unknown;
          legalTargets?: unknown;
        }
      | undefined;
    const fromPositions = normalizeCoordList(ctx?.legalPositions);
    if (fromPositions.length > 0) return fromPositions;
    const fromCells = normalizeCoordList(ctx?.legalCells);
    if (fromCells.length > 0) return fromCells;
    const fromTargets = normalizeCoordList(ctx?.legalTargets);
    if (fromTargets.length > 0) return fromTargets;
    return [] as Coord[];
  }, [isGuideTravelerPlacement, pendingRoll]);
  const guideTravelerPlacementKeys = useMemo(
    () => new Set(guideTravelerPlacementCoords.map(coordKey)),
    [guideTravelerPlacementCoords]
  );
  const jebeKhansShooterTargetIds = useMemo(() => {
    if (!isJebeKhansShooterTargetChoice) return [] as string[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as string[];
    return ctx.options.filter((value): value is string => typeof value === "string");
  }, [isJebeKhansShooterTargetChoice, pendingRoll]);
  const jebeKhansShooterTargetKeys = useMemo(
    () =>
      new Set(
        jebeKhansShooterTargetIds
          .map((targetId) => view?.units[targetId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [jebeKhansShooterTargetIds, view]
  );
  const hassanTrueEnemyTargetIds = useMemo(() => {
    if (!isHassanTrueEnemyTargetChoice) return [] as string[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as string[];
    return ctx.options.filter((value): value is string => typeof value === "string");
  }, [isHassanTrueEnemyTargetChoice, pendingRoll]);
  const hassanTrueEnemyTargetKeys = useMemo(
    () =>
      new Set(
        hassanTrueEnemyTargetIds
          .map((targetId) => view?.units[targetId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [hassanTrueEnemyTargetIds, view]
  );
  const hassanAssassinOrderEligibleIds = useMemo(() => {
    if (!isHassanAssassinOrderSelection) return [] as string[];
    const ctx = pendingRoll?.context as { eligibleUnitIds?: unknown } | undefined;
    if (!Array.isArray(ctx?.eligibleUnitIds)) return [] as string[];
    return ctx.eligibleUnitIds.filter(
      (value): value is string => typeof value === "string"
    );
  }, [isHassanAssassinOrderSelection, pendingRoll]);
  const hassanAssassinOrderEligibleKeys = useMemo(
    () =>
      new Set(
        hassanAssassinOrderEligibleIds
          .map((unitId) => view?.units[unitId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [hassanAssassinOrderEligibleIds, view]
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

  const jebeHailTargetCenters = useMemo(() => {
    if (!view || actionMode !== "jebeHailOfArrows" || !selectedUnit?.position) {
      return [] as Coord[];
    }
    return getDoraTargetCenters(view, selectedUnit.id);
  }, [view, actionMode, selectedUnit]);

  const jebeHailTargetKeys = useMemo(
    () => new Set(jebeHailTargetCenters.map(coordKey)),
    [jebeHailTargetCenters]
  );

  const kaladinFifthTargetCenters = useMemo(() => {
    if (!view || actionMode !== "kaladinFifth") {
      return [] as Coord[];
    }
    const size = view.boardSize ?? 9;
    const cells: Coord[] = [];
    for (let col = 0; col < size; col += 1) {
      for (let row = 0; row < size; row += 1) {
        cells.push({ col, row });
      }
    }
    return cells;
  }, [view, actionMode]);

  const kaladinFifthTargetKeys = useMemo(
    () => new Set(kaladinFifthTargetCenters.map(coordKey)),
    [kaladinFifthTargetCenters]
  );

  const tisonaTargetCells = useMemo(() => {
    if (!view || actionMode !== "tisona" || !selectedUnit?.position) {
      return [] as Coord[];
    }
    const size = view.boardSize ?? 9;
    const origin = selectedUnit.position;
    const cells: Coord[] = [];
    for (let col = 0; col < size; col += 1) {
      if (col === origin.col) continue;
      cells.push({ col, row: origin.row });
    }
    for (let row = 0; row < size; row += 1) {
      if (row === origin.row) continue;
      cells.push({ col: origin.col, row });
    }
    return cells;
  }, [view, actionMode, selectedUnit]);

  const tisonaTargetKeys = useMemo(
    () => new Set(tisonaTargetCells.map(coordKey)),
    [tisonaTargetCells]
  );

  const invadeTimeTargets = useMemo(() => {
    if (!view || actionMode !== "invadeTime" || !selectedUnit?.position) {
      return [] as Coord[];
    }
    const size = view.boardSize ?? 9;
    const origin = selectedUnit.position;
    const cells: Coord[] = [];
    for (let col = 0; col < size; col += 1) {
      for (let row = 0; row < size; row += 1) {
        if (col === origin.col && row === origin.row) continue;
        if (getUnitAt(view, col, row)) continue;
        cells.push({ col, row });
      }
    }
    return cells;
  }, [view, actionMode, selectedUnit]);

  const invadeTimeKeys = useMemo(
    () => new Set(invadeTimeTargets.map(coordKey)),
    [invadeTimeTargets]
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
    if (actionMode !== "jebeHailOfArrows") {
      setJebeHailPreviewCenter(null);
      return;
    }
    if (!selectedUnitId) {
      setJebeHailPreviewCenter(null);
    }
  }, [actionMode, selectedUnitId]);

  useEffect(() => {
    if (actionMode !== "jebeHailOfArrows" || !jebeHailPreviewCenter) return;
    if (!jebeHailTargetKeys.has(coordKey(jebeHailPreviewCenter))) {
      setJebeHailPreviewCenter(null);
    }
  }, [actionMode, jebeHailPreviewCenter, jebeHailTargetKeys]);

  useEffect(() => {
    if (actionMode !== "kaladinFifth") {
      setKaladinFifthPreviewCenter(null);
      return;
    }
    if (!selectedUnitId) {
      setKaladinFifthPreviewCenter(null);
    }
  }, [actionMode, selectedUnitId]);

  useEffect(() => {
    if (actionMode !== "kaladinFifth" || !kaladinFifthPreviewCenter) return;
    if (!kaladinFifthTargetKeys.has(coordKey(kaladinFifthPreviewCenter))) {
      setKaladinFifthPreviewCenter(null);
    }
  }, [actionMode, kaladinFifthPreviewCenter, kaladinFifthTargetKeys]);

  useEffect(() => {
    if (actionMode !== "tisona") {
      setTisonaPreviewCoord(null);
      return;
    }
    if (!selectedUnitId) {
      setTisonaPreviewCoord(null);
    }
  }, [actionMode, selectedUnitId]);

  useEffect(() => {
    if (actionMode !== "tisona" || !tisonaPreviewCoord) return;
    if (!tisonaTargetKeys.has(coordKey(tisonaPreviewCoord))) {
      setTisonaPreviewCoord(null);
    }
  }, [actionMode, tisonaPreviewCoord, tisonaTargetKeys]);

  useEffect(() => {
    if (!isStakePlacement) {
      setStakeSelections([]);
      return;
    }
    setStakeSelections([]);
  }, [isStakePlacement, pendingRoll?.id]);

  useEffect(() => {
    if (!isHassanAssassinOrderSelection) {
      setHassanAssassinOrderSelections([]);
      return;
    }
    setHassanAssassinOrderSelections([]);
  }, [isHassanAssassinOrderSelection, pendingRoll?.id]);

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
      selectedUnit.heroId === KALADIN_ID ||
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

  const assassinMarkTargets = useMemo(() => {
    if (!view || actionMode !== "assassinMark" || !selectedUnit?.position) {
      return [] as UnitState[];
    }
    const origin = selectedUnit.position;
    return Object.values(view.units).filter((unit) => {
      if (!unit?.isAlive || !unit.position) return false;
      if (unit.id === selectedUnit.id) return false;
      const dx = Math.abs(unit.position.col - origin.col);
      const dy = Math.abs(unit.position.row - origin.row);
      return Math.max(dx, dy) <= 2;
    });
  }, [view, actionMode, selectedUnit]);
  const assassinMarkTargetIds = useMemo(
    () => assassinMarkTargets.map((unit) => unit.id),
    [assassinMarkTargets]
  );
  const assassinMarkTargetKeys = useMemo(
    () =>
      new Set(
        assassinMarkTargets
          .map((unit) => unit.position)
          .filter((pos): pos is Coord => !!pos)
          .map(coordKey)
      ),
    [assassinMarkTargets]
  );

  const guideTravelerTargets = useMemo(() => {
    if (!view || actionMode !== "guideTraveler" || !selectedUnit?.position) {
      return [] as UnitState[];
    }
    const origin = selectedUnit.position;
    return Object.values(view.units).filter((unit) => {
      if (!unit?.isAlive || !unit.position) return false;
      if (unit.id === selectedUnit.id) return false;
      if (unit.owner !== selectedUnit.owner) return false;
      const dx = Math.abs(unit.position.col - origin.col);
      const dy = Math.abs(unit.position.row - origin.row);
      return Math.max(dx, dy) <= 2;
    });
  }, [view, actionMode, selectedUnit]);
  const guideTravelerTargetIds = useMemo(
    () => guideTravelerTargets.map((unit) => unit.id),
    [guideTravelerTargets]
  );
  const guideTravelerTargetKeys = useMemo(
    () =>
      new Set(
        guideTravelerTargets
          .map((unit) => unit.position)
          .filter((pos): pos is Coord => !!pos)
          .map(coordKey)
      ),
    [guideTravelerTargets]
  );
  const hassanTrueEnemyCandidateIds = useMemo(() => {
    if (!view || actionMode !== "hassanTrueEnemy" || !selectedUnit?.position) {
      return [] as string[];
    }
    const origin = selectedUnit.position;
    return Object.values(view.units)
      .filter((unit) => {
        if (!unit?.isAlive || !unit.position) return false;
        if (unit.owner === selectedUnit.owner) return false;
        const dx = Math.abs(unit.position.col - origin.col);
        const dy = Math.abs(unit.position.row - origin.row);
        return Math.max(dx, dy) <= 2;
      })
      .map((unit) => unit.id);
  }, [view, actionMode, selectedUnit]);
  const hassanTrueEnemyCandidateKeys = useMemo(
    () =>
      new Set(
        hassanTrueEnemyCandidateIds
          .map((unitId) => view?.units[unitId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [hassanTrueEnemyCandidateIds, view]
  );
  const gutsRangedTargetIds = useMemo(() => {
    if (
      !view ||
      !selectedUnit ||
      (actionMode !== "gutsArbalet" && actionMode !== "gutsCannon")
    ) {
      return [] as string[];
    }
    return getArcherLikeTargetIds(view, selectedUnit.id);
  }, [view, selectedUnit, actionMode]);
  const gutsRangedTargetKeys = useMemo(
    () =>
      new Set(
        gutsRangedTargetIds
          .map((unitId) => view?.units[unitId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [gutsRangedTargetIds, view]
  );

  const hoverAttackPreview = useMemo(() => {
    if (!view || hoverPreview?.type !== "attackRange") {
      return null;
    }
    const unit = view.units[hoverPreview.unitId];
    if (!unit?.position) return null;
    const rangeCells = getAttackRangeCells(view, unit.id);
    const targetIds = view.legal?.attackTargetsByUnitId[unit.id] ?? [];
    return { rangeCells, targetIds };
  }, [view, hoverPreview]);

  const highlightedCells = useMemo(() => {
    const highlights: Record<
      string,
      "place" | "move" | "attack" | "dora" | "attackRange"
    > = {};

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

    if (isForestMoveDestination) {
      for (const coord of forestMoveDestinationOptions) {
        highlights[coordKey(coord)] = "move";
      }
      return highlights;
    }

    if (isFemtoDivineMoveDestination) {
      for (const coord of femtoDivineMoveOptions) {
        highlights[coordKey(coord)] = "move";
      }
      return highlights;
    }

    if (isChikatiloPlacement) {
      for (const coord of chikatiloPlacementCoords) {
        highlights[coordKey(coord)] = "place";
      }
      return highlights;
    }

    if (isGuideTravelerPlacement) {
      for (const coord of guideTravelerPlacementCoords) {
        highlights[coordKey(coord)] = "place";
      }
      return highlights;
    }

    if (isJebeKhansShooterTargetChoice) {
      for (const key of jebeKhansShooterTargetKeys) {
        highlights[key] = "attack";
      }
      return highlights;
    }

    if (isHassanTrueEnemyTargetChoice) {
      for (const key of hassanTrueEnemyTargetKeys) {
        highlights[key] = "attack";
      }
      return highlights;
    }

    if (isHassanAssassinOrderSelection) {
      for (const key of hassanAssassinOrderEligibleKeys) {
        highlights[key] = "place";
      }
      for (const unitId of hassanAssassinOrderSelections) {
        const pos = view?.units[unitId]?.position;
        if (!pos) continue;
        highlights[coordKey(pos)] = "move";
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

    if (actionMode === "invadeTime") {
      for (const coord of invadeTimeTargets) {
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

    if (actionMode === "assassinMark") {
      for (const key of assassinMarkTargetKeys) {
        highlights[key] = "attack";
      }
    }

    if (actionMode === "guideTraveler") {
      for (const key of guideTravelerTargetKeys) {
        highlights[key] = "attack";
      }
    }

    if (actionMode === "demonDuelist" && view) {
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

    if (actionMode === "jebeHailOfArrows") {
      for (const coord of jebeHailTargetCenters) {
        highlights[coordKey(coord)] = "dora";
      }
    }

    if (actionMode === "kaladinFifth") {
      for (const coord of kaladinFifthTargetCenters) {
        highlights[coordKey(coord)] = "dora";
      }
    }

    if (actionMode === "jebeKhansShooter" && view) {
      for (const targetId of legalAttackTargets) {
        const unit = view.units[targetId];
        if (!unit?.position) continue;
        highlights[coordKey(unit.position)] = "attack";
      }
    }

    if (actionMode === "gutsArbalet" || actionMode === "gutsCannon") {
      for (const key of gutsRangedTargetKeys) {
        highlights[key] = "attack";
      }
    }

    if (actionMode === "hassanTrueEnemy") {
      for (const key of hassanTrueEnemyCandidateKeys) {
        highlights[key] = "attack";
      }
    }

    if (actionMode === "tisona" && view && selectedUnit?.position) {
      const size = view.boardSize ?? 9;
      if (tisonaPreviewCoord) {
        const lineCells = getOrthogonalLineCells(
          size,
          selectedUnit.position,
          tisonaPreviewCoord
        );
        for (const coord of lineCells) {
          highlights[coordKey(coord)] = "attackRange";
        }
      }
      for (const coord of tisonaTargetCells) {
        highlights[coordKey(coord)] = "attack";
      }
    }

    const allowHoverPreview =
      !actionMode &&
      !isStakePlacement &&
      !isIntimidateChoice &&
      !isForestTarget &&
      !isForestMoveDestination &&
      !isJebeKhansShooterTargetChoice &&
      !isHassanTrueEnemyTargetChoice &&
      !isHassanAssassinOrderSelection;

    if (allowHoverPreview && hoverAttackPreview && view) {
      for (const coord of hoverAttackPreview.rangeCells) {
        highlights[coordKey(coord)] = "attackRange";
      }
      for (const targetId of hoverAttackPreview.targetIds) {
        const unit = view.units[targetId];
        if (!unit?.position) continue;
        highlights[coordKey(unit.position)] = "attack";
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
    isForestMoveDestination,
    forestMoveDestinationOptions,
    isFemtoDivineMoveDestination,
    femtoDivineMoveOptions,
    isChikatiloPlacement,
    chikatiloPlacementCoords,
    isGuideTravelerPlacement,
    guideTravelerPlacementCoords,
    isJebeKhansShooterTargetChoice,
    jebeKhansShooterTargetKeys,
    isHassanTrueEnemyTargetChoice,
    hassanTrueEnemyTargetKeys,
    isHassanAssassinOrderSelection,
    hassanAssassinOrderEligibleKeys,
    hassanAssassinOrderSelections,
    hassanTrueEnemyCandidateKeys,
    selectedUnit,
    pendingMoveForSelected,
    moveOptions,
    hoverAttackPreview,
    jebeHailTargetCenters,
    kaladinFifthTargetCenters,
    tisonaTargetCells,
    tisonaPreviewCoord,
    assassinMarkTargetKeys,
    guideTravelerTargetKeys,
    invadeTimeTargets,
    gutsRangedTargetKeys,
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

    if (isForestMoveDestination) {
      const key = coordKey({ col, row });
      if (!forestMoveDestinationKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "forestMoveDestination", position: { col, row } },
      } as GameAction);
      return;
    }

    if (isFemtoDivineMoveDestination) {
      const key = coordKey({ col, row });
      if (!femtoDivineMoveKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "femtoDivineMoveDestination", position: { col, row } },
      } as GameAction);
      return;
    }

    if (isChikatiloPlacement) {
      const key = coordKey({ col, row });
      if (!chikatiloPlacementKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "chikatiloPlace", position: { col, row } },
      } as GameAction);
      return;
    }

    if (isGuideTravelerPlacement) {
      const key = coordKey({ col, row });
      if (!guideTravelerPlacementKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "lechyGuideTravelerPlace", position: { col, row } },
      } as GameAction);
      return;
    }

    if (isJebeKhansShooterTargetChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!jebeKhansShooterTargetIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "jebeKhansShooterTarget", targetId: target.id },
      } as GameAction);
      return;
    }

    if (isHassanTrueEnemyTargetChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!hassanTrueEnemyTargetIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "hassanTrueEnemyTarget", targetId: target.id },
      } as GameAction);
      return;
    }

    if (isHassanAssassinOrderSelection) {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!hassanAssassinOrderEligibleIds.includes(target.id)) return;
      setHassanAssassinOrderSelections((prev) => {
        const exists = prev.includes(target.id);
        if (exists) {
          return prev.filter((id) => id !== target.id);
        }
        if (prev.length >= 2) return prev;
        return [...prev, target.id];
      });
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

    if (actionMode === "invadeTime") {
      if (!invadeTimeKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: GROZNY_INVADE_TIME_ID,
        payload: { to: { col, row } },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "jebeKhansShooter") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!legalAttackTargets.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: JEBE_KHANS_SHOOTER_ID,
        payload: { targetId: target.id },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "gutsArbalet") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!gutsRangedTargetIds.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: GUTS_ARBALET_ID,
        payload: { targetId: target.id },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "gutsCannon") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!gutsRangedTargetIds.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: GUTS_CANNON_ID,
        payload: { targetId: target.id },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "hassanTrueEnemy") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!hassanTrueEnemyCandidateIds.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: HASSAN_TRUE_ENEMY_ID,
        payload: { forcedAttackerId: target.id },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "guideTraveler") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!guideTravelerTargetIds.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: LECHY_GUIDE_TRAVELER_ID,
        payload: { targetId: target.id },
      });
      setActionMode("move");
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

    if (actionMode === "assassinMark") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!assassinMarkTargetIds.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: CHIKATILO_ASSASSIN_MARK_ID,
        payload: { targetId: target.id },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "demonDuelist") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!legalAttackTargets.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: EL_CID_DEMON_DUELIST_ID,
        payload: { targetId: target.id },
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

    if (actionMode === "jebeHailOfArrows") {
      if (!jebeHailTargetKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: JEBE_HAIL_OF_ARROWS_ID,
        payload: { center: { col, row } },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "kaladinFifth") {
      if (!kaladinFifthTargetKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: KALADIN_FIFTH_ID,
        payload: { center: { col, row } },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "tisona") {
      if (!tisonaTargetKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: EL_CID_TISONA_ID,
        payload: { target: { col, row } },
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

    if (actionMode === "jebeHailOfArrows") {
      if (!coord) {
        setJebeHailPreviewCenter(null);
        return;
      }
      const key = coordKey(coord);
      setJebeHailPreviewCenter(jebeHailTargetKeys.has(key) ? coord : null);
      return;
    }

    if (actionMode === "kaladinFifth") {
      if (!coord) {
        setKaladinFifthPreviewCenter(null);
        return;
      }
      const key = coordKey(coord);
      setKaladinFifthPreviewCenter(kaladinFifthTargetKeys.has(key) ? coord : null);
      return;
    }

    if (actionMode === "tisona") {
      if (!coord) {
        setTisonaPreviewCoord(null);
        return;
      }
      const key = coordKey(coord);
      setTisonaPreviewCoord(tisonaTargetKeys.has(key) ? coord : null);
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
      : actionMode === "jebeHailOfArrows"
      ? jebeHailPreviewCenter
      : actionMode === "kaladinFifth"
      ? kaladinFifthPreviewCenter
      : isForestTarget
      ? forestPreviewCenter
      : null;
  const boardDisabled =
    !joined ||
    isSpectator ||
    view?.phase === "lobby" ||
    (hasBlockingRoll && !boardSelectionPending);
  const allowUnitPick =
    !boardSelectionPending &&
    actionMode !== "dora" &&
    actionMode !== "jebeHailOfArrows" &&
    actionMode !== "kaladinFifth" &&
    actionMode !== "tisona" &&
    actionMode !== "demonDuelist" &&
    actionMode !== "assassinMark" &&
    actionMode !== "guideTraveler" &&
    actionMode !== "jebeKhansShooter" &&
    actionMode !== "gutsArbalet" &&
    actionMode !== "gutsCannon" &&
    actionMode !== "hassanTrueEnemy";

  if (!view || !hasSnapshot) {
    return (
      <div className="min-h-screen bg-app p-6">
        <div className="mx-auto max-w-xl rounded-2xl border-ui bg-surface p-6 shadow-sm shadow-slate-900/5 dark:shadow-black/40">
          <h1 className="text-xl font-semibold text-primary">FATE</h1>
          <p className="mt-2 text-sm text-muted">
            Waiting for room state...
          </p>
          <div className="mt-4 text-xs text-muted">
            Connected: {connectionStatus === "connected" ? "yes" : "no"} | Status: {connectionStatus} | Joined: {joined ? "yes" : "no"} | Room: {roomId ?? "-"} | Role: {role ?? "-"}
          </div>
          <button
            className="mt-4 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
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
    <div className="min-h-screen bg-app p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:shadow-black/40">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <div>Room: {roomId ?? "-"}</div>
            <div>Role: {role ?? "-"}</div>
            <div>Connected: {connectionStatus === "connected" ? "yes" : "no"}</div>
            <div>Status: {connectionStatus}</div>
            <div>Joined: {joined ? "yes" : "no"}</div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={handleLeave}
                disabled={leavingRoom}
              >
                {leavingRoom ? "Leaving..." : "Leave"}
              </button>
              <ThemeToggle />
            </div>
          </div>
          <Board
            view={view}
            playerId={playerId}
            selectedUnitId={selectedUnitId}
            highlightedCells={highlightedCells}
            hoveredAbilityId={hoveredAbilityId}
            doraPreview={
              boardPreviewCenter
                ? {
                    center: boardPreviewCenter,
                    radius: actionMode === "kaladinFifth" ? 2 : 1,
                  }
                : null
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
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-200">
              Waiting for {pendingMeta.player} to roll.
            </div>
          )}
          {pendingRoll && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
              {isStakePlacement ? (
                <div>
                  <div className="font-semibold">Place 3 stakes</div>
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Selected: {stakeSelections.length}/{stakeLimit}
                  </div>
                  {stakeSelections.length > 0 && (
                    <div className="mt-1 text-[10px] text-amber-700 dark:text-amber-200">
                      {stakeSelections.map((pos) => `(${pos.col},${pos.row})`).join(", ")}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-lg bg-emerald-600 px-3 py-1 text-[10px] font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
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
                      className="rounded-lg bg-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                      onClick={() => setStakeSelections([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : isIntimidateChoice ? (
                <div>
                  <div className="font-semibold">Intimidate: choose a push cell</div>
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Click a highlighted cell or skip.
                  </div>
                  <button
                    className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
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
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Select the 3x3 center cell.
                  </div>
                </div>
              ) : isForestMoveDestination ? (
                <div>
                  <div className="font-semibold">Forest check failed</div>
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Choose a highlighted destination inside the aura.
                  </div>
                </div>
              ) : isForestChoice ? (
                <div>
                  <div className="font-semibold">Forest of the Dead ready</div>
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Decide whether to activate the phantasm.
                  </div>
                </div>
              ) : isForestMoveCheck ? (
                <div>
                  <div className="font-semibold">Forest check</div>
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Forest check: roll 5-6 to leave
                  </div>
                </div>
              ) : isDuelistChoice ? (
                <div>
                  <div className="font-semibold">Demon Duelist</div>
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Choose whether to continue the duel.
                  </div>
                </div>
              ) : isChikatiloPlacement ? (
                <div>
                  <div className="font-semibold">False Trail placement</div>
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Select any empty cell to place Chikatilo.
                  </div>
                </div>
              ) : isGuideTravelerPlacement ? (
                <div>
                  <div className="font-semibold">Guide Traveler placement</div>
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Select an empty cell to place the guided ally.
                  </div>
                </div>
              ) : isJebeKhansShooterTargetChoice ? (
                <div>
                  <div className="font-semibold">Khan's Shooter</div>
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Select the next ricochet target.
                  </div>
                </div>
              ) : isHassanTrueEnemyTargetChoice ? (
                <div>
                  <div className="font-semibold">True Enemy</div>
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Select a target for the forced enemy attack.
                  </div>
                </div>
              ) : isHassanAssassinOrderSelection ? (
                <div>
                  <div className="font-semibold">
                    Assassin Order: pick 2 allied heroes to gain Stealth (5-6)
                  </div>
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Selected: {hassanAssassinOrderSelections.length}/2
                  </div>
                  {hassanAssassinOrderSelections.length > 0 && (
                    <div className="mt-1 text-[10px] text-amber-700 dark:text-amber-200">
                      {hassanAssassinOrderSelections.join(", ")}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-lg bg-emerald-600 px-3 py-1 text-[10px] font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
                      onClick={() =>
                        pendingRoll &&
                        sendAction({
                          type: "resolvePendingRoll",
                          pendingRollId: pendingRoll.id,
                          choice: {
                            type: "hassanAssassinOrderPick",
                            unitIds: hassanAssassinOrderSelections,
                          },
                        } as GameAction)
                      }
                      disabled={hassanAssassinOrderSelections.length !== 2}
                    >
                      Confirm
                    </button>
                    <button
                      className="rounded-lg bg-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                      onClick={() => setHassanAssassinOrderSelections([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : isChikatiloRevealChoice ? (
                <div>
                  <div className="font-semibold">False Trail choice</div>
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Decide whether the token explodes or is removed.
                  </div>
                </div>
              ) : isChikatiloDecoyChoice ? (
                <div>
                  <div className="font-semibold">Decoy</div>
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                    Roll defense or spend 3 charges to take 1 damage.
                  </div>
                </div>
              ) : (
                <div>
                  Pending roll: {getPendingRollLabel(pendingRoll.kind)}. Resolve to continue.
                </div>
              )}
              {!isStakePlacement && pendingQueueCount > 0 && (
                <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                  Pending attacks: {pendingQueueCount}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {view.phase === "lobby" && (
            <div className="rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:shadow-black/40">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Room Lobby
              </div>
              <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
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
                  className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition hover:shadow ${
                    playerReady
                      ? "bg-amber-500 text-white dark:bg-amber-400"
                      : "bg-teal-500 text-white dark:bg-teal-800/50 dark:text-slate-100 dark:hover:bg-teal-700/60"
                  }`}
                  onClick={() => setReady(!playerReady)}
                  disabled={!joined || !!pendingMeta}
                >
                  {playerReady ? "Unready" : "Ready"}
                </button>
              )}
              {seat && (
                <button
                  className="mt-2 w-full rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                  onClick={() => switchRole("spectator")}
                  disabled={!joined || !!pendingMeta}
                >
                  Switch to Spectator
                </button>
              )}
              {isHost && (
                <button
                  className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition hover:shadow ${
                    canStartGame
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
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
            onHoverAttackRange={(unitId, hovering) => {
              if (hovering) {
                if (unitId) {
                  setHoverPreview({ type: "attackRange", unitId });
                }
                return;
              }
              if (hoverPreview?.type === "attackRange") {
                setHoverPreview(null);
              }
            }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-slate-950/70">
          <div className="w-full max-w-sm rounded-2xl border-ui bg-surface-solid p-5 shadow-lg shadow-slate-900/10 dark:shadow-black/40">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {pendingRoll.kind === "initiativeRoll"
                ? "Roll initiative"
                : isForestMoveCheck
                ? "Forest check"
                : isForestChoice
                ? "Forest of the Dead"
                : isDuelistChoice
                ? "Demon Duelist"
                : isChikatiloRevealChoice
                ? "False Trail"
                : isChikatiloDecoyChoice
                ? "Decoy"
                : "Roll required"}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {pendingRoll.kind === "berserkerDefenseChoice" ||
              pendingRoll.kind === "dora_berserkerDefenseChoice" ||
              pendingRoll.kind === "jebeHailOfArrows_berserkerDefenseChoice" ||
              pendingRoll.kind === "carpetStrike_berserkerDefenseChoice" ||
              pendingRoll.kind === "vladForest_berserkerDefenseChoice"
                ? "Choose berserker defense."
                : isChikatiloDecoyChoice
                ? "Roll defense or spend 3 charges to take 1 damage."
                : isChikatiloRevealChoice
                ? "Explode the token or remove it."
                : isForestMoveCheck
                ? "Forest check: roll 5-6 to leave"
                : isForestChoice
                ? "Activate Forest of the Dead or skip."
                : isDuelistChoice
                ? "Pay 1 HP to continue the duel, or stop."
                : `Please roll the dice to resolve: ${getPendingRollLabel(
                    pendingRoll.kind
                  )}.`}
            </div>
            {pendingRoll.kind === "initiativeRoll" && (
              <div className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
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
              <div className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
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
              pendingRoll.kind === "jebeHailOfArrows_berserkerDefenseChoice" ||
              pendingRoll.kind === "carpetStrike_berserkerDefenseChoice" ||
              pendingRoll.kind === "vladForest_berserkerDefenseChoice" ? (
                <>
                  <button
                    className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
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
                    className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
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
              ) : isChikatiloDecoyChoice ? (
                <>
                  <button
                    className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
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
                    className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
                    onClick={() =>
                      sendAction({
                        type: "resolvePendingRoll",
                        pendingRollId: pendingRoll.id,
                        choice: "decoy",
                      } as GameAction)
                    }
                    disabled={decoyCharges < 3}
                  >
                    Use Decoy (-3)
                  </button>
                </>
              ) : isDuelistChoice ? (
                <>
                  <button
                    className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
                    onClick={() =>
                      sendAction({
                        type: "resolvePendingRoll",
                        pendingRollId: pendingRoll.id,
                        choice: "elCidDuelistContinue",
                      } as GameAction)
                    }
                    disabled={duelistAttackerHp <= 1}
                  >
                    Pay 1 HP
                  </button>
                  <button
                    className="flex-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                    onClick={() =>
                      sendAction({
                        type: "resolvePendingRoll",
                        pendingRollId: pendingRoll.id,
                        choice: "elCidDuelistStop",
                      } as GameAction)
                    }
                  >
                    Stop
                  </button>
                </>
              ) : isForestChoice ? (
                <>
                  <button
                    className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
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
                    className="flex-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
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
              ) : isChikatiloRevealChoice ? (
                <>
                  <button
                    className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
                    onClick={() =>
                      sendAction({
                        type: "resolvePendingRoll",
                        pendingRollId: pendingRoll.id,
                        choice: "falseTrailExplode",
                      } as GameAction)
                    }
                  >
                    Explode
                  </button>
                  <button
                    className="flex-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                    onClick={() =>
                      sendAction({
                        type: "resolvePendingRoll",
                        pendingRollId: pendingRoll.id,
                        choice: "falseTrailRemove",
                      } as GameAction)
                    }
                  >
                    Remove
                  </button>
                </>
              ) : (
                <button
                  className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
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
