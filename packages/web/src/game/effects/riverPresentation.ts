import type { Coord } from "rules";
import type { PresentationEvent } from "./types";
import type { BoardVfxRequest } from "../../features/vfx/vfxTypes";
import type { MovementPresentationCue } from "./movementPresentation";
import { ABILITY_RIVER_PERSON_TRA_LA_LA } from "../../rulesHints";

export const RIVER_TIMING = { pickupMs: 300, activationMs: 240, landingMs: 180 } as const;

/** Cosmetic attachment across commands. Contains only recipient-authorized identities. */
export interface TransportAttachment {
  abilityUseId: string;
  carrierId: string;
  passengerId: string;
  mode: "boat" | "tralala";
}

/** A small semantic mapper, not a second rules/route controller. No planned path input. */
export interface TransportPresentationCue {
  id: string;
  abilityUseId: string;
  eventIndex: number;
  kind:
    | "pickup"
    | "activation"
    | "travel"
    | "drop"
    | "reaction"
    | "attack"
    | "pass"
    | "resume"
    | "interrupted"
    | "completed"
    | "cancelled";
  mode: "boat" | "tralala";
  atMs: number;
  durationMs: number;
  from?: Coord;
  to?: Coord;
}

export function riverStage(event: PresentationEvent): {
  kind: TransportPresentationCue["kind"];
  mode: TransportPresentationCue["mode"];
  durationMs: number;
  from?: Coord;
  to?: Coord;
} | null {
  if (!("abilityUseId" in event) || !event.abilityUseId) return null;
  if (event.type === "riverBoatPickup")
    return {
      kind: "pickup",
      mode: "boat",
      durationMs: RIVER_TIMING.pickupMs,
      from: event.sourceCell,
    };
  if (event.type === "riverBoatDisembarked")
    return {
      kind: "drop",
      mode: "boat",
      durationMs: RIVER_TIMING.landingMs,
      from: event.riverDestination,
      to: event.dropDestination,
    };
  if (event.type === "abilityUsed" && event.abilityId === ABILITY_RIVER_PERSON_TRA_LA_LA)
    return {
      kind: "activation",
      mode: "tralala",
      durationMs: RIVER_TIMING.activationMs,
      from: event.sourceCell,
    };
  if (event.type === "reactionOpportunity" && event.source === "tralala")
    return { kind: "reaction", mode: "tralala", durationMs: 0 };
  if (event.type === "reactionChoiceResolved" && event.source === "tralala")
    return { kind: event.choice, mode: "tralala", durationMs: 0 };
  if (event.type === "reactionMovementResumed" && event.source === "tralala")
    return { kind: "resume", mode: "tralala", durationMs: 0 };
  if (event.type === "reactionMovementEnded" && event.source === "tralala")
    return { kind: event.reason, mode: "tralala", durationMs: 0 };
  if (event.type === "riverBoatDisembarkFailed")
    return { kind: "interrupted", mode: "boat", durationMs: 0 };
  return null;
}

export function riverMovementCue(
  event: PresentationEvent,
  movement: Extract<MovementPresentationCue, { kind: "movement" }>,
): Omit<TransportPresentationCue, "id" | "eventIndex" | "abilityUseId"> | null {
  if (
    !("abilityUseId" in event) ||
    !event.abilityUseId ||
    (movement.mode !== "boat" && movement.mode !== "tralala")
  )
    return null;
  if (movement.transportPhase === "drop")
    return movement.mode === "tralala"
      ? {
          kind: "drop",
          mode: movement.mode,
          atMs: movement.atMs + movement.durationMs,
          durationMs: RIVER_TIMING.landingMs,
          from: movement.from,
          to: movement.to,
        }
      : null; // Boat's explicit disembark also covers an unchanged passenger cell.
  if (movement.transportRole !== "carrier" || movement.transportPhase !== "travel") return null;
  return {
    kind: "travel",
    mode: movement.mode,
    atMs: movement.atMs,
    durationMs: movement.durationMs,
    from: movement.from,
    to: movement.to,
  };
}

export function transportCueVfx(cue: TransportPresentationCue): BoardVfxRequest[] {
  const cell = cue.kind === "drop" ? cue.to : cue.from;
  if (!cell) return [];
  if (!["pickup", "activation", "travel", "drop"].includes(cue.kind)) return [];
  return [
    {
      id: `${cue.id}:vfx`,
      effectId:
        cue.kind === "drop"
          ? "boatDrop"
          : cue.kind === "pickup"
            ? "boatPickup"
            : cue.mode === "tralala"
              ? "tralala"
              : "boat",
      placement: cue.kind === "travel" ? "projectile" : "cell",
      sourceCell: cell,
      ...(cue.kind === "travel" && cue.to ? { targetCell: cue.to } : {}),
      anchorMode: "event",
      scaleCells: cue.kind === "travel" ? 0.75 : 0.9,
      delayMs: cue.atMs,
      durationMs: cue.durationMs,
    },
  ];
}
