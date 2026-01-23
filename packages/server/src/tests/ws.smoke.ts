// packages/server/src/tests/ws.smoke.ts

import assert from "assert";
import WebSocket from "ws";
import { buildServer } from "../index";
import { createGameRoom } from "../store";

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

async function main() {
  const server = await buildServer();
  await server.listen({ port: 0, host: "127.0.0.1" });

  const address = server.server.address();
  if (!address || typeof address === "string") {
    await server.close();
    throw new Error("Unable to determine server address");
  }

  const room = createGameRoom();
  const wsUrl = `ws://127.0.0.1:${address.port}/ws`;
  const ws = new WebSocket(wsUrl);

  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (err) => reject(err));
  });

  const queue = collectMessages(ws);

  ws.send(
    JSON.stringify({
      type: "joinRoom",
      roomId: room.id,
      requestedRole: "P1",
    })
  );

  await waitForType(queue, "joinAccepted");
  await waitForType(queue, "roomState");

  ws.send(
    JSON.stringify({
      type: "action",
      action: { type: "rollInitiative" },
    })
  );

  const actionMsg = await waitForType(queue, "actionResult");
  const actionResult = actionMsg as { type?: string; error?: string };
  assert(
    actionResult.type === "actionResult",
    "actionResult should be emitted after action"
  );
  assert(
    actionResult.error !== "Must join a room first",
    "action should not fail with join error after join"
  );

  ws.close();
  await server.close();
  console.log("ws_smoke passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
