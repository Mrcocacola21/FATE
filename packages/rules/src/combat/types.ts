import type { GameState, StealthRevealReason, UnitState } from "../model";

export interface ResolveAttackParams {
  attackerId: string;
  defenderId: string;
  allowFriendlyTarget?: boolean;
  rangedAttack?: boolean;
  defenderUseBerserkAutoDefense?: boolean;
  defenderUseMuninnAutoDefense?: boolean;
  ignoreRange?: boolean;
  ignoreStealth?: boolean;
  revealStealthedAllies?: boolean;
  revealReason?: StealthRevealReason;
  damageBonus?: number;
  damageOverride?: number;
  ignoreBonuses?: boolean;
  autoHit?: boolean;
  forceMiss?: boolean;
  rolls?: {
    attackerDice: number[];
    defenderDice: number[];
    tieBreakAttacker?: number[];
    tieBreakDefender?: number[];
  };
}

export interface AutoDefenseResolution {
  resolved: boolean;
  state: GameState;
  attackerAfter: UnitState;
  defenderAfter: UnitState;
  units: Record<string, UnitState>;
  events: import("../model").GameEvent[];
}

export interface HitResolution {
  attackerAfter: UnitState;
  defenderAfter: UnitState;
  units: Record<string, UnitState>;
  events: import("../model").GameEvent[];
  damage: number;
  defenderHpAfterEvent: number;
  attackerRevealedToDefender: boolean;
  revealedAttackerPos: import("../model").Coord | null;
}
