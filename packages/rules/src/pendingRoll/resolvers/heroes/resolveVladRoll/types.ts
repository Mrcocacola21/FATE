import type { Coord, PlayerId } from "../../../../model";
import type { IntimidateResume } from "../../../../actions/types";

export type VladIntimidateContext = {
  defenderId?: string;
  attackerId?: string;
  options?: Coord[];
  resume?: IntimidateResume;
};

export type VladPlaceStakesContext = {
  owner?: PlayerId;
  count?: number;
  reason?: "battleStart" | "turnStart";
  legalPositions?: Coord[];
  queue?: PlayerId[];
};

export type VladForestChoiceContext = {
  unitId?: string;
  owner?: PlayerId;
  canPlaceStakes?: boolean;
};

export type VladForestTargetContext = {
  unitId?: string;
  owner?: PlayerId;
};
