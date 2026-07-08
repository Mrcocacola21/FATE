import type { Coord } from "../../../model";

export type TyrantMode = "normal" | "invadeTime";

export type TyrantAttempt = {
  targetId: string;
  moveTo: Coord;
  mode: TyrantMode;
};

export type TyrantAttackCellOption = {
  targetId: string;
  position: Coord;
  mode: TyrantMode;
};

export interface TyrantOptionChoiceContext extends Record<string, unknown> {
  groznyId: string;
  options: TyrantMode[];
  kills: number;
  remaining: number;
  allowSkip: boolean;
}

export interface TyrantAllyChoiceContext extends Record<string, unknown> {
  groznyId: string;
  mode: TyrantMode;
  options: string[];
  kills: number;
  remaining: number;
  allowSkip: boolean;
}

export interface TyrantAttackCellChoiceContext
  extends Record<string, unknown> {
  groznyId: string;
  mode: TyrantMode;
  targetId: string;
  options: TyrantAttackCellOption[];
  kills: number;
  remaining: number;
  allowSkip: boolean;
}

export type TyrantChainState = {
  groznyId: string;
  kills: number;
  remaining: number;
};
