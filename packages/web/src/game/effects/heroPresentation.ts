import {
  ABILITY_KAISER_DORA,
  ABILITY_KAISER_CARPET_STRIKE,
  ABILITY_VLAD_FOREST,
} from "../../rulesHints";
import type { ProjectedGameEvent } from "rules";

/** Identity and geometry come exclusively from recipient-projected semantics. */
export function heroAoeEffect(abilityId: string | undefined) {
  switch (abilityId) {
    case ABILITY_KAISER_DORA:
      return "doraImpact" as const;
    case ABILITY_KAISER_CARPET_STRIKE:
      return "carpetImpact" as const;
    case ABILITY_VLAD_FOREST:
      return "forestEruption" as const;
    case "asgoreFireParade":
      return "fireParade" as const;
    default:
      return null;
  }
}

type CorrelatedEvent = Exclude<ProjectedGameEvent, { type: "eventRedacted" }>;
export function sameAbilityResolution(a: CorrelatedEvent, b: CorrelatedEvent): boolean {
  if (a.abilityUseId && b.abilityUseId) return a.abilityUseId === b.abilityUseId;
  const aChain = a.chainId ?? a.visualBatchId;
  const bChain = b.chainId ?? b.visualBatchId;
  return Boolean(aChain && bChain && aChain === bChain);
}

export function heroCueId(
  namespace: string | number,
  event: ProjectedGameEvent & { eventId?: string },
  stage: string,
): string {
  const useId = "abilityUseId" in event ? event.abilityUseId : undefined;
  return `${namespace}:hero:${useId ?? event.eventId ?? "preview"}:${stage}`;
}
