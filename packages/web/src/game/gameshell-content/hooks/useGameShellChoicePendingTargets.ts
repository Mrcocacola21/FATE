import { useMemo } from "react";
import type { Coord } from "rules";
import { FRISK_GENOCIDE_ID, FRISK_PACIFISM_ID, LOKI_LAUGHT_ID } from "../../../rulesHints";
import { coordKey } from "../helpers";

interface UseGameShellChoicePendingTargetsParams {
  view: any;
  pendingRoll: any;
  isFriskPacifismChoice: boolean;
  isFriskPacifismHugsTargetChoice: boolean;
  isFriskWarmWordsTargetChoice: boolean;
  isFriskGenocideChoice: boolean;
  isFriskKeenEyeChoice: boolean;
  isLokiLaughtChoice: boolean;
  isLokiChickenTargetChoice: boolean;
  isLokiMindControlEnemyChoice: boolean;
  isLokiMindControlTargetChoice: boolean;
}

export function useGameShellChoicePendingTargets({
  view,
  pendingRoll,
  isFriskPacifismChoice,
  isFriskPacifismHugsTargetChoice,
  isFriskWarmWordsTargetChoice,
  isFriskGenocideChoice,
  isFriskKeenEyeChoice,
  isLokiLaughtChoice,
  isLokiChickenTargetChoice,
  isLokiMindControlEnemyChoice,
  isLokiMindControlTargetChoice,
}: UseGameShellChoicePendingTargetsParams) {
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

  return {
    friskPacifismPoints,
    friskPacifismDisabled,
    friskPacifismHugsOptions,
    friskPacifismWarmWordsOptions,
    friskPacifismPowerOfFriendshipEnabled,
    friskPacifismHugsTargetIds,
    friskPacifismHugsTargetKeys,
    friskWarmWordsTargetIds,
    friskWarmWordsTargetKeys,
    friskGenocidePoints,
    friskKeenEyeTargetIds,
    lokiLaughtCurrent,
    lokiLaughtChickenOptions,
    lokiLaughtMindControlEnemyOptions,
    lokiLaughtSpinCandidateIds,
    lokiCanAgainSomeNonsense,
    lokiCanChicken,
    lokiCanMindControl,
    lokiCanSpinTheDrum,
    lokiCanGreatLokiJoke,
    lokiChickenTargetIds,
    lokiChickenTargetKeys,
    lokiMindControlEnemyIds,
    lokiMindControlEnemyKeys,
    lokiMindControlTargetIds,
    lokiMindControlTargetKeys,
  };
}
