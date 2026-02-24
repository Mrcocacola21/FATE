import { useEffect, useMemo } from "react";
import type { Coord, UnitState } from "rules";
import { KALADIN_ID, PAPYRUS_ID } from "../../../rulesHints";
import { coordKey, getArcherLikeTargetIds, getAttackRangeCells } from "../helpers";

interface UseGameShellCombatTargetsParams {
  view: any;
  selectedUnit: any;
  selectedUnitId: string | null;
  placeUnitId: string | null;
  effectiveActionMode: any;
  pendingMoveForSelected: any;
  moveOptions: any;
  hoverActionMode: any;
  allowActionHoverPreview: boolean;
}

export function useGameShellCombatTargets({
  view,
  selectedUnit,
  selectedUnitId,
  placeUnitId,
  effectiveActionMode,
  pendingMoveForSelected,
  moveOptions,
  hoverActionMode,
  allowActionHoverPreview,
}: UseGameShellCombatTargetsParams) {
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
  const undyneSpearThrowTargetIds = useMemo(() => {
    if (!view || !selectedUnit || effectiveActionMode !== "undyneSpearThrow") {
      return [] as string[];
    }
    return getArcherLikeTargetIds(view, selectedUnit.id);
  }, [view, selectedUnit, effectiveActionMode]);
  const undyneSpearThrowTargetKeys = useMemo(
    () =>
      new Set(
        undyneSpearThrowTargetIds
          .map((unitId) => view?.units[unitId]?.position)
          .filter((coord): coord is Coord => !!coord)
          .map(coordKey)
      ),
    [undyneSpearThrowTargetIds, view]
  );

  return {
    legalMoveCoords,
    legalPlacementCoords,
    legalAttackTargets,
    attackPreviewCells,
    papyrusLongBoneAttackTargetIds,
    assassinMarkTargetIds,
    assassinMarkTargetKeys,
    guideTravelerTargetIds,
    guideTravelerTargetKeys,
    hassanTrueEnemyCandidateIds,
    hassanTrueEnemyCandidateKeys,
    gutsRangedTargetIds,
    gutsRangedTargetKeys,
    asgoreFireballTargetIds,
    asgoreFireballTargetKeys,
    undyneSpearThrowTargetIds,
    undyneSpearThrowTargetKeys,
    selectedUnitId,
  };
}
