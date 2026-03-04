import type { ApplyResult, GameEvent, GameState } from "../../../../model";
import type { RNG } from "../../../../rng";
import { maybeRequestIntimidate } from "../../../../actions/heroes/vlad";
import type { AttackRollContext } from "../../../types";
import { handleElCidDuelistAfterAttack } from "./elCid";
import { handleJebeKhansShooterAfterAttack } from "./jebe";
import { advanceCombatQueue } from "./queue";
import { handleTyrantIfNeeded } from "./shared";

export function continueAfterAttackResolution(
  state: GameState,
  events: GameEvent[],
  context: AttackRollContext,
  rng: RNG
): ApplyResult {
  if (context.elCidDuelist) {
    return handleElCidDuelistAfterAttack(state, events, context);
  }
  if (context.jebeKhansShooter) {
    return handleJebeKhansShooterAfterAttack(state, events, context);
  }

  const tyrant = handleTyrantIfNeeded(state, events, context, rng);
  if (tyrant.requested) {
    return { state: tyrant.state, events: tyrant.events };
  }

  const intimidate = maybeRequestIntimidate(
    tyrant.state,
    context.attackerId,
    context.defenderId,
    tyrant.events,
    { kind: "combatQueue" }
  );
  if (intimidate.requested) {
    return { state: intimidate.state, events: intimidate.events };
  }
  return advanceCombatQueue(tyrant.state, tyrant.events);
}
