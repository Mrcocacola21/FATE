import type { PlayerView, ProjectedGameEvent } from "rules";
import type { PresentationEvent } from "./types";

export function isFinalPresentationDeath(events: readonly ProjectedGameEvent[], index: number, view: PlayerView): boolean {
  const event = events[index];
  if (event?.type !== "unitDied") return false;
  if (view.units[event.unitId]?.donMadDelusionPending) return false;
  for (const later of events.slice(index + 1)) {
    if (later.type === "unitDied" && later.unitId === event.unitId) break;
    if (later.type === "unitTransformed" && later.unitId === event.unitId && later.reason === "griffithFemtoRebirth") return false;
    if (later.type === "abilityUsed" && later.unitId === event.unitId &&
      (later.abilityId === "undyneUndying" || later.abilityId === "donKihoteMadness")) return false;
  }
  return true;
}

/** Normalize the semantic completion onto existing death playback/audio consumers. */
export function finalDeathPresentationEvents(events: PresentationEvent[], view: PlayerView): PresentationEvent[] {
  return events.flatMap((event, index): PresentationEvent[] => {
    if (event.type === "unitDied" && !isFinalPresentationDeath(events, index, view)) return [];
    if (event.type !== "unitDeathFinalized") return [event];
    const { sourceCell, ...identity } = event;
    return [{ ...identity, type: "unitDied", killerId: null, deathCell: sourceCell }];
  });
}
