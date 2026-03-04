import type { Coord, PapyrusBoneType, PapyrusLineAxis } from "../../../model";

export interface LinePayload {
  target?: Coord;
  axis?: PapyrusLineAxis;
}

export interface OrangeBonePayload {
  enabled?: boolean;
  boneType?: PapyrusBoneType;
}

export interface LongBonePayload {
  enabled?: boolean;
  axis?: PapyrusLineAxis;
}
