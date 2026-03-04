import type { Coord, GameAction } from "../../model";

export type MoveActionInternal = Extract<GameAction, { type: "move" }> & {
  __forestBypass?: true;
};

export type ForestRestrictionKind = "exit" | "cross";

export interface ForestRestrictionContext {
  kind: ForestRestrictionKind;
  fallbackOptions: Coord[];
}
