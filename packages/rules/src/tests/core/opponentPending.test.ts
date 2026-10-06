import assert from "node:assert/strict";
import {
  applyAction,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  HERO_HASSAN_ID,
  HERO_JACK_RIPPER_ID,
  HERO_VLAD_TEPES_ID,
  makePlayerView,
  makeSpectatorView,
  projectEventsForRecipient,
  SeededRNG,
} from "../../index";
import type { Coord, GameState, PendingDecisionView, UnitClass } from "../../model";
import { requestVladStakesPlacement } from "../../actions/heroes/vlad";
import { requestHassanAssassinOrderSelection } from "../../actions/heroes/hassan";
import { maybeTriggerChargedImpulseChoice } from "../../actions/chargedImpulses";

function setup(heroId: string, unitClass: UnitClass) {
  let state = attachArmy(createEmptyGame(), createDefaultArmy("P1", { [unitClass]: heroId }));
  state = attachArmy(state, createDefaultArmy("P2"));
  const units = { ...state.units };
  let p1 = 1;
  let p2 = 1;
  for (const unit of Object.values(units)) {
    units[unit.id] = {
      ...unit,
      position: { col: unit.owner === "P1" ? p1++ : p2++, row: unit.owner === "P1" ? 0 : 8 },
    };
  }
  const source = Object.values(units).find((unit) => unit.heroId === heroId)!;
  state = {
    ...state,
    units,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: source.id,
    turnNumber: 2,
  };
  return { state, source: state.units[source.id] };
}

function waiting(decision: PendingDecisionView | null | undefined) {
  assert.ok(decision && !decision.viewerCanRespond);
  assert.deepEqual(Object.keys(decision).sort(), [
    "opponentStatus",
    "ownerPlayerId",
    "type",
    "viewerCanRespond",
  ]);
  assert.equal(decision.ownerPlayerId, "P1");
  assert.equal(decision.type, "opponentResolvingDecision");
  const serialized = JSON.stringify(decision);
  for (const privateField of [
    "context",
    "legalCells",
    "legalPositions",
    "options",
    "selectedCells",
    "targetIds",
    "eligibleUnitIds",
    "placement",
    "count",
    "step",
  ]) {
    assert.equal(
      serialized.includes(`"${privateField}"`),
      false,
      `${privateField} must never enter the waiting projection`,
    );
  }
  return decision;
}

function vladPending() {
  const { state } = setup(HERO_VLAD_TEPES_ID, "spearman");
  return requestVladStakesPlacement(state, "P1", "turnStart").state;
}

export function testVladStakePendingDecisionIsPrivate() {
  const state = vladPending();
  // Future context additions must not implicitly enter the opponent's projection.
  state.pendingRoll!.context.selectedCells = [{ col: 3, row: 4 }];
  state.stakeMarkers = [
    {
      id: "private-stake",
      owner: "P1",
      position: { col: 3, row: 4 },
      isRevealed: false,
      createdAt: 1,
    },
  ];
  const owner = makePlayerView(state, "P1");
  assert.equal(owner.pendingDecision?.viewerCanRespond, true);
  assert.equal(owner.pendingRoll?.kind, "vladPlaceStakes");
  assert.ok((owner.pendingRoll!.context.legalPositions as unknown[]).length > 0);
  assert.deepEqual(owner.pendingRoll!.context.selectedCells, [{ col: 3, row: 4 }]);
  const opponent = makePlayerView(state, "P2");
  assert.equal(opponent.pendingRoll, null);
  assert.deepEqual(opponent.stakeMarkers, []);
  assert.equal(waiting(opponent.pendingDecision).opponentStatus.key, "vladStakes");
  assert.equal(waiting(opponent.pendingDecision).opponentStatus.abilityName, "Field of Stakes");
  assert.equal(waiting(makeSpectatorView(state).pendingDecision).opponentStatus.key, "vladStakes");
  console.log("vlad_stake_pending_decision_is_private passed");
}

export function testJackSnarePendingDecisionIsPrivate() {
  const { state: initial, source } = setup(HERO_JACK_RIPPER_ID, "assassin");
  const state: GameState = {
    ...initial,
    jackTrapCounter: 5,
    jackTraps: Array.from({ length: 5 }, (_, index) => ({
      id: `private-snare-${index}`,
      owner: "P1",
      sourceUnitId: source.id,
      position: { col: index, row: 4 },
      isRevealed: false,
      createdAt: index,
      triggeredTargetIds: [],
    })),
  };
  const requested = maybeTriggerChargedImpulseChoice(state, source.id).state;
  const owner = makePlayerView(requested, "P1");
  assert.equal(owner.pendingDecision?.viewerCanRespond, true);
  assert.ok((owner.pendingRoll!.context.options as unknown[]).length > 0);
  const before = waiting(makePlayerView(requested, "P2").pendingDecision);
  assert.equal(before.opponentStatus.key, "jackSnares");
  const selected = applyAction(
    requested,
    {
      type: "resolvePendingRoll",
      player: "P1",
      pendingRollId: requested.pendingRoll!.id,
      choice: { type: "chargedImpulseTarget", position: { col: 0, row: 8 } },
    },
    new SeededRNG(1),
  );
  assert.equal(selected.state.pendingRoll?.context.step, "coveringTracks");
  assert.deepEqual(makePlayerView(selected.state, "P1").pendingRoll!.context.placement, {
    col: 0,
    row: 8,
  });
  const opponent = makePlayerView(selected.state, "P2");
  assert.equal(opponent.pendingRoll, null);
  assert.deepEqual(opponent.jackTraps, []);
  assert.deepEqual(
    waiting(opponent.pendingDecision),
    before,
    "multi-step status must expose no progress",
  );
  const resolved = applyAction(
    selected.state,
    {
      type: "resolvePendingRoll",
      player: "P1",
      pendingRollId: selected.state.pendingRoll!.id,
      choice: { type: "chargedImpulseTarget", position: { col: 4, row: 4 } },
    },
    new SeededRNG(1),
  );
  assert.equal(makePlayerView(resolved.state, "P2").pendingDecision, null);
  assert.equal(resolved.state.jackTraps?.length, 5);
  assert.equal(
    JSON.stringify(projectEventsForRecipient(resolved.state, resolved.events, "P2")).includes(
      "private-snare",
    ),
    false,
  );
  console.log("jack_snare_pending_decision_is_private passed");
}

export function testHassanStealthPendingDecisionIsPrivate() {
  const { state: initial } = setup(HERO_HASSAN_ID, "assassin");
  const state = requestHassanAssassinOrderSelection(initial, "P1").state;
  const owner = makePlayerView(state, "P1");
  const eligible = owner.pendingRoll!.context.eligibleUnitIds as string[];
  assert.ok(eligible.length >= 2);
  state.pendingRoll!.context.targetIds = eligible.slice(0, 2);
  const opponent = makePlayerView(state, "P2");
  assert.equal(opponent.pendingRoll, null);
  assert.equal(waiting(opponent.pendingDecision).opponentStatus.key, "hassanStealth");
  const resolved = applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: state.pendingRoll!.id,
      player: "P1",
      choice: { type: "hassanAssassinOrderPick", unitIds: eligible.slice(0, 2) },
    },
    new SeededRNG(1),
  );
  const publicEvents = projectEventsForRecipient(resolved.state, resolved.events, "P2");
  for (const id of eligible.slice(0, 2))
    assert.equal(JSON.stringify(publicEvents).includes(id), false);
  assert.equal(makePlayerView(resolved.state, "P2").pendingDecision, null);
  console.log("hassan_stealth_pending_decision_is_private passed");
}

export function testOpponentCannotRespondToOtherPlayersDecision() {
  const state = vladPending();
  const before = JSON.stringify(state);
  const result = applyAction(
    state,
    {
      type: "resolvePendingRoll",
      player: "P2",
      pendingRollId: state.pendingRoll!.id,
      choice: {
        type: "placeStakes",
        positions: (state.pendingRoll!.context.legalPositions as Coord[]).slice(0, 3),
      },
    },
    new SeededRNG(1),
  );
  assert.equal(result.state, state);
  assert.equal(JSON.stringify(result.state), before);
  assert.deepEqual(result.events, []);
  console.log("opponent_cannot_respond_to_other_players_decision passed");
}

export function testWaitingStateSurvivesSnapshotReconnect() {
  const state = vladPending();
  const reconnectState = JSON.parse(JSON.stringify(state)) as GameState;
  const reconnect = JSON.parse(JSON.stringify(makePlayerView(reconnectState, "P2")));
  assert.deepEqual(waiting(reconnect.pendingDecision), makePlayerView(state, "P2").pendingDecision);
  assert.equal(reconnect.pendingRoll, null);
  const positions = state.pendingRoll!.context.legalPositions as { col: number; row: number }[];
  const result = applyAction(
    state,
    {
      type: "resolvePendingRoll",
      player: "P1",
      pendingRollId: state.pendingRoll!.id,
      choice: { type: "placeStakes", positions: positions.slice(0, 3) },
    },
    new SeededRNG(1),
  );
  assert.equal(result.state.pendingRoll, null);
  assert.equal(makePlayerView(result.state, "P2").pendingDecision, null);
  const publicEvents = projectEventsForRecipient(result.state, result.events, "P2");
  assert.deepEqual(
    publicEvents.find((event) => event.type === "hiddenSetupCompleted"),
    {
      type: "hiddenSetupCompleted",
      owner: "P1",
      ability: "vladStakes",
    },
  );
  assert.equal(
    publicEvents.some((event) => event.type === "stakesPlaced"),
    false,
  );
  console.log("waiting_state_survives_snapshot_reconnect passed");
}

export function testWaitingPresentationHiddenSourceAndFallback() {
  const state = vladPending();
  const vlad = Object.values(state.units).find((unit) => unit.heroId === HERO_VLAD_TEPES_ID)!;
  state.units[vlad.id] = { ...vlad, isStealthed: true };
  const hidden = waiting(makePlayerView(state, "P2").pendingDecision);
  assert.equal(hidden.opponentStatus.key, "hidden");
  assert.equal(hidden.opponentStatus.abilityName, undefined);
  assert.equal(JSON.stringify(hidden).includes("Vlad"), false);
  state.pendingRoll = {
    id: "future-decision",
    kind: "ruleDeclarationChoice",
    player: "P1",
    context: { targetIds: [vlad.id] },
  };
  assert.equal(waiting(makePlayerView(state, "P2").pendingDecision).opponentStatus.key, "generic");
  console.log("waiting_presentation_hidden_source_and_fallback passed");
}
