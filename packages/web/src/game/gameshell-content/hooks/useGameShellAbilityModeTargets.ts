import { useMemo } from "react";
import type { Coord } from "rules";
import { getDoraTargetCenters, getUnitAt, coordKey } from "../helpers";

interface UseGameShellAbilityModeTargetsParams {
  view: any;
  effectiveActionMode: any;
  selectedUnit: any;
}

export function useGameShellAbilityModeTargets({
  view,
  effectiveActionMode,
  selectedUnit,
}: UseGameShellAbilityModeTargetsParams) {
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

  const mettatonLineTargets = useMemo(() => {
    if (
      !view ||
      (effectiveActionMode !== "mettatonPoppins" &&
        effectiveActionMode !== "mettatonLaser" &&
        effectiveActionMode !== "sansGasterBlaster") ||
      !selectedUnit?.position
    ) {
      return [] as Coord[];
    }
    return getDoraTargetCenters(view, selectedUnit.id);
  }, [view, effectiveActionMode, selectedUnit]);

  const mettatonLineTargetKeys = useMemo(
    () => new Set(mettatonLineTargets.map(coordKey)),
    [mettatonLineTargets]
  );

  const undyneEnergySpearTargets = useMemo(() => {
    if (!view || effectiveActionMode !== "undyneEnergySpear") {
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

  const undyneEnergySpearTargetKeys = useMemo(
    () => new Set(undyneEnergySpearTargets.map(coordKey)),
    [undyneEnergySpearTargets]
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

  return {
    doraTargetCenters,
    doraTargetKeys,
    jebeHailTargetCenters,
    jebeHailTargetKeys,
    mettatonLineTargets,
    mettatonLineTargetKeys,
    undyneEnergySpearTargets,
    undyneEnergySpearTargetKeys,
    kaladinFifthTargetCenters,
    kaladinFifthTargetKeys,
    tisonaTargetCells,
    tisonaTargetKeys,
    invadeTimeTargets,
    invadeTimeKeys,
  };
}
