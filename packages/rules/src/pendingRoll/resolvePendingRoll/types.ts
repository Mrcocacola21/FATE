import type { GameAction } from "../../model";

export type ResolvePendingRollAction = Extract<
  GameAction,
  { type: "resolvePendingRoll" }
>;

export type AutoRollChoice = "auto" | "roll" | undefined;
