import type { ProjectedGameEvent } from "rules";
import { SANS_GASTER_BLASTER_ID } from "../../rulesHints";
import { heroAoeEffect } from "./heroPresentation";
import { REMAINING_AREAS } from "./remainingHeroPresentation";

/** One completed use, released by the shared chain scheduler before outcomes.
 * Manual dice remain live while the signature waits for authoritative completion.
 * Audio and artwork use these same offsets, including under reduced motion. */
export const GASTER_TIMING = {
  summonMs: 0,
  chargeMs: 100,
  fireMs: 500,
  outcomesMs: 650,
  endMs: 1350,
} as const;
export const CURSE_APPLY_LEAD_MS = 220;

export function isGasterResolution(event: ProjectedGameEvent): event is Extract<
  ProjectedGameEvent,
  { type: "aoeResolved" }
> & {
  abilityId: typeof SANS_GASTER_BLASTER_ID;
} {
  return event.type === "aoeResolved" && event.abilityId === SANS_GASTER_BLASTER_ID;
}

export function hasHeroAggregatePresentation(abilityId: string | undefined): boolean {
  return (
    Boolean(heroAoeEffect(abilityId)) ||
    Boolean(abilityId && REMAINING_AREAS[abilityId]) ||
    abilityId === SANS_GASTER_BLASTER_ID
  );
}
