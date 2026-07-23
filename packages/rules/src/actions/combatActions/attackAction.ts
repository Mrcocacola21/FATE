import type { ApplyResult, GameAction, GameEvent, GameState } from "../../model";
import type { RNG } from "../../rng";
import { canAttackTarget } from "../../combat";
import { canSpendSlots } from "../../turnEconomy";
import { requestRoll, makeAttackContext } from "../../core";
import { HERO_FALSE_TRAIL_TOKEN_ID, HERO_ZORO_ID } from "../../heroes";
import { ABILITY_ZORO_3_SWORD_STYLE } from "../../abilities";
import { isKaiser } from "../shared";
import { exitBunkerForUnit } from "../heroes/kaiser";
import { applyGutsBerserkAttack } from "../heroes/guts";
import { markFriskAttackedWhileStealthed } from "../heroes/frisk";
import { applyMettatonStagePhenomenonOnAttackAction } from "../heroes/mettaton";
import { maybeApplyPapyrusLongBoneAttack } from "../heroes/papyrus";
import { getPolkovodetsSource } from "../heroes/vlad";
import { canDirectlyTargetUnit } from "../../visibility";

export function applyAttack(
  state: GameState,
  action: Extract<GameAction, { type: "attack" }>,
  rng: RNG
): ApplyResult {
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

  const santoryuTargets =
    attacker.heroId === HERO_ZORO_ID && Array.isArray(action.defenderIds)
      ? action.defenderIds
      : [];
  if (santoryuTargets.length > 0) {
    const unique = Array.from(new Set(santoryuTargets));
    if (
      unique.length !== santoryuTargets.length ||
      unique.length > 2 ||
      !unique.includes(action.defenderId) ||
      !canSpendSlots(attacker, { attack: true, action: true })
    ) {
      return { state, events: [] };
    }
    const targets = unique.map((id) => state.units[id]);
    if (targets.some((target) => !target || !canAttackTarget(state, attacker, target))) {
      return { state, events: [] };
    }
    if (unique.length === 2) {
      const queue = unique.map((defenderId) => ({
        attackerId: attacker.id,
        defenderId,
        consumeSlots: false,
        sourceAbilityId: ABILITY_ZORO_3_SWORD_STYLE,
        kind: "aoe" as const,
      }));
      const queuedState: GameState = {
        ...state,
        pendingCombatQueue: queue,
        pendingAoE: {
          casterId: attacker.id,
          abilityId: ABILITY_ZORO_3_SWORD_STYLE,
          center: attacker.position!,
          radius: 1,
          affectedUnitIds: unique,
          revealedUnitIds: [],
          damagedUnitIds: [],
          damageByUnitId: {},
        },
      };
      const context = makeAttackContext({
        attackerId: attacker.id,
        defenderId: unique[0],
        consumeSlots: true,
        sourceAbilityId: ABILITY_ZORO_3_SWORD_STYLE,
        queueKind: "aoe",
      });
      return requestRoll(queuedState, attacker.owner, "attack_attackerRoll", context, attacker.id);
    }
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
  if (!canDirectlyTargetUnit(state, attacker.id, defender.id)) {
    return {
      state,
      events: [],
      rejectionReason: "Target is hidden from you.",
    };
  }
  if (!canAttackTarget(state, attacker, defender)) {
    return {
      state,
      events: [],
      rejectionReason: "Target is not legal for this attack.",
    };
  }

  let workingState = state;
  let workingAttacker = attacker;
  let preEvents: GameEvent[] = [];

  workingState = markFriskAttackedWhileStealthed(workingState, workingAttacker.id);
  workingAttacker = workingState.units[workingAttacker.id] ?? workingAttacker;

  if (isKaiser(attacker) && attacker.bunker?.active) {
    const exited = exitBunkerForUnit(workingState, workingAttacker, "attacked");
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
