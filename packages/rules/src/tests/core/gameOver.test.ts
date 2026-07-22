import {
  HERO_FALSE_TRAIL_TOKEN_ID,
  SeededRNG,
  applyAction,
  applyNormalVictoryCheck,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  type GameState,
} from "../..";
import { assert } from "../helpers/testUtils";

function battleState(): GameState {
  let state = attachArmy(createEmptyGame(), createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  return {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    ruleDeclaration: {
      ...state.ruleDeclaration,
      selectedRuleId: "normal_rule",
      setupComplete: true,
    },
  };
}

function defeatPlayer(state: GameState, player: "P1" | "P2"): GameState {
  return {
    ...state,
    units: Object.fromEntries(
      Object.entries(state.units).map(([id, unit]) => [
        id,
        unit.owner === player ? { ...unit, hp: 0, isAlive: false } : unit,
      ])
    ),
  };
}

export function testAuthoritativeGameOverResultAndTokenRule() {
  let state = defeatPlayer(battleState(), "P2");
  const tokenTemplate = Object.values(state.units).find((unit) => unit.owner === "P2")!;
  state = {
    ...state,
    turnNumber: 14,
    units: {
      ...state.units,
      p2FalseTrail: {
        ...tokenTemplate,
        id: "p2FalseTrail",
        heroId: HERO_FALSE_TRAIL_TOKEN_ID,
        hp: 1,
        isAlive: true,
        position: { col: 4, row: 4 },
      },
    },
  };

  const result = applyNormalVictoryCheck(state, []);
  assert(result.state.phase === "ended", "a living token must not prevent victory");
  assert(result.state.gameOver?.winnerPlayerId === "P1", "winner must be authoritative");
  assert(result.state.gameOver?.loserPlayerId === "P2", "loser must be authoritative");
  assert(
    result.state.gameOver?.reason === "allEnemyUnitsDefeated",
    "normal victory reason must be recorded"
  );
  assert(result.state.gameOver?.endedAtTurn === 14, "ending turn must be recorded");
  assert(
    typeof result.state.gameOver?.endedAtRevision === "number",
    "rules result must contain a revision placeholder"
  );
  console.log("authoritative_game_over_result_and_token_rule passed");
}

export function testVictoryWaitsForPendingDeathResolution() {
  const defeated = defeatPlayer(battleState(), "P2");
  const pending: GameState = {
    ...defeated,
    pendingRoll: {
      id: "death-phantasm",
      kind: "donMadDelusionDirection",
      player: "P2",
      context: {},
    },
  };
  const deferred = applyNormalVictoryCheck(pending, []);
  assert(deferred.state.phase === "battle", "pending death effects must defer victory");
  assert(deferred.state.gameOver === null, "no result may be exposed while death resolves");

  const resolved = applyNormalVictoryCheck({ ...deferred.state, pendingRoll: null }, []);
  assert(resolved.state.phase === "ended", "victory must finalize after the death effect");
  assert(resolved.state.gameOver?.winnerPlayerId === "P1", "resolved victory must keep winner");
  console.log("victory_waits_for_pending_death_resolution passed");
}

export function testActionsRejectedAfterGameOver() {
  const ended = applyNormalVictoryCheck(defeatPlayer(battleState(), "P2"), []).state;
  const rejected = applyAction(ended, { type: "endTurn" }, new SeededRNG(1));
  assert(rejected.state === ended, "post-game actions must not mutate state");
  assert(rejected.events.length === 0, "post-game actions must not emit effects");
  assert(rejected.rejectionReason === "Game is already over.", "rejection must be clear");
  console.log("actions_rejected_after_game_over passed");
}
