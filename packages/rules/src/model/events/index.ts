import type { CoreGameEvent } from "./core";
import type { HeroGameEvent } from "./heroes";
import type { CombatVisualEventMetadata } from "../roll";

export type GameEvent = (CoreGameEvent | HeroGameEvent) & CombatVisualEventMetadata;

export type { CoreGameEvent } from "./core";
export type { HeroGameEvent } from "./heroes";
