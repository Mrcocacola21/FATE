import type { PlayerId } from "../model";
import { createDefaultArmy } from "../actions/armyActions";

export function createClassicArmy(player: PlayerId) {
  return createDefaultArmy(player);
}
