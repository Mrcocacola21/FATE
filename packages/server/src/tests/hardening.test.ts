import assert from "assert";
import { randomUUID } from "node:crypto";
import { mock } from "node:test";
import { enqueueRoomCommand, fateRoomKey } from "../roomQueue";
import { applyGameAction, createGameRoomWithId } from "../store";
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

async function main() {
  await testGraceExpiryVacatesSeatAndInvalidatesToken();
  await testReconnectWithinGraceKeepsSeatAndClearsTimer();
  await testConcurrentSwitchRoleSerialization();
  testRejectedActionLogAndRevisionInvariants();
  testRateLimitWindowResets();
  testPayloadCapAllowsValidClientCommands();
  console.log("hardening tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
