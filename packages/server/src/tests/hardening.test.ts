import assert from "assert";
import { randomUUID } from "node:crypto";
import { mock } from "node:test";
import {
  ABILITY_RIVER_PERSON_BOAT,
  ABILITY_RIVER_PERSON_BOATMAN,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  getMovementActionsRemaining,
  HERO_CHIKATILO_ID,
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_RIVER_PERSON_ID,
  projectEventsForRecipient,
  type GameEvent,
  type GameState,
  type UnitState,
} from "rules";
import { buildServer } from "../index";
import { enqueueRoomCommand, fateRoomKey } from "../roomQueue";
import {
  applyGameAction,
  cleanupGameRooms,
  createGameRoomWithId,
  getGameRoom,
  storeTestHooks,
} from "../store";
import { GameActionSchema } from "../schemas";
import { wsTestHooks } from "../ws";

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

function makeSeatedRoom(params: {
  roomIdPrefix: string;
  connId?: string;
  resumeToken?: string;
}) {
  const connId = params.connId ?? `conn-${randomUUID()}`;
  const resumeToken = params.resumeToken ?? `token-${randomUUID()}`;
  const room = createGameRoomWithId(`${params.roomIdPrefix}-${randomUUID()}`, {
    hostSeat: "P1",
    hostConnId: connId,
  });
  room.seatTokens.P1 = resumeToken;
  return { room, connId, resumeToken };
}

function setUnit(
  state: GameState,
  unitId: string,
  patch: Partial<UnitState>
): GameState {
  const unit = state.units[unitId];
  assert(unit, `missing unit ${unitId}`);
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: { ...unit, ...patch },
    },
  };
}

function restoreEnv(name: string, previous: string | undefined) {
  if (previous === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previous;
  }
}

async function testGraceExpiryVacatesSeatAndInvalidatesToken() {
  wsTestHooks.resetWsStateForTests();
  mock.timers.enable({ apis: ["Date", "setTimeout"] });
  try {
    const { room, connId, resumeToken } = makeSeatedRoom({
      roomIdPrefix: "hardening-grace-expiry",
    });
    const meta = {
      channel: "fate",
      roomId: room.id,
      role: "P1",
      seat: "P1",
      connId,
      resumeToken,
    };

    wsTestHooks.scheduleSeatGrace(room, meta as any);
    assert.equal(wsTestHooks.hasSeatGraceToken(resumeToken), true);
    assert.equal(
      wsTestHooks.canAssignSeat(
        room,
        "P1",
        `intruder-${randomUUID()}`,
        `intruder-token-${randomUUID()}`
      ),
      false,
      "seat must remain reserved during grace"
    );

    const graceMs = Number(process.env.RECONNECT_GRACE_MS ?? 45_000);
    mock.timers.tick(graceMs + 1);
    await flushMicrotasks();

    assert.equal(room.seats.P1, null, "grace expiry should vacate seat");
    assert.equal(room.seatTokens.P1, null, "grace expiry should clear seat token");
    assert.equal(
      wsTestHooks.hasSeatGraceToken(resumeToken),
      false,
      "grace token record must be removed after expiry"
    );

    const newcomerConn = `newcomer-${randomUUID()}`;
    const newcomerToken = `newcomer-token-${randomUUID()}`;
    assert.equal(
      wsTestHooks.assignSeat(room, "P1", newcomerConn, newcomerToken),
      true,
      "vacated seat should be claimable as a fresh join"
    );
    assert.equal(
      wsTestHooks.canAssignSeat(room, "P1", `stale-${randomUUID()}`, resumeToken),
      false,
      "stale token must not reclaim a re-occupied seat"
    );
  } finally {
    mock.timers.reset();
    wsTestHooks.resetWsStateForTests();
  }
  console.log("hardening_grace_expiry_invalidates_token passed");
}

async function testReconnectWithinGraceKeepsSeatAndClearsTimer() {
  wsTestHooks.resetWsStateForTests();
  mock.timers.enable({ apis: ["Date", "setTimeout"] });
  try {
    const { room, resumeToken } = makeSeatedRoom({
      roomIdPrefix: "hardening-grace-reconnect",
    });
    const reconnectConnId = `reconnected-${randomUUID()}`;
    const meta = {
      channel: "fate",
      roomId: room.id,
      role: "P1",
      seat: "P1",
      connId: room.seats.P1,
      resumeToken,
    };

    wsTestHooks.scheduleSeatGrace(room, meta as any);
    assert.equal(wsTestHooks.hasSeatGraceToken(resumeToken), true);

    wsTestHooks.clearSeatGraceByToken(resumeToken);
    assert.equal(
      wsTestHooks.hasSeatGraceToken(resumeToken),
      false,
      "reconnect path must clear pending grace timer"
    );

    assert.equal(
      wsTestHooks.assignSeat(room, "P1", reconnectConnId, resumeToken),
      true,
      "reconnect with valid token should restore seat"
    );

    const graceMs = Number(process.env.RECONNECT_GRACE_MS ?? 45_000);
    mock.timers.tick(graceMs + 1);
    await flushMicrotasks();

    assert.equal(room.seats.P1, reconnectConnId, "reconnected seat must stay occupied");
    assert.equal(
      room.seatTokens.P1,
      resumeToken,
      "reconnected seat must keep the reconnect token"
    );
  } finally {
    mock.timers.reset();
    wsTestHooks.resetWsStateForTests();
  }
  console.log("hardening_reconnect_clears_grace_timer passed");
}

async function testConcurrentSwitchRoleSerialization() {
  wsTestHooks.resetWsStateForTests();
  const { room, connId, resumeToken } = makeSeatedRoom({
    roomIdPrefix: "hardening-switch-queue",
  });
  let meta = {
    channel: "fate",
    roomId: room.id,
    role: "P1",
    seat: "P1",
    connId,
    resumeToken,
  };

  const order: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let markFirstApplied!: () => void;
  const firstApplied = new Promise<void>((resolve) => {
    markFirstApplied = resolve;
  });

  const firstSwitch = enqueueRoomCommand(fateRoomKey(room.id), async () => {
    order.push("first:start");
    const transition = wsTestHooks.buildSwitchRoleTransition(room, meta as any, "spectator");
    assert.equal(transition.ok, true, "first switch should be accepted");
    if (!transition.ok) return;
    wsTestHooks.applySeatMutationSnapshot(room, transition.nextRoom);
    meta = transition.nextMeta as any;
    order.push("first:applied");
    markFirstApplied();
    await firstGate;
    order.push("first:end");
  });

  const secondSwitch = enqueueRoomCommand(fateRoomKey(room.id), () => {
    order.push("second:start");
    const transition = wsTestHooks.buildSwitchRoleTransition(room, meta as any, "P2");
    assert.equal(transition.ok, true, "second switch should be accepted");
    if (!transition.ok) return;
    wsTestHooks.applySeatMutationSnapshot(room, transition.nextRoom);
    meta = transition.nextMeta as any;
    order.push("second:end");
  });

  await firstApplied;
  assert.deepEqual(order, ["first:start", "first:applied"]);

  releaseFirst();
  await Promise.all([firstSwitch, secondSwitch]);

  assert.deepEqual(order, [
    "first:start",
    "first:applied",
    "first:end",
    "second:start",
    "second:end",
  ]);
  assert.equal(room.seats.P1, null);
  assert.equal(room.seats.P2, connId);
  const occupiedByConn = (["P1", "P2"] as const).filter(
    (seat) => room.seats[seat] === connId
  );
  assert.equal(occupiedByConn.length, 1, "socket must never end up in two seats");

  const sameRole = wsTestHooks.buildSwitchRoleTransition(room, meta as any, "P2");
  assert.equal(sameRole.ok, false, "same-role switch should be rejected");
  if (!sameRole.ok) {
    assert.equal(sameRole.code, "ALREADY_IN_ROLE");
  }
  console.log("hardening_switch_role_queue_serialized passed");
}

function testRejectedActionLogAndRevisionInvariants() {
  const room = createGameRoomWithId(`hardening-log-${randomUUID()}`, {
    hostSeat: "P1",
    hostConnId: `conn-${randomUUID()}`,
  });

  const revision0 = room.revision;
  const logLen0 = room.actionLog.length;

  const rejectedBefore = applyGameAction(room, { type: "endTurn" }, "P1");
  assert.equal(rejectedBefore.ok, false);
  if (!rejectedBefore.ok) {
    assert.equal(rejectedBefore.code, "RULES_REJECTED");
  }
  assert.equal(room.revision, revision0, "rejected action must not change revision");
  assert.equal(room.actionLog.length, logLen0, "rejected action must not append log");

  const accepted = applyGameAction(
    room,
    { type: "setReady", player: "P1", ready: true },
    "P1"
  );
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.logIndex, logLen0, "accepted action should expose log index");
  }
  assert.equal(room.revision, revision0 + 1, "accepted action should increment revision");
  assert.equal(room.actionLog.length, logLen0 + 1, "accepted action should append log");

  const rejectedAfter = applyGameAction(room, { type: "endTurn" }, "P1");
  assert.equal(rejectedAfter.ok, false);
  assert.equal(
    room.revision,
    revision0 + 1,
    "rejected action after accepted one must keep revision stable"
  );
  assert.equal(
    room.actionLog.length,
    logLen0 + 1,
    "rejected action after accepted one must not append log"
  );
  console.log("hardening_rejected_action_log_invariants passed");
}

function testRateLimitWindowResets() {
  wsTestHooks.resetWsStateForTests();
  mock.timers.enable({ apis: ["Date"] });
  try {
    const socket = {} as any;
    const maxMessages = Number(process.env.WS_RATE_LIMIT_MAX_MESSAGES ?? 60);
    const windowMs = Number(process.env.WS_RATE_LIMIT_WINDOW_MS ?? 1000);

    for (let i = 0; i < maxMessages; i += 1) {
      assert.equal(
        wsTestHooks.consumeSocketRateBudget(socket),
        true,
        "messages up to the window budget should pass"
      );
    }
    assert.equal(
      wsTestHooks.consumeSocketRateBudget(socket),
      false,
      "message over the window budget should be limited"
    );

    mock.timers.tick(windowMs + 1);
    assert.equal(
      wsTestHooks.consumeSocketRateBudget(socket),
      true,
      "budget should reset after the rate-limit window"
    );
  } finally {
    mock.timers.reset();
    wsTestHooks.resetWsStateForTests();
  }
  console.log("hardening_rate_limit_window_reset passed");
}

function testPayloadCapAllowsValidClientCommands() {
  const payloadCapBytes = Number(process.env.WS_MAX_PAYLOAD_BYTES ?? 64 * 1024);
  const representativeJoinMessage = JSON.stringify({
    type: "joinRoom",
    mode: "create",
    role: "P1",
    name: "x".repeat(128),
    resumeToken: `resume-${randomUUID()}`,
    figureSet: {
      assassin: "chikatilo",
      archer: "jebe",
      berserker: "guts",
      rider: "genghisKhan",
      spearman: "vladTepes",
      trickster: "loki",
      knight: "elCidCompeador",
    },
  });
  assert.equal(
    Buffer.byteLength(representativeJoinMessage) < payloadCapBytes,
    true,
    "payload cap should keep headroom for normal join/action command sizes"
  );
  console.log("hardening_payload_cap_headroom passed");
}

function testGroznyTyrantPendingChoicePayloadsAccepted() {
  const actions = [
    {
      type: "resolvePendingRoll",
      pendingRollId: "roll-1",
      choice: { type: "groznyTyrantOption", mode: "invadeTime" },
    },
    {
      type: "resolvePendingRoll",
      pendingRollId: "roll-1",
      choice: { type: "groznyTyrantAlly", targetId: "ally-1" },
    },
    {
      type: "resolvePendingRoll",
      pendingRollId: "roll-1",
      choice: {
        type: "groznyTyrantAttackCell",
        mode: "normal",
        targetId: "ally-1",
        position: { col: 4, row: 3 },
      },
    },
  ];

  for (const action of actions) {
    const parsed = GameActionSchema.safeParse(action);
    assert.equal(parsed.success, true);
  }

  console.log("hardening_grozny_tyrant_pending_choice_payloads passed");
}

async function testRestDebugEndpointsGatedInProduction() {
  storeTestHooks.reset();
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDebugToken = process.env.FATE_DEBUG_TOKEN;
  process.env.NODE_ENV = "production";
  process.env.FATE_DEBUG_TOKEN = "rest-secret";

  const server = await buildServer();
  try {
    const room = createGameRoomWithId(`hardening-rest-${randomUUID()}`, {
      hostSeat: "P1",
      hostConnId: `conn-${randomUUID()}`,
    });

    const deniedView = await server.inject({
      method: "GET",
      url: `/api/games/${room.id}?playerId=P1`,
    });
    assert.equal(deniedView.statusCode, 401);

    const deniedLog = await server.inject({
      method: "GET",
      url: `/api/games/${room.id}/log`,
    });
    assert.equal(deniedLog.statusCode, 401);

    const deniedAction = await server.inject({
      method: "POST",
      url: `/api/games/${room.id}/actions?playerId=P1`,
      payload: { type: "setReady", player: "P1", ready: true },
    });
    assert.equal(deniedAction.statusCode, 401);

    const allowedView = await server.inject({
      method: "GET",
      url: `/api/games/${room.id}?playerId=P1`,
      headers: { "x-fate-debug-token": "rest-secret" },
    });
    assert.equal(allowedView.statusCode, 200);
  } finally {
    await server.close();
    restoreEnv("NODE_ENV", previousNodeEnv);
    restoreEnv("FATE_DEBUG_TOKEN", previousDebugToken);
    storeTestHooks.reset();
  }

  process.env.NODE_ENV = "development";
  const devServer = await buildServer();
  try {
    const room = createGameRoomWithId(`hardening-rest-dev-${randomUUID()}`, {
      hostSeat: "P1",
      hostConnId: `conn-${randomUUID()}`,
    });
    const devView = await devServer.inject({
      method: "GET",
      url: `/api/games/${room.id}?playerId=P1`,
    });
    assert.equal(devView.statusCode, 200);
  } finally {
    await devServer.close();
    restoreEnv("NODE_ENV", previousNodeEnv);
    storeTestHooks.reset();
  }

  console.log("hardening_rest_debug_endpoints_gated passed");
}

function testIdleRoomCleanupExpiresRoom() {
  storeTestHooks.reset();
  mock.timers.enable({ apis: ["Date"] });
  try {
    const room = createGameRoomWithId(`hardening-cleanup-idle-${randomUUID()}`);
    const ttlMs = 1000;
    mock.timers.tick(ttlMs + 1);
    const removed = cleanupGameRooms({
      roomTtlMs: ttlMs,
      activeRoomIds: new Set(),
    });
    assert(removed.includes(room.id), "idle room should be removed after TTL");
    assert.equal(getGameRoom(room.id), undefined);
  } finally {
    mock.timers.reset();
    storeTestHooks.reset();
  }
  console.log("hardening_idle_room_cleanup_expires passed");
}

function testActiveRoomCleanupDoesNotExpireRoom() {
  storeTestHooks.reset();
  mock.timers.enable({ apis: ["Date"] });
  try {
    const room = createGameRoomWithId(`hardening-cleanup-active-${randomUUID()}`);
    const ttlMs = 1000;
    mock.timers.tick(ttlMs + 1);
    const removed = cleanupGameRooms({
      roomTtlMs: ttlMs,
      activeRoomIds: new Set([room.id]),
    });
    assert(!removed.includes(room.id), "active room must not be removed by TTL");
    assert.equal(getGameRoom(room.id)?.id, room.id);
  } finally {
    mock.timers.reset();
    storeTestHooks.reset();
  }
  console.log("hardening_active_room_cleanup_keeps_room passed");
}

function testActionLogTruncatesToConfiguredLimit() {
  storeTestHooks.reset();
  const previousMaxLogEvents = process.env.MAX_LOG_EVENTS;
  process.env.MAX_LOG_EVENTS = "2";
  try {
    const room = createGameRoomWithId(`hardening-log-truncate-${randomUUID()}`, {
      hostSeat: "P1",
      hostConnId: `conn-${randomUUID()}`,
    });
    applyGameAction(room, { type: "setReady", player: "P1", ready: true }, "P1");
    applyGameAction(room, { type: "setReady", player: "P1", ready: false }, "P1");
    applyGameAction(room, { type: "setReady", player: "P1", ready: true }, "P1");

    assert.equal(room.actionLog.length, 2, "action log should keep configured tail");
    assert.equal(room.actionLog[0].revision, 2);
    assert.equal(room.actionLog[1].revision, 3);
  } finally {
    restoreEnv("MAX_LOG_EVENTS", previousMaxLogEvents);
    storeTestHooks.reset();
  }
  console.log("hardening_action_log_truncates passed");
}

function testProjectedEventsRedactHiddenUnitPositions() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  const hidden = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "assassin"
  );
  assert(hidden, "expected P1 assassin");
  state = setUnit(state, hidden.id, {
    position: { col: 2, row: 2 },
    isStealthed: true,
    isAlive: true,
  });
  const event: GameEvent = {
    type: "unitMoved",
    unitId: hidden.id,
    from: { col: 1, row: 1 },
    to: { col: 2, row: 2 },
  };

  const ownerEvents = projectEventsForRecipient(state, [event], "P1");
  const opponentEvents = projectEventsForRecipient(state, [event], "P2");
  const spectatorEvents = projectEventsForRecipient(state, [event], "spectator");

  assert.deepEqual(ownerEvents[0], event, "owner should receive full hidden move");
  assert.equal("from" in (opponentEvents[0] as Record<string, unknown>), false);
  assert.equal("to" in (opponentEvents[0] as Record<string, unknown>), false);
  assert.equal("from" in (spectatorEvents[0] as Record<string, unknown>), false);
  assert.equal("to" in (spectatorEvents[0] as Record<string, unknown>), false);

  console.log("hardening_projected_events_redact_hidden_positions passed");
}

function testServerAcceptsMoveIntoUnknownHiddenOccupiedCell() {
  storeTestHooks.reset();
  try {
    const room = createGameRoomWithId(`hardening-hidden-move-${randomUUID()}`, {
      hostSeat: "P1",
      hostConnId: `conn-${randomUUID()}`,
    });

    let state = createEmptyGame();
    state = attachArmy(state, createDefaultArmy("P1"));
    state = attachArmy(state, createDefaultArmy("P2"));

    const hidden = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.class === "assassin"
    );
    const mover = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.class === "knight"
    );
    assert(hidden, "expected P1 hidden assassin");
    assert(mover, "expected P2 mover");

    state = setUnit(state, hidden.id, {
      position: { col: 3, row: 4 },
      isStealthed: true,
      stealthTurnsLeft: 3,
    });
    state = setUnit(state, mover.id, {
      position: { col: 3, row: 3 },
    });
    state = {
      ...state,
      phase: "battle",
      currentPlayer: "P2",
      activeUnitId: mover.id,
      turnQueue: [mover.id],
      turnOrder: [mover.id],
      placementOrder: [mover.id],
      knowledge: {
        P1: { [hidden.id]: true },
        // Mimics stale pre-stealth visibility. Last-known is not exact knowledge.
        P2: { [mover.id]: true, [hidden.id]: true },
      },
      lastKnownPositions: {
        P1: {},
        P2: { [hidden.id]: { col: 3, row: 4 } },
      },
    };
    room.state = state;

    const result = applyGameAction(
      room,
      { type: "move", unitId: mover.id, to: { col: 3, row: 4 } },
      "P2"
    );

    assert.equal(result.ok, true, "server should accept move into unknown hidden cell");
    assert.deepEqual(
      room.state.units[mover.id].position,
      { col: 3, row: 4 },
      "mover should occupy the hidden unit cell"
    );
    assert.equal(
      room.state.units[hidden.id].isStealthed,
      true,
      "hidden unit should remain stealthed"
    );
    if (result.ok) {
      assert(
        !result.events.some((event) => event.type === "stealthRevealed"),
        "accepted move should not emit proximity reveal"
      );
    }
  } finally {
    storeTestHooks.reset();
  }

  console.log("hardening_server_accepts_move_into_unknown_hidden_cell passed");
}

function testServerRejectsInvalidFalsePromisePlacementsWithoutMutation() {
  storeTestHooks.reset();
  try {
    const room = createGameRoomWithId(
      `hardening-false-promise-placement-${randomUUID()}`,
      {
        hostSeat: "P1",
        hostConnId: `conn-${randomUUID()}`,
      }
    );

    let state = createEmptyGame();
    state = attachArmy(
      state,
      createDefaultArmy("P1", { assassin: HERO_CHIKATILO_ID })
    );
    state = attachArmy(state, createDefaultArmy("P2"));
    state = {
      ...state,
      phase: "placement",
      currentPlayer: "P1",
      placementFirstPlayer: "P1",
      initiative: { P1: 6, P2: 1, winner: "P1" },
    };
    room.state = state;

    const chikatilo = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.heroId === HERO_CHIKATILO_ID
    );
    const token = Object.values(state.units).find(
      (unit) =>
        unit.owner === "P1" && unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID
    );
    assert(chikatilo, "expected Chikatilo in server placement state");
    assert(token, "expected False Promise token in server placement state");

    const beforeTokenReject = room.state;
    const tokenRejected = applyGameAction(
      room,
      {
        type: "placeUnit",
        unitId: token.id,
        position: { col: 4, row: 4 },
      },
      "P1"
    );
    assert.equal(tokenRejected.ok, false);
    if (!tokenRejected.ok) {
      assert.equal(
        tokenRejected.code,
        "false_promise_token_must_be_in_deployment_zone"
      );
    }
    assert.equal(room.state, beforeTokenReject);
    assert.equal(room.revision, 0);

    const tokenAccepted = applyGameAction(
      room,
      {
        type: "placeUnit",
        unitId: token.id,
        position: { col: 1, row: 0 },
      },
      "P1"
    );
    assert.equal(tokenAccepted.ok, true);
    const pending = room.state.pendingRoll;
    assert.equal(pending?.kind, "chikatiloFalseTrailPlacement");

    for (const position of [
      { col: 4, row: 0 },
      { col: 4, row: room.state.boardSize - 1 },
    ]) {
      const beforeReject = room.state;
      const revisionBeforeReject = room.revision;
      const rejectedPlacement = applyGameAction(
        room,
        {
          type: "resolvePendingRoll",
          pendingRollId: pending!.id,
          player: pending!.player,
          choice: { type: "chikatiloPlace", position },
        },
        "P1"
      );
      assert.equal(rejectedPlacement.ok, false);
      if (!rejectedPlacement.ok) {
        assert.equal(
          rejectedPlacement.code,
          "chikatilo_cannot_be_placed_on_deployment_line"
        );
      }
      assert.equal(room.state, beforeReject);
      assert.equal(room.revision, revisionBeforeReject);
      assert.equal(room.state.pendingRoll?.id, pending!.id);
      assert.equal(room.state.units[chikatilo.id].position, null);
    }

    const realAccepted = applyGameAction(
      room,
      {
        type: "resolvePendingRoll",
        pendingRollId: pending!.id,
        player: pending!.player,
        choice: {
          type: "chikatiloPlace",
          position: { col: 4, row: 4 },
        },
      },
      "P1"
    );
    assert.equal(realAccepted.ok, true);
    assert.deepEqual(room.state.units[chikatilo.id].position, {
      col: 4,
      row: 4,
    });
  } finally {
    storeTestHooks.reset();
  }

  console.log("hardening_false_promise_placement_validation passed");
}

function testRiverBoatmanCommandsPreserveAuthoritativeMovementBudget() {
  storeTestHooks.reset();
  try {
    const room = createGameRoomWithId(`hardening-river-boatman-${randomUUID()}`, {
      hostSeat: "P1",
      hostConnId: `conn-${randomUUID()}`,
    });
    let state = createEmptyGame();
    state = attachArmy(
      state,
      createDefaultArmy("P1", { rider: HERO_RIVER_PERSON_ID })
    );
    state = attachArmy(state, createDefaultArmy("P2"));
    const river = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.heroId === HERO_RIVER_PERSON_ID
    );
    assert(river, "River Person should exist in server regression state");
    state = setUnit(state, river.id, { position: { col: 0, row: 0 } });
    state = {
      ...state,
      phase: "battle",
      currentPlayer: "P1",
      activeUnitId: river.id,
      turnOrder: [river.id],
      turnOrderIndex: 0,
      turnQueue: [river.id],
      turnQueueIndex: 0,
    };
    room.state = state;

    const boatman = applyGameAction(
      room,
      {
        type: "useAbility",
        unitId: river.id,
        abilityId: ABILITY_RIVER_PERSON_BOATMAN,
      },
      "P1"
    );
    assert.equal(boatman.ok, true, "Boatman should be accepted with Action available");
    assert.equal(room.state.units[river.id].turn.actionUsed, true);
    assert.equal(getMovementActionsRemaining(room.state.units[river.id]), 2);

    const beforeDuplicate = room.state;
    const revisionBeforeDuplicate = room.revision;
    const duplicate = applyGameAction(
      room,
      {
        type: "useAbility",
        unitId: river.id,
        abilityId: ABILITY_RIVER_PERSON_BOATMAN,
      },
      "P1"
    );
    assert.equal(duplicate.ok, false, "Boatman should be rejected after Action is spent");
    assert.equal(room.state, beforeDuplicate, "Rejected Boatman must not mutate state");
    assert.equal(room.revision, revisionBeforeDuplicate);
    assert.equal(getMovementActionsRemaining(room.state.units[river.id]), 2);

    const moved = applyGameAction(
      room,
      { type: "move", unitId: river.id, to: { col: 0, row: 2 } },
      "P1"
    );
    assert.equal(moved.ok, true, "Move should be accepted after Boatman");
    assert.equal(getMovementActionsRemaining(room.state.units[river.id]), 1);

    const boat = applyGameAction(
      room,
      {
        type: "useAbility",
        unitId: river.id,
        abilityId: ABILITY_RIVER_PERSON_BOAT,
      },
      "P1"
    );
    assert.equal(boat.ok, true, "Boat targeting should be accepted on the granted move");
    assert.equal(room.state.pendingRoll?.kind, "riverBoatCarryChoice");
    assert.equal(
      getMovementActionsRemaining(room.state.units[river.id]),
      1,
      "Starting Boat targeting must not spend movement"
    );
    const pendingBoat = room.state.pendingRoll!;
    const canceledBoat = applyGameAction(
      room,
      {
        type: "resolvePendingRoll",
        pendingRollId: pendingBoat.id,
        player: pendingBoat.player,
        choice: "skip",
      },
      "P1"
    );
    assert.equal(canceledBoat.ok, true, "Canceling Boat targeting should resolve cleanly");
    assert.equal(getMovementActionsRemaining(room.state.units[river.id]), 1);

    const beforeRejectedMove = room.state;
    const revisionBeforeRejectedMove = room.revision;
    const rejectedMove = applyGameAction(
      room,
      { type: "move", unitId: river.id, to: { col: 8, row: 8 } },
      "P1"
    );
    assert.equal(rejectedMove.ok, false, "Illegal Move should be rejected");
    assert.equal(room.state, beforeRejectedMove, "Rejected Move must not mutate budget");
    assert.equal(room.revision, revisionBeforeRejectedMove);
    assert.equal(getMovementActionsRemaining(room.state.units[river.id]), 1);
  } finally {
    storeTestHooks.reset();
  }

  console.log("hardening_river_boatman_authoritative_budget passed");
}

async function main() {
  await testGraceExpiryVacatesSeatAndInvalidatesToken();
  await testReconnectWithinGraceKeepsSeatAndClearsTimer();
  await testConcurrentSwitchRoleSerialization();
  testRejectedActionLogAndRevisionInvariants();
  testRateLimitWindowResets();
  testPayloadCapAllowsValidClientCommands();
  testGroznyTyrantPendingChoicePayloadsAccepted();
  await testRestDebugEndpointsGatedInProduction();
  testIdleRoomCleanupExpiresRoom();
  testActiveRoomCleanupDoesNotExpireRoom();
  testActionLogTruncatesToConfiguredLimit();
  testProjectedEventsRedactHiddenUnitPositions();
  testServerAcceptsMoveIntoUnknownHiddenOccupiedCell();
  testServerRejectsInvalidFalsePromisePlacementsWithoutMutation();
  testRiverBoatmanCommandsPreserveAuthoritativeMovementBudget();
  console.log("hardening tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
