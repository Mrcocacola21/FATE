import type { Coord } from "../../../model";

export type TyrantAttempt = { targetId: string; moveTo: Coord };

export type TyrantChainState = {
  groznyId: string;
  kills: number;
  remaining: number;
};
