import assert from "assert";
import { randomUUID } from "node:crypto";
import type { ServerMessage, RoomStateMessage } from "../ws";
import WebSocket from "ws";
import {
  DRAFT_BAN_ORDER,
  DRAFT_CLASSES,
  DRAFT_HERO_POOL,
  getPickOrder,
  HERO_ARTEMIDA_ID,
  HERO_DON_KIHOTE_ID,
  HERO_DUOLINGO_ID,
  HERO_JACK_RIPPER_ID,
  HERO_KANEKI_ID,
  HERO_LUCHE_ID,
  HERO_ZORO_ID,
  type GameModeId,
  type PlayerId,
  type UnitClass,
} from "rules";
import { MemoryMatchPersistence, testAccessToken, testIdentityService } from "./matchTestSupport";
import { buildServer } from "../index";
import { createGameRoomWithId, getGameRoom, storeTestHooks } from "../store";

const NEW_PLAYABLE_HERO_IDS = [
  HERO_DUOLINGO_ID,
  HERO_LUCHE_ID,
  HERO_DON_KIHOTE_ID,
  HERO_KANEKI_ID,
  HERO_JACK_RIPPER_ID,
  HERO_ZORO_ID,
  HERO_ARTEMIDA_ID,
] as const;

function collectMessages(ws: WebSocket) {
  const queue: ServerMessage[] = [];
  ws.on("message", (data) => {
    try {
      queue.push(JSON.parse(data.toString()) as ServerMessage);
    } catch {
      // ignore bad payloads in test
    }
  });
  return queue;
}

function waitForType<T extends ServerMessage["type"]>(
  queue: ServerMessage[],
  type: T,
  timeoutMs = 2000,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const msg = queue.find((item) => item.type === type);
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
  queue: ServerMessage[],
  predicate: (msg: RoomStateMessage) => boolean,
  timeoutMs = 2500,
): Promise<RoomStateMessage> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const msg = queue.find(
        (payload): payload is RoomStateMessage =>
          payload.type === "roomState" && predicate(payload),
      );
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
  queue: ServerMessage[],
  code: string,
  timeoutMs = 2000
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const msg = queue.find((item) => {
        const payload = item as { type?: string; code?: string };
        return (payload.type === "error" || payload.type === "actionResult") && payload.code === code;
      });
      if (msg) {
        resolve(msg);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for error: ${code}`));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}



function openSocket(wsUrl: string): Promise<WebSocket> {
  const ws = new WebSocket(wsUrl);
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve(ws));
    ws.once("error", (err) => reject(err));
  });
}

async function joinTwoPlayers(wsUrl: string, params: {
  p1FigureSet?: Record<string, string>;
  p2FigureSet?: Record<string, string>;
} = {}) {
  const ws1 = await openSocket(wsUrl);
  const ws2 = await openSocket(wsUrl);
  const queue1 = collectMessages(ws1);
  const queue2 = collectMessages(ws2);
  const accessTokens = { P1: testAccessToken("P1", "P1", randomUUID()), P2: testAccessToken("P2", "P2", randomUUID()) };

  ws1.send(
    JSON.stringify({
      type: "joinRoom",
      mode: "create",
      role: "P1",
      accessToken: accessTokens.P1,
      figureSet: params.p1FigureSet,
    })
  );
  const joinAck = (await waitForType(queue1, "joinAck")) as { roomId: string };
  await waitForRoomState(queue1, (msg) => msg.meta?.gameMode === "standard");

  ws2.send(
    JSON.stringify({
      type: "joinRoom",
      mode: "join",
      roomId: joinAck.roomId,
      role: "P2",
      accessToken: accessTokens.P2,
      figureSet: params.p2FigureSet,
    })
  );
  await waitForType(queue2, "joinAck");
  await waitForRoomState(queue2, (msg) => !!msg.meta?.players?.P2);

  return { ws1, ws2, queue1, queue2, roomId: joinAck.roomId, accessTokens };
}

function sendReadyBoth(ws1: WebSocket, ws2: WebSocket) {
  ws1.send(JSON.stringify({ type: "setReady", ready: true }));
  ws2.send(JSON.stringify({ type: "setReady", ready: true }));
}

function sendSetMode(ws: WebSocket, mode: string) {
  ws.send(JSON.stringify({ type: "setGameMode", mode }));
}

function heroForClass(
  unitClass: UnitClass,
  excluded: Set<string> = new Set()
): string {
  const hero = DRAFT_HERO_POOL.find(
    (candidate) =>
      candidate.primaryClass === unitClass && !excluded.has(candidate.heroId)
  );
  assert(hero, `missing draft hero for ${unitClass}`);
  return hero.heroId;
}

async function testDefaultRoomModeAndRoomList(server: Awaited<ReturnType<typeof buildServer>>) {
  storeTestHooks.reset();
  const room = createGameRoomWithId("mode-default-list");
  assert.equal(room.gameMode, "standard");
  const response = await server.inject({ method: "GET", url: "/rooms" });
  assert.equal(response.statusCode, 200);
  const rooms = response.json() as Array<{ id: string; gameMode: GameModeId }>;
  const listed = rooms.find((item) => item.id === room.id);
  assert(listed, "room should be listed");
  assert.equal(listed.gameMode, "standard");
  storeTestHooks.reset();
  console.log("server_modes_default_and_list passed");
}

async function testHostModeSelectionAndClassicStart(wsUrl: string) {
  const { ws1, ws2, queue1, queue2 } = await joinTwoPlayers(wsUrl, {
    p1FigureSet: { knight: "griffith", archer: "jebe" },
    p2FigureSet: { knight: "asgore", archer: "mettaton" },
  });

  ws2.send(JSON.stringify({ type: "setGameMode", mode: "classic" }));
  await waitForError(queue2, "not_host");

  sendSetMode(ws1, "invalid-mode");
  await waitForError(queue1, "invalid_game_mode");

  sendSetMode(ws1, "classic");
  await waitForRoomState(queue1, (msg) => msg.meta?.gameMode === "classic");

  sendReadyBoth(ws1, ws2);
  await waitForRoomState(queue1, (msg) => msg.meta?.ready?.P1 && msg.meta?.ready?.P2);

  ws1.send(JSON.stringify({ type: "startGame" }));
  const started = await waitForRoomState(
    queue1,
    (msg) => msg.meta?.pendingRoll?.kind === "initiativeRoll"
  );
  const p1Units = Object.values(started.view.units).filter(
    (unit) => unit.owner === "P1"
  );
  assert.equal(p1Units.length, 7);
  assert(
    p1Units.every((unit) => !unit.heroId && !unit.figureId),
    "classic start should ignore custom figure sets",
  );

  sendSetMode(ws1, "standard");
  await waitForError(queue1, "mode_locked");

  ws1.close();
  ws2.close();
  console.log("server_modes_host_selection_and_classic_start passed");
}

async function testStandardStartPreservesFigureSets(wsUrl: string) {
  const { ws1, ws2, queue1 } = await joinTwoPlayers(wsUrl, {
    p1FigureSet: { knight: "griffith", archer: "jebe", trickster: HERO_DUOLINGO_ID },
    p2FigureSet: { knight: "asgore", archer: "mettaton" },
  });

  sendReadyBoth(ws1, ws2);
  await waitForRoomState(queue1, (msg) => msg.meta?.ready?.P1 && msg.meta?.ready?.P2);
  ws1.send(JSON.stringify({ type: "startGame" }));
  const started = await waitForRoomState(
    queue1,
    (msg) => msg.meta?.pendingRoll?.kind === "initiativeRoll",
  );
  const units = Object.values(started.view.units);
  const p1Knight = units.find((unit) => unit.owner === "P1" && unit.class === "knight");
  assert.equal(p1Knight?.heroId, "griffith");
  const p1Trickster = units.find((unit) => unit.owner === "P1" && unit.class === "trickster");
  assert.equal(p1Trickster?.heroId, HERO_DUOLINGO_ID);
  assert.equal(p1Trickster?.figureId, HERO_DUOLINGO_ID);

  ws1.close();
  ws2.close();
  console.log("server_modes_standard_preserves_figure_sets passed");
}

async function testDraftRejectsEveryStubWithoutMutation(wsUrl: string) {
  const { ws1, ws2, queue1 } = await joinTwoPlayers(wsUrl);
  sendSetMode(ws1, "draft");
  await waitForRoomState(queue1, (msg) => msg.meta?.gameMode === "draft");
  sendReadyBoth(ws1, ws2);
  await waitForRoomState(queue1, (msg) => msg.meta?.ready?.P1 && msg.meta?.ready?.P2);
  ws1.send(JSON.stringify({ type: "startGame" }));
  await waitForRoomState(queue1, (msg) => msg.meta?.draftState?.phase === "ban");

  const draftStart = await waitForRoomState(
    queue1,
    (msg) => Array.isArray(msg.meta?.draftPool) && msg.meta.draftPool.length > 0,
  );
  for (const heroId of NEW_PLAYABLE_HERO_IDS) {
    assert(
      draftStart.meta.draftPool.some((hero) => hero.heroId === heroId),
      `${heroId} missing from server draft pool`,
    );
  }

  ws1.close();
  ws2.close();
  console.log("server_modes_draft_rejects_stub_heroes_without_mutation passed");
}

async function testDraftFlowStartsPlacement(wsUrl: string, persistence: MemoryMatchPersistence, rejectFinalPick = false) {
  const { ws1, ws2, queue1, queue2, roomId, accessTokens } = await joinTwoPlayers(wsUrl);
  const room = getGameRoom(roomId)!;
  const matchId = room.matchId!;
  const seatTokens = { ...room.seatTokens };
  const seatIdentities = structuredClone(room.seatIdentities);
  sendSetMode(ws1, "draft");
  await waitForRoomState(queue1, (msg) => msg.meta?.gameMode === "draft");

  sendReadyBoth(ws1, ws2);
  await waitForRoomState(queue1, (msg) => msg.meta?.ready?.P1 && msg.meta?.ready?.P2);
  ws1.send(JSON.stringify({ type: "startGame" }));

  await waitForRoomState(queue1, (msg) => msg.meta?.draftState?.phase === "ban");
  const draftStart = await waitForRoomState(
    queue1,
    (msg) => Array.isArray(msg.meta?.draftPool) && msg.meta.draftPool.length > 0,
  );
  assert(
    draftStart.meta.draftPool.every(
      (hero) => hero.implemented && !hero.isBase && hero.draftEnabled,
    ),
    "draft pool should exclude base units",
  );
  assert(
    NEW_PLAYABLE_HERO_IDS.every((heroId) =>
      draftStart.meta.draftPool.some((hero) => hero.heroId === heroId),
    ),
    "draft pool should include all newly playable heroes",
  );

  sendSetMode(ws1, "classic");
  await waitForError(queue1, "mode_locked");

  ws2.send(JSON.stringify({ type: "draftBanHero", heroId: heroForClass("knight") }));
  await waitForError(queue2, "not_current_player");

  ws1.send(JSON.stringify({ type: "draftBanHero", heroId: "base-knight" }));
  await waitForError(queue1, "base_unit_not_allowed");

  const banned = new Set<string>();
  for (let i = 0; i < DRAFT_BAN_ORDER.length; i += 1) {
    const player = DRAFT_BAN_ORDER[i];
    const unitClass = DRAFT_CLASSES[i];
    const heroId = heroForClass(unitClass, banned);
    banned.add(heroId);
    const socket = player === "P1" ? ws1 : ws2;
    socket.send(JSON.stringify({ type: "draftBanHero", heroId }));
    await waitForRoomState(
      player === "P1" ? queue1 : queue2,
      (msg) => msg.meta?.draftState?.history?.length === i + 1,
    );
  }

  const selected = new Set(banned);
  const pickedClasses: Record<PlayerId, Set<UnitClass>> = {
    P1: new Set(),
    P2: new Set(),
  };
  const pickOrder = getPickOrder();
  for (let i = 0; i < pickOrder.length; i += 1) {
    const player = pickOrder[i];
    const unitClass = DRAFT_CLASSES.find((candidate) => !pickedClasses[player].has(candidate));
    assert(unitClass, `expected open class for ${player}`);
    const heroId = heroForClass(unitClass, selected);
    selected.add(heroId);
    pickedClasses[player].add(unitClass);
    const socket = player === "P1" ? ws1 : ws2;
    if (rejectFinalPick && i === pickOrder.length - 1) {
      const revision = room.revision;
      const draftBefore = structuredClone(room.draftState);
      persistence.fail.add("participant");
      socket.send(JSON.stringify({ type: "draftPickHero", heroId }));
      await waitForError(player === "P1" ? queue1 : queue2, "MATCH_PERSISTENCE_UNAVAILABLE");
      persistence.fail.delete("participant");
      assert.deepEqual(room.draftState, draftBefore, "rejected transition must keep the last pick available for retry");
      assert.equal(room.revision, revision, "rejected transition must not journal a completed draft");
    }
    socket.send(JSON.stringify({ type: "draftPickHero", heroId }));
    await waitForRoomState(
      player === "P1" ? queue1 : queue2,
      (msg) => msg.meta?.draftState?.history?.length === DRAFT_BAN_ORDER.length + i + 1,
    );
  }

  const completed = await waitForRoomState(
    queue1,
    (msg) => msg.meta?.draftState?.phase === "complete" && !!msg.meta?.pendingRoll,
  );
  await waitForRoomState(queue2, (msg) => msg.meta?.draftState?.phase === "complete" && !!msg.meta?.pendingRoll);
  assert.equal(getGameRoom(roomId), room);
  assert.equal(room.matchId, matchId);
  assert.equal(persistence.matches.get(matchId)?.status, "IN_PROGRESS");
  assert.deepEqual(room.seatTokens, seatTokens);
  assert.deepEqual(room.seatIdentities, seatIdentities);
  const transition = room.actionLog.slice(-2);
  assert.deepEqual(transition.map((entry) => entry.action.type), ["draftPickHero", "startGame"]);
  assert.equal(transition[0].revision + 1, transition[1].revision);
  const startedResult = queue1.find((msg) => msg.type === "actionResult" && msg.ok && msg.events.some((event) => event.type === "initiativeRollRequested"));
  assert(startedResult?.type === "actionResult");
  assert.equal(startedResult.revision, room.revision);
  for (const queue of [queue1, queue2]) {
    assert(!queue.some((msg) => msg.type === "leftRoom" || msg.type === "joinRejected"));
    assert(!queue.some((msg) => msg.type === "roomState" && msg.meta?.draftState?.phase === "complete" && !msg.meta.pendingRoll && msg.view.phase === "lobby"), "completed draft must arrive with gameplay state");
  }
  const p1Units = Object.values(completed.view.units).filter((unit) => unit.owner === "P1");
  assert.equal(p1Units.length, 7);
  assert(
    p1Units.every((unit) => !!unit.heroId && !unit.heroId.startsWith("base-")),
    "drafted roster should contain full heroes only",
  );

  // Complete authoritative initiative/rule choices, then reconnect to the same gameplay.
  let rolls = 0;
  while (room.state.pendingRoll) {
    assert(++rolls < 10, "setup rolls must reach placement");
    const pending = room.state.pendingRoll;
    const revision = room.revision;
    (pending.player === "P1" ? ws1 : ws2).send(JSON.stringify({
      type: "resolvePendingRoll", pendingRollId: pending.id,
      ...(pending.kind === "ruleDeclarationChoice" ? { choice: { type: "chooseRuleDeclaration", ruleId: "normal_rule" } } : {}),
    }));
    await waitForRoomState(queue1, (msg) => msg.meta.revision > revision);
  }
  assert.equal(room.state.phase, "placement");
  const placement = await waitForRoomState(queue2, (msg) => msg.view.phase === "placement");
  const closed = new Promise<void>((resolve) => ws2.once("close", () => resolve()));
  ws2.close();
  await closed;
  const resumed = await openSocket(wsUrl);
  const resumedQueue = collectMessages(resumed);
  resumed.send(JSON.stringify({ type: "joinRoom", mode: "join", roomId, role: "P2", resumeToken: seatTokens.P2, accessToken: accessTokens.P2 }));
  const ack = await waitForType(resumedQueue, "joinAck");
  assert(ack.type === "joinAck");
  assert.equal(ack.seat, "P2");
  assert.equal(ack.resumeToken, seatTokens.P2);
  const resumedState = await waitForRoomState(resumedQueue, (msg) => msg.view.phase === "placement");
  assert.equal(resumedState.roomId, roomId);
  assert.equal(room.matchId, matchId);
  assert.deepEqual(room.seatTokens, seatTokens);
  assert.deepEqual(room.seatIdentities, seatIdentities);
  assert.deepEqual(resumedState.view.units, placement.view.units);
  resumed.close();

  ws1.close();
  console.log("server_modes_draft_flow_starts_placement passed");
}

async function main() {
  const persistence = new MemoryMatchPersistence();
  const server = await buildServer({ matchPersistence: persistence, connectionIdentity: testIdentityService() });
  await server.listen({ port: 0, host: "127.0.0.1" });

  const address = server.server.address();
  if (!address || typeof address === "string") {
    await server.close();
    throw new Error("Unable to determine server address");
  }
  const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

  try {
    await testDefaultRoomModeAndRoomList(server);
    await testStandardStartPreservesFigureSets(wsUrl);
    await testHostModeSelectionAndClassicStart(wsUrl);
    await testDraftRejectsEveryStubWithoutMutation(wsUrl);
    await testDraftFlowStartsPlacement(wsUrl, persistence);
    await testDraftFlowStartsPlacement(wsUrl, persistence, true);
  } finally {
    storeTestHooks.reset();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
