import type { Coord, PapyrusLineAxis } from "../../../model";

export interface LinePayload {
  target?: Coord;
  axis?: PapyrusLineAxis;
}

export interface LongBonePayload {
  enabled?: boolean;
  axis?: PapyrusLineAxis;
}
