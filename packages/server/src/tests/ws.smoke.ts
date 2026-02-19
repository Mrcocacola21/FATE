// packages/server/src/tests/ws.smoke.ts

import assert from "assert";
import WebSocket from "ws";
import { buildServer } from "../index";

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

function waitForType(
  queue: unknown[],
  type: string,
  timeoutMs = 2000
): Promise<unknown> {
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
  predicate: (msg: { type?: string; meta?: any }) => boolean,
  timeoutMs = 2000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const msg = queue.find((item) => {
        const payload = item as { type?: string; meta?: any };
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
  timeoutMs = 2000
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

async function main() {
  const server = await buildServer();
  await server.listen({ port: 0, host: "127.0.0.1" });

  const address = server.server.address();
  if (!address || typeof address === "string") {
    await server.close();
    throw new Error("Unable to determine server address");
  }

  const wsUrl = `ws://127.0.0.1:${address.port}/ws`;
  let ws1 = new WebSocket(wsUrl);
  const ws2 = new WebSocket(wsUrl);

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
  const queue2 = collectMessages(ws2);

  ws1.send(
    JSON.stringify({
      type: "resolvePendingRoll",
      pendingRollId: 123,
    })
  );

  await waitForError(queue1, (msg) => msg.message === "Invalid message payload");

  ws1.send(
    JSON.stringify({
      type: "joinRoom",
      mode: "create",
      role: "P1",
    })
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

  ws2.send(
    JSON.stringify({
      type: "joinRoom",
      mode: "join",
      roomId,
      role: "P2",
    })
  );

  await waitForType(queue2, "joinAck");
  await waitForType(queue2, "roomState");

  ws1.send(JSON.stringify({ type: "switchRole", role: "invalid_role" }));
  await waitForError(
    queue1,
    (msg) =>
      msg.message === "Invalid message payload" && msg.code === "INVALID_PAYLOAD"
  );

  ws1.send(
    JSON.stringify({
      type: "switchRole",
      role: "P2",
    })
  );
  await waitForError(queue1, (msg) => msg.code === "role_taken");

  ws1.close();
  await new Promise((resolve) => setTimeout(resolve, 50));

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
    })
  );
  const rejected = (await waitForType(queue3, "joinRejected")) as {
    type: string;
    reason?: string;
  };
  assert(
    rejected.reason === "role_taken",
    "seat should remain reserved during reconnect grace window"
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
    })
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
    })
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
    })
  );

  const pendingState = (await waitForRoomState(queue1, (msg) => {
    return msg.meta?.pendingRoll?.player === "P1";
  })) as {
    type: string;
    meta: { pendingRoll?: { id: string; kind: string; player: string } };
  };

  assert(
    pendingState.meta.pendingRoll?.kind === "initiativeRoll",
    "initiative roll should be requested after startGame"
  );
  assert(pendingState.meta.pendingRoll?.id, "pending roll id should be present");

  ws1.send(
    JSON.stringify({
      type: "resolvePendingRoll",
      pendingRollId: pendingState.meta.pendingRoll?.id,
    })
  );

  await waitForRoomState(queue1, (msg) => {
    return msg.meta?.pendingRoll?.player === "P2";
  });

  ws1.close();
  ws2.close();
  await server.close();
  console.log("ws_smoke passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
