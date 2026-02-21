import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Coord,
  type GameAction,
  type MoveMode,
  type PapyrusLineAxis,
  type UnitState,
} from "rules";
import { Board } from "../components/Board";
import { EventLog } from "../components/EventLog";
import { RightPanel } from "./components/RightPanel/RightPanel";
import { TurnQueueTracker } from "../components/TurnQueueTracker";
import { ThemeToggle } from "../components/ThemeToggle";
import { GameLoadingState } from "./gameshell-content/components/GameLoadingState";
import { PendingBoardNotice } from "./gameshell-content/components/PendingBoardNotice";
import { PendingRollModal } from "./gameshell-content/components/PendingRollModal";
import { buildHighlightedCells } from "./gameshell-content/buildHighlightedCells";
import {
  createCellClickHandler,
  createCellHoverHandler,
} from "./gameshell-content/cellHandlers";
import {
  getLocalPlayerId,
  useGameStore,
} from "../store";
import {
  EL_CID_DEMON_DUELIST_ID,
  EL_CID_TISONA_ID,
  KAISER_DORA_ID,
  GROZNY_INVADE_TIME_ID,
  CHIKATILO_ASSASSIN_MARK_ID,
  CHIKATILO_DECOY_ID,
  HASSAN_TRUE_ENEMY_ID,
  FRISK_GENOCIDE_ID,
  FRISK_PACIFISM_ID,
  KALADIN_FIFTH_ID,
  KALADIN_ID,
  LOKI_LAUGHT_ID,
  ODIN_MUNINN_ID,
  ODIN_SLEIPNIR_ID,
  LECHY_GUIDE_TRAVELER_ID,
  JEBE_HAIL_OF_ARROWS_ID,
  JEBE_KHANS_SHOOTER_ID,
  ASGORE_ID,
  ASGORE_FIREBALL_ID,
  FEMTO_ID,
  GUTS_ID,
  GUTS_ARBALET_ID,
  GUTS_CANNON_ID,
  PAPYRUS_COOL_GUY_ID,
  PAPYRUS_ID,
  PAPYRUS_LONG_BONE_ID,
  PAPYRUS_ORANGE_BONE_ID,
} from "../rulesHints";
import {
  coordKey,
  getArcherLikeTargetIds,
  getAttackRangeCells,
  getDoraTargetCenters,
  getUnitAt,
  isCoordInList,
  normalizeCoordList,
  previewKindForActionMode,
} from "./gameshell-content/helpers";

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
  const [papyrusLineAxis, setPapyrusLineAxis] =
    useState<PapyrusLineAxis>("row");

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
  const isAsgoreSoulParadePatienceTargetChoice =
    pendingRoll?.kind === "asgoreSoulParadePatienceTargetChoice";
  const isAsgoreSoulParadePerseveranceTargetChoice =
    pendingRoll?.kind === "asgoreSoulParadePerseveranceTargetChoice";
  const isAsgoreSoulParadeJusticeTargetChoice =
    pendingRoll?.kind === "asgoreSoulParadeJusticeTargetChoice";
  const isAsgoreSoulParadeIntegrityDestination =
    pendingRoll?.kind === "asgoreSoulParadeIntegrityDestination";
  const isLokiLaughtChoice = pendingRoll?.kind === "lokiLaughtChoice";
  const isLokiChickenTargetChoice =
    pendingRoll?.kind === "lokiChickenTargetChoice";
  const isLokiMindControlEnemyChoice =
    pendingRoll?.kind === "lokiMindControlEnemyChoice";
  const isLokiMindControlTargetChoice =
    pendingRoll?.kind === "lokiMindControlTargetChoice";
  const isFriskPacifismChoice = pendingRoll?.kind === "friskPacifismChoice";
  const isFriskPacifismHugsTargetChoice =
    pendingRoll?.kind === "friskPacifismHugsTargetChoice";
  const isFriskWarmWordsTargetChoice =
    pendingRoll?.kind === "friskWarmWordsTargetChoice";
  const isFriskGenocideChoice = pendingRoll?.kind === "friskGenocideChoice";
  const isFriskKeenEyeChoice = pendingRoll?.kind === "friskKeenEyeChoice";
  const isFriskSubstitutionChoice =
    pendingRoll?.kind === "friskSubstitutionChoice";
  const isFriskChildsCryChoice =
    pendingRoll?.kind === "friskChildsCryChoice";
  const isFemtoDivineMoveDestination =
    pendingRoll?.kind === "femtoDivineMoveDestination";
  const isRiverBoatCarryChoice =
    pendingRoll?.kind === "riverBoatCarryChoice";
  const isRiverBoatDropDestination =
    pendingRoll?.kind === "riverBoatDropDestination";
  const isRiverTraLaLaTargetChoice =
    pendingRoll?.kind === "riverTraLaLaTargetChoice";
  const isRiverTraLaLaDestinationChoice =
    pendingRoll?.kind === "riverTraLaLaDestinationChoice";
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
    isLokiChickenTargetChoice ||
    isLokiMindControlEnemyChoice ||
    isLokiMindControlTargetChoice ||
    isFriskPacifismHugsTargetChoice ||
    isFriskWarmWordsTargetChoice ||
    isAsgoreSoulParadePatienceTargetChoice ||
    isAsgoreSoulParadePerseveranceTargetChoice ||
    isAsgoreSoulParadeJusticeTargetChoice ||
    isAsgoreSoulParadeIntegrityDestination ||
    isFemtoDivineMoveDestination ||
    isRiverBoatCarryChoice ||
    isRiverBoatDropDestination ||
    isRiverTraLaLaTargetChoice ||
    isRiverTraLaLaDestinationChoice;
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
  const isBerserkerDefenseChoice =
    pendingRoll?.kind === "berserkerDefenseChoice" ||
    pendingRoll?.kind === "dora_berserkerDefenseChoice" ||
    pendingRoll?.kind === "jebeHailOfArrows_berserkerDefenseChoice" ||
    pendingRoll?.kind === "carpetStrike_berserkerDefenseChoice" ||
    pendingRoll?.kind === "vladForest_berserkerDefenseChoice";
  const isOdinMuninnDefenseChoice =
    pendingRoll?.kind === "odinMuninnDefenseChoice";
  const isAsgoreBraveryDefenseChoice =
    pendingRoll?.kind === "asgoreBraveryDefenseChoice";
  const isFriskDefenseChoice =
    isFriskSubstitutionChoice || isFriskChildsCryChoice;
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
    isBerserkerDefenseChoice ||
    isOdinMuninnDefenseChoice ||
    isAsgoreBraveryDefenseChoice ||
    isFriskDefenseChoice ||
    pendingRoll?.kind === "chikatiloDecoyChoice";
  const defenderId = (() => {
    if (!pendingRoll) return undefined;
    if (
      pendingRoll.kind === "berserkerDefenseChoice" ||
      pendingRoll.kind === "odinMuninnDefenseChoice" ||
      pendingRoll.kind === "asgoreBraveryDefenseChoice"
    ) {
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
  const defenderBerserkCharges =
    defenderId && view?.units[defenderId]
      ? view.units[defenderId].charges?.berserkAutoDefense ?? 0
      : 0;
  const defenderMuninnCharges =
    defenderId && view?.units[defenderId]
      ? view.units[defenderId].charges?.[ODIN_MUNINN_ID] ?? 0
      : 0;
  const defenderAsgoreBraveryReady =
    !!(defenderId && view?.units[defenderId]?.asgoreBraveryAutoDefenseReady);
  const defenderFriskPacifismPoints =
    defenderId && view?.units[defenderId]
      ? view.units[defenderId].charges?.[FRISK_PACIFISM_ID] ?? 0
      : 0;
  const defenderFriskGenocidePoints =
    defenderId && view?.units[defenderId]
      ? view.units[defenderId].charges?.[FRISK_GENOCIDE_ID] ?? 0
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
  const hoverActionMode =
    hoverPreview?.type === "actionMode" ? hoverPreview.mode : null;
  const allowActionHoverPreview =
    !actionMode &&
    !hasBlockingRoll &&
    !boardSelectionPending &&
    !!hoverActionMode &&
    !!selectedUnit;
  const effectiveActionMode =
    actionMode ?? (allowActionHoverPreview ? hoverActionMode : null);
  const modePreviewKind = allowActionHoverPreview
    ? previewKindForActionMode(hoverActionMode)
    : null;

  useEffect(() => {
    if (hoverPreview?.type !== "actionMode") return;
    if (actionMode || hasBlockingRoll || boardSelectionPending || !selectedUnit) {
      setHoverPreview(null);
    }
  }, [
    hoverPreview,
    actionMode,
    hasBlockingRoll,
    boardSelectionPending,
    selectedUnit,
    setHoverPreview,
  ]);

  useEffect(() => {
    if (!selectedUnit || selectedUnit.heroId !== PAPYRUS_ID) {
      return;
    }
    const nextAxis = selectedUnit.papyrusLineAxis ?? "row";
    if (nextAxis !== papyrusLineAxis) {
      setPapyrusLineAxis(nextAxis);
    }
  }, [selectedUnit, papyrusLineAxis]);

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
  const riverBoatCarryOptionIds = useMemo(() => {
    if (!isRiverBoatCarryChoice) return [] as string[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as string[];
    return ctx.options.filter((value): value is string => typeof value === "string");
  }, [isRiverBoatCarryChoice, pendingRoll]);
  const riverBoatCarryOptionKeys = useMemo(
    () =>
      new Set(
        riverBoatCarryOptionIds
          .map((unitId) => view?.units[unitId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [riverBoatCarryOptionIds, view]
  );
  const riverBoatDropDestinationOptions = useMemo(() => {
    if (!isRiverBoatDropDestination) return [] as Coord[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    return normalizeCoordList(ctx?.options);
  }, [isRiverBoatDropDestination, pendingRoll]);
  const riverBoatDropDestinationKeys = useMemo(
    () => new Set(riverBoatDropDestinationOptions.map(coordKey)),
    [riverBoatDropDestinationOptions]
  );
  const riverTraLaLaTargetIds = useMemo(() => {
    if (!isRiverTraLaLaTargetChoice) return [] as string[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as string[];
    return ctx.options.filter((value): value is string => typeof value === "string");
  }, [isRiverTraLaLaTargetChoice, pendingRoll]);
  const riverTraLaLaTargetKeys = useMemo(
    () =>
      new Set(
        riverTraLaLaTargetIds
          .map((unitId) => view?.units[unitId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [riverTraLaLaTargetIds, view]
  );
  const riverTraLaLaDestinationOptions = useMemo(() => {
    if (!isRiverTraLaLaDestinationChoice) return [] as Coord[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    return normalizeCoordList(ctx?.options);
  }, [isRiverTraLaLaDestinationChoice, pendingRoll]);
  const riverTraLaLaDestinationKeys = useMemo(
    () => new Set(riverTraLaLaDestinationOptions.map(coordKey)),
    [riverTraLaLaDestinationOptions]
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
  const asgorePatienceTargetIds = useMemo(() => {
    if (!isAsgoreSoulParadePatienceTargetChoice) return [] as string[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as string[];
    return ctx.options.filter((value): value is string => typeof value === "string");
  }, [isAsgoreSoulParadePatienceTargetChoice, pendingRoll]);
  const asgorePatienceTargetKeys = useMemo(
    () =>
      new Set(
        asgorePatienceTargetIds
          .map((targetId) => view?.units[targetId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [asgorePatienceTargetIds, view]
  );
  const asgorePerseveranceTargetIds = useMemo(() => {
    if (!isAsgoreSoulParadePerseveranceTargetChoice) return [] as string[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as string[];
    return ctx.options.filter((value): value is string => typeof value === "string");
  }, [isAsgoreSoulParadePerseveranceTargetChoice, pendingRoll]);
  const asgorePerseveranceTargetKeys = useMemo(
    () =>
      new Set(
        asgorePerseveranceTargetIds
          .map((targetId) => view?.units[targetId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [asgorePerseveranceTargetIds, view]
  );
  const asgoreJusticeTargetIds = useMemo(() => {
    if (!isAsgoreSoulParadeJusticeTargetChoice) return [] as string[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as string[];
    return ctx.options.filter((value): value is string => typeof value === "string");
  }, [isAsgoreSoulParadeJusticeTargetChoice, pendingRoll]);
  const asgoreJusticeTargetKeys = useMemo(
    () =>
      new Set(
        asgoreJusticeTargetIds
          .map((targetId) => view?.units[targetId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [asgoreJusticeTargetIds, view]
  );
  const asgoreIntegrityDestinationOptions = useMemo(() => {
    if (!isAsgoreSoulParadeIntegrityDestination) return [] as Coord[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    return normalizeCoordList(ctx?.options);
  }, [isAsgoreSoulParadeIntegrityDestination, pendingRoll]);
  const asgoreIntegrityDestinationKeys = useMemo(
    () => new Set(asgoreIntegrityDestinationOptions.map(coordKey)),
    [asgoreIntegrityDestinationOptions]
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
  const friskPacifismContext = isFriskPacifismChoice
    ? (pendingRoll?.context as
        | {
            friskId?: unknown;
            hugsOptions?: unknown;
            warmWordsOptions?: unknown;
            canPowerOfFriendship?: unknown;
          }
        | undefined)
    : undefined;
  const friskPacifismCasterId =
    typeof friskPacifismContext?.friskId === "string"
      ? friskPacifismContext.friskId
      : "";
  const friskPacifismPoints =
    friskPacifismCasterId && view?.units[friskPacifismCasterId]
      ? view.units[friskPacifismCasterId].charges?.[FRISK_PACIFISM_ID] ?? 0
      : 0;
  const friskPacifismDisabled =
    !!(friskPacifismCasterId &&
      view?.units[friskPacifismCasterId]?.friskPacifismDisabled);
  const friskPacifismHugsOptions = useMemo(() => {
    if (!Array.isArray(friskPacifismContext?.hugsOptions)) return [] as string[];
    return friskPacifismContext.hugsOptions.filter(
      (value): value is string => typeof value === "string"
    );
  }, [friskPacifismContext]);
  const friskPacifismWarmWordsOptions = useMemo(() => {
    if (!Array.isArray(friskPacifismContext?.warmWordsOptions)) {
      return [] as string[];
    }
    return friskPacifismContext.warmWordsOptions.filter(
      (value): value is string => typeof value === "string"
    );
  }, [friskPacifismContext]);
  const friskPacifismPowerOfFriendshipEnabled =
    friskPacifismContext?.canPowerOfFriendship === true;
  const friskPacifismHugsTargetIds = useMemo(() => {
    if (!isFriskPacifismHugsTargetChoice) return [] as string[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as string[];
    return ctx.options.filter((value): value is string => typeof value === "string");
  }, [isFriskPacifismHugsTargetChoice, pendingRoll]);
  const friskPacifismHugsTargetKeys = useMemo(
    () =>
      new Set(
        friskPacifismHugsTargetIds
          .map((targetId) => view?.units[targetId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [friskPacifismHugsTargetIds, view]
  );
  const friskWarmWordsTargetIds = useMemo(() => {
    if (!isFriskWarmWordsTargetChoice) return [] as string[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as string[];
    return ctx.options.filter((value): value is string => typeof value === "string");
  }, [isFriskWarmWordsTargetChoice, pendingRoll]);
  const friskWarmWordsTargetKeys = useMemo(
    () =>
      new Set(
        friskWarmWordsTargetIds
          .map((targetId) => view?.units[targetId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [friskWarmWordsTargetIds, view]
  );
  const friskGenocideContext = isFriskGenocideChoice
    ? (pendingRoll?.context as { friskId?: unknown } | undefined)
    : undefined;
  const friskGenocideCasterId =
    typeof friskGenocideContext?.friskId === "string"
      ? friskGenocideContext.friskId
      : "";
  const friskGenocidePoints =
    friskGenocideCasterId && view?.units[friskGenocideCasterId]
      ? view.units[friskGenocideCasterId].charges?.[FRISK_GENOCIDE_ID] ?? 0
      : 0;
  const friskKeenEyeTargetIds = useMemo(() => {
    if (!isFriskKeenEyeChoice) return [] as string[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as string[];
    return ctx.options.filter((value): value is string => typeof value === "string");
  }, [isFriskKeenEyeChoice, pendingRoll]);
  const lokiLaughtContext = isLokiLaughtChoice
    ? (pendingRoll?.context as
        | {
            lokiId?: unknown;
            chickenOptions?: unknown;
            mindControlEnemyOptions?: unknown;
            spinCandidateIds?: unknown;
          }
        | undefined)
    : undefined;
  const lokiLaughtCasterId =
    typeof lokiLaughtContext?.lokiId === "string" ? lokiLaughtContext.lokiId : "";
  const lokiLaughtCurrent =
    lokiLaughtCasterId && view?.units[lokiLaughtCasterId]
      ? view.units[lokiLaughtCasterId].charges?.[LOKI_LAUGHT_ID] ?? 0
      : 0;
  const lokiLaughtChickenOptions = useMemo(() => {
    if (!Array.isArray(lokiLaughtContext?.chickenOptions)) return [] as string[];
    return lokiLaughtContext.chickenOptions.filter(
      (value): value is string => typeof value === "string"
    );
  }, [lokiLaughtContext]);
  const lokiLaughtMindControlEnemyOptions = useMemo(() => {
    if (!Array.isArray(lokiLaughtContext?.mindControlEnemyOptions)) {
      return [] as string[];
    }
    return lokiLaughtContext.mindControlEnemyOptions.filter(
      (value): value is string => typeof value === "string"
    );
  }, [lokiLaughtContext]);
  const lokiLaughtSpinCandidateIds = useMemo(() => {
    if (!Array.isArray(lokiLaughtContext?.spinCandidateIds)) return [] as string[];
    return lokiLaughtContext.spinCandidateIds.filter(
      (value): value is string => typeof value === "string"
    );
  }, [lokiLaughtContext]);
  const lokiCanAgainSomeNonsense = lokiLaughtCurrent >= 3;
  const lokiCanChicken =
    lokiLaughtCurrent >= 5 && lokiLaughtChickenOptions.length > 0;
  const lokiCanMindControl =
    lokiLaughtCurrent >= 10 && lokiLaughtMindControlEnemyOptions.length > 0;
  const lokiCanSpinTheDrum = lokiLaughtCurrent >= 12;
  const lokiCanGreatLokiJoke = lokiLaughtCurrent >= 15;
  const lokiChickenTargetIds = useMemo(() => {
    if (!isLokiChickenTargetChoice) return [] as string[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as string[];
    return ctx.options.filter((value): value is string => typeof value === "string");
  }, [isLokiChickenTargetChoice, pendingRoll]);
  const lokiChickenTargetKeys = useMemo(
    () =>
      new Set(
        lokiChickenTargetIds
          .map((unitId) => view?.units[unitId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [lokiChickenTargetIds, view]
  );
  const lokiMindControlEnemyIds = useMemo(() => {
    if (!isLokiMindControlEnemyChoice) return [] as string[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as string[];
    return ctx.options.filter((value): value is string => typeof value === "string");
  }, [isLokiMindControlEnemyChoice, pendingRoll]);
  const lokiMindControlEnemyKeys = useMemo(
    () =>
      new Set(
        lokiMindControlEnemyIds
          .map((unitId) => view?.units[unitId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [lokiMindControlEnemyIds, view]
  );
  const lokiMindControlTargetIds = useMemo(() => {
    if (!isLokiMindControlTargetChoice) return [] as string[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as string[];
    return ctx.options.filter((value): value is string => typeof value === "string");
  }, [isLokiMindControlTargetChoice, pendingRoll]);
  const lokiMindControlTargetKeys = useMemo(
    () =>
      new Set(
        lokiMindControlTargetIds
          .map((unitId) => view?.units[unitId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [lokiMindControlTargetIds, view]
  );

  const doraTargetCenters = useMemo(() => {
    if (!view || effectiveActionMode !== "dora" || !selectedUnit?.position) {
      return [] as Coord[];
    }
    return getDoraTargetCenters(view, selectedUnit.id);
  }, [view, effectiveActionMode, selectedUnit]);

  const doraTargetKeys = useMemo(
    () => new Set(doraTargetCenters.map(coordKey)),
    [doraTargetCenters]
  );

  const jebeHailTargetCenters = useMemo(() => {
    if (
      !view ||
      effectiveActionMode !== "jebeHailOfArrows" ||
      !selectedUnit?.position
    ) {
      return [] as Coord[];
    }
    return getDoraTargetCenters(view, selectedUnit.id);
  }, [view, effectiveActionMode, selectedUnit]);

  const jebeHailTargetKeys = useMemo(
    () => new Set(jebeHailTargetCenters.map(coordKey)),
    [jebeHailTargetCenters]
  );

  const kaladinFifthTargetCenters = useMemo(() => {
    if (!view || effectiveActionMode !== "kaladinFifth") {
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
  }, [view, effectiveActionMode]);

  const kaladinFifthTargetKeys = useMemo(
    () => new Set(kaladinFifthTargetCenters.map(coordKey)),
    [kaladinFifthTargetCenters]
  );

  const tisonaTargetCells = useMemo(() => {
    if (!view || effectiveActionMode !== "tisona" || !selectedUnit?.position) {
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
  }, [view, effectiveActionMode, selectedUnit]);

  const tisonaTargetKeys = useMemo(
    () => new Set(tisonaTargetCells.map(coordKey)),
    [tisonaTargetCells]
  );

  const invadeTimeTargets = useMemo(() => {
    if (
      !view ||
      (effectiveActionMode !== "invadeTime" &&
        effectiveActionMode !== "odinSleipnir") ||
      !selectedUnit?.position
    ) {
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
  }, [view, effectiveActionMode, selectedUnit]);

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
  const attackPreviewCells = useMemo(() => {
    if (!view || !selectedUnit) return [] as Coord[];
    return getAttackRangeCells(view, selectedUnit.id);
  }, [view, selectedUnit]);
  const papyrusLongBoneAttackTargetIds = useMemo(() => {
    if (!view || !selectedUnit) return [] as string[];
    if (
      selectedUnit.heroId !== PAPYRUS_ID ||
      !selectedUnit.papyrusUnbelieverActive ||
      !selectedUnit.papyrusLongBoneMode
    ) {
      return [] as string[];
    }
    return Object.values(view.units)
      .filter((unit) => unit.id !== selectedUnit.id && unit.isAlive && !!unit.position)
      .map((unit) => unit.id);
  }, [view, selectedUnit]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (hoverActionMode !== "attack" || !allowActionHoverPreview) return;
    console.debug("attackPreviewCells", attackPreviewCells.length);
  }, [hoverActionMode, allowActionHoverPreview, attackPreviewCells]);

  const assassinMarkTargets = useMemo(() => {
    if (
      !view ||
      effectiveActionMode !== "assassinMark" ||
      !selectedUnit?.position
    ) {
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
  }, [view, effectiveActionMode, selectedUnit]);
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
    if (
      !view ||
      effectiveActionMode !== "guideTraveler" ||
      !selectedUnit?.position
    ) {
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
  }, [view, effectiveActionMode, selectedUnit]);
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
    if (
      !view ||
      effectiveActionMode !== "hassanTrueEnemy" ||
      !selectedUnit?.position
    ) {
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
  }, [view, effectiveActionMode, selectedUnit]);
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
      (effectiveActionMode !== "gutsArbalet" &&
        effectiveActionMode !== "gutsCannon")
    ) {
      return [] as string[];
    }
    return getArcherLikeTargetIds(view, selectedUnit.id);
  }, [view, selectedUnit, effectiveActionMode]);
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
  const asgoreFireballTargetIds = useMemo(() => {
    if (!view || !selectedUnit || effectiveActionMode !== "asgoreFireball") {
      return [] as string[];
    }
    return getArcherLikeTargetIds(view, selectedUnit.id);
  }, [view, selectedUnit, effectiveActionMode]);
  const asgoreFireballTargetKeys = useMemo(
    () =>
      new Set(
        asgoreFireballTargetIds
          .map((unitId) => view?.units[unitId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [asgoreFireballTargetIds, view]
  );

  const highlightedCells = useMemo(
    () =>
      buildHighlightedCells({
        effectiveActionMode,
        modePreviewKind,
        legalPlacementCoords,
        legalMoveCoords,
        legalAttackTargets,
        attackPreviewCells,
        papyrusLongBoneAttackTargetIds,
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
        isRiverBoatCarryChoice,
        riverBoatCarryOptionKeys,
        isRiverBoatDropDestination,
        riverBoatDropDestinationOptions,
        isRiverTraLaLaTargetChoice,
        riverTraLaLaTargetKeys,
        isRiverTraLaLaDestinationChoice,
        riverTraLaLaDestinationOptions,
        isChikatiloPlacement,
        chikatiloPlacementCoords,
        isGuideTravelerPlacement,
        guideTravelerPlacementCoords,
        isJebeKhansShooterTargetChoice,
        jebeKhansShooterTargetKeys,
        isHassanTrueEnemyTargetChoice,
        hassanTrueEnemyTargetKeys,
        isAsgoreSoulParadePatienceTargetChoice,
        asgorePatienceTargetKeys,
        isAsgoreSoulParadePerseveranceTargetChoice,
        asgorePerseveranceTargetKeys,
        isAsgoreSoulParadeJusticeTargetChoice,
        asgoreJusticeTargetKeys,
        isAsgoreSoulParadeIntegrityDestination,
        asgoreIntegrityDestinationOptions,
        isHassanAssassinOrderSelection,
        hassanAssassinOrderEligibleKeys,
        hassanAssassinOrderSelections,
        isLokiChickenTargetChoice,
        lokiChickenTargetKeys,
        isLokiMindControlEnemyChoice,
        lokiMindControlEnemyKeys,
        isLokiMindControlTargetChoice,
        lokiMindControlTargetKeys,
        isFriskPacifismHugsTargetChoice,
        friskPacifismHugsTargetKeys,
        isFriskWarmWordsTargetChoice,
        friskWarmWordsTargetKeys,
        hassanTrueEnemyCandidateKeys,
        selectedUnit,
        pendingMoveForSelected,
        moveOptions,
        jebeHailTargetCenters,
        kaladinFifthTargetCenters,
        tisonaTargetCells,
        tisonaPreviewCoord,
        assassinMarkTargetKeys,
        guideTravelerTargetKeys,
        invadeTimeTargets,
        gutsRangedTargetKeys,
        asgoreFireballTargetKeys,
      }),
    [
      effectiveActionMode,
      modePreviewKind,
      legalPlacementCoords,
      legalMoveCoords,
      legalAttackTargets,
      attackPreviewCells,
      papyrusLongBoneAttackTargetIds,
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
      isRiverBoatCarryChoice,
      riverBoatCarryOptionKeys,
      isRiverBoatDropDestination,
      riverBoatDropDestinationOptions,
      isRiverTraLaLaTargetChoice,
      riverTraLaLaTargetKeys,
      riverTraLaLaTargetIds,
      isRiverTraLaLaDestinationChoice,
      riverTraLaLaDestinationOptions,
      isChikatiloPlacement,
      chikatiloPlacementCoords,
      isGuideTravelerPlacement,
      guideTravelerPlacementCoords,
      isJebeKhansShooterTargetChoice,
      jebeKhansShooterTargetKeys,
      isHassanTrueEnemyTargetChoice,
      hassanTrueEnemyTargetKeys,
      isAsgoreSoulParadePatienceTargetChoice,
      asgorePatienceTargetKeys,
      isAsgoreSoulParadePerseveranceTargetChoice,
      asgorePerseveranceTargetKeys,
      isAsgoreSoulParadeJusticeTargetChoice,
      asgoreJusticeTargetKeys,
      isAsgoreSoulParadeIntegrityDestination,
      asgoreIntegrityDestinationOptions,
      isHassanAssassinOrderSelection,
      hassanAssassinOrderEligibleKeys,
      hassanAssassinOrderSelections,
      isLokiChickenTargetChoice,
      lokiChickenTargetKeys,
      lokiChickenTargetIds,
      isLokiMindControlEnemyChoice,
      lokiMindControlEnemyKeys,
      lokiMindControlEnemyIds,
      isLokiMindControlTargetChoice,
      lokiMindControlTargetKeys,
      lokiMindControlTargetIds,
      isFriskPacifismHugsTargetChoice,
      friskPacifismHugsTargetKeys,
      friskPacifismHugsTargetIds,
      isFriskWarmWordsTargetChoice,
      friskWarmWordsTargetKeys,
      friskWarmWordsTargetIds,
      hassanTrueEnemyCandidateKeys,
      selectedUnit,
      pendingMoveForSelected,
      moveOptions,
      jebeHailTargetCenters,
      kaladinFifthTargetCenters,
      tisonaTargetCells,
      tisonaPreviewCoord,
      assassinMarkTargetKeys,
      guideTravelerTargetKeys,
      invadeTimeTargets,
      gutsRangedTargetKeys,
      asgoreFireballTargetKeys,
    ]
  );
  const handleCellClick = createCellClickHandler({
    view,
    playerId,
    joined,
    isSpectator,
    hasBlockingRoll,
    boardSelectionPending,
    isStakePlacement,
    stakeLegalKeys,
    stakeLimit,
    setStakeSelections,
    isIntimidateChoice,
    intimidateKeys,
    pendingRoll,
    isForestTarget,
    forestTargetKeys,
    isForestMoveDestination,
    forestMoveDestinationKeys,
    isFemtoDivineMoveDestination,
    femtoDivineMoveKeys,
    isRiverBoatCarryChoice,
    riverBoatCarryOptionIds,
    isRiverBoatDropDestination,
    riverBoatDropDestinationKeys,
    isRiverTraLaLaTargetChoice,
    riverTraLaLaTargetIds,
    isRiverTraLaLaDestinationChoice,
    riverTraLaLaDestinationKeys,
    isChikatiloPlacement,
    chikatiloPlacementKeys,
    isGuideTravelerPlacement,
    guideTravelerPlacementKeys,
    isJebeKhansShooterTargetChoice,
    jebeKhansShooterTargetIds,
    isHassanTrueEnemyTargetChoice,
    hassanTrueEnemyTargetIds,
    isAsgoreSoulParadePatienceTargetChoice,
    asgorePatienceTargetIds,
    isAsgoreSoulParadePerseveranceTargetChoice,
    asgorePerseveranceTargetIds,
    isAsgoreSoulParadeJusticeTargetChoice,
    asgoreJusticeTargetIds,
    isAsgoreSoulParadeIntegrityDestination,
    asgoreIntegrityDestinationKeys,
    isFriskPacifismHugsTargetChoice,
    friskPacifismHugsTargetIds,
    isFriskWarmWordsTargetChoice,
    friskWarmWordsTargetIds,
    isLokiChickenTargetChoice,
    lokiChickenTargetIds,
    isLokiMindControlEnemyChoice,
    lokiMindControlEnemyIds,
    isLokiMindControlTargetChoice,
    lokiMindControlTargetIds,
    isHassanAssassinOrderSelection,
    hassanAssassinOrderEligibleIds,
    setHassanAssassinOrderSelections,
    actionMode,
    placeUnitId,
    legalPlacementCoords,
    sendGameAction,
    setActionMode,
    setPlaceUnitId,
    selectedUnitId,
    legalMoveCoords,
    setMoveOptions,
    invadeTimeKeys,
    legalAttackTargets,
    gutsRangedTargetIds,
    asgoreFireballTargetIds,
    hassanTrueEnemyCandidateIds,
    guideTravelerTargetIds,
    papyrusLongBoneAttackTargetIds,
    assassinMarkTargetIds,
    doraTargetKeys,
    jebeHailTargetKeys,
    kaladinFifthTargetKeys,
    tisonaTargetKeys,
    papyrusLineAxis,
    sendAction,
  });

  const handleCellHover = createCellHoverHandler({
    actionMode,
    isForestTarget,
    doraTargetKeys,
    jebeHailTargetKeys,
    kaladinFifthTargetKeys,
    tisonaTargetKeys,
    forestTargetKeys,
    setDoraPreviewCenter,
    setJebeHailPreviewCenter,
    setKaladinFifthPreviewCenter,
    setTisonaPreviewCoord,
    setForestPreviewCenter,
  });
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
  const papyrusLongBoneAttackMode =
    actionMode === "attack" &&
    selectedUnit?.heroId === PAPYRUS_ID &&
    !!selectedUnit.papyrusUnbelieverActive &&
    !!selectedUnit.papyrusLongBoneMode;
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
    actionMode !== "asgoreFireball" &&
    actionMode !== "odinSleipnir" &&
    actionMode !== "hassanTrueEnemy" &&
    actionMode !== "papyrusCoolGuy" &&
    !papyrusLongBoneAttackMode;

  if (!view || !hasSnapshot) {
    return (
      <GameLoadingState
        connectionStatus={connectionStatus}
        joined={joined}
        roomId={roomId}
        role={role}
        leavingRoom={leavingRoom}
        onLeave={handleLeave}
      />
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
            <PendingBoardNotice
              pendingRollKind={pendingRoll.kind}
              pendingQueueCount={pendingQueueCount}
              stakeSelections={stakeSelections}
              stakeLimit={stakeLimit}
              hassanAssassinOrderSelections={hassanAssassinOrderSelections}
              isStakePlacement={isStakePlacement}
              isIntimidateChoice={isIntimidateChoice}
              isForestTarget={isForestTarget}
              isForestMoveDestination={isForestMoveDestination}
              isForestChoice={isForestChoice}
              isForestMoveCheck={isForestMoveCheck}
              isDuelistChoice={isDuelistChoice}
              isChikatiloPlacement={isChikatiloPlacement}
              isGuideTravelerPlacement={isGuideTravelerPlacement}
              isRiverBoatCarryChoice={isRiverBoatCarryChoice}
              isRiverBoatDropDestination={isRiverBoatDropDestination}
              isRiverTraLaLaTargetChoice={isRiverTraLaLaTargetChoice}
              isRiverTraLaLaDestinationChoice={isRiverTraLaLaDestinationChoice}
              isJebeKhansShooterTargetChoice={isJebeKhansShooterTargetChoice}
              isLokiLaughtChoice={isLokiLaughtChoice}
              isLokiChickenTargetChoice={isLokiChickenTargetChoice}
              isLokiMindControlEnemyChoice={isLokiMindControlEnemyChoice}
              isLokiMindControlTargetChoice={isLokiMindControlTargetChoice}
              isHassanTrueEnemyTargetChoice={isHassanTrueEnemyTargetChoice}
              isAsgoreSoulParadePatienceTargetChoice={
                isAsgoreSoulParadePatienceTargetChoice
              }
              isAsgoreSoulParadePerseveranceTargetChoice={
                isAsgoreSoulParadePerseveranceTargetChoice
              }
              isAsgoreSoulParadeJusticeTargetChoice={
                isAsgoreSoulParadeJusticeTargetChoice
              }
              isAsgoreSoulParadeIntegrityDestination={
                isAsgoreSoulParadeIntegrityDestination
              }
              isHassanAssassinOrderSelection={isHassanAssassinOrderSelection}
              isChikatiloRevealChoice={isChikatiloRevealChoice}
              isChikatiloDecoyChoice={isChikatiloDecoyChoice}
              onResolveSkip={() => {
                sendAction({
                  type: "resolvePendingRoll",
                  pendingRollId: pendingRoll.id,
                  choice: "skip",
                } as GameAction);
              }}
              onConfirmStakePlacement={() => {
                sendAction({
                  type: "resolvePendingRoll",
                  pendingRollId: pendingRoll.id,
                  choice: { type: "placeStakes", positions: stakeSelections },
                } as GameAction);
              }}
              onClearStakeSelections={() => setStakeSelections([])}
              onConfirmHassanAssassinOrder={() => {
                sendAction({
                  type: "resolvePendingRoll",
                  pendingRollId: pendingRoll.id,
                  choice: {
                    type: "hassanAssassinOrderPick",
                    unitIds: hassanAssassinOrderSelections,
                  },
                } as GameAction);
              }}
              onClearHassanAssassinOrder={() => setHassanAssassinOrderSelections([])}
            />
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
            onHoverActionMode={(mode) =>
              setHoverPreview(mode ? { type: "actionMode", mode } : null)
            }
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
              const preserveMode =
                action.type === "useAbility" &&
                (action.abilityId === PAPYRUS_ORANGE_BONE_ID ||
                  action.abilityId === PAPYRUS_LONG_BONE_ID);
              if (action.type !== "requestMoveOptions" && !preserveMode) {
                setActionMode(null);
              }
            }}
            papyrusLineAxis={papyrusLineAxis}
            onSetPapyrusLineAxis={setPapyrusLineAxis}
          />
          <EventLog events={events} clientLog={clientLog} />
        </div>
      </div>
      {pendingRoll && playerId && !boardSelectionPending && (
        <PendingRollModal
          pendingRoll={pendingRoll}
          view={view}
          showAttackerRoll={showAttackerRoll}
          attackerDice={attackerDice}
          tieBreakAttacker={tieBreakAttacker}
          isForestMoveCheck={isForestMoveCheck}
          isForestChoice={isForestChoice}
          isDuelistChoice={isDuelistChoice}
          isAsgoreBraveryDefenseChoice={isAsgoreBraveryDefenseChoice}
          isLokiLaughtChoice={isLokiLaughtChoice}
          isFriskPacifismChoice={isFriskPacifismChoice}
          isFriskGenocideChoice={isFriskGenocideChoice}
          isFriskKeenEyeChoice={isFriskKeenEyeChoice}
          isFriskSubstitutionChoice={isFriskSubstitutionChoice}
          isFriskChildsCryChoice={isFriskChildsCryChoice}
          isOdinMuninnDefenseChoice={isOdinMuninnDefenseChoice}
          isChikatiloRevealChoice={isChikatiloRevealChoice}
          isChikatiloDecoyChoice={isChikatiloDecoyChoice}
          isBerserkerDefenseChoice={isBerserkerDefenseChoice}
          lokiLaughtCurrent={lokiLaughtCurrent}
          lokiCanAgainSomeNonsense={lokiCanAgainSomeNonsense}
          lokiCanChicken={lokiCanChicken}
          lokiCanMindControl={lokiCanMindControl}
          lokiCanSpinTheDrum={lokiCanSpinTheDrum}
          lokiCanGreatLokiJoke={lokiCanGreatLokiJoke}
          lokiLaughtChickenOptions={lokiLaughtChickenOptions}
          lokiLaughtMindControlEnemyOptions={lokiLaughtMindControlEnemyOptions}
          lokiLaughtSpinCandidateIds={lokiLaughtSpinCandidateIds}
          friskPacifismPoints={friskPacifismPoints}
          friskPacifismDisabled={friskPacifismDisabled}
          friskPacifismHugsOptions={friskPacifismHugsOptions}
          friskPacifismWarmWordsOptions={friskPacifismWarmWordsOptions}
          friskPacifismPowerOfFriendshipEnabled={
            friskPacifismPowerOfFriendshipEnabled
          }
          friskGenocidePoints={friskGenocidePoints}
          friskKeenEyeTargetIds={friskKeenEyeTargetIds}
          defenderFriskGenocidePoints={defenderFriskGenocidePoints}
          defenderFriskPacifismPoints={defenderFriskPacifismPoints}
          defenderBerserkCharges={defenderBerserkCharges}
          defenderMuninnCharges={defenderMuninnCharges}
          defenderAsgoreBraveryReady={defenderAsgoreBraveryReady}
          decoyCharges={decoyCharges}
          duelistAttackerHp={duelistAttackerHp}
          onResolvePendingRoll={(choice) => {
            if (choice === undefined) {
              sendAction({
                type: "resolvePendingRoll",
                pendingRollId: pendingRoll.id,
              } as GameAction);
              return;
            }
            sendAction({
              type: "resolvePendingRoll",
              pendingRollId: pendingRoll.id,
              choice,
            } as GameAction);
          }}
        />
      )}
    </div>
  );
}
