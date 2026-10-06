import type { Coord, GameEvent } from "rules";

export type CellEffectTone =
  | "attack"
  | "heal"
  | "move"
  | "status"
  | "warning"
  | "boneBlue"
  | "boneOrange";
export type AreaEffectTone = "aoe" | "danger" | "safe";
export type BeamEffectTone = "attack" | "magic";
export type FloatingTextTone = "damage" | "heal" | "miss" | "status" | "boneBlue" | "boneOrange";
export type UnitFlashTone = "hit" | "heal" | "defend" | "buff" | "debuff";
export type BoardPulseTone = "danger" | "magic" | "status";
export type MovementTrailTone = "move" | "teleport" | "push";

export type EffectLabel =
  | "miss"
  | "dodge"
  | "blocked"
  | "status"
  | "revealed"
  | "defeated"
  | "ability"
  | "blueBone"
  | "orangeBone";

interface TimedBoardEffect {
  durationMs?: number;
  delayMs?: number;
}

export type BoardEffect =
  | (TimedBoardEffect & {
      kind: "cellPulse";
      cells: Coord[];
      tone: CellEffectTone;
    })
  | (TimedBoardEffect & {
      kind: "areaHighlight";
      cells: Coord[];
      tone: AreaEffectTone;
    })
  | (TimedBoardEffect & {
      kind: "beam";
      from: Coord;
      to: Coord;
      tone: BeamEffectTone;
    })
  | (TimedBoardEffect & {
      kind: "movementTrail";
      path: Coord[];
      tone?: MovementTrailTone;
    })
  | (TimedBoardEffect & {
      kind: "floatingText";
      coord: Coord;
      text?: string;
      label?: EffectLabel;
      tone: FloatingTextTone;
    })
  | (TimedBoardEffect & {
      kind: "unitFlash";
      unitId: string;
      coord?: Coord;
      tone: UnitFlashTone;
    })
  | (TimedBoardEffect & {
      kind: "boardPulse";
      tone: BoardPulseTone;
    });

export type QueuedBoardEffect = BoardEffect & {
  id: string;
  startedAt: number;
  expiresAt: number;
};

export type PresentationEvent = GameEvent & { eventId?: string };

export interface BoardEventBatch {
  presentationToken?: import("./presentationSession").PresentationToken;
  receivedAt?: number;
  streamId?: string;
  revision: number;
  /** Local preview namespace; never used as a live ordering watermark. */
  previewId?: string;
  /** Snapshot at ingress, for ordered batches received before a React commit. */
  view?: import("rules").PlayerView;
  events: PresentationEvent[];
  /** Client-only deterministic playback offsets. Never sent to the rules engine. */
  eventDelaysMs?: number[];
}

export interface BoardPreviewLine {
  from: Coord;
  to: Coord;
  tone: BeamEffectTone;
}

export type VisibleUnitPositions = Record<string, Coord>;
