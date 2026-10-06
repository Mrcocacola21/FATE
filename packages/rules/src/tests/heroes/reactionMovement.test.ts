import {
  ABILITY_RIVER_PERSON_TRA_LA_LA,
  ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
  ABILITY_BERSERK_AUTO_DEFENSE,
  applyActionRaw,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  HERO_GENGHIS_KHAN_ID,
  HERO_SANS_ID,
  HERO_ODIN_ID,
  initKnowledgeForOwners,
  makeEmptyTurnEconomy,
  makePlayerView,
  makeRngSequence,
  setUnit,
  setupRiverPersonState,
  toBattleState,
} from "../helpers/testUtils";
import type { GameEvent, GameState, ResolveRollChoice } from "../../model";
import type { RNG } from "../../rng";
import { makeSpectatorView, projectEventsForRecipient } from "../../view";

const noDice: RNG = {
  next() {
    throw new Error("Unexpected RNG consumption");
  },
};
const attackChoice: ResolveRollChoice = { type: "resolveReactionChoice", choice: "attack" };
const passChoice: ResolveRollChoice = { type: "resolveReactionChoice", choice: "pass" };
const destination = { col: 0, row: 5 };
const drop = { col: 1, row: 5 };

function respond(state: GameState, choice?: ResolveRollChoice, rng: RNG = noDice) {
  const pending = state.pendingRoll!;
  assert(pending, "Expected a pending decision");
  return applyActionRaw(
    state,
    { type: "resolvePendingRoll", player: pending.player, pendingRollId: pending.id, choice },
    rng,
  );
}

function fixture() {
  const { state: initialState, river } = setupRiverPersonState();
  let state = initialState;
  const own = (cls: string) =>
    Object.values(state.units).find((unit) => unit.owner === "P1" && unit.class === cls)!;
  const berserker = own("berserker");
  const assassin = own("assassin");
  const spearman = own("spearman");
  const target = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight",
  )!;
  state = setUnit(state, river.id, {
    position: { col: 0, row: 0 },
    charges: { ...river.charges, [ABILITY_RIVER_PERSON_TRA_LA_LA]: 4 },
  });
  state = setUnit(state, target.id, { position: { col: 1, row: 0 }, hp: 20 });
  state = setUnit(state, berserker.id, { position: { col: 1, row: 1 } });
  state = setUnit(state, assassin.id, { position: { col: 1, row: 3 } });
  state = initKnowledgeForOwners(toBattleState(state, "P1", river.id));
  return {
    state,
    riverId: river.id,
    targetId: target.id,
    berserkerId: berserker.id,
    assassinId: assassin.id,
    spearmanId: spearman.id,
  };
}

function start(setup: ReturnType<typeof fixture>) {
  const activated = applyActionRaw(
    setup.state,
    { type: "useAbility", unitId: setup.riverId, abilityId: ABILITY_RIVER_PERSON_TRA_LA_LA },
    noDice,
  );
  const selected = respond(activated.state, {
    type: "hassanTrueEnemyTarget",
    targetId: setup.targetId,
  });
  const planned = respond(selected.state, { type: "forestMoveDestination", position: destination });
  return respond(planned.state, { type: "forestMoveDestination", position: drop });
}

function winCombat(state: GameState) {
  const attacker = respond(state, undefined, makeRngSequence([0.99, 0.99]));
  assert.equal(attacker.state.pendingRoll?.kind, "attack_defenderRoll");
  return respond(attacker.state, undefined, makeRngSequence([0.01, 0.2]));
}

export function testTralalaAlliesCanIndependentlyAttackOrPass() {
  const setup = fixture();
  const initial = start(setup);
  assert.equal(initial.state.pendingRoll?.context.reactorUnitId, setup.berserkerId);
  const selected = respond(initial.state, attackChoice);
  const combat = winCombat(selected.state);
  assert.equal(combat.state.pendingRoll?.kind, "reactionChoice");
  assert.equal(combat.state.pendingRoll?.context.reactorUnitId, setup.assassinId);
  assert.deepStrictEqual(combat.state.units[setup.targetId].position, { col: 0, row: 2 });
  const passed = respond(combat.state, passChoice);
  const events = [...initial.events, ...selected.events, ...combat.events, ...passed.events];
  assert.equal(
    events.filter(
      (event) => event.type === "attackResolved" && event.attackerId === setup.berserkerId,
    ).length,
    1,
  );
  assert(
    !events.some(
      (event) => event.type === "attackResolved" && event.attackerId === setup.assassinId,
    ),
  );
  assert.deepStrictEqual(passed.state.units[setup.riverId].position, destination);
  assert.deepStrictEqual(passed.state.units[setup.targetId].position, drop);
  assert.equal(passed.state.pendingRoll, null);
  assert.equal(passed.state.pendingReactionMovement, null);
  assert.equal(
    events.filter((event) => event.type === "reactionOpportunity").length,
    2,
    "No duplicate prompt during later steps",
  );
  console.log("tralala_allies_can_independently_attack_or_pass passed");
}

export function testReactionAttackDoesNotConsumeNormalActionSlot() {
  const setup = fixture();
  const turn = {
    ...makeEmptyTurnEconomy(),
    moveUsed: true,
    actionUsed: true,
    attackUsed: true,
    stealthUsed: true,
  };
  setup.state = setUnit(setup.state, setup.berserkerId, {
    turn,
    hasMovedThisTurn: true,
    hasActedThisTurn: true,
    hasAttackedThisTurn: true,
    stealthAttemptedThisTurn: true,
  });
  const initial = start(setup);
  assert.equal(
    initial.state.pendingRoll?.context.reactorUnitId,
    setup.berserkerId,
    "Spent slots do not disable a reaction",
  );
  const combat = winCombat(respond(initial.state, attackChoice).state);
  const reactor = combat.state.units[setup.berserkerId];
  assert.deepStrictEqual(reactor.turn, turn);
  assert(
    reactor.hasMovedThisTurn &&
      reactor.hasActedThisTurn &&
      reactor.hasAttackedThisTurn &&
      reactor.stealthAttemptedThisTurn,
  );
  console.log("reaction_attack_does_not_consume_normal_action_slot passed");
}

export function testMultipleReactionsAreProcessedSequentially() {
  const setup = fixture();
  setup.state = setUnit(setup.state, setup.riverId, { position: { col: 0, row: 1 } });
  setup.state = setUnit(setup.state, setup.assassinId, { position: { col: 1, row: 1 } });
  setup.state = setUnit(setup.state, setup.spearmanId, { position: { col: 1, row: 2 } });
  setup.state = setUnit(setup.state, setup.berserkerId, { position: { col: 1, row: 0 } });
  setup.state = setUnit(setup.state, setup.targetId, { position: { col: 0, row: 2 } });
  let current = start(setup);
  const reactors: string[] = [];
  for (let index = 0; index < 3; index++) {
    assert.equal(current.state.pendingRoll?.kind, "reactionChoice");
    assert.equal(current.state.pendingCombatQueue.length, 0);
    assert.deepStrictEqual(current.state.units[setup.riverId].position, { col: 0, row: 1 });
    reactors.push(String(current.state.pendingRoll?.context.reactorUnitId));
    current = respond(current.state, passChoice);
  }
  assert.deepStrictEqual(reactors, [setup.berserkerId, setup.assassinId, setup.spearmanId]);
  assert.equal(current.state.pendingRoll, null);
  assert.deepStrictEqual(current.state.units[setup.targetId].position, drop);
  console.log("multiple_reactions_are_processed_sequentially passed");
}

export function testPassSkipsCombatAndResumesFlow() {
  const setup = fixture();
  setup.state = setUnit(setup.state, setup.assassinId, { position: null });
  const initial = start(setup);
  const passed = respond(initial.state, passChoice);
  assert.equal(passed.state.pendingRoll, null);
  assert.equal(passed.state.units[setup.targetId].hp, setup.state.units[setup.targetId].hp);
  assert.deepStrictEqual(
    passed.state.units[setup.berserkerId].turn,
    setup.state.units[setup.berserkerId].turn,
  );
  assert(
    !passed.events.some(
      (event) => event.type === "attackResolved" || event.type === "rollRequested",
    ),
  );
  assert.deepStrictEqual(passed.state.units[setup.riverId].position, destination);
  console.log("pass_skips_combat_and_resumes_flow passed");
}

export function testReactionAttackUsesManualRolls() {
  const setup = fixture();
  const initial = start(setup);
  const chosen = respond(initial.state, attackChoice);
  assert.equal(chosen.state.pendingRoll?.kind, "attack_attackerRoll");
  assert.equal(chosen.state.pendingRoll?.context.consumeSlots, false);
  assert.deepStrictEqual(chosen.state.units[setup.targetId].position, { col: 0, row: 0 });
  let consumed = 0;
  const attack = respond(chosen.state, undefined, {
    next() {
      consumed++;
      return 0.99;
    },
  });
  assert.equal(consumed, 2);
  assert.equal(attack.state.pendingRoll?.kind, "attack_defenderRoll");
  assert.equal(attack.state.pendingRoll?.player, "P2");
  assert.deepStrictEqual(attack.state.pendingRoll?.context.attackerDice, [6, 6]);
  assert.deepStrictEqual(attack.state.units[setup.targetId].position, { col: 0, row: 0 });
  assert.equal(attack.state.units[setup.targetId].hp, 20);
  const defender = respond(attack.state, undefined, makeRngSequence([0.01, 0.2]));
  assert(defender.events.some((event) => event.type === "attackResolved"));
  assert.deepStrictEqual(defender.state.units[setup.targetId].position, { col: 0, row: 2 });
  console.log("reaction_attack_uses_manual_rolls passed");
}

export function testDraggedUnitDiesDuringReaction() {
  const setup = fixture();
  setup.state = setUnit(setup.state, setup.targetId, { hp: 1 });
  const initial = start(setup);
  const resolved = winCombat(respond(initial.state, attackChoice).state);
  assert.equal(resolved.state.units[setup.targetId].isAlive, false);
  assert.equal(resolved.state.units[setup.targetId].position, null);
  assert.deepStrictEqual(resolved.state.units[setup.riverId].position, { col: 0, row: 0 });
  assert.equal(resolved.state.pendingRoll, null);
  assert.equal(resolved.state.pendingReactionMovement, null);
  assert.equal(
    resolved.events.filter((event) => event.type === "unitDied" && event.unitId === setup.targetId)
      .length,
    1,
  );
  assert(!resolved.events.some((event) => event.type === "reactionOpportunity"));
  console.log("dragged_unit_dies_during_reaction passed");
}

export function testStakeInterruptsBeforeFutureReactionPoint() {
  const setup = fixture();
  setup.state = {
    ...setup.state,
    stakeMarkers: [
      { id: "stop", owner: "P2", position: { col: 0, row: 1 }, isRevealed: false, createdAt: 1 },
    ],
  };
  const initial = start(setup);
  assert.deepStrictEqual(makePlayerView(initial.state, "P1").stakeMarkers, []);
  const passed = respond(initial.state, passChoice);
  assert.equal(passed.state.pendingRoll?.kind, "reactionDropChoice");
  assert.deepStrictEqual(passed.state.units[setup.riverId].position, { col: 0, row: 1 });
  assert.equal(passed.state.units[setup.riverId].hp, setup.state.units[setup.riverId].hp - 1);
  assert(
    !passed.events.some(
      (event) => event.type === "reactionOpportunity" && event.reactorUnitId === setup.assassinId,
    ),
  );
  const landed = respond(passed.state, {
    type: "reactionDropDestination",
    position: { col: 1, row: 2 },
  });
  assert.equal(landed.state.pendingRoll, null);
  assert.equal(landed.state.pendingReactionMovement, null);
  assert.equal(landed.state.units[setup.riverId].charges[ABILITY_RIVER_PERSON_TRA_LA_LA], 0);
  assert.deepStrictEqual(landed.state.units[setup.targetId].position, { col: 1, row: 2 });
  console.log("stake_interrupts_before_future_reaction_point passed");
}

export function testGenghisUsesSameOptionalReactionSystem() {
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID })),
    createDefaultArmy("P2"),
  );
  const unit = (owner: string, cls: string) =>
    Object.values(state.units).find((other) => other.owner === owner && other.class === cls)!;
  const genghis = unit("P1", "rider"),
    ally = unit("P1", "berserker"),
    target = unit("P2", "knight");
  state = setUnit(state, genghis.id, {
    position: { col: 0, row: 1 },
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_MONGOL_CHARGE]: 4 },
  });
  state = setUnit(state, ally.id, {
    position: { col: 1, row: 0 },
    turn: { ...makeEmptyTurnEconomy(), actionUsed: true, moveUsed: true, attackUsed: true },
  });
  state = setUnit(state, target.id, { position: { col: 2, row: 0 }, hp: 20 });
  state = initKnowledgeForOwners(toBattleState(state, "P1", genghis.id));
  const activated = applyActionRaw(
    state,
    { type: "useAbility", unitId: genghis.id, abilityId: ABILITY_GENGHIS_KHAN_MONGOL_CHARGE },
    noDice,
  );
  const moved = applyActionRaw(
    activated.state,
    { type: "move", unitId: genghis.id, to: { col: 5, row: 1 } },
    noDice,
  );
  assert.equal(moved.state.pendingRoll?.kind, "reactionChoice");
  assert.equal(moved.state.pendingReactionMovement?.source, "genghis");
  assert.deepStrictEqual(moved.state.units[genghis.id].position, { col: 1, row: 1 });
  const passed = respond(moved.state, passChoice);
  assert.equal(passed.state.pendingRoll, null);
  assert.deepStrictEqual(passed.state.units[genghis.id].position, { col: 5, row: 1 });
  assert(!passed.events.some((event) => event.type === "attackResolved"));
  const fought = winCombat(respond(moved.state, attackChoice).state);
  assert.deepStrictEqual(fought.state.units[ally.id].turn, state.units[ally.id].turn);
  const attack = fought.events.find((event) => event.type === "attackResolved");
  assert(
    attack?.type === "attackResolved" && attack.damage === ally.attack + 1,
    "Existing commander bonus is preserved",
  );
  console.log("genghis_uses_same_optional_reaction_system passed");
}

export function testReactionChoiceAuthorityAndPrivacy() {
  const setup = fixture();
  const initial = start(setup);
  const pending = initial.state.pendingRoll!;
  const wrongPlayer = applyActionRaw(
    initial.state,
    { type: "resolvePendingRoll", player: "P2", pendingRollId: pending.id, choice: passChoice },
    noDice,
  );
  assert.strictEqual(wrongPlayer.state, initial.state);
  const wrongId = applyActionRaw(
    initial.state,
    { type: "resolvePendingRoll", player: "P1", pendingRollId: "stale", choice: passChoice },
    noDice,
  );
  assert.strictEqual(wrongId.state, initial.state);
  const invalid = respond(initial.state, {
    type: "resolveReactionChoice",
    choice: "attack",
    targetId: setup.riverId,
  });
  assert.strictEqual(invalid.state, initial.state);
  const owner = makePlayerView(initial.state, "P1");
  const opponent = makePlayerView(initial.state, "P2");
  assert.equal(owner.pendingRoll?.kind, "reactionChoice");
  assert.equal(opponent.pendingRoll, null);
  assert.equal(opponent.pendingDecision?.viewerCanRespond, false);
  assert(
    opponent.pendingDecision?.type === "opponentResolvingDecision" &&
      opponent.pendingDecision.opponentStatus.key === "reaction",
  );
  for (const view of [owner, opponent, makeSpectatorView(initial.state)])
    assert(!("pendingReactionMovement" in view), "Future movement and queue are private");
  const hiddenState = setUnit(initial.state, setup.berserkerId, { isStealthed: true });
  const opportunity: GameEvent = {
    type: "reactionOpportunity",
    source: "tralala",
    reactorUnitId: setup.berserkerId,
    targetUnitIds: [setup.targetId],
  };
  assert.deepStrictEqual(projectEventsForRecipient(hiddenState, [opportunity], "P2"), []);
  console.log("reaction_choice_authority_and_privacy passed");
}

export function testReactionPreservesSansLastAttack() {
  const setup = fixture();
  setup.state = setUnit(setup.state, setup.targetId, {
    heroId: HERO_SANS_ID,
    hp: 1,
    sansUnbelieverUnlocked: true,
  });
  const initial = start(setup);
  const killed = winCombat(respond(initial.state, attackChoice).state);
  assert.equal(killed.state.pendingRoll?.kind, "selectLastAttackTarget");
  assert.equal(killed.state.pendingRoll?.player, "P2");
  assert.equal(killed.state.pendingReactionMovement, null);
  assert.deepStrictEqual(killed.state.units[setup.riverId].position, { col: 0, row: 0 });
  const finished = respond(killed.state, {
    type: "sansLastAttackTarget",
    targetId: setup.berserkerId,
  });
  assert.equal(finished.state.units[setup.targetId].isAlive, false);
  assert.equal(finished.state.units[setup.berserkerId].sansLastAttackCurseSourceId, setup.targetId);
  assert.equal(finished.state.pendingRoll, null);
  console.log("reaction_preserves_sans_last_attack passed");
}

export function testReactionEligibilityAndSpecialDefense() {
  const disabled = fixture();
  disabled.state = setUnit(disabled.state, disabled.berserkerId, {
    lokiChickenSources: [disabled.riverId],
  });
  const skipped = start(disabled);
  assert.equal(
    skipped.state.pendingRoll?.context.reactorUnitId,
    disabled.assassinId,
    "Disabled allies do not get prompts",
  );
  const setup = fixture();
  setup.state = setUnit(setup.state, setup.targetId, { class: "spearman" });
  const initial = start(setup);
  const chosen = respond(initial.state, attackChoice);
  const attack = respond(chosen.state, undefined, makeRngSequence([0.99, 0.99]));
  const defense = respond(attack.state, undefined, makeRngSequence([0.01, 0.01]));
  const resolved = defense.events.find((event) => event.type === "attackResolved");
  assert(
    resolved?.type === "attackResolved" && !resolved.hit,
    "Spearman double defense still beats a larger attack roll",
  );
  assert.equal(defense.state.units[setup.targetId].hp, 20);
  console.log("reaction_eligibility_and_special_defense passed");
}

export function testReactionMovementRegressions() {
  testTralalaAlliesCanIndependentlyAttackOrPass();
  testReactionAttackDoesNotConsumeNormalActionSlot();
  testMultipleReactionsAreProcessedSequentially();
  testPassSkipsCombatAndResumesFlow();
  testReactionAttackUsesManualRolls();
  testDraggedUnitDiesDuringReaction();
  testStakeInterruptsBeforeFutureReactionPoint();
  testGenghisUsesSameOptionalReactionSystem();
  testReactionChoiceAuthorityAndPrivacy();
  testReactionPreservesSansLastAttack();
  testReactionEligibilityAndSpecialDefense();
  testReactionKeepsBerserkerDefenseChoiceAndAssassinStealthRules();
  testHiddenDraggedTargetDoesNotSuppressStakeInterruption();
  testDraggedTargetStakeStopsHiddenBoat();
}

export function testReactionKeepsBerserkerDefenseChoiceAndAssassinStealthRules() {
  const setup = fixture();
  setup.state = setUnit(setup.state, setup.targetId, {
    class: "berserker",
    charges: { [ABILITY_BERSERK_AUTO_DEFENSE]: 6 },
  });
  const initial = start(setup);
  const attack = respond(
    respond(initial.state, attackChoice).state,
    undefined,
    makeRngSequence([0.99, 0.99]),
  );
  assert.equal(attack.state.pendingRoll?.kind, "berserkerDefenseChoice");
  const rolled = respond(attack.state, "roll");
  assert.equal(rolled.state.pendingRoll?.kind, "attack_defenderRoll");
  const fought = respond(rolled.state, undefined, makeRngSequence([0.01, 0.2]));
  assert(fought.events.some((event) => event.type === "attackResolved" && event.hit));
  const dodged = respond(attack.state, "auto");
  assert.equal(dodged.state.units[setup.targetId].hp, 20);
  assert.equal(dodged.state.units[setup.targetId].charges[ABILITY_BERSERK_AUTO_DEFENSE], 0);

  const hidden = fixture();
  hidden.state = setUnit(hidden.state, hidden.berserkerId, { position: null });
  hidden.state = setUnit(hidden.state, hidden.assassinId, {
    position: { col: 1, row: 1 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  const offered = start(hidden);
  const passed = respond(offered.state, passChoice);
  assert.equal(
    passed.state.units[hidden.assassinId].isStealthed,
    true,
    "Pass preserves the assassin's stealth",
  );
  const struck = winCombat(respond(offered.state, attackChoice).state);
  assert.equal(
    struck.state.units[hidden.assassinId].isStealthed,
    false,
    "Attack uses the normal attacked reveal",
  );
  assert(
    struck.events.some(
      (event) =>
        event.type === "stealthRevealed" &&
        event.unitId === hidden.assassinId &&
        event.reason === "attacked",
    ),
  );
  assert.deepStrictEqual(
    struck.state.units[hidden.assassinId].turn,
    hidden.state.units[hidden.assassinId].turn,
  );
  console.log("reaction_keeps_berserker_defense_choice_and_assassin_stealth_rules passed");
}

export function testHiddenDraggedTargetDoesNotSuppressStakeInterruption() {
  const setup = fixture();
  setup.state = setUnit(setup.state, setup.targetId, { isStealthed: true, stealthTurnsLeft: 3 });
  setup.state = setUnit(setup.state, setup.berserkerId, { heroId: HERO_ODIN_ID });
  setup.state = {
    ...setup.state,
    knowledge: {
      ...setup.state.knowledge,
      P1: { ...setup.state.knowledge.P1, [setup.targetId]: true },
    },
    stakeMarkers: [
      {
        id: "hidden-stop",
        owner: "P2",
        position: { col: 0, row: 1 },
        isRevealed: false,
        createdAt: 1,
      },
    ],
  };
  const initial = start(setup);
  const stopped = respond(initial.state, passChoice);
  assert.equal(stopped.state.pendingRoll?.kind, "reactionDropChoice");
  assert.deepStrictEqual(stopped.state.units[setup.riverId].position, { col: 0, row: 1 });
  assert.equal(stopped.state.units[setup.riverId].hp, setup.state.units[setup.riverId].hp - 1);
  assert.equal(stopped.state.stakeMarkers[0].isRevealed, true);
  assert(
    !stopped.events.some(
      (event) => event.type === "reactionOpportunity" && event.reactorUnitId === setup.assassinId,
    ),
  );
  console.log("hidden_dragged_target_does_not_suppress_stake_interruption passed");
}

export function testDraggedTargetStakeStopsHiddenBoat() {
  const setup = fixture();
  setup.state = setUnit(setup.state, setup.riverId, { isStealthed: true, stealthTurnsLeft: 3 });
  setup.state = {
    ...setup.state,
    stakeMarkers: [
      {
        id: "target-stop",
        owner: "P2",
        position: { col: 0, row: 1 },
        isRevealed: false,
        createdAt: 1,
      },
    ],
  };
  const initial = start(setup);
  const stopped = respond(initial.state, passChoice);
  assert.equal(stopped.state.pendingRoll?.kind, "reactionDropChoice");
  assert.deepStrictEqual(stopped.state.units[setup.riverId].position, { col: 0, row: 1 });
  assert.equal(stopped.state.units[setup.riverId].hp, setup.state.units[setup.riverId].hp);
  assert.equal(stopped.state.units[setup.targetId].hp, 19);
  assert(
    stopped.events.some(
      (event) => event.type === "stakeTriggered" && event.unitId === setup.targetId,
    ),
  );
  assert(
    !stopped.events.some(
      (event) => event.type === "reactionOpportunity" && event.reactorUnitId === setup.assassinId,
    ),
  );
  console.log("dragged_target_stake_stops_hidden_boat passed");
}
