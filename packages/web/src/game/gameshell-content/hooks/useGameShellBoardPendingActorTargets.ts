import { useMemo } from "react";
import type { Coord } from "rules";
import { coordKey } from "../helpers";

interface UseGameShellBoardPendingActorTargetsParams {
  view: any;
  pendingRoll: any;
  isJebeKhansShooterTargetChoice: boolean;
  isHassanTrueEnemyTargetChoice: boolean;
  isAsgoreSoulParadePatienceTargetChoice: boolean;
  isAsgoreSoulParadePerseveranceTargetChoice: boolean;
  isAsgoreSoulParadeJusticeTargetChoice: boolean;
  isAsgoreSoulParadeIntegrityDestination: boolean;
  isHassanAssassinOrderSelection: boolean;
}

export function useGameShellBoardPendingActorTargets({
  view,
  pendingRoll,
  isJebeKhansShooterTargetChoice,
  isHassanTrueEnemyTargetChoice,
  isAsgoreSoulParadePatienceTargetChoice,
  isAsgoreSoulParadePerseveranceTargetChoice,
  isAsgoreSoulParadeJusticeTargetChoice,
  isAsgoreSoulParadeIntegrityDestination,
  isHassanAssassinOrderSelection,
}: UseGameShellBoardPendingActorTargetsParams) {
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
    if (!Array.isArray(ctx?.options)) return [] as Coord[];
    return ctx.options.filter(
      (value): value is Coord =>
        !!value &&
        typeof value === "object" &&
        typeof (value as { col?: unknown }).col === "number" &&
        typeof (value as { row?: unknown }).row === "number"
    );
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

  return {
    jebeKhansShooterTargetIds,
    jebeKhansShooterTargetKeys,
    hassanTrueEnemyTargetIds,
    hassanTrueEnemyTargetKeys,
    asgorePatienceTargetIds,
    asgorePatienceTargetKeys,
    asgorePerseveranceTargetIds,
    asgorePerseveranceTargetKeys,
    asgoreJusticeTargetIds,
    asgoreJusticeTargetKeys,
    asgoreIntegrityDestinationOptions,
    asgoreIntegrityDestinationKeys,
    hassanAssassinOrderEligibleIds,
    hassanAssassinOrderEligibleKeys,
  };
}
