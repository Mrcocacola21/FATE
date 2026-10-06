import type { GameEvent } from "./index";
import type { CombatVisualEventMetadata } from "../roll";
import type { EVENT_VISIBILITY } from "./visibility";

type StripInternal<T> = T extends GameEvent ? Omit<T, typeof EVENT_VISIBILITY> : never;
type PayloadEvent = StripInternal<GameEvent>;
type EventOf<T extends GameEvent["type"]> = Extract<PayloadEvent, { type: T }>;
type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Recipient payloads. Only the fields explicitly redacted by policy are optional. */
export type ProjectedGameEvent =
  | Exclude<
      PayloadEvent,
      {
        type:
          | "aoeResolved"
          | "attackResolved"
          | "unitDied"
          | "stakeTriggered"
          | "carpetStrikeCenter"
          | "carpetStrikeAttackRolled";
      }
    >
  | OptionalFields<EventOf<"aoeResolved">, "sourceUnitId">
  | OptionalFields<EventOf<"attackResolved">, "attackerId">
  | OptionalFields<EventOf<"unitDied">, "killerId">
  | Omit<EventOf<"stakeTriggered">, "stakeIdsRevealed">
  | OptionalFields<EventOf<"carpetStrikeCenter">, "unitId">
  | OptionalFields<EventOf<"carpetStrikeAttackRolled">, "unitId">
  | ({ type: "eventRedacted" } & CombatVisualEventMetadata);
