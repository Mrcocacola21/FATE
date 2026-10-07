import type { Coord, ProjectedGameEvent, PlayerView } from "rules";
import { isCoord } from "../../features/vfx/vfxGeometry";
import type { BoardEffect, PresentationEvent } from "./types";
import type { BoardVfxRequest } from "../../features/vfx/vfxTypes";

export type MovementPresentationKind = "normal" | "rider" | "teleport" | "forced";
export type MovementPresentationCue = {
  id: string;
  eventIndex: number;
  atMs: number;
  durationMs: number;
} & (
  | {
      kind: "movement";
      mode: MovementPresentationKind;
      unitId: string;
      from: Coord;
      to: Coord;
      cause?: string;
    }
  | { kind: "stakePlacement"; cells: Coord[] }
  | { kind: "snarePlacement"; cells: Coord[] }
  | { kind: "stakeTrigger"; unitId: string; cell: Coord; stopped?: boolean }
  | { kind: "snareTrigger"; unitId: string; cell: Coord; stopped?: boolean }
  | { kind: "reveal"; unitId: string; cell: Coord; stopped?: boolean }
);

/** Only committed projected semantics enter this plan. No selected destination or route input. */
export interface MovementPresentationPlan {
  cues: MovementPresentationCue[];
}

export function confirmedMovement(event: ProjectedGameEvent) {
  if (event.type !== "unitMoved" && event.type !== "intimidateResolved") return null;
  const mode = event.provenance.kind;
  if (mode !== "normal" && mode !== "rider" && mode !== "teleport" && mode !== "forced")
    return null;
  if (!isCoord(event.from) || !isCoord(event.to)) return null;
  return {
    mode,
    unitId: event.type === "unitMoved" ? event.unitId : event.attackerId,
    from: { ...event.from },
    to: { ...event.to },
    ...(event.provenance.kind === "forced" ? { cause: event.provenance.cause } : {}),
  };
}

export function movementSegmentDuration(segmentCount: number, reducedMotion: boolean): number {
  return reducedMotion ? 50 : Math.min(160, 720 / Math.max(1, segmentCount));
}

export function movementCueFromEvent(params: {
  event: PresentationEvent;
  events: PresentationEvent[];
  eventIndex: number;
  namespace: string;
  atMs: number;
  durationMs: number;
  view: PlayerView;
}): MovementPresentationCue | null {
  const { event, events, eventIndex, namespace, atMs, durationMs, view } = params;
  const identity = {
    id: `${namespace}:${event.eventId ?? eventIndex}:movement`,
    eventIndex,
    atMs,
    durationMs,
  };
  const movement = confirmedMovement(event);
  if (movement) return { ...identity, kind: "movement", ...movement };
  switch (event.type) {
    case "stakesPlaced":
      return {
        ...identity,
        kind: "stakePlacement",
        cells: event.positions.filter(isCoord).map((cell) => ({ ...cell })),
      };
    case "snarePlaced":
      return isCoord(event.cell)
        ? { ...identity, kind: "snarePlacement", cells: [{ ...event.cell }] }
        : null;
    case "stakeTriggered":
      return isCoord(event.markerPos)
        ? {
            ...identity,
            kind: "stakeTrigger",
            unitId: event.unitId,
            cell: { ...event.markerPos },
            stopped: event.stopped,
          }
        : null;
    case "snareTriggered":
      return isCoord(event.cell)
        ? {
            ...identity,
            kind: "snareTrigger",
            unitId: event.unitId,
            cell: { ...event.cell },
            stopped: true,
          }
        : null;
    case "stealthRevealed": {
      // A hazard anchor authorizes the reveal cell without authorizing the earlier hidden path.
      const hazard =
        event.reason === "stakeTriggered"
          ? events.find(
              (candidate) =>
                (candidate.type === "stakeTriggered" || candidate.type === "snareTriggered") &&
                candidate.unitId === event.unitId,
            )
          : undefined;
      const priorMove = events
        .slice(0, eventIndex)
        .reverse()
        .map(confirmedMovement)
        .find((move) => move?.unitId === event.unitId);
      const nextMove = events
        .slice(eventIndex + 1)
        .map(confirmedMovement)
        .find((move) => move?.unitId === event.unitId);
      const cell =
        hazard?.type === "stakeTriggered"
          ? hazard.markerPos
          : hazard?.type === "snareTriggered"
            ? hazard.cell
            : (priorMove?.to ?? nextMove?.from ?? view.units[event.unitId]?.position);
      return isCoord(cell)
        ? { ...identity, kind: "reveal", unitId: event.unitId, cell: { ...cell } }
        : null;
    }
    default:
      return null;
  }
}

export function movementCueEffects(cue: MovementPresentationCue): BoardEffect[] {
  const timed = { delayMs: cue.atMs, durationMs: cue.durationMs };
  if (cue.kind === "movement") {
    if (cue.mode === "teleport") return []; // Endpoint portal sprites own teleport; never a line.
    return [
      {
        ...timed,
        kind: "movementTrail",
        path: [cue.from, cue.to],
        tone: cue.mode === "forced" ? "push" : "move",
      },
    ];
  }
  if (cue.kind === "stakePlacement" || cue.kind === "snarePlacement")
    return [{ ...timed, kind: "cellPulse", cells: cue.cells, tone: "status" }];
  if (cue.kind === "reveal")
    return [{ ...timed, kind: "floatingText", coord: cue.cell, label: "revealed", tone: "status" }];
  return [
    { ...timed, kind: "cellPulse", cells: [cue.cell], tone: "warning" },
    ...(cue.stopped
      ? [
          {
            ...timed,
            kind: "floatingText" as const,
            coord: cue.cell,
            label: "blocked" as const,
            tone: "status" as const,
          },
        ]
      : []),
  ];
}

export function movementCueVfx(cue: MovementPresentationCue): BoardVfxRequest[] {
  if (cue.kind === "movement") {
    if (cue.mode !== "teleport") return [];
    return [cue.from, cue.to].map((cell, index) => ({
      id: `${cue.id}:portal:${index}`,
      effectId: "portal",
      placement: "cell",
      sourceCell: cell,
      anchorMode: "event",
      scaleCells: 0.85,
      durationMs: cue.durationMs / 2,
      delayMs: cue.atMs + (index * cue.durationMs) / 2,
    }));
  }
  if (cue.kind === "stakePlacement" || cue.kind === "snarePlacement")
    return cue.cells.map((cell, index) => ({
      id: `${cue.id}:vfx:${index}`,
      effectId: cue.kind === "stakePlacement" ? "stakePlace" : "snarePlace",
      placement: "cell",
      sourceCell: cell,
      anchorMode: "event",
      delayMs: cue.atMs,
      durationMs: cue.durationMs,
      scaleCells: 0.65,
    }));
  return [
    {
      id: `${cue.id}:vfx`,
      effectId:
        cue.kind === "reveal"
          ? "hiddenReveal"
          : cue.kind === "stakeTrigger"
            ? "stakeTrigger"
            : "snareTrigger",
      placement: "cell",
      sourceCell: cue.cell,
      anchorMode: "event",
      delayMs: cue.atMs,
      durationMs: cue.durationMs,
      scaleCells: 0.8,
    },
  ];
}
