import type { Coord, PlayerId } from "./shared";

/** Rules identity of one committed use; unrelated to transport and roll identities. */
export type AbilityUseId = string;

export interface AbilityEventMetadata {
  abilityId?: string;
  abilityUseId?: AbilityUseId;
}

/** Authoritative continuation only. Never copied wholesale into recipient payloads. */
export interface AbilityUseContext extends AbilityEventMetadata {
  abilitySourceUnitId?: string;
  abilitySourceCell?: Coord;
  abilitySourceRecipients?: readonly (PlayerId | "spectator")[];
}

export type MovementProvenance =
  | { kind: "normal" }
  | { kind: "rider" }
  | { kind: "teleport" }
  | { kind: "boat" }
  | { kind: "tralala" }
  | {
      kind: "forced";
      cause: "intimidatingStare" | "hiddenCollision" | "court" | "moonSwap" | "donWindmills";
    }
  | { kind: "ability"; abilityId: string; movementKind?: "teleport" };
