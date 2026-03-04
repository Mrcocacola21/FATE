export type PlayerId = "P1" | "P2";

export type TurnSlot = "move" | "attack" | "action" | "stealth";

export type AbilityKind = "passive" | "active" | "impulse" | "phantasm";
export type AbilitySlot = "none" | "action" | "move" | "attack" | "stealth";

export interface AbilityView {
  id: string;
  name: string;
  kind: AbilityKind;
  description: string;
  slot: AbilitySlot;
  chargeRequired?: number;
  maxCharges?: number;
  chargeUnlimited?: boolean;
  currentCharges?: number;
  isAvailable: boolean;
  disabledReason?: string;
}

export interface TurnEconomy {
  moveUsed: boolean;
  attackUsed: boolean;
  actionUsed: boolean;
  stealthUsed: boolean;
}

export type UnitClass =
  | "spearman"
  | "rider"
  | "trickster"
  | "assassin"
  | "berserker"
  | "archer"
  | "knight";

export type MoveMode = "normal" | UnitClass;

export interface Coord {
  col: number;
  row: number;
}

export interface PendingMove {
  unitId: string;
  roll?: number;
  legalTo: Coord[];
  expiresTurnNumber: number;
  mode?: MoveMode;
}

export type GamePhase = "lobby" | "placement" | "battle" | "ended";

export interface UnitDefinition {
  class: UnitClass;
  maxHp: number;
  baseAttack: number;
  canStealth: boolean;
  maxStealthTurns?: number;
}
