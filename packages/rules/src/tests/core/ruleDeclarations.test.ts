import {
  applyAction,
  assert,
  attachArmy,
  coordKeys,
  createDefaultArmy,
  createEmptyGame,
  getLegalMovesForUnit,
  initKnowledgeForOwners,
  makeRngSequence,
  resolveAllPendingRolls,
  resolvePendingRollOnce,
  setUnit,
  toBattleState,
} from "../helpers/testUtils";
import {
  applyRuleDeclarationWinChecks,
  handleRuleDeclarationRoundEnd,
} from "../../ruleDeclarations";

function startToRuleChoice() {
  const rng = makeRngSequence([0.9, 0.9, 0.1, 0.1]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  state = applyAction(state, { type: "lobbyInit", host: "P1" } as any, rng).state;
  state = { ...state, seats: { P1: true, P2: true } };
  state = applyAction(state, { type: "setReady", player: "P1", ready: true } as any, rng).state;
  state = applyAction(state, { type: "setReady", player: "P2", ready: true } as any, rng).state;
  state = applyAction(state, { type: "startGame" } as any, rng).state;
  state = resolvePendingRollOnce(state, rng).state;
  state = resolvePendingRollOnce(state, rng).state;
  return { state, rng };
}

function chooseRule(state: ReturnType<typeof createEmptyGame>, ruleId: string) {
  const pending = state.pendingRoll;
  assert(pending?.kind === "ruleDeclarationChoice", "rule declaration choice should be pending");
  return applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice: { type: "chooseRuleDeclaration", ruleId },
    } as any,
    makeRngSequence([])
  ).state;
}

export function testRuleDeclarationChooserAndPlacementGate() {
  const { state, rng } = startToRuleChoice();
  assert(state.phase === "lobby", "placement should not start before rule choice");
  assert(state.initiative.winner === "P1", "P1 should win deterministic initiative");
  assert(state.placementFirstPlayer === "P1", "initiative winner should place first");
  assert(state.pendingRoll?.kind === "ruleDeclarationChoice", "rule choice should be pending");
  assert(state.pendingRoll.player === "P2", "initiative loser should choose the rule");
  assert(state.ruleDeclaration.chooserPlayer === "P2", "chooser should be stored");

  const afterChoice = resolvePendingRollOnce(state, rng, {
    type: "chooseRuleDeclaration",
    ruleId: "moon_game",
  }).state;
  assert(afterChoice.phase === "placement", "placement starts after no-setup rule choice");
  assert(afterChoice.ruleDeclaration.selectedRuleId === "moon_game", "selected rule is stored");

  console.log("rule_declaration_chooser_and_placement_gate passed");
}

export function testRuleDeclarationSetupBranches() {
  {
    const { state } = startToRuleChoice();
    const court = chooseRule(state, "court");
    assert(court.phase === "placement", "Court should complete setup immediately");
    assert(court.ruleDeclaration.ruleData.court?.attackerPlayer === "P2", "Court attacker starts as chooser");
  }
  {
    const { state } = startToRuleChoice();
    const chess = chooseRule(state, "chess_party");
    assert(
      chess.pendingRoll?.kind === "ruleDeclarationChessKingChoice",
      "Chess Party should ask for King setup"
    );
  }
  {
    const { state } = startToRuleChoice();
    const advantage = chooseRule(state, "advantage_game");
    assert(
      advantage.pendingRoll?.kind === "ruleDeclarationAdvantageThreshold",
      "Advantage Game should ask for threshold setup"
    );
  }

  console.log("rule_declaration_setup_branches passed");
}

export function testAdvantageThresholdValidationAndWin() {
  const { state } = startToRuleChoice();
  let advantage = chooseRule(state, "advantage_game");
  const pending = advantage.pendingRoll!;
  const invalid = applyAction(
    advantage,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice: { type: "ruleThreshold", threshold: 2 },
    } as any,
    makeRngSequence([])
  ).state;
  assert(
    invalid.pendingRoll?.kind === "ruleDeclarationAdvantageThreshold",
    "threshold below 3 should remain pending"
  );
  advantage = resolvePendingRollOnce(invalid, makeRngSequence([]), {
    type: "ruleThreshold",
    threshold: 3,
  }).state;
  assert(advantage.phase === "placement", "valid threshold should complete setup");

  const p1 = Object.values(advantage.units).filter((unit) => unit.owner === "P1");
  const p2 = Object.values(advantage.units).filter((unit) => unit.owner === "P2");
  let battle = toBattleState(advantage, "P1", p1[0].id);
  for (const unit of [...p1, ...p2]) {
    battle = setUnit(battle, unit.id, {
      position: unit.owner === "P1" ? { col: p1.indexOf(unit), row: 0 } : { col: p2.indexOf(unit), row: 8 },
    });
  }
  for (const unit of p2.slice(0, 3)) {
    battle = setUnit(battle, unit.id, { isAlive: false, hp: 0 });
  }
  const checked = applyRuleDeclarationWinChecks(battle, []);
  assert(checked.state.phase === "ended", "figure advantage should end the game");
  assert(
    checked.events.some((event) => event.type === "advantageWinTriggered" && event.winner === "P1"),
    "P1 should win by living-figure advantage"
  );

  console.log("advantage_threshold_validation_and_win passed");
}

export function testChessKingDeathAndDraw() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  const p1King = Object.values(state.units).find((unit) => unit.owner === "P1")!;
  const p2King = Object.values(state.units).find((unit) => unit.owner === "P2")!;
  state = {
    ...state,
    phase: "battle",
    ruleDeclaration: {
      selectedRuleId: "chess_party",
      chooserPlayer: "P2",
      setupComplete: true,
      ruleData: { chessParty: { kings: { P1: p1King.id, P2: p2King.id } } },
    },
  };
  const p1Dead = applyRuleDeclarationWinChecks(
    setUnit(state, p1King.id, { isAlive: false, hp: 0 }),
    []
  );
  assert(p1Dead.state.phase === "ended", "dead King should end the game");
  assert(
    p1Dead.events.some((event) => event.type === "gameEnded" && event.winner === "P2"),
    "opponent should win when one King dies"
  );

  const bothDead = applyRuleDeclarationWinChecks(
    setUnit(setUnit(state, p1King.id, { isAlive: false, hp: 0 }), p2King.id, {
      isAlive: false,
      hp: 0,
    }),
    []
  );
  assert(bothDead.state.phase === "ended", "simultaneous dead Kings should end game");
  assert(bothDead.events.some((event) => event.type === "gameDraw"), "draw event should be emitted");

  console.log("chess_king_death_and_draw passed");
}

export function testMoonGameStraightMovementBonus() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  const knight = Object.values(state.units).find((unit) => unit.owner === "P1" && unit.class === "knight")!;
  state = setUnit(state, knight.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", knight.id);
  state = initKnowledgeForOwners({
    ...state,
    ruleDeclaration: {
      selectedRuleId: "moon_game",
      chooserPlayer: "P2",
      setupComplete: true,
      ruleData: { moonGame: {} },
    },
  });
  const moves = coordKeys(getLegalMovesForUnit(state, knight.id));
  assert(moves.includes("4,2"), "Moon Game should add +1 straight movement reach");

  console.log("moon_game_straight_movement_bonus passed");
}

export function testCourtRoundEndRollsEffectsAndSwapsRoles() {
  const rng = makeRngSequence([0.0, 0.0]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  const p1Unit = Object.values(state.units).find((unit) => unit.owner === "P1")!;
  const p2Unit = Object.values(state.units).find((unit) => unit.owner === "P2")!;
  state = setUnit(state, p1Unit.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, p2Unit.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", p1Unit.id);
  state = initKnowledgeForOwners({
    ...state,
    turnQueue: [p1Unit.id, p2Unit.id],
    turnOrder: [p1Unit.id, p2Unit.id],
    ruleDeclaration: {
      selectedRuleId: "court",
      chooserPlayer: "P2",
      setupComplete: true,
      ruleData: {
        court: {
          attackerPlayer: "P2",
          defenderPlayer: "P1",
        },
      },
    },
  });
  const requested = handleRuleDeclarationRoundEnd(
    state,
    {
      nextRoundNumber: 2,
      nextTurnNumber: 2,
      nextIndex: 0,
      nextUnitId: p1Unit.id,
      nextPlayer: "P1",
    },
    rng
  );
  const resolved = resolveAllPendingRolls(requested.state, rng);
  assert(
    resolved.state.ruleDeclaration.ruleData.court?.attackerPlayer === "P1",
    "Court roles should swap after both effects resolve"
  );
  assert(resolved.state.roundNumber === 2, "round should advance after Court pending resolves");

  console.log("court_round_end_rolls_effects_and_swaps_roles passed");
}
