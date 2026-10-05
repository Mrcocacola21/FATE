import type { AbilityKind, TurnSlot } from "../model";

export interface AbilityCost {
  consumes?: Partial<Record<TurnSlot, boolean>>;
}

export interface AbilitySpec {
  id: string;
  displayName: string;
  kind: AbilityKind;
  description: string;
  targetRange?: number;
  /** Accumulation cap; does not by itself define the activation cost. */
  maxCharges?: number;
  /** Activation requirement and amount spent, resolved by getAbilityChargeCost. */
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
