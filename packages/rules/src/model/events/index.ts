import { EVENT_VISIBILITY, type EventVisibility } from "./visibility";
import type { CoreGameEvent } from "./core";
import type { HeroGameEvent } from "./heroes";
import type { CombatVisualEventMetadata } from "../roll";
import type { ReactionSource } from "../reactions";
import type { AbilityEventMetadata } from "../semantic";

export type ReactionGameEvent =
  | { type: "reactionOpportunity"; source: ReactionSource; reactorUnitId: string; targetUnitIds: string[] }
  | { type: "reactionChoiceResolved"; source: ReactionSource; reactorUnitId: string; choice: "attack" | "pass"; targetUnitId?: string }
  | { type: "reactionMovementResumed"; source: ReactionSource; controllerUnitId: string };

export type GameEvent = (CoreGameEvent | HeroGameEvent | ReactionGameEvent) & CombatVisualEventMetadata & AbilityEventMetadata & { [EVENT_VISIBILITY]?: EventVisibility };

export type { CoreGameEvent } from "./core";
export type { HeroGameEvent } from "./heroes";

export type { ProjectedGameEvent } from "./projected";
