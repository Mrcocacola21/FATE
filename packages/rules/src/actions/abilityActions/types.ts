import type { GameAction } from "../../model";

export type UseAbilityAction = Extract<GameAction, { type: "useAbility" }>;
