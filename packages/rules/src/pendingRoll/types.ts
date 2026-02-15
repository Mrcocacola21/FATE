import type { Coord, StealthRevealReason } from "../model";

export interface CarpetStrikeAoEContext extends Record<string, unknown> {
  casterId: string;
  center: Coord;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

export interface AttackRollContext extends Record<string, unknown> {
  attackerId: string;
  defenderId: string;
  allowFriendlyTarget?: boolean;
  ignoreRange?: boolean;
  ignoreStealth?: boolean;
  revealStealthedAllies?: boolean;
  revealReason?: StealthRevealReason;
  damageBonus?: number;
  damageBonusSourceId?: string;
  rangedAttack?: boolean;
  damageOverride?: number;
  ignoreBonuses?: boolean;
  attackerDice?: number[];
  defenderDice?: number[];
  tieBreakAttacker?: number[];
  tieBreakDefender?: number[];
  stage?: "initial" | "tieBreak";
  berserkerChoiceMade?: boolean;
  consumeSlots?: boolean;
  queueKind?: "normal" | "riderPath" | "aoe";
  elCidDuelist?: {
    attackerId: string;
    targetId: string;
  };
  jebeKhansShooter?: {
    casterId: string;
    remainingAttacks: number;
  };
}

export interface TricksterAoEContext extends Record<string, unknown> {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
  damageOverride?: number;
  ignoreBonuses?: boolean;
  immobilizeOnHit?: boolean;
  immobilizeSourceId?: string;
}

export interface DoraAoEContext extends Record<string, unknown> {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

export interface ForestAoEContext extends Record<string, unknown> {
  casterId: string;
  center: Coord;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

export interface ElCidAoEContext extends Record<string, unknown> {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

export interface JebeHailOfArrowsAoEContext extends Record<string, unknown> {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

export interface JebeKhansShooterRicochetContext
  extends Record<string, unknown> {
  casterId: string;
  initialTargetId: string;
}

export interface JebeKhansShooterTargetChoiceContext
  extends Record<string, unknown> {
  casterId: string;
  remainingAttacks: number;
  options: string[];
  lastTargetId?: string;
}

export interface HassanTrueEnemyTargetChoiceContext
  extends Record<string, unknown> {
  hassanId: string;
  forcedAttackerId: string;
  options: string[];
}

export interface HassanAssassinOrderSelectionContext
  extends Record<string, unknown> {
  owner: "P1" | "P2";
  hassanId: string;
  eligibleUnitIds: string[];
  queue?: ("P1" | "P2")[];
}

export interface FemtoDivineMoveRollContext extends Record<string, unknown> {
  unitId: string;
}

export interface FemtoDivineMoveDestinationContext
  extends Record<string, unknown> {
  unitId: string;
  roll: number;
  options: Coord[];
}
