import type { GameEvent } from "./index";
import type { CombatVisualEventMetadata } from "../roll";
import type { EVENT_VISIBILITY } from "./visibility";
import type { MovementProvenance } from "../semantic";

export type ProjectedMovementProvenance = Exclude<MovementProvenance, { kind: "ability" }>
  | { kind: "ability"; abilityId?: string; movementKind?: "teleport" };

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
          | "unitMoved"
          | "rollResolved"
          | "stakeTriggered"
          | "carpetStrikeCenter"
          | "carpetStrikeAttackRolled"
          | "heroSelfCost"
          | "unitHealed"
          | "papyrusBonePunished"
          | "sansBoneFieldPunished"
          | "sansLastAttackTick"
          | "lechyStormRollResult";
      }
    >
  | OptionalFields<EventOf<"aoeResolved">, "sourceUnitId">
  | OptionalFields<
      EventOf<"attackResolved">,
      "attackerId" | "sourceCell" | "targetCell" | "defenderHpAfter"
    >
  | OptionalFields<EventOf<"heroSelfCost">, "hpAfter">
  | OptionalFields<EventOf<"unitHealed">, "hpAfter">
  | OptionalFields<EventOf<"papyrusBonePunished">, "hpAfter">
  | OptionalFields<EventOf<"sansBoneFieldPunished">, "hpAfter">
  | OptionalFields<EventOf<"sansLastAttackTick">, "hpAfter">
  | OptionalFields<EventOf<"lechyStormRollResult">, "hpAfter">
  | OptionalFields<EventOf<"unitDied">, "killerId">
  | (Omit<EventOf<"unitMoved">, "provenance"> & { provenance: ProjectedMovementProvenance })
  | OptionalFields<EventOf<"rollResolved">, "rollIndex">
  | Omit<EventOf<"stakeTriggered">, "stakeIdsRevealed">
  | OptionalFields<EventOf<"carpetStrikeCenter">, "unitId">
  | OptionalFields<EventOf<"carpetStrikeAttackRolled">, "unitId">
  | ({ type: "eventRedacted" } & CombatVisualEventMetadata);
