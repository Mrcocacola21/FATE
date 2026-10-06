import type { GameState, UnitState } from "../../model";
import { isKaiser } from "../shared";
import { exitBunkerForUnit } from "../heroes/kaiser";
import { markFriskAttackedWhileStealthed } from "../heroes/frisk";
import { applyMettatonStagePhenomenonOnAttackAction } from "../heroes/mettaton";

/** Basic attack preparation shared by normal and optional reaction attacks. */
export function prepareAttackAttempt(state: GameState, attacker: UnitState) {
  let workingState = markFriskAttackedWhileStealthed(state, attacker.id);
  let workingAttacker = workingState.units[attacker.id] ?? attacker;
  const exited =
    isKaiser(attacker) && attacker.bunker?.active
      ? exitBunkerForUnit(workingState, workingAttacker, "attacked")
      : { state: workingState, unit: workingAttacker, events: [] };
  workingState = exited.state;
  workingAttacker = exited.unit;
  const stageBonus = applyMettatonStagePhenomenonOnAttackAction(workingState, workingAttacker.id);
  return {
    state: stageBonus.state,
    attacker: stageBonus.state.units[attacker.id] ?? workingAttacker,
    events: [...exited.events, ...stageBonus.events],
  };
}
