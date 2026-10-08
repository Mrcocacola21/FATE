import type { PlayerView, ProjectedGameEvent } from "rules";
import { ASGORE_FIREBALL_ID, ASGORE_FIRE_PARADE_ID } from "../../rulesHints";

export const FIREBALL_TIMING = { castMs: 125, travelMs: 400, impactMs: 700 } as const;
export const FIRE_PARADE_TIMING = { outcomesMs: 300, endMs: 1200 } as const;

/** Missing/private correlation deliberately falls back to generic combat. */
export function isFireballResolution<T extends ProjectedGameEvent>(
  event: T | undefined,
): event is T &
  Extract<ProjectedGameEvent, { type: "attackResolved" }> & {
    abilityId: typeof ASGORE_FIREBALL_ID;
    abilityUseId: string;
  } {
  return (
    event?.type === "attackResolved" &&
    event.abilityId === ASGORE_FIREBALL_ID &&
    Boolean(event.abilityUseId)
  );
}

/** A fresh semantic delta proves the crossing; renders/snapshots cannot trigger it.
 * Automatic Soul Parade has no manual ready button, so it gets only its reveal. */
export function asgoreReadyAbilities(event: ProjectedGameEvent, view: PlayerView): string[] {
  if (event.type !== "chargesUpdated") return [];
  return (view.abilitiesByUnitId[event.unitId] ?? [])
    .filter((ability) => {
      if (ability.id !== ASGORE_FIREBALL_ID && ability.id !== ASGORE_FIRE_PARADE_ID) return false;
      const required = ability.chargeRequired;
      const now = event.now[ability.id];
      const delta = event.deltas[ability.id] ?? 0;
      return (
        typeof required === "number" &&
        required > 0 &&
        typeof now === "number" &&
        delta > 0 &&
        now >= required &&
        now - delta < required
      );
    })
    .map((ability) => ability.id);
}
