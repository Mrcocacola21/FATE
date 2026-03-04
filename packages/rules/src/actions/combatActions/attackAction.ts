import type { ApplyResult, GameAction, GameEvent, GameState } from "../../model";
import type { RNG } from "../../rng";
import { canSpendSlots } from "../../turnEconomy";
import { requestRoll, makeAttackContext } from "../../core";
import { HERO_FALSE_TRAIL_TOKEN_ID } from "../../heroes";
import { isKaiser } from "../shared";
import { exitBunkerForUnit } from "../heroes/kaiser";
import { applyGutsBerserkAttack } from "../heroes/guts";
import { markFriskAttackedWhileStealthed } from "../heroes/frisk";
import { applyMettatonStagePhenomenonOnAttackAction } from "../heroes/mettaton";
import { maybeApplyPapyrusLongBoneAttack } from "../heroes/papyrus";
import { getPolkovodetsSource } from "../heroes/vlad";

export function applyAttack(
  state: GameState,
  action: Extract<GameAction, { type: "attack" }>,
  rng: RNG
): ApplyResult {
  state = markFriskAttackedWhileStealthed(state, action.attackerId);

  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const attacker = state.units[action.attackerId];
  const defender = state.units[action.defenderId];
  if (!attacker || !defender) {
    return { state, events: [] };
  }
  if (attacker.heroId === HERO_FALSE_TRAIL_TOKEN_ID) {
    return { state, events: [] };
  }
  if (attacker.owner !== state.currentPlayer) {
    return { state, events: [] };
  }
  if (state.activeUnitId !== attacker.id) {
    return { state, events: [] };
  }

  const papyrusLongBone = maybeApplyPapyrusLongBoneAttack(
    state,
    action.attackerId,
    action.defenderId
  );
  if (papyrusLongBone) {
    return papyrusLongBone;
  }

  if (attacker.gutsBerserkModeActive) {
    return applyGutsBerserkAttack(state, attacker, action);
  }

  if (!canSpendSlots(attacker, { attack: true, action: true })) {
    return { state, events: [] };
  }

  let workingState = state;
  let workingAttacker = attacker;
  let preEvents: GameEvent[] = [];

  if (isKaiser(attacker) && attacker.bunker?.active) {
    const exited = exitBunkerForUnit(state, attacker, "attacked");
    workingState = exited.state;
    workingAttacker = exited.unit;
    preEvents = exited.events;
  }

  const stageBonus = applyMettatonStagePhenomenonOnAttackAction(
    workingState,
    workingAttacker.id
  );
  workingState = stageBonus.state;
  workingAttacker = workingState.units[workingAttacker.id] ?? workingAttacker;
  preEvents = [...preEvents, ...stageBonus.events];

  const auraSource = getPolkovodetsSource(workingState, workingAttacker.id);
  const context = makeAttackContext({
    attackerId: workingAttacker.id,
    defenderId: defender.id,
    damageBonusSourceId: auraSource ?? undefined,
    consumeSlots: true,
    queueKind: "normal",
  });

  const requested = requestRoll(
    workingState,
    workingAttacker.owner,
    "attack_attackerRoll",
    context,
    workingAttacker.id
  );

  return { state: requested.state, events: [...preEvents, ...requested.events] };
}
