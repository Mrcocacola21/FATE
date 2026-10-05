import assert from "node:assert/strict";
import { getLegalPlacements, getLegalMovesForUnit, getLegalAttackTargets, getLegalIntents, type GameAction, type GameState, type PlayerId } from "rules";

/** Choose commands only; the browser sends them through its normal store and WebSocket. */
export function nextSmokeAction(state: GameState): { seat: PlayerId; action: GameAction } {
  const seat = state.pendingRoll?.player ?? state.currentPlayer;
  if (state.pendingRoll) {
    const pending = state.pendingRoll;
    return { seat, action: { type: "resolvePendingRoll", player: seat, pendingRollId: pending.id,
      choice: pending.kind === "ruleDeclarationChoice"
        ? { type: "chooseRuleDeclaration", ruleId: "normal_rule" } : "roll" } };
  }
  if (state.phase === "placement") {
    const entry = Object.values(state.units).map(unit => ({ unit, legal: getLegalPlacements(state, unit.id) })).find(candidate => candidate.legal.length);
    assert(entry, "a legal deployment exists");
    return { seat, action: { type: "placeUnit", unitId: entry.unit.id, position: entry.legal[0] } };
  }
  assert.equal(state.phase, "battle");
  // P2 is cooperative; P1 attacks until the actual normal win condition is met.
  if (seat === "P2") return { seat, action: { type: "endTurn" } };
  if (!state.activeUnitId) {
    const id = state.turnQueue.length ? state.turnQueue[state.turnQueueIndex] : state.turnOrder[state.turnOrderIndex];
    return { seat, action: { type: "unitStartTurn", unitId: id } };
  }
  const unit = state.units[state.activeUnitId];
  assert(unit?.position);
  const intents = getLegalIntents(state, seat);
  const targets = intents.canAttack ? getLegalAttackTargets(state, unit.id) : [];
  if (targets.length) return { seat, action: { type: "attack", attackerId: unit.id, defenderId: targets[0] } };
  if (intents.canMove && !state.pendingMove) return { seat, action: { type: "requestMoveOptions", unitId: unit.id, mode: "normal" } };
  const enemies = Object.values(state.units).filter(enemy => enemy.owner !== seat && enemy.isAlive && enemy.position);
  const distance = (position: { col: number; row: number }) => Math.min(...enemies.map(enemy => Math.max(Math.abs(enemy.position!.row - position.row), Math.abs(enemy.position!.col - position.col))));
  const moves = intents.canMove ? [...(state.pendingMove?.legalTo ?? getLegalMovesForUnit(state, unit.id))] : [];
  moves.sort((a, b) => distance(a) - distance(b));
  if (moves[0] && distance(moves[0]) < distance(unit.position)) return { seat, action: { type: "move", unitId: unit.id, to: moves[0] } };
  return { seat, action: { type: "endTurn" } };
}
