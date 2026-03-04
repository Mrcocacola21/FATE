import type { AbilityKind, TurnSlot } from "../model";

export interface AbilityCost {
  consumes?: Partial<Record<TurnSlot, boolean>>;
}

export interface AbilitySpec {
  id: string;
  displayName: string;
  kind: AbilityKind;
  description: string;
  maxCharges?: number;
  chargesPerUse?: number;
  chargeCost?: number;
  isSpecialCounter?: boolean;
  startsFull?: boolean;
  startsCharged?: boolean;
  resetsChargesOnUse?: boolean;
  actionCost?: AbilityCost;
  chargeUnlimited?: boolean;
  triggerCharges?: number;
}
