export type PlayerId = "P1" | "P2";

export type TurnSlot = "move" | "attack" | "action" | "stealth";

export type AbilityKind = "passive" | "active" | "impulse" | "phantasm";
export type AbilitySlot = "none" | "action" | "move" | "attack" | "stealth";

export type AbilityUseSource =
  | { type: "abilityCounter"; counterId: string }
  | { type: "heroResource"; resourceId: string; amount: number }
  | { type: "freeImpulse" };

export interface AbilityUseOptionView {
  id: string;
  source: AbilityUseSource;
  sourceName: string;
  currentCharges?: number;
  chargeRequired?: number;
  consumes?: {
    action?: boolean;
    move?: boolean;
    attack?: boolean;
    stealth?: boolean;
  };
  isAvailable: boolean;
  disabledReason?: string;
}

export interface AbilityTargetingView {
  targetIds?: string[];
  cells?: Coord[];
  destinationsByTargetId?: Record<string, Coord[]>;
  modes?: {
    line?: { cells: Coord[] };
    aroundSelf?: { cells: Coord[] };
  };
}

export interface AbilityView {
  id: string;
  name: string;
  kind: AbilityKind;
  description: string;
  slot: AbilitySlot;
  targetRange?: number;
  chargeRequired?: number;
  maxCharges?: number;
  chargeUnlimited?: boolean;
  /** Hero-wide currency/resource, distinct from this ability's ordinary counter. */
  isSpecialCounter?: boolean;
  currentCharges?: number;
  isAvailable: boolean;
  disabledReason?: string;
  useOptions?: AbilityUseOptionView[];
  targeting?: AbilityTargetingView;
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

export type GameOverReason =
  | "allEnemyUnitsDefeated"
  | "surrender"
  | "disconnect"
  | "debug"
  | "unknown";

export interface GameOverResult {
  winnerPlayerId: PlayerId;
  loserPlayerId: PlayerId;
  reason: GameOverReason;
  /** Stamped by the authoritative server; zero in standalone rules simulations. */
  endedAtRevision: number;
  endedAtTurn?: number;
}

export interface UnitDefinition {
  class: UnitClass;
  maxHp: number;
  baseAttack: number;
  canStealth: boolean;
  maxStealthTurns?: number;
}
