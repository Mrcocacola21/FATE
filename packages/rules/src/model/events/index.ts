import type { CoreGameEvent } from "./core";
import type { HeroGameEvent } from "./heroes";

export type GameEvent = CoreGameEvent | HeroGameEvent;

export type { CoreGameEvent } from "./core";
export type { HeroGameEvent } from "./heroes";
