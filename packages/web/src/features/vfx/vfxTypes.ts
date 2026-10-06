import type { Coord, GameEvent, PlayerView } from "rules";

export type VfxEffectId =
  | "searchReveal"
  | "hiddenReveal"
  | "markApply"
  | "storm"
  | "soulParade"
  | "fireParade"
  | "shield"
  | "portal"
  | "phantasm"
  | "phantasmTrace"
  | "chicken"
  | "transformation"
  | "stageSpark"
  | "boat"
  | "tralala"
  | "muzzle"
  | "snareExplosion"
  | "berserkAoE";

export type VfxPlacement = "cell" | "unit" | "area" | "line" | "path";

export type BoardVfxRequest = {
  id: string;
  effectId: VfxEffectId;
  placement: VfxPlacement;
  sourceCell?: Coord;
  targetCell?: Coord;
  cells?: Coord[];
  path?: Coord[];
  unitId?: string;
  durationMs?: number;
  delayMs?: number;
  scaleCells?: number;
  opacity?: number;
};

export type QueuedBoardVfxRequest = BoardVfxRequest & {
  startedAt: number;
  expiresAt: number;
};

export type BoardVfxEventBatch = import("../../game/effects/types").BoardEventBatch;

export type VisibleUnitPositions = Record<string, Coord>;

export interface VfxMapperContext {
  view: PlayerView;
  previousPositions: VisibleUnitPositions;
  revision: number;
  presentationId?: string;
  events: GameEvent[];
  eventIndex: number;
}
