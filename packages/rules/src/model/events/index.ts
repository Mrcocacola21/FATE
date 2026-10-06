import type { CoreGameEvent } from "./core";
import type { HeroGameEvent } from "./heroes";
import type { CombatVisualEventMetadata } from "../roll";
import type { ReactionSource } from "../reactions";

export type ReactionGameEvent =
  | { type: "reactionOpportunity"; source: ReactionSource; reactorUnitId: string; targetUnitIds: string[] }
  | { type: "reactionChoiceResolved"; source: ReactionSource; reactorUnitId: string; choice: "attack" | "pass"; targetUnitId?: string }
  | { type: "reactionMovementResumed"; source: ReactionSource; controllerUnitId: string };

export type GameEvent = (CoreGameEvent | HeroGameEvent | ReactionGameEvent) & CombatVisualEventMetadata;

export type { CoreGameEvent } from "./core";
export type { HeroGameEvent } from "./heroes";
