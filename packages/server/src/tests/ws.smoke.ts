// packages/server/src/tests/ws.smoke.ts

import assert from "assert";
import type { RoomStateMessage } from "../ws";
import WebSocket from "ws";
import { buildTestServer as buildServer, testAccessToken } from "./matchTestSupport";
import { getGameRoom } from "../store";
import { attachArmy, createDefaultArmy, createEmptyGame, HERO_VLAD_TEPES_ID } from "rules";

function collectMessages(ws: WebSocket) {
  const queue: unknown[] = [];
  ws.on("message", (data) => {
    try {
      queue.push(JSON.parse(data.toString()));
    } catch {
      // ignore bad payloads in test
    }
  });
  return queue;
}

function waitForType(queue: unknown[], type: string, timeoutMs = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const msg = queue.find((item) => (item as { type?: string }).type === type);
      if (msg) {
        resolve(msg);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for WS message: ${type}`));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

function waitForRoomState(
  queue: unknown[],
  predicate: (msg: RoomStateMessage) => boolean,
  timeoutMs = 2000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const msg = queue.find((item) => {
        const payload = item as RoomStateMessage;
        return payload.type === "roomState" && predicate(payload);
      });
      if (msg) {
        resolve(msg);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Timed out waiting for matching roomState"));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

function waitForError(
  queue: unknown[],
  predicate: (msg: { type?: string; message?: string; code?: string }) => boolean,
  timeoutMs = 2000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const msg = queue.find((item) => {
        const payload = item as { type?: string; message?: string; code?: string };
        return payload.type === "error" && predicate(payload);
      });
      if (msg) {
        resolve(msg);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Timed out waiting for matching error message"));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

function openSocket(wsUrl: string, origin?: string): Promise<WebSocket> {
  const ws = new WebSocket(wsUrl, origin ? { headers: { Origin: origin } } : undefined);
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve(ws));
    ws.once("error", (err) => reject(err));
  });
}

function waitForClose(ws: WebSocket, timeoutMs = 2000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for WS close"));
    }, timeoutMs);
    ws.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  const server = await buildServer();
  await server.listen({ port: 0, host: "127.0.0.1" });

  const address = server.server.address();
  if (!address || typeof address === "string") {
    await server.close();
    throw new Error("Unable to determine server address");
  }

  const wsUrl = `ws://127.0.0.1:${address.port}/ws`;
  const allowedOriginSocket = await openSocket(wsUrl, "http://localhost:5173");
  allowedOriginSocket.close();

  const disallowedOriginSocket = await openSocket(wsUrl, "https://evil.example");
  const disallowedCloseCode = await waitForClose(disallowedOriginSocket);
  assert.equal(
    disallowedCloseCode,
    1008,
    "disallowed WS Origin should be rejected with policy violation",
  );

  let ws1 = new WebSocket(wsUrl);
  let ws2 = new WebSocket(wsUrl);

  await Promise.all([
    new Promise<void>((resolve, reject) => {
      ws1.once("open", () => resolve());
      ws1.once("error", (err) => reject(err));
    }),
    new Promise<void>((resolve, reject) => {
      ws2.once("open", () => resolve());
      ws2.once("error", (err) => reject(err));
    }),
  ]);

  let queue1 = collectMessages(ws1);
  let queue2 = collectMessages(ws2);

  ws1.send(
    JSON.stringify({
      type: "resolvePendingRoll",
      pendingRollId: 123,
    }),
  );

  await waitForError(queue1, (msg) => msg.message === "Invalid message payload");

  ws1.send(
    JSON.stringify({
      type: "joinRoom",
      mode: "create",
      role: "P1",
      accessToken: testAccessToken("P1"),
    }),
  );

  const joinAck = (await waitForType(queue1, "joinAck")) as {
    type: string;
    roomId: string;
    resumeToken?: string;
  };
  const roomId = joinAck.roomId;
  assert(joinAck.resumeToken, "joinAck should include resumeToken");
  const resumeToken = joinAck.resumeToken!;
  await waitForType(queue1, "roomState");

  ws1.send(JSON.stringify({ type: "switchRole", role: "P1" }));
  await waitForError(queue1, (msg) => msg.code === "ALREADY_IN_ROLE");

  ws2.send(
    JSON.stringify({
      type: "joinRoom",
      mode: "join",
      roomId,
      role: "P2",
      accessToken: testAccessToken("P2"),
    }),
  );

  const p2JoinAck = (await waitForType(queue2, "joinAck")) as { resumeToken: string };
  await waitForType(queue2, "roomState");

  ws1.send(JSON.stringify({ type: "switchRole", role: "invalid_role" }));
  await waitForError(
    queue1,
    (msg) => msg.message === "Invalid message payload" && msg.code === "INVALID_PAYLOAD",
  );

  ws1.send(
    JSON.stringify({
      type: "switchRole",
      role: "P2",
    }),
  );
  await waitForError(queue1, (msg) => msg.code === "USER_ALREADY_IN_MATCH");

  const disconnected = new Promise<void>((resolve) => ws1.once("close", () => resolve()));
  ws1.close();
  await disconnected;

  const ws3 = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws3.once("open", () => resolve());
    ws3.once("error", (err) => reject(err));
  });
  const queue3 = collectMessages(ws3);
  ws3.send(
    JSON.stringify({
      type: "joinRoom",
      mode: "join",
      roomId,
      role: "P1",
      accessToken: testAccessToken("P1"),
    }),
  );
  const rejected = (await waitForType(queue3, "joinRejected")) as {
    type: string;
    reason?: string;
  };
  assert(
    rejected.reason === "role_taken",
    "seat should remain reserved during reconnect grace window",
  );
  ws3.close();

  ws1 = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws1.once("open", () => resolve());
    ws1.once("error", (err) => reject(err));
  });
  queue1 = collectMessages(ws1);
  ws1.send(
    JSON.stringify({
      type: "joinRoom",
      mode: "join",
      roomId,
      role: "P1",
      resumeToken,
      accessToken: testAccessToken("P1"),
    }),
  );
  const rejoinAck = (await waitForType(queue1, "joinAck")) as {
    type: string;
    roomId: string;
    role: string;
    seat?: string;
  };
  assert(rejoinAck.roomId === roomId, "rejoin should stay in same room");
  assert(rejoinAck.seat === "P1", "rejoin should restore P1 seat");
  await waitForType(queue1, "roomState");

  ws1.send(JSON.stringify({ type: "action", action: { type: "endTurn" } }));
  const rejectedAction = (await waitForType(queue1, "actionResult")) as {
    type: string;
    ok?: boolean;
  };
  assert(rejectedAction.ok === false, "invalid lobby action must be rejected");

  ws1.send(
    JSON.stringify({
      type: "resolvePendingRoll",
      pendingRollId: "chikatilo-test",
      choice: { type: "chikatiloPlace", position: { col: 0, row: 0 } },
    }),
  );

  await waitForError(queue1, (msg) => msg.message === "Not your pending roll");

  ws1.send(JSON.stringify({ type: "setReady", ready: true }));
  ws2.send(JSON.stringify({ type: "setReady", ready: true }));

  await waitForRoomState(queue1, (msg) => {
    const ready = msg.meta?.ready as { P1?: boolean; P2?: boolean } | undefined;
    return !!ready?.P1 && !!ready?.P2;
  });

  ws1.send(
    JSON.stringify({
      type: "startGame",
    }),
  );

  const pendingState = (await waitForRoomState(queue1, (msg) => {
    return msg.meta?.pendingRoll?.player === "P1" && msg.view?.pendingRoll?.player === "P1";
  })) as {
    type: string;
    meta: { pendingRoll?: { id: string; kind: string; player: string } };
    view: { pendingRoll?: { id: string; kind: string; player: string } };
  };

  assert(
    pendingState.meta.pendingRoll?.kind === "initiativeRoll",
    "initiative roll should be requested after startGame",
  );
  assert(pendingState.meta.pendingRoll?.id, "pending roll id should be present");

  const p2WaitingForP1 = (await waitForRoomState(queue2, (msg) => {
    return msg.meta?.pendingRoll?.player === "P1";
  })) as {
    you: { role: string; seat?: string };
    meta: { pendingRoll: { player: string; presentation?: unknown } };
    view: { pendingRoll: unknown; pendingDecision: RoomStateMessage["view"]["pendingDecision"] };
  };
  assert.equal(p2WaitingForP1.you.role, "P2");
  assert.equal(p2WaitingForP1.you.seat, "P2");
  assert.equal(
    p2WaitingForP1.meta.pendingRoll.presentation,
    undefined,
    "opponent metadata must never include resolution descriptions",
  );
  assert.equal(p2WaitingForP1.view.pendingDecision?.viewerCanRespond, false);
  assert.deepEqual(Object.keys(p2WaitingForP1.view.pendingDecision!).sort(), [
    "opponentStatus",
    "ownerPlayerId",
    "type",
    "viewerCanRespond",
  ]);
  assert.equal(
    p2WaitingForP1.view.pendingRoll,
    null,
    "P2 must not receive P1's private pending-roll context",
  );

  ws1.send(
    JSON.stringify({
      type: "resolvePendingRoll",
      pendingRollId: pendingState.meta.pendingRoll?.id,
    }),
  );

  const p1WaitingForP2 = (await waitForRoomState(queue1, (msg) => {
    return msg.meta?.pendingRoll?.player === "P2";
  })) as {
    view: { pendingRoll: unknown; initiative: { P1: number | null } };
  };
  assert.equal(
    p1WaitingForP2.view.pendingRoll,
    null,
    "P1 must see public waiting state without P2's roll context",
  );
  assert.equal(typeof p1WaitingForP2.view.initiative.P1, "number");

  const p2Pending = (await waitForRoomState(queue2, (msg) => {
    return msg.meta?.pendingRoll?.player === "P2" && msg.view?.pendingRoll?.player === "P2";
  })) as {
    you: { role: string; seat?: string };
    meta: {
      revision: number;
      pendingRoll: { id: string; kind: string; player: string };
    };
    view: {
      pendingRoll: { id: string; kind: string; player: string; context?: unknown };
      initiative: { P1: number | null; P2: number | null };
    };
  };
  assert.equal(p2Pending.you.role, "P2");
  assert.equal(p2Pending.you.seat, "P2");
  assert.equal(p2Pending.meta.pendingRoll.kind, "initiativeRoll");
  assert.equal(p2Pending.view.pendingRoll.id, p2Pending.meta.pendingRoll.id);
  assert.equal(p2Pending.view.pendingRoll.player, "P2");
  assert.equal(typeof p2Pending.view.initiative.P1, "number");

  ws2.send(
    JSON.stringify({
      type: "resolvePendingRoll",
      pendingRollId: p2Pending.view.pendingRoll.id,
    }),
  );

  await waitForRoomState(queue2, (msg) => {
    return (
      msg.meta?.revision > p2Pending.meta.revision &&
      msg.meta?.pendingRoll?.id !== p2Pending.view.pendingRoll.id
    );
  });

  // Seed authoritative private setup to exercise the actual reconnect transport.
  const liveRoom = getGameRoom(roomId)!;
  let setup = attachArmy(
    createEmptyGame(),
    createDefaultArmy("P1", { spearman: HERO_VLAD_TEPES_ID }),
  );
  setup = attachArmy(setup, createDefaultArmy("P2"));
  const vlad = Object.values(setup.units).find((unit) => unit.heroId === HERO_VLAD_TEPES_ID)!;
  setup.units[vlad.id] = { ...vlad, position: { col: 4, row: 4 } };
  const secretCells = [
    { col: 1, row: 3 },
    { col: 3, row: 5 },
    { col: 7, row: 7 },
  ];
  liveRoom.state = {
    ...setup,
    phase: "battle",
    pendingRoll: {
      id: "private-vlad-reconnect",
      player: "P1",
      kind: "vladPlaceStakes",
      context: {
        owner: "P1",
        count: 3,
        reason: "turnStart",
        legalPositions: secretCells,
        selectedCells: [secretCells[0]],
        queue: [],
      },
      presentation: {
        title: "PRIVATE SELECTED CELL",
        reason: "PRIVATE SELECTED CELL",
        rollKind: "ability",
        diceLabel: "Choice",
        requestedPlayerId: "P1",
      },
    },
  };
  const p2Disconnected = new Promise<void>((resolve) => ws2.once("close", () => resolve()));
  ws2.close();
  await p2Disconnected;
  ws2 = await openSocket(wsUrl);
  queue2 = collectMessages(ws2);
  ws2.send(
    JSON.stringify({
      type: "joinRoom",
      mode: "join",
      roomId,
      role: "P2",
      resumeToken: p2JoinAck.resumeToken,
      accessToken: testAccessToken("P2"),
    }),
  );
  await waitForType(queue2, "joinAck");
  const reconnect = (await waitForRoomState(
    queue2,
    (msg) => msg.meta.pendingRoll?.id === "private-vlad-reconnect",
  )) as RoomStateMessage;
  assert.equal(reconnect.view.pendingRoll, null);
  assert.equal(reconnect.meta.pendingRoll?.presentation, undefined);
  const decision = reconnect.view.pendingDecision;
  assert(decision && !decision.viewerCanRespond);
  assert.equal(decision.opponentStatus.title, "Vlad is preparing the battlefield");
  assert.equal(decision.opponentStatus.abilityName, "Field of Stakes");
  assert.equal(decision.ownerPlayerId, "P1");
  const serialized = JSON.stringify(reconnect);
  for (const privateText of ["legalPositions", "selectedCells", "PRIVATE SELECTED CELL"]) {
    assert(
      !serialized.includes(privateText),
      `${privateText} must not reach a reconnecting opponent`,
    );
  }
  const stateBeforeRejectedResolution = JSON.stringify(liveRoom.state);
  const revisionBeforeRejectedResolution = liveRoom.revision;
  ws2.send(
    JSON.stringify({
      type: "resolvePendingRoll",
      pendingRollId: "private-vlad-reconnect",
      choice: { type: "placeStakes", positions: secretCells },
    }),
  );
  const rejectedResolution = (await waitForError(queue2, (msg) => msg.code === "pending_roll")) as {
    message: string;
  };
  assert.equal(rejectedResolution.message, "Not your pending roll");
  assert.equal(JSON.stringify(liveRoom.state), stateBeforeRejectedResolution);
  assert.equal(liveRoom.revision, revisionBeforeRejectedResolution);
  console.log("waiting_state_survives_vlad_websocket_reconnect passed");

  ws1.close();
  ws2.close();
  await server.close();
  console.log("ws_smoke passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
