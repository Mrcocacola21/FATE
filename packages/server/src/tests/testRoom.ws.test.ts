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
        heroId: "frisk",
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

  testSocket.send(
    JSON.stringify({
      type: "testRoomCommand",
      command: {
        type: "debugSpawnUnit",
        heroId: "frisk",
        owner: "P1",
        coord: { col: 4, row: 3 },
      },
    })
  );
  const duel = await waitFor(
    testMessages,
    (message) =>
      message.type === "roomState" &&
      message.meta?.revision === 2 &&
      Object.keys(message.view?.units ?? {}).length === 2
  );
  const duelUnits = Object.values(duel.view.units) as any[];
  const attacker = duelUnits.find((unit) => unit.owner === "P1");
  const defender = duelUnits.find((unit) => unit.owner === "P2");
  assert(attacker, "test room should expose spawned P1 attacker");
  assert(defender, "test room should expose spawned P2 defender");
  assert.equal(
    duel.view.activeUnitId,
    attacker.id,
    "spawning a P1 unit after an enemy should make the P1 unit active"
  );

  testSocket.send(
    JSON.stringify({
      type: "testRoomCommand",
      command: { type: "debugSetDiceQueue", values: [5, 4, 1, 1] },
    })
  );
  await waitFor(
    testMessages,
    (message) => message.type === "roomState" && message.meta?.revision === 3
  );

  testSocket.send(
    JSON.stringify({
      type: "action",
      action: {
        type: "attack",
        attackerId: attacker.id,
        defenderId: defender.id,
      },
    })
  );
  const attackerRoll = await waitFor(
    testMessages,
    (message) =>
      message.type === "roomState" &&
      message.view?.pendingRoll?.kind === "attack_attackerRoll" &&
      message.view.pendingRoll.context?.attackerId === attacker.id
  );
  testSocket.send(
    JSON.stringify({
      type: "action",
      action: {
        type: "resolvePendingRoll",
        pendingRollId: attackerRoll.view.pendingRoll.id,
        player: attackerRoll.view.pendingRoll.player,
      },
    })
  );
  const defenderRoll = await waitFor(
    testMessages,
    (message) =>
      message.type === "roomState" &&
      message.view?.pendingRoll?.kind === "attack_defenderRoll"
  );
  testSocket.send(
    JSON.stringify({
      type: "action",
      action: {
        type: "resolvePendingRoll",
        pendingRollId: defenderRoll.view.pendingRoll.id,
        player: defenderRoll.view.pendingRoll.player,
      },
    })
  );
  await waitFor(testMessages, (message) =>
    message.type === "actionResult" &&
    message.ok === true &&
    Array.isArray(message.events) &&
    message.events.some(
      (event: any) =>
        event.type === "attackResolved" &&
        event.attackerId === attacker.id &&
        event.defenderId === defender.id
    )
  );

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
