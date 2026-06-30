import { useMemo } from "react";
import type { Coord } from "rules";
import { coordKey, normalizeCoordList } from "../helpers";
import { useGameShellBoardPendingActorTargets } from "./useGameShellBoardPendingActorTargets";

interface UseGameShellBoardPendingTargetsParams {
  view: any;
  pendingRoll: any;
  isStakePlacement: boolean;
  stakeSelections: Coord[];
  isIntimidateChoice: boolean;
  isForestTarget: boolean;
  isForestMoveDestination: boolean;
  isFemtoDivineMoveDestination: boolean;
  isOdinSleipnirDestination: boolean;
  isChargedImpulseTargetChoice: boolean;
  isRiverBoatCarryChoice: boolean;
  isRiverBoatDropDestination: boolean;
  isRiverTraLaLaTargetChoice: boolean;
  isRiverTraLaLaDestinationChoice: boolean;
  isChikatiloPlacement: boolean;
  isGroznyTyrantAttackCellChoice: boolean;
  isGuideTravelerPlacement: boolean;
  isJebeKhansShooterTargetChoice: boolean;
  isHassanTrueEnemyTargetChoice: boolean;
  isAsgoreSoulParadePatienceTargetChoice: boolean;
  isAsgoreSoulParadePerseveranceTargetChoice: boolean;
  isAsgoreSoulParadeJusticeTargetChoice: boolean;
  isAsgoreSoulParadeIntegrityDestination: boolean;
  isHassanAssassinOrderSelection: boolean;
}

type GroznyTyrantAttackCellOption = {
  targetId: string;
  mode: "normal" | "invadeTime";
  position: Coord;
};

function isGroznyTyrantAttackCellOption(
  value: unknown
): value is GroznyTyrantAttackCellOption {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { targetId?: unknown }).targetId === "string" &&
    ((value as { mode?: unknown }).mode === "normal" ||
      (value as { mode?: unknown }).mode === "invadeTime") &&
    typeof (value as { position?: { col?: unknown } }).position?.col ===
      "number" &&
    typeof (value as { position?: { row?: unknown } }).position?.row ===
      "number"
  );
}

export function useGameShellBoardPendingTargets({
  view,
  pendingRoll,
  isStakePlacement,
  stakeSelections,
  isIntimidateChoice,
  isForestTarget,
  isForestMoveDestination,
  isFemtoDivineMoveDestination,
  isOdinSleipnirDestination,
  isChargedImpulseTargetChoice,
  isRiverBoatCarryChoice,
  isRiverBoatDropDestination,
  isRiverTraLaLaTargetChoice,
  isRiverTraLaLaDestinationChoice,
  isChikatiloPlacement,
  isGroznyTyrantAttackCellChoice,
  isGuideTravelerPlacement,
  isJebeKhansShooterTargetChoice,
  isHassanTrueEnemyTargetChoice,
  isAsgoreSoulParadePatienceTargetChoice,
  isAsgoreSoulParadePerseveranceTargetChoice,
  isAsgoreSoulParadeJusticeTargetChoice,
  isAsgoreSoulParadeIntegrityDestination,
  isHassanAssassinOrderSelection,
}: UseGameShellBoardPendingTargetsParams) {
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
  const odinSleipnirOptions = useMemo(() => {
    if (!isOdinSleipnirDestination) return [] as Coord[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    return normalizeCoordList(ctx?.options);
  }, [isOdinSleipnirDestination, pendingRoll]);
  const odinSleipnirKeys = useMemo(
    () => new Set(odinSleipnirOptions.map(coordKey)),
    [odinSleipnirOptions]
  );
  const chargedImpulseTargetOptions = useMemo(() => {
    if (!isChargedImpulseTargetChoice) return [] as Coord[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    return normalizeCoordList(ctx?.options);
  }, [isChargedImpulseTargetChoice, pendingRoll]);
  const chargedImpulseTargetKeys = useMemo(
    () => new Set(chargedImpulseTargetOptions.map(coordKey)),
    [chargedImpulseTargetOptions]
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

  const groznyTyrantAttackCellOptions = useMemo(() => {
    if (!isGroznyTyrantAttackCellChoice) return [] as GroznyTyrantAttackCellOption[];
    const ctx = pendingRoll?.context as { options?: unknown } | undefined;
    if (!Array.isArray(ctx?.options)) return [] as GroznyTyrantAttackCellOption[];
    return ctx.options.filter(isGroznyTyrantAttackCellOption);
  }, [isGroznyTyrantAttackCellChoice, pendingRoll]);
  const groznyTyrantAttackCellKeys = useMemo(
    () =>
      new Set(
        groznyTyrantAttackCellOptions.map((option) =>
          coordKey(option.position)
        )
      ),
    [groznyTyrantAttackCellOptions]
  );
  const groznyTyrantAllowSkip =
    isGroznyTyrantAttackCellChoice &&
    (pendingRoll?.context as { allowSkip?: unknown } | undefined)?.allowSkip ===
      true;

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

  const actorTargets = useGameShellBoardPendingActorTargets({
    view,
    pendingRoll,
    isJebeKhansShooterTargetChoice,
    isHassanTrueEnemyTargetChoice,
    isAsgoreSoulParadePatienceTargetChoice,
    isAsgoreSoulParadePerseveranceTargetChoice,
    isAsgoreSoulParadeJusticeTargetChoice,
    isAsgoreSoulParadeIntegrityDestination,
    isHassanAssassinOrderSelection,
  });

  return {
    stakeLimit,
    stakeLegalPositions,
    stakeLegalKeys,
    stakeSelectionKeys,
    intimidateOptions,
    intimidateKeys,
    forestTargetCenters,
    forestTargetKeys,
    forestMoveDestinationOptions,
    forestMoveDestinationKeys,
    femtoDivineMoveOptions,
    femtoDivineMoveKeys,
    odinSleipnirOptions,
    odinSleipnirKeys,
    chargedImpulseTargetOptions,
    chargedImpulseTargetKeys,
    riverBoatCarryOptionIds,
    riverBoatCarryOptionKeys,
    riverBoatDropDestinationOptions,
    riverBoatDropDestinationKeys,
    riverTraLaLaTargetIds,
    riverTraLaLaTargetKeys,
    riverTraLaLaDestinationOptions,
    riverTraLaLaDestinationKeys,
    chikatiloPlacementCoords,
    chikatiloPlacementKeys,
    groznyTyrantAttackCellOptions,
    groznyTyrantAttackCellKeys,
    groznyTyrantAllowSkip,
    guideTravelerPlacementCoords,
    guideTravelerPlacementKeys,
    ...actorTargets,
  };
}
