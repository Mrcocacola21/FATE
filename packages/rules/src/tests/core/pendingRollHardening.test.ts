import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  applyAction,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  initKnowledgeForOwners,
  makeRngSequence,
  resolvePendingRollOnce,
  SeededRNG,
  setUnit,
  toBattleState,
} from "../helpers/testUtils";
import {
  applyRuleDeclarationWinChecks,
  handleRuleDeclarationRoundEnd,
} from "../../ruleDeclarations";
import { makePlayerView, makeSpectatorView } from "../../view";
import type { GameState, PendingRoll, ResolveRollChoice } from "../../model";

function resolveWith(state: GameState, choice: unknown, rngValues: number[] = []) {
  const pending = state.pendingRoll!;
  return applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice: choice as ResolveRollChoice,
    },
    makeRngSequence(rngValues),
  );
}

function assertRejected(state: GameState, choice: unknown, label: string) {
  const result = resolveWith(state, choice);
  assert(result.state === state, `${label}: state must not change`);
  assert(result.events.length === 0, `${label}: no events must be emitted`);
}

function withPending(state: GameState, pending: Omit<PendingRoll, "id">): GameState {
  return { ...state, pendingRoll: { id: "test-pending", ...pending } };
}

function setupBerserkerDefenseChoice() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight",
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "berserker",
  )!;
  state = setUnit(state, attacker.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, defender.id, {
    position: { col: 4, row: 5 },
    charges: { ...defender.charges, [ABILITY_BERSERK_AUTO_DEFENSE]: 6 },
  });
  state = initKnowledgeForOwners(toBattleState(state, "P1", attacker.id));
  state = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: defender.id },
    rng,
  ).state;
  state = resolvePendingRollOnce(state, rng).state;
  assert(
    state.pendingRoll?.kind === "berserkerDefenseChoice",
    "berserker defense choice should be pending after the attacker roll",
  );
  return { state, attacker, defender };
}

export function testUnknownDefenseChoiceIsRejected() {
  const { state, defender } = setupBerserkerDefenseChoice();
  for (const choice of [undefined, "skip", "activate", { type: "roll" }, 42]) {
    assertRejected(state, choice, `berserker choice ${JSON.stringify(choice)}`);
  }

  const rolled = resolveWith(state, "roll");
  assert(
    rolled.state.pendingRoll?.kind === "attack_defenderRoll",
    "a valid roll choice should still request the defender roll",
  );
  const auto = resolveWith(state, "auto");
  assert(
    auto.events.some((event) => event.type === "attackResolved" && event.defenderId === defender.id),
    "a valid auto choice should still resolve the attack",
  );

  // The other auto/roll decisions share the same guard.
  for (const kind of [
    "odinMuninnDefenseChoice",
    "asgoreBraveryDefenseChoice",
    "carpetStrike_berserkerDefenseChoice",
    "tricksterAoE_berserkerDefenseChoice",
    "dora_berserkerDefenseChoice",
    "jebeHailOfArrows_berserkerDefenseChoice",
    "vladForest_berserkerDefenseChoice",
  ] as const) {
    const pending = withPending(state, { ...state.pendingRoll!, kind });
    assertRejected(pending, "skip", kind);
  }

  // Owner-side choices that used to default to an option now need a real one.
  const vladForest = withPending(state, {
    player: "P2",
    kind: "vladForestChoice",
    context: { owner: "P2", unitId: defender.id },
  });
  assertRejected(vladForest, "explode", "vladForestChoice");
  const falseTrail = withPending(state, {
    player: "P2",
    kind: "chikatiloFalseTrailRevealChoice",
    context: { tokenId: defender.id, queue: [] },
  });
  assertRejected(falseTrail, "skip", "chikatiloFalseTrailRevealChoice");

  console.log("unknown_defense_choice_is_rejected passed");
}

function setupMoonBattle() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  const p1 = Object.values(state.units).filter((unit) => unit.owner === "P1");
  const p2 = Object.values(state.units).filter((unit) => unit.owner === "P2");
  p1.forEach((unit, index) => {
    state = setUnit(state, unit.id, { position: { col: index, row: 0 } });
  });
  p2.forEach((unit, index) => {
    state = setUnit(state, unit.id, { position: { col: index, row: 8 } });
  });
  state = toBattleState(state, "P1", p1[0].id);
  state = initKnowledgeForOwners({
    ...state,
    turnQueue: [p1[0].id],
    turnOrder: [p1[0].id],
    ruleDeclaration: {
      selectedRuleId: "moon_game",
      chooserPlayer: "P2",
      setupComplete: true,
      ruleData: { moonGame: {} },
    },
  });
  return { state, p1, p2 };
}

function rollCheeseHoles(state: GameState, nextUnitId: string) {
  const requested = handleRuleDeclarationRoundEnd(
    state,
    { nextRoundNumber: 2, nextTurnNumber: 2, nextIndex: 0, nextUnitId, nextPlayer: "P1" },
    makeRngSequence([]),
  );
  assert(requested.state.pendingRoll?.kind === "moonRoundRoll", "Moon roll should be pending");
  // rollD6 maps 0.55 to 4: Cheese Holes.
  return resolveWith(requested.state, undefined, [0.55, 0.55, 0.55]);
}

export function testMoonCheeseHolesSkipsPlayersWithoutFigures() {
  // P2 has no living figure: P1 chooses, P2 is skipped, and the match ends.
  {
    const { state: base, p1, p2 } = setupMoonBattle();
    let state = base;
    for (const unit of p2) {
      state = setUnit(state, unit.id, { isAlive: false, hp: 0, position: null });
    }
    const rolled = rollCheeseHoles(state, p1[0].id);
    const pending = rolled.state.pendingRoll;
    assert(pending?.kind === "moonCheeseHolesChoice", "P1 should still choose a figure");
    assert(pending.player === "P1", "P1 chooses first");
    const options = pending.context.options as string[];
    assert(options.length > 0, "P1 should have options");
    const chosen = resolveWith(rolled.state, { type: "ruleUnit", unitId: options[0] });
    assert(
      chosen.state.pendingRoll?.kind !== "moonCheeseHolesChoice",
      "P2 with no figures must not be asked an unanswerable choice",
    );
    assert(chosen.state.phase === "ended", "the match should end once the effect resolves");
    assert(
      chosen.events.some((event) => event.type === "gameEnded" && event.winner === "P1"),
      "P1 should win when P2 has no living figures",
    );
  }

  // P1 has no living figure: P1 is skipped and P2 is asked.
  {
    const { state: base, p1 } = setupMoonBattle();
    let state = base;
    for (const unit of p1) {
      state = setUnit(state, unit.id, { isAlive: false, hp: 0, position: null });
    }
    const rolled = rollCheeseHoles(state, p1[0].id);
    const pending = rolled.state.pendingRoll;
    assert(pending?.kind === "moonCheeseHolesChoice", "P2 should be asked");
    assert(pending.player === "P2", "P1 without figures is skipped");
    assert((pending.context.options as string[]).length > 0, "P2 should have options");
  }

  console.log("moon_cheese_holes_skips_players_without_figures passed");
}

export function testSpecialRulesStillEndOnElimination() {
  const { state: base, p2 } = setupMoonBattle();
  let eliminated = base;
  for (const unit of p2) {
    eliminated = setUnit(eliminated, unit.id, { isAlive: false, hp: 0, position: null });
  }
  const rules: GameState["ruleDeclaration"][] = [
    { ...base.ruleDeclaration },
    {
      selectedRuleId: "court",
      chooserPlayer: "P2",
      setupComplete: true,
      ruleData: { court: { attackerPlayer: "P2", defenderPlayer: "P1" } },
    },
    {
      selectedRuleId: "advantage_game",
      chooserPlayer: "P2",
      setupComplete: true,
      // Higher than any possible lead, so only elimination can end the match.
      ruleData: { advantageGame: { threshold: 99 } },
    },
  ];
  for (const ruleDeclaration of rules) {
    const checked = applyRuleDeclarationWinChecks({ ...eliminated, ruleDeclaration }, []);
    assert(
      checked.state.phase === "ended",
      `${ruleDeclaration.selectedRuleId} should end when one side has no living figures`,
    );
    assert(
      checked.state.gameOver?.winnerPlayerId === "P1",
      `${ruleDeclaration.selectedRuleId} should award the surviving side`,
    );
  }

  const ongoing = applyRuleDeclarationWinChecks(base, []);
  assert(ongoing.state.phase === "battle", "a match with both sides alive continues");

  console.log("special_rules_still_end_on_elimination passed");
}

export function testPendingViewKeepsOwnUnpositionedUnits() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  const p1 = Object.values(state.units).filter((unit) => unit.owner === "P1");
  const p2 = Object.values(state.units).filter((unit) => unit.owner === "P2");
  const ownIds = p1.map((unit) => unit.id).sort();

  // Chess king choice before placement: no figure has a position yet.
  const kingChoice = withPending(state, {
    player: "P1",
    kind: "ruleDeclarationChessKingChoice",
    context: { player: "P1", queue: ["P2"], options: ownIds },
  });
  const ownerView = makePlayerView(kingChoice, "P1");
  assert(
    JSON.stringify(ownerView.pendingRoll?.context.options) === JSON.stringify(ownIds),
    "the owner should see every own figure as a king option before placement",
  );
  assert(makePlayerView(kingChoice, "P2").pendingRoll === null, "the opponent sees no pending roll");
  assert(
    !JSON.stringify(makeSpectatorView(kingChoice)).includes('"options"'),
    "a spectator sees no pending options",
  );

  // Court effect on a fallen own figure next to a hidden enemy.
  const fallen = p1[0];
  const hiddenEnemy = p2[0];
  const visibleEnemy = p2[1];
  let battle = setUnit(state, fallen.id, { isAlive: false, hp: 0, position: null });
  battle = setUnit(battle, hiddenEnemy.id, { position: { col: 8, row: 8 }, isStealthed: true });
  battle = setUnit(battle, visibleEnemy.id, { position: { col: 7, row: 8 } });
  battle = setUnit(battle, p1[1].id, { position: { col: 0, row: 0 } });
  battle = toBattleState(battle, "P1", p1[1].id);
  const courtChoice = withPending(battle, {
    player: "P1",
    kind: "courtEffectUnitChoice",
    context: { options: [fallen.id, hiddenEnemy.id, visibleEnemy.id] },
  });
  const options = makePlayerView(courtChoice, "P1").pendingRoll?.context.options as string[];
  assert(options.includes(fallen.id), "the owner keeps its fallen figure in options");
  assert(options.includes(visibleEnemy.id), "a visible enemy stays in options");
  assert(!options.includes(hiddenEnemy.id), "a hidden enemy is still removed from options");

  console.log("pending_view_keeps_own_unpositioned_units passed");
}
