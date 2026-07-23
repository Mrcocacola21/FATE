import assert from "assert";
import { randomUUID } from "node:crypto";
import { mock } from "node:test";
import {
  ABILITY_CHIKATILO_ASSASSIN_MARK,
  ABILITY_CHIKATILO_DECOY,
  ABILITY_KAISER_BUNKER,
  ABILITY_ARTEMIDA_SILVER_CRESCENT,
  ABILITY_HASSAN_ASSASIN_ORDER,
  ABILITY_JACK_RIPPER_SNARES,
  ABILITY_LOKI_LAUGHT,
  ABILITY_LUCHE_DIVINE_RAY,
  ABILITY_RIVER_PERSON_BOAT,
  ABILITY_RIVER_PERSON_BOATMAN,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  getMovementActionsRemaining,
  HERO_CHIKATILO_ID,
  HERO_ARTEMIDA_ID,
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_KANEKI_ID,
  HERO_HASSAN_ID,
  HERO_DUOLINGO_ID,
  HERO_GRAND_KAISER_ID,
  HERO_JACK_RIPPER_ID,
  HERO_PAPYRUS_ID,
  HERO_RIVER_PERSON_ID,
  makePlayerView,
  makeEmptyTurnEconomy,
  getStealthSuccessMinRoll,
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

function testLokiLaughPayloadSchemas() {
  const directOptionPayload = GameActionSchema.safeParse({
    type: "useAbility",
    unitId: "P1-trickster-loki",
    abilityId: ABILITY_LOKI_LAUGHT,
    payload: { optionId: "mindControl" },
  });
  const invalidDirectOption = GameActionSchema.safeParse({
    type: "useAbility",
    unitId: "P1-trickster-loki",
    abilityId: ABILITY_LOKI_LAUGHT,
    payload: { optionId: "freeEverything" },
  });
  const optionPayload = GameActionSchema.safeParse({
    type: "resolvePendingRoll",
    pendingRollId: "loki-laugh-option",
    choice: { type: "lokiLaughtOption", option: "chicken" },
  });
  const spinFallbackPayload = GameActionSchema.safeParse({
    type: "resolvePendingRoll",
    pendingRollId: "loki-spin-fallback",
    choice: { type: "lokiSpinAbility", abilityId: ABILITY_LOKI_LAUGHT },
  });
  const invalidOption = GameActionSchema.safeParse({
    type: "resolvePendingRoll",
    pendingRollId: "loki-laugh-option",
    choice: { type: "lokiLaughtOption", option: "mostExpensiveAvailable" },
  });
  assert(optionPayload.success, "server schema should accept a specific Loki Laugh option");
  assert(directOptionPayload.success, "server schema should accept a direct Loki option payload");
  assert.equal(invalidDirectOption.success, false, "server schema must reject invalid direct Loki options");
  assert(spinFallbackPayload.success, "server schema should accept Spin fallback ability choice");
  assert.equal(invalidOption.success, false, "server schema must reject ambiguous Loki options");
  console.log("hardening_loki_laugh_payload_schemas passed");
}

function testLightRayModePayloadSchemas() {
  for (const mode of ["line", "aroundSelf"] as const) {
    const parsed = GameActionSchema.safeParse({
      type: "useAbility",
      unitId: "P1-spearman-luche",
      abilityId: ABILITY_LUCHE_DIVINE_RAY,
      payload:
        mode === "line"
          ? { mode, target: { col: 8, row: 2 } }
          : { mode },
    });
    assert(parsed.success, `server schema should accept Light Ray ${mode} mode`);
  }
  for (const payload of [{ mode: "cone" }, {}, undefined]) {
    const parsed = GameActionSchema.safeParse({
      type: "useAbility",
      unitId: "P1-spearman-luche",
      abilityId: ABILITY_LUCHE_DIVINE_RAY,
      ...(payload === undefined ? {} : { payload }),
    });
    assert.equal(
      parsed.success,
      false,
      "server schema should reject missing or invalid Light Ray modes",
    );
  }
  console.log("hardening_light_ray_mode_payload_schemas passed");
}

function testPapyrusBoneChoicePayloadSchema() {
  for (const boneType of ["blue", "orange"] as const) {
    const parsed = GameActionSchema.safeParse({
      type: "resolvePendingRoll",
      pendingRollId: "papyrus-bone-choice",
      choice: { type: "papyrusBoneChoice", boneType },
    });
    assert(parsed.success, `server schema should accept ${boneType} bone choice`);
  }
  const invalid = GameActionSchema.safeParse({
    type: "resolvePendingRoll",
    pendingRollId: "papyrus-bone-choice",
    choice: { type: "papyrusBoneChoice", boneType: "green" },
  });
  assert.equal(invalid.success, false, "server schema should reject unknown bones");
  console.log("hardening_papyrus_bone_choice_payload_schema passed");
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

function testInvalidCoveringTracksSelectionIsRejectedWithoutMutation() {
  const room = createGameRoomWithId(`hardening-covering-tracks-${randomUUID()}`, {
    hostSeat: "P1",
    hostConnId: `conn-${randomUUID()}`,
  });
  let state = attachArmy(
    createEmptyGame(),
    createDefaultArmy("P1", { assassin: HERO_JACK_RIPPER_ID }),
  );
  state = attachArmy(state, createDefaultArmy("P2"));
  const jack = Object.values(state.units).find(
    (unit) => unit.heroId === HERO_JACK_RIPPER_ID,
  );
  assert(jack);
  state = setUnit(state, jack.id, { position: { col: 8, row: 8 } });
  const positions = [
    { col: 1, row: 1 },
    { col: 2, row: 2 },
    { col: 3, row: 3 },
    { col: 4, row: 4 },
    { col: 5, row: 5 },
  ];
  room.state = {
    ...state,
    phase: "battle",
    activeUnitId: jack.id,
    jackTrapCounter: 5,
    jackTraps: positions.map((position, index) => ({
      id: `jack-snare-P1-${index + 1}`,
      sourceUnitId: jack.id,
      owner: "P1" as const,
      position,
      isRevealed: false,
      triggeredTargetIds: [],
    })),
    pendingRoll: {
      id: "covering-tracks-choice",
      player: "P1",
      kind: "chargedImpulseTargetChoice",
      context: {
        unitId: jack.id,
        abilityId: ABILITY_JACK_RIPPER_SNARES,
        step: "coveringTracks",
        placement: { col: 0, row: 8 },
        options: positions,
      },
    },
  };
  const stateBefore = room.state;
  const revisionBefore = room.revision;
  const logLengthBefore = room.actionLog.length;

  const result = applyGameAction(
    room,
    {
      type: "resolvePendingRoll",
      pendingRollId: "covering-tracks-choice",
      player: "P1",
      choice: { type: "chargedImpulseTarget", position: { col: 8, row: 0 } },
    },
    "P1",
  );

  assert.equal(result.ok, false, "an unlisted snare must be rejected by the server");
  if (!result.ok) assert.equal(result.code, "RULES_REJECTED");
  assert.equal(room.state, stateBefore, "rejection must preserve the authoritative state object");
  assert.equal(room.revision, revisionBefore, "rejection must not increment the revision");
  assert.equal(room.actionLog.length, logLengthBefore, "rejection must not append an action log entry");
  console.log("hardening_invalid_covering_tracks_selection_no_mutation passed");
}

function testTransformedKaiserStealthCommandAndProjectionAreRejected() {
  const room = createGameRoomWithId(`hardening-kaiser-stealth-${randomUUID()}`, {
    hostSeat: "P1",
    hostConnId: `conn-${randomUUID()}`,
  });
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", { archer: HERO_GRAND_KAISER_ID }),
  );
  state = attachArmy(state, createDefaultArmy("P2"));
  const kaiser = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_GRAND_KAISER_ID,
  );
  assert(kaiser, "Grand Kaiser fixture should exist");

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    transformed: true,
    isStealthed: false,
    stealthTurnsLeft: 0,
    bunker: { active: false, ownTurnsInBunker: 0 },
    turn: makeEmptyTurnEconomy(),
  });
  room.state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: kaiser.id,
    pendingRoll: null,
  };

  const projected = makePlayerView(room.state, "P1");
  assert.equal(projected.legalIntents?.canEnterStealth, false);
  assert.equal(
    projected.abilitiesByUnitId[kaiser.id]?.some(
      (ability) => ability.id === ABILITY_KAISER_BUNKER,
    ),
    false,
    "transformed projection must omit the lost Bunker passive",
  );

  const stateBefore = room.state;
  const turnBefore = room.state.units[kaiser.id].turn;
  const revisionBefore = room.revision;
  const logLengthBefore = room.actionLog.length;
  const rejectedCommand = applyGameAction(
    room,
    { type: "enterStealth", unitId: kaiser.id },
    "P1",
  );

  assert.equal(rejectedCommand.ok, false);
  if (!rejectedCommand.ok) {
    assert.equal(
      rejectedCommand.message,
      "Grand Kaiser cannot enter stealth after transformation.",
    );
  }
  assert.equal(room.state, stateBefore, "rejected stealth must preserve authoritative state");
  assert.equal(room.state.units[kaiser.id].turn, turnBefore, "no slot may be spent");
  assert.equal(room.revision, revisionBefore, "rejection must not advance revision");
  assert.equal(room.actionLog.length, logLengthBefore, "rejection must not append a log entry");

  console.log("hardening_transformed_kaiser_stealth_rejected passed");
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

function testNewBatchBoardPendingChoicePayloadsAccepted() {
  for (const choice of [
    { type: "donMadDelusionDirection", direction: { col: 1, row: -1 } },
    { type: "donSorrowfulMove", destination: { col: 3, row: 2 } },
    { type: "donWindmillsReposition", destination: { col: 4, row: 2 } },
    { type: "chargedImpulseTarget", position: { col: 5, row: 2 } },
  ]) {
    const parsed = GameActionSchema.safeParse({
      type: "resolvePendingRoll",
      pendingRollId: "roll-new-batch",
      choice,
    });
    assert.equal(parsed.success, true, `${choice.type} must pass the server schema`);
  }

  console.log("hardening_new_batch_board_pending_choice_payloads passed");
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

function testOrangeBoneDamageIsAuthoritativeAtActionStart() {
  storeTestHooks.reset();
  try {
    const room = createGameRoomWithId(
      `hardening-orange-bone-${randomUUID()}`,
      {
        hostSeat: "P1",
        hostConnId: `conn-${randomUUID()}`,
      }
    );
    let state = createEmptyGame();
    state = attachArmy(
      state,
      createDefaultArmy("P1", { spearman: HERO_PAPYRUS_ID })
    );
    state = attachArmy(state, createDefaultArmy("P2"));
    const papyrus = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.heroId === HERO_PAPYRUS_ID
    )!;
    const defender = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.class === "knight"
    )!;
    const actor = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.class === "knight"
    )!;

    state = setUnit(state, papyrus.id, {
      position: { col: 1, row: 1 },
      ownTurnsStarted: 0,
    });
    state = setUnit(state, defender.id, { position: { col: 4, row: 5 } });
    state = setUnit(state, actor.id, {
      position: { col: 4, row: 4 },
      hp: 6,
      turn: makeEmptyTurnEconomy(),
      papyrusBoneStatus: {
        sourceUnitId: papyrus.id,
        kind: "orange",
        expiresOnSourceOwnTurn: 1,
      },
      orangeBoneFirstMoveSatisfied: false,
      orangeBonePenaltyAppliedThisTurn: false,
      hasSpentMeaningfulTurnAction: false,
    });
    room.state = {
      ...state,
      phase: "battle",
      currentPlayer: "P2",
      activeUnitId: actor.id,
      turnQueue: [actor.id, defender.id],
      turnQueueIndex: 0,
      turnOrder: [actor.id, defender.id],
      turnOrderIndex: 0,
    };

    const revisionBeforeInvalid = room.revision;
    const invalid = applyGameAction(
      room,
      {
        type: "attack",
        attackerId: actor.id,
        defenderId: "missing-unit",
      },
      "P2"
    );
    assert.equal(invalid.ok, false, "invalid pre-resolution commands stay rejected");
    assert.equal(room.revision, revisionBeforeInvalid);
    assert.equal(room.state.units[actor.id].hp, 6);

    const attacked = applyGameAction(
      room,
      {
        type: "attack",
        attackerId: actor.id,
        defenderId: defender.id,
      },
      "P2"
    );
    assert.equal(attacked.ok, true, "legal attack should be accepted");
    assert.equal(
      room.state.units[actor.id].hp,
      5,
      "authoritative HP should update before the pending attack resolves"
    );
    assert(room.state.pendingRoll, "the surviving actor should continue into attack resolution");
    const logEntry = room.actionLog.at(-1)!;
    assert.equal(logEntry.events[0]?.type, "papyrusBonePunished");
    assert.equal(logEntry.events[1]?.type, "rollRequested");
    const ownerView = makePlayerView(room.state, "P2");
    assert.equal(ownerView.units[actor.id].hp, 5, "the owner projection must update immediately");
    const projected = projectEventsForRecipient(room.state, logEntry.events, "P2");
    assert.equal(projected[0]?.type, "papyrusBonePunished");

    console.log("hardening_orange_bone_damage_is_authoritative_at_action_start passed");
  } finally {
    storeTestHooks.reset();
  }
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

function testServerTargetsVisibleEnemyOnHiddenAllySharedCell() {
  const { room } = makeSeatedRoom({ roomIdPrefix: "hardening-shared-cell-attack" });
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1")),
    createDefaultArmy("P2")
  );
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  );
  const hiddenAlly = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "assassin"
  );
  const visibleEnemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  );
  assert(attacker && hiddenAlly && visibleEnemy, "shared-cell attack fixtures should exist");

  state = setUnit(state, attacker.id, {
    position: { col: 3, row: 3 },
    turn: makeEmptyTurnEconomy(),
  });
  state = setUnit(state, hiddenAlly.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, visibleEnemy.id, { position: { col: 4, row: 4 } });
  room.state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: attacker.id,
    turnOrder: [attacker.id, visibleEnemy.id],
    turnOrderIndex: 0,
    turnQueue: [attacker.id, visibleEnemy.id],
    turnQueueIndex: 0,
    knowledge: {
      P1: { [attacker.id]: true, [hiddenAlly.id]: true, [visibleEnemy.id]: true },
      P2: { [visibleEnemy.id]: true },
    },
  };

  const revisionBeforeIllegal = room.revision;
  const illegal = applyGameAction(
    room,
    { type: "attack", attackerId: attacker.id, defenderId: hiddenAlly.id },
    "P1"
  );
  assert.equal(illegal.ok, false, "an allied target id must remain illegal");
  assert.equal(room.revision, revisionBeforeIllegal, "illegal target id must not mutate the room");

  const accepted = applyGameAction(
    room,
    { type: "attack", attackerId: attacker.id, defenderId: visibleEnemy.id },
    "P1"
  );
  assert(accepted.ok, "server should accept the visible enemy target id");
  assert.equal(room.state.pendingRoll?.kind, "attack_attackerRoll");
  assert.equal(room.state.pendingRoll?.context.defenderId, visibleEnemy.id);
  assert.equal(room.state.units[hiddenAlly.id].isStealthed, true);

  const opponentView = makePlayerView(room.state, "P2");
  assert.equal(
    opponentView.units[hiddenAlly.id],
    undefined,
    "attack declaration projection must not expose the hidden ally"
  );
  assert(
    !JSON.stringify(projectEventsForRecipient(room.state, accepted.events, "P2")).includes(
      hiddenAlly.id
    ),
    "attack declaration events must not mention the hidden ally"
  );
  console.log("hardening_server_targets_visible_enemy_on_hidden_ally_shared_cell passed");
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

function testMulticlassMovementCommandsStayAuthoritative() {
  storeTestHooks.reset();
  try {
    for (const mode of ["normal", "trickster"] as const) {
      const room = createGameRoomWithId(`hardening-artemida-${mode}-${randomUUID()}`, {
        hostSeat: "P1",
        hostConnId: `conn-${randomUUID()}`,
      });
      let state = createEmptyGame();
      state = attachArmy(
        state,
        createDefaultArmy("P1", { archer: HERO_ARTEMIDA_ID }),
      );
      state = attachArmy(state, createDefaultArmy("P2"));
      const artemida = Object.values(state.units).find(
        (unit) => unit.owner === "P1" && unit.heroId === HERO_ARTEMIDA_ID,
      );
      assert(artemida, "Artemida should exist in server movement regression state");
      state = setUnit(state, artemida.id, { position: { col: 4, row: 4 } });
      room.state = {
        ...state,
        phase: "battle",
        currentPlayer: "P1",
        activeUnitId: artemida.id,
        turnOrder: [artemida.id],
        turnOrderIndex: 0,
        turnQueue: [artemida.id],
        turnQueueIndex: 0,
      };

      const requested = applyGameAction(
        room,
        { type: "requestMoveOptions", unitId: artemida.id, mode },
        "P1",
      );
      assert.equal(requested.ok, true, `Artemida ${mode} mode should be accepted`);
      if (room.state.pendingRoll) {
        const pending = room.state.pendingRoll;
        const rolled = applyGameAction(
          room,
          {
            type: "resolvePendingRoll",
            pendingRollId: pending.id,
            player: pending.player,
          },
          "P1",
        );
        assert.equal(rolled.ok, true, `Artemida ${mode} roll should resolve`);
      }
      const destination = room.state.pendingMove?.legalTo[0];
      assert(destination, `Artemida ${mode} should receive an authoritative destination`);
      const moved = applyGameAction(
        room,
        { type: "move", unitId: artemida.id, to: destination },
        "P1",
      );
      assert.equal(moved.ok, true, `Artemida ${mode} movement command should resolve`);
      assert.equal(room.state.units[artemida.id].turn.moveUsed, true);
    }

    const room = createGameRoomWithId(`hardening-multiclass-invalid-${randomUUID()}`, {
      hostSeat: "P1",
      hostConnId: `conn-${randomUUID()}`,
    });
    let state = createEmptyGame();
    state = attachArmy(state, createDefaultArmy("P1", {
      archer: HERO_ARTEMIDA_ID,
      berserker: HERO_KANEKI_ID,
    }));
    state = attachArmy(state, createDefaultArmy("P2"));
    const artemida = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.heroId === HERO_ARTEMIDA_ID,
    );
    const kaneki = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.heroId === HERO_KANEKI_ID,
    );
    assert(artemida && kaneki, "Artemida and Kaneki should exist");
    state = setUnit(state, artemida.id, { position: { col: 4, row: 4 } });
    state = setUnit(state, kaneki.id, { position: { col: 2, row: 2 } });
    room.state = {
      ...state,
      phase: "battle",
      currentPlayer: "P1",
      activeUnitId: artemida.id,
      turnOrder: [artemida.id],
      turnOrderIndex: 0,
      turnQueue: [artemida.id],
      turnQueueIndex: 0,
    };
    const beforeInvalid = room.state;
    const revisionBeforeInvalid = room.revision;
    const invalid = applyGameAction(
      room,
      { type: "requestMoveOptions", unitId: artemida.id, mode: "rider" },
      "P1",
    );
    assert.equal(invalid.ok, false, "an invalid Artemida mode should be rejected");
    assert.equal(room.state, beforeInvalid, "invalid mode must not mutate server state");
    assert.equal(room.revision, revisionBeforeInvalid);
    assert.equal(room.state.units[artemida.id].turn.moveUsed, false);

    room.state = {
      ...setUnit(room.state, kaneki.id, { kanekiCentipedeUnlocked: true }),
      activeUnitId: kaneki.id,
      turnOrder: [kaneki.id],
      turnQueue: [kaneki.id],
    };
    const kanekiRider = applyGameAction(
      room,
      { type: "requestMoveOptions", unitId: kaneki.id, mode: "rider" },
      "P1",
    );
    assert.equal(kanekiRider.ok, true, "Centipede Kaneki Rider mode should validate");
  } finally {
    storeTestHooks.reset();
  }

  console.log("hardening_multiclass_movement_commands passed");
}

function testArtemidaSickleEndpointCommandsStayAuthoritative() {
  storeTestHooks.reset();
  try {
    const room = createGameRoomWithId(`hardening-artemida-sickle-${randomUUID()}`, {
      hostSeat: "P1",
      hostConnId: `conn-${randomUUID()}`,
    });
    let state = createEmptyGame();
    state = attachArmy(state, createDefaultArmy("P1", { archer: HERO_ARTEMIDA_ID }));
    state = attachArmy(state, createDefaultArmy("P2"));
    const artemida = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.heroId === HERO_ARTEMIDA_ID,
    );
    const hiddenBeyondEndpoint = Object.values(state.units).find(
      (unit) => unit.owner === "P2",
    );
    assert(artemida && hiddenBeyondEndpoint, "Artemida and an enemy should exist");
    state = setUnit(state, artemida.id, {
      position: { col: 4, row: 4 },
      charges: {
        ...artemida.charges,
        [ABILITY_ARTEMIDA_SILVER_CRESCENT]: 5,
      },
    });
    state = setUnit(state, hiddenBeyondEndpoint.id, {
      position: { col: 8, row: 4 },
      isStealthed: true,
      stealthTurnsLeft: 2,
    });
    room.state = {
      ...state,
      phase: "battle",
      currentPlayer: "P1",
      activeUnitId: artemida.id,
      turnOrder: [artemida.id],
      turnOrderIndex: 0,
      turnQueue: [artemida.id],
      turnQueueIndex: 0,
    };

    const projected = makePlayerView(room.state, "P1");
    assert.equal(projected.units[hiddenBeyondEndpoint.id], undefined, "Sickle targeting projection must not reveal a hidden enemy");
    assert.equal(
      projected.abilitiesByUnitId[artemida.id]?.find(
        (ability) => ability.id === ABILITY_ARTEMIDA_SILVER_CRESCENT,
      )?.isAvailable,
      true,
      "the authoritative projection should expose a paid, unused Sickle as available",
    );

    const beforeInvalid = room.state;
    const revisionBeforeInvalid = room.revision;
    const invalid = applyGameAction(room, {
      type: "useAbility",
      unitId: artemida.id,
      abilityId: ABILITY_ARTEMIDA_SILVER_CRESCENT,
      payload: { target: { col: 6, row: 5 } },
    }, "P1");
    assert.equal(invalid.ok, false, "the server must reject an off-line Sickle endpoint");
    assert.equal(room.state, beforeInvalid, "an invalid endpoint must not mutate authoritative state");
    assert.equal(room.revision, revisionBeforeInvalid, "an invalid endpoint must not advance room revision");
    assert.equal(room.state.units[artemida.id].charges[ABILITY_ARTEMIDA_SILVER_CRESCENT], 5);
    assert.equal(room.state.units[artemida.id].turn.actionUsed, false);

    const accepted = applyGameAction(room, {
      type: "useAbility",
      unitId: artemida.id,
      abilityId: ABILITY_ARTEMIDA_SILVER_CRESCENT,
      payload: { target: { col: 6, row: 4 } },
    }, "P1");
    assert.equal(accepted.ok, true, "the server should accept a closer endpoint on Artemida's attack line");
    assert.equal(room.state.units[artemida.id].charges[ABILITY_ARTEMIDA_SILVER_CRESCENT], 0);
    assert.equal(room.state.units[artemida.id].turn.actionUsed, true);
    assert.equal(room.state.units[hiddenBeyondEndpoint.id].isStealthed, true, "a hidden enemy beyond the endpoint must remain untouched and hidden");
  } finally {
    storeTestHooks.reset();
  }

  console.log("hardening_artemida_sickle_endpoint_commands passed");
}

function testPendingBoardChoiceUsesAuthenticatedSeat() {
  const { room } = makeSeatedRoom({
    roomIdPrefix: "hardening-pending-board-choice",
  });
  room.state = {
    ...createEmptyGame(),
    pendingRoll: {
      id: "pending-board-choice",
      kind: "hassanTrueEnemyTargetChoice",
      player: "P1",
      context: {},
    },
  };

  const result = applyGameAction(
    room,
    {
      type: "resolvePendingRoll",
      pendingRollId: "pending-board-choice",
      choice: "skip",
    } as any,
    "P1"
  );

  assert.equal(result.ok, true, "authenticated board choice should reach rules");
  assert.equal(room.state.pendingRoll, null, "pending choice should resolve");
  const logged = room.actionLog.at(-1)?.action;
  assert.equal(
    logged?.type === "resolvePendingRoll" ? logged.player : undefined,
    "P1",
    "server should attach the authenticated seat to generic pending commands"
  );

  console.log("hardening_pending_board_choice_uses_authenticated_seat passed");
}

function testMongolChargePendingChoiceIsAuthoritative() {
  const { room } = makeSeatedRoom({
    roomIdPrefix: "hardening-mongol-charge-choice",
  });
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  const controller = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider",
  )!;
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight",
  )!;
  const enemies = Object.values(state.units).filter((unit) => unit.owner === "P2");
  const [enemyA, enemyB] = enemies;
  state = setUnit(state, controller.id, { position: { col: 1, row: 1 } });
  state = setUnit(state, ally.id, { position: { col: 3, row: 0 } });
  state = setUnit(state, enemyA.id, { position: { col: 2, row: 0 } });
  state = setUnit(state, enemyB.id, { position: { col: 4, row: 0 } });
  room.state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: controller.id,
    pendingRoll: {
      id: "mongol-charge-choice",
      kind: "mongolChargeAllyAttackTarget",
      player: "P1",
      context: {
        sourceUnitId: ally.id,
        controllerUnitId: controller.id,
        legalTargetIds: [enemyA.id, enemyB.id],
        options: [enemyA.id, enemyB.id],
        remainingAllyIds: [],
        queuedAttacks: [],
      },
    },
  };

  const payload = GameActionSchema.safeParse({
    type: "resolvePendingRoll",
    pendingRollId: "mongol-charge-choice",
    choice: {
      type: "mongolChargeAllyAttackTarget",
      targetId: enemyB.id,
    },
  });
  assert(payload.success, "server schema should accept a Mongol Charge target response");

  const ownerView = makePlayerView(room.state, "P1");
  const opponentView = makePlayerView(room.state, "P2");
  assert.equal(ownerView.pendingRoll?.kind, "mongolChargeAllyAttackTarget");
  assert.deepEqual(ownerView.pendingRoll?.context.legalTargetIds, [enemyA.id, enemyB.id]);
  assert.equal(opponentView.pendingRoll, null, "Mongol Charge target options must be owner-private");

  const beforeInvalid = room.state;
  const revisionBeforeInvalid = room.revision;
  const rejected = applyGameAction(
    room,
    {
      type: "resolvePendingRoll",
      pendingRollId: "mongol-charge-choice",
      choice: {
        type: "mongolChargeAllyAttackTarget",
        targetId: controller.id,
      },
    } as any,
    "P1",
  );
  assert.equal(rejected.ok, false);
  assert.equal(room.state, beforeInvalid, "illegal Mongol Charge target must not mutate state");
  assert.equal(room.revision, revisionBeforeInvalid, "illegal target must not advance revision");

  const accepted = applyGameAction(room, payload.data as any, "P1");
  assert.equal(accepted.ok, true);
  assert.equal(room.revision, revisionBeforeInvalid + 1);
  assert.equal(room.state.pendingRoll?.kind, "attack_attackerRoll");
  assert.equal(room.state.pendingRoll?.context.attackerId, ally.id);
  assert.equal(room.state.pendingRoll?.context.defenderId, enemyB.id);
  console.log("hardening_mongol_charge_pending_choice_is_authoritative passed");
}

function testHassanAssassinOrderCommandAndProjectionAreAuthoritative() {
  const { room } = makeSeatedRoom({
    roomIdPrefix: "hardening-hassan-assassin-order",
  });
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_HASSAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));
  const hassan = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_HASSAN_ID,
  );
  const allies = Object.values(state.units).filter(
    (unit) => unit.owner === "P1" && unit.id !== hassan?.id,
  );
  const enemy = Object.values(state.units).find((unit) => unit.owner === "P2");
  assert(hassan && allies.length >= 2 && enemy, "Hassan targets should exist");
  state = setUnit(state, hassan.id, { position: { col: 1, row: 0 } });
  state = setUnit(state, allies[0].id, { position: { col: 2, row: 0 } });
  state = setUnit(state, allies[1].id, { position: { col: 3, row: 0 } });
  state = setUnit(state, enemy.id, { position: { col: 1, row: 8 } });
  room.state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    pendingRoll: {
      id: "hassan-assassin-order",
      kind: "hassanAssassinOrderSelection",
      player: "P1",
      context: {
        owner: "P1",
        hassanId: hassan.id,
        eligibleUnitIds: [allies[0].id, allies[1].id],
        queue: [],
      },
    },
  };

  const validPayload = GameActionSchema.safeParse({
    type: "resolvePendingRoll",
    pendingRollId: "hassan-assassin-order",
    choice: {
      type: "hassanAssassinOrderPick",
      unitIds: [allies[0].id, allies[1].id],
    },
  });
  const invalidPayload = GameActionSchema.safeParse({
    type: "resolvePendingRoll",
    pendingRollId: "hassan-assassin-order",
    choice: {
      type: "hassanAssassinOrderPick",
      unitIds: [allies[0].id],
    },
  });
  assert(validPayload.success, "the valid Assassin Order payload should match schema");
  assert.equal(invalidPayload.success, false, "the schema should reject a one-target payload");

  const ownerView = makePlayerView(room.state, "P1");
  const opponentView = makePlayerView(room.state, "P2");
  assert.equal(ownerView.pendingRoll?.kind, "hassanAssassinOrderSelection");
  assert.deepEqual(ownerView.pendingRoll?.context.eligibleUnitIds, [allies[0].id, allies[1].id]);
  assert.equal(opponentView.pendingRoll, null, "the opponent must not receive Hassan target options");
  const projectedAbility = ownerView.abilitiesByUnitId[hassan.id]?.find(
    (ability) => ability.id === ABILITY_HASSAN_ASSASIN_ORDER,
  );
  assert.equal(projectedAbility?.kind, "phantasm");
  assert.equal(projectedAbility?.slot, "none");

  const beforeInvalid = room.state;
  const revisionBeforeInvalid = room.revision;
  const rejectedChoice = applyGameAction(
    room,
    {
      type: "resolvePendingRoll",
      pendingRollId: "hassan-assassin-order",
      choice: {
        type: "hassanAssassinOrderPick",
        unitIds: [allies[0].id, enemy.id],
      },
    } as any,
    "P1",
  );
  assert.equal(rejectedChoice.ok, false, "the server should reject an ineligible target");
  assert.equal(room.state, beforeInvalid, "a rejected Assassin Order command must not mutate state");
  assert.equal(room.revision, revisionBeforeInvalid, "rejection must not advance revision");

  const acceptedChoice = applyGameAction(room, validPayload.data as any, "P1");
  assert(acceptedChoice.ok, "the server should accept a valid Assassin Order choice");
  assert.equal(room.state.pendingRoll, null, "the valid choice should clear the pending task");
  assert.equal(getStealthSuccessMinRoll(room.state.units[allies[0].id]), 5);
  assert.equal(getStealthSuccessMinRoll(room.state.units[allies[1].id]), 5);
  assert(
    acceptedChoice.events.some(
      (event) =>
        event.type === "abilityUsed" &&
        event.unitId === hassan.id &&
        event.abilityId === ABILITY_HASSAN_ASSASIN_ORDER,
    ),
    "accepted Assassin Order should be visible in the authoritative event log",
  );

  console.log("hardening_hassan_assassin_order_authoritative passed");
}

function testMissedHiddenAttackRevealIsAuthoritative() {
  const { room } = makeSeatedRoom({
    roomIdPrefix: "hardening-hidden-attack-reveal",
  });
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", { assassin: HERO_HASSAN_ID }),
  );
  state = attachArmy(
    state,
    createDefaultArmy("P2", { trickster: HERO_DUOLINGO_ID }),
  );
  const hassan = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_HASSAN_ID,
  );
  const duolingo = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.heroId === HERO_DUOLINGO_ID,
  );
  assert(hassan && duolingo, "Hassan and Duolingo fixtures should exist");
  state = setUnit(state, hassan.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, duolingo.id, { position: { col: 4, row: 5 } });
  room.state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: hassan.id,
    knowledge: {
      P1: { [hassan.id]: true },
      P2: { [duolingo.id]: true },
    },
  };
  const rolls = [0.01, 0.01, 0.99, 0.99];
  room.rng = {
    next: () => rolls.shift() ?? 0.5,
  };

  const declared = applyGameAction(
    room,
    { type: "attack", attackerId: hassan.id, defenderId: duolingo.id } as any,
    "P1",
  );
  assert(declared.ok, "server should accept the legal hidden attack");
  assert.equal(room.state.pendingRoll?.kind, "attack_attackerRoll");

  const attackerRollId = room.state.pendingRoll!.id;
  const attackerRolled = applyGameAction(
    room,
    { type: "resolvePendingRoll", pendingRollId: attackerRollId } as any,
    "P1",
  );
  assert(attackerRolled.ok, "server should accept the attacker roll");
  assert.equal(room.state.pendingRoll?.kind, "attack_defenderRoll");

  const defenderRollId = room.state.pendingRoll!.id;
  const defenderRolled = applyGameAction(
    room,
    { type: "resolvePendingRoll", pendingRollId: defenderRollId } as any,
    "P2",
  );
  assert(defenderRolled.ok, "server should accept the defender roll");
  assert(
    defenderRolled.events.some(
      (event) => event.type === "attackResolved" && !event.hit,
    ),
    "the queued dice should produce the reported miss",
  );
  assert.equal(
    room.state.units[hassan.id].isStealthed,
    false,
    "authoritative state must reveal Hassan after the miss",
  );
  assert.equal(
    room.actionLog
      .flatMap((entry) => entry.events)
      .filter(
        (event) => event.type === "stealthRevealed" && event.unitId === hassan.id,
      ).length,
    1,
    "the server event log should contain one safe reveal event",
  );

  const p1View = makePlayerView(room.state, "P1");
  const p2View = makePlayerView(room.state, "P2");
  assert.equal(p1View.units[hassan.id]?.isStealthed, false);
  assert.equal(p2View.units[hassan.id]?.isStealthed, false);

  console.log("hardening_missed_hidden_attack_reveal_is_authoritative passed");
}

function testChikatiloCommandsAndResourcesAreAuthoritative() {
  const { room } = makeSeatedRoom({ roomIdPrefix: "hardening-chikatilo" });
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1", { assassin: HERO_CHIKATILO_ID })),
    createDefaultArmy("P2")
  );
  const chikatilo = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_CHIKATILO_ID
  );
  const target = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  );
  assert(chikatilo && target, "expected Chikatilo and mark target");
  state = setUnit(state, chikatilo.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
    charges: { ...chikatilo.charges, [ABILITY_CHIKATILO_DECOY]: 12 },
  });
  state = setUnit(state, target.id, { position: { col: 5, row: 4 } });
  room.state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: chikatilo.id,
    turnOrder: [chikatilo.id],
    turnOrderIndex: 0,
    turnQueue: [chikatilo.id],
    turnQueueIndex: 0,
    knowledge: {
      P1: { [chikatilo.id]: true, [target.id]: true },
      P2: { [target.id]: true },
    },
  };

  const ownerBefore = makePlayerView(room.state, "P1");
  const decoyView = ownerBefore.abilitiesByUnitId[chikatilo.id]?.find(
    (ability) => ability.id === ABILITY_CHIKATILO_DECOY
  );
  assert.equal(decoyView?.chargeUnlimited, true);
  assert.equal(decoyView?.isSpecialCounter, true);
  assert.equal(decoyView?.maxCharges, undefined);
  assert(
    ownerBefore.abilitiesByUnitId[chikatilo.id]
      ?.find((ability) => ability.id === ABILITY_CHIKATILO_ASSASSIN_MARK)
      ?.targeting?.targetIds?.includes(target.id),
    "owner projection should expose the authoritative legal Killer's Mark target"
  );
  assert.equal(
    makePlayerView(room.state, "P2").units[chikatilo.id],
    undefined,
    "opponent projection must not expose hidden Chikatilo coordinates"
  );

  const marked = applyGameAction(
    room,
    {
      type: "useAbility",
      unitId: chikatilo.id,
      abilityId: ABILITY_CHIKATILO_ASSASSIN_MARK,
      payload: { targetId: target.id },
    },
    "P1"
  );
  assert.equal(marked.ok, true, "server should accept a legal Killer's Mark");
  assert.equal(room.state.units[chikatilo.id].isStealthed, true);

  room.state = setUnit(room.state, chikatilo.id, { turn: makeEmptyTurnEconomy() });
  const beforeDuplicate = room.state;
  const revisionBeforeDuplicate = room.revision;
  const duplicate = applyGameAction(
    room,
    {
      type: "useAbility",
      unitId: chikatilo.id,
      abilityId: ABILITY_CHIKATILO_ASSASSIN_MARK,
      payload: { targetId: target.id },
    },
    "P1"
  );
  assert.equal(duplicate.ok, false, "duplicate Killer's Mark should be rejected");
  assert.equal(room.state, beforeDuplicate, "duplicate Mark must not mutate state");
  assert.equal(room.revision, revisionBeforeDuplicate);

  room.state = setUnit(room.state, chikatilo.id, {
    isStealthed: false,
    stealthTurnsLeft: 0,
    turn: makeEmptyTurnEconomy(),
  });
  const decoy = applyGameAction(
    room,
    {
      type: "useAbility",
      unitId: chikatilo.id,
      abilityId: ABILITY_CHIKATILO_DECOY,
    },
    "P1"
  );
  assert.equal(decoy.ok, true, "server should accept legal Decoy Stealth");
  assert.equal(room.state.units[chikatilo.id].isStealthed, true);
  assert.equal(room.state.units[chikatilo.id].turn.stealthUsed, true);
  assert.equal(room.state.units[chikatilo.id].charges[ABILITY_CHIKATILO_DECOY], 9);

  console.log("hardening_chikatilo_commands_and_resources_authoritative passed");
}

async function main() {
  testLokiLaughPayloadSchemas();
  testLightRayModePayloadSchemas();
  testPapyrusBoneChoicePayloadSchema();
  await testGraceExpiryVacatesSeatAndInvalidatesToken();
  await testReconnectWithinGraceKeepsSeatAndClearsTimer();
  await testConcurrentSwitchRoleSerialization();
  testRejectedActionLogAndRevisionInvariants();
  testInvalidCoveringTracksSelectionIsRejectedWithoutMutation();
  testTransformedKaiserStealthCommandAndProjectionAreRejected();
  testRateLimitWindowResets();
  testPayloadCapAllowsValidClientCommands();
  testGroznyTyrantPendingChoicePayloadsAccepted();
  testNewBatchBoardPendingChoicePayloadsAccepted();
  await testRestDebugEndpointsGatedInProduction();
  testIdleRoomCleanupExpiresRoom();
  testActiveRoomCleanupDoesNotExpireRoom();
  testActionLogTruncatesToConfiguredLimit();
  testProjectedEventsRedactHiddenUnitPositions();
  testOrangeBoneDamageIsAuthoritativeAtActionStart();
  testServerAcceptsMoveIntoUnknownHiddenOccupiedCell();
  testServerTargetsVisibleEnemyOnHiddenAllySharedCell();
  testServerRejectsInvalidFalsePromisePlacementsWithoutMutation();
  testRiverBoatmanCommandsPreserveAuthoritativeMovementBudget();
  testMulticlassMovementCommandsStayAuthoritative();
  testArtemidaSickleEndpointCommandsStayAuthoritative();
  testPendingBoardChoiceUsesAuthenticatedSeat();
  testMongolChargePendingChoiceIsAuthoritative();
  testHassanAssassinOrderCommandAndProjectionAreAuthoritative();
  testMissedHiddenAttackRevealIsAuthoritative();
  testChikatiloCommandsAndResourcesAreAuthoritative();
  console.log("hardening tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
