import type { Coord, StealthRevealReason } from "../model";

export interface AttackRollContext extends Record<string, unknown> {
  attackerId: string;
  defenderId: string;
  ignoreRange?: boolean;
  ignoreStealth?: boolean;
  revealStealthedAllies?: boolean;
  revealReason?: StealthRevealReason;
  damageBonus?: number;
  damageBonusSourceId?: string;
  attackerDice?: number[];
  defenderDice?: number[];
  tieBreakAttacker?: number[];
  tieBreakDefender?: number[];
  stage?: "initial" | "tieBreak";
  berserkerChoiceMade?: boolean;
  chikatiloDecoyChoiceMade?: boolean;
  consumeSlots?: boolean;
  queueKind?: "normal" | "riderPath" | "aoe";
  elCidDuelist?: {
    attackerId: string;
    targetId: string;
  };
  tyrant?: {
    groznyId: string;
    kills: number;
    remaining: number;
  };
}

export interface TricksterAoEContext extends Record<string, unknown> {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
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

export type IntimidateResume =
  | { kind: "none" }
  | { kind: "combatQueue" }
  | { kind: "tricksterAoE"; context: Record<string, unknown> }
  | { kind: "doraAoE"; context: Record<string, unknown> }
  | { kind: "carpetStrike"; context: Record<string, unknown> }
  | { kind: "forestAoE"; context: Record<string, unknown> }
  | { kind: "elCidTisonaAoE"; context: Record<string, unknown> }
  | { kind: "elCidKoladaAoE"; context: Record<string, unknown> }
  | { kind: "falseTrailExplosion"; context: Record<string, unknown> }
  | { kind: "elCidDuelist"; context: Record<string, unknown> };
