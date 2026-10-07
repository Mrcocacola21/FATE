import type { Coord } from "./shared";
import type { AbilityUseContext } from "./semantic";

export type ReactionSource = "tralala" | "genghis";

export interface ReactionAttackOpportunity {
  reactorUnitId: string;
  targetUnitIds: string[];
}

/** Authoritative continuation, never projected to either player. */
export interface PendingReactionMovement extends AbilityUseContext {
  source: ReactionSource;
  controllerUnitId: string;
  targetUnitId?: string;
  path: Coord[];
  stepIndex: number;
  stepReached: boolean;
  stopped: boolean;
  processedReactorIds: string[];
  touchedReactorIds: string[];
  reactionQueue: ReactionAttackOpportunity[];
  dropDestination?: Coord;
}
