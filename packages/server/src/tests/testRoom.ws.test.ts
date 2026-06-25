import assert from "assert";
import WebSocket from "ws";
import { buildServer } from "../index";
import { getGameRoom, storeTestHooks } from "../store";
import { wsTestHooks } from "../ws";

function collect(ws: WebSocket) {
  const messages: any[] = [];
  ws.on("message", (data) => {
    messages.push(JSON.parse(data.toString()));
  });
  return messages;
}

function waitFor(
  messages: any[],
  predicate: (message: any) => boolean,
  timeoutMs = 3000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const message = messages.find(predicate);
      if (message) return resolve(message);
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timed out waiting for test-room WS message"));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

async function openSocket(url: string) {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return ws;
}

async function main() {
  storeTestHooks.reset();
  wsTestHooks.resetWsStateForTests();
  const server = await buildServer();
  await server.listen({ port: 0, host: "127.0.0.1" });
  const address = server.server.address();
  assert(address && typeof address !== "string");
  const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

  const testSocket = await openSocket(wsUrl);
  const testMessages = collect(testSocket);
  testSocket.send(
    JSON.stringify({
      type: "joinRoom",
      mode: "create",
      role: "P1",
      roomMode: "test",
    })
  );
  const initial = await waitFor(
    testMessages,
    (message) =>
      message.type === "roomState" &&
      message.meta?.roomMode === "test" &&
      message.you?.canControlTestRoom === true
  );
  assert.equal(initial.meta.revision, 0);
  const testRoomId = initial.roomId as string;

  testSocket.send(
    JSON.stringify({
      type: "testRoomCommand",
      command: {
        type: "debugSpawnUnit",
        heroId: "guts",
        owner: "P2",
        coord: { col: 4, row: 4 },
      },
    })
  );
  const mutated = await waitFor(
    testMessages,
    (message) =>
      message.type === "roomState" &&
      message.meta?.revision === 1 &&
      Object.keys(message.view?.units ?? {}).length === 1
  );
  assert.equal(Object.values(mutated.view.units)[0] && (Object.values(mutated.view.units)[0] as any).owner, "P2");

  const normalSocket = await openSocket(wsUrl);
  const normalMessages = collect(normalSocket);
  normalSocket.send(
    JSON.stringify({
      type: "joinRoom",
      mode: "create",
      role: "P1",
    })
  );
  await waitFor(normalMessages, (message) => message.type === "roomState");
  normalSocket.send(
    JSON.stringify({
      type: "testRoomCommand",
      command: { type: "debugClearBoard" },
    })
  );
  await waitFor(
    normalMessages,
    (message) => message.type === "error" && message.code === "FORBIDDEN"
  );

  testSocket.send(
    JSON.stringify({
      type: "testRoomCommand",
      command: { type: "debugDeleteRoom" },
    })
  );
  await waitFor(
    testMessages,
    (message) => message.type === "leftRoom" && message.roomId === testRoomId
  );
  assert.equal(getGameRoom(testRoomId), undefined);

  testSocket.close();
  normalSocket.close();
  await server.close();
  storeTestHooks.reset();
  wsTestHooks.resetWsStateForTests();
  console.log("test_room_ws_authority_and_broadcast passed");
}

void main();
