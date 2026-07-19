import assert from "assert";
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
import { buildServer } from "../index";
import { createGameRoomWithId, getGameRoom, storeTestHooks } from "../store";

const STUB_HERO_IDS = [
  HERO_DUOLINGO_ID,
  HERO_LUCHE_ID,
  HERO_DON_KIHOTE_ID,
  HERO_KANEKI_ID,
  HERO_JACK_RIPPER_ID,
  HERO_ZORO_ID,
  HERO_ARTEMIDA_ID,
] as const;

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
): Promise<any> {
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
  predicate: (msg: { type?: string; meta?: any; view?: any }) => boolean,
  timeoutMs = 2500
): Promise<any> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const msg = queue.find((item) => {
        const payload = item as { type?: string; meta?: any; view?: any };
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
  code: string,
  timeoutMs = 2000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const msg = queue.find((item) => {
        const payload = item as { type?: string; code?: string };
        return payload.type === "error" && payload.code === code;
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

function waitForErrorCount(
  queue: unknown[],
  code: string,
  expectedCount: number,
  timeoutMs = 2000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const matches = queue.filter((item) => {
        const payload = item as { type?: string; code?: string };
        return payload.type === "error" && payload.code === code;
      });
      if (matches.length >= expectedCount) {
        resolve(matches[expectedCount - 1]);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for error ${code} count ${expectedCount}`));
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

  ws1.send(
    JSON.stringify({
      type: "joinRoom",
      mode: "create",
      role: "P1",
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
      figureSet: params.p2FigureSet,
    })
  );
  await waitForType(queue2, "joinAck");
  await waitForRoomState(queue2, (msg) => !!msg.meta?.players?.P2);

  return { ws1, ws2, queue1, queue2, roomId: joinAck.roomId };
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
  const p1Units = Object.values(started.view.units as Record<string, any>).filter(
    (unit) => unit.owner === "P1"
  );
  assert.equal(p1Units.length, 7);
  assert(
    p1Units.every((unit: any) => !unit.heroId && !unit.figureId),
    "classic start should ignore custom figure sets"
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
    (msg) => msg.meta?.pendingRoll?.kind === "initiativeRoll"
  );
  const units = Object.values(started.view.units as Record<string, any>);
  const p1Knight = units.find(
    (unit: any) => unit.owner === "P1" && unit.class === "knight"
  ) as any;
  assert.equal(p1Knight?.heroId, "griffith");
  const p1Trickster = units.find(
    (unit: any) => unit.owner === "P1" && unit.class === "trickster"
  ) as any;
  assert.equal(p1Trickster?.heroId, undefined);
  assert.equal(p1Trickster?.figureId, undefined);

  ws1.close();
  ws2.close();
  console.log("server_modes_standard_preserves_figure_sets passed");
}

async function testDraftRejectsEveryStubWithoutMutation(wsUrl: string) {
  const { ws1, ws2, queue1, queue2, roomId } = await joinTwoPlayers(wsUrl);
  sendSetMode(ws1, "draft");
  await waitForRoomState(queue1, (msg) => msg.meta?.gameMode === "draft");
  sendReadyBoth(ws1, ws2);
  await waitForRoomState(queue1, (msg) => msg.meta?.ready?.P1 && msg.meta?.ready?.P2);
  ws1.send(JSON.stringify({ type: "startGame" }));
  await waitForRoomState(queue1, (msg) => msg.meta?.draftState?.phase === "ban");

  let rejectionCount = 0;
  for (const heroId of STUB_HERO_IDS) {
    const room = getGameRoom(roomId);
    assert(room?.draftState, `draft state should exist before banning ${heroId}`);
    const before = JSON.stringify(room.draftState);
    ws1.send(JSON.stringify({ type: "draftBanHero", heroId }));
    rejectionCount += 1;
    await waitForErrorCount(queue1, "hero_not_draftable", rejectionCount);
    assert.equal(JSON.stringify(room.draftState), before, `stub ban mutated state for ${heroId}`);
  }

  for (let index = 0; index < DRAFT_BAN_ORDER.length; index += 1) {
    const player = DRAFT_BAN_ORDER[index];
    const socket = player === "P1" ? ws1 : ws2;
    const queue = player === "P1" ? queue1 : queue2;
    socket.send(
      JSON.stringify({ type: "draftBanHero", heroId: heroForClass(DRAFT_CLASSES[index]) })
    );
    await waitForRoomState(
      queue,
      (msg) => msg.meta?.draftState?.history?.length === index + 1
    );
  }

  for (const heroId of STUB_HERO_IDS) {
    const room = getGameRoom(roomId);
    assert(room?.draftState, `draft state should exist before picking ${heroId}`);
    const before = JSON.stringify(room.draftState);
    ws1.send(JSON.stringify({ type: "draftPickHero", heroId }));
    rejectionCount += 1;
    await waitForErrorCount(queue1, "hero_not_draftable", rejectionCount);
    assert.equal(JSON.stringify(room.draftState), before, `stub pick mutated state for ${heroId}`);
  }

  ws1.close();
  ws2.close();
  console.log("server_modes_draft_rejects_stub_heroes_without_mutation passed");
}

async function testDraftFlowStartsPlacement(wsUrl: string) {
  const { ws1, ws2, queue1, queue2 } = await joinTwoPlayers(wsUrl);
  sendSetMode(ws1, "draft");
  await waitForRoomState(queue1, (msg) => msg.meta?.gameMode === "draft");

  sendReadyBoth(ws1, ws2);
  await waitForRoomState(queue1, (msg) => msg.meta?.ready?.P1 && msg.meta?.ready?.P2);
  ws1.send(JSON.stringify({ type: "startGame" }));

  await waitForRoomState(queue1, (msg) => msg.meta?.draftState?.phase === "ban");
  const draftStart = await waitForRoomState(
    queue1,
    (msg) => Array.isArray(msg.meta?.draftPool) && msg.meta.draftPool.length > 0
  );
  assert(
    draftStart.meta.draftPool.every(
      (hero: any) => hero.implemented && !hero.isBase && hero.draftEnabled
    ),
    "draft pool should exclude base units"
  );
  assert(
    STUB_HERO_IDS.every(
      (heroId) => !draftStart.meta.draftPool.some((hero: any) => hero.heroId === heroId)
    ),
    "draft pool should exclude all stub heroes"
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
      (msg) => msg.meta?.draftState?.history?.length === i + 1
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
    const unitClass = DRAFT_CLASSES.find(
      (candidate) => !pickedClasses[player].has(candidate)
    );
    assert(unitClass, `expected open class for ${player}`);
    const heroId = heroForClass(unitClass, selected);
    selected.add(heroId);
    pickedClasses[player].add(unitClass);
    const socket = player === "P1" ? ws1 : ws2;
    socket.send(JSON.stringify({ type: "draftPickHero", heroId }));
    await waitForRoomState(
      player === "P1" ? queue1 : queue2,
      (msg) => msg.meta?.draftState?.history?.length === DRAFT_BAN_ORDER.length + i + 1
    );
  }

  const completed = await waitForRoomState(
    queue1,
    (msg) => msg.meta?.draftState?.phase === "complete" && !!msg.meta?.pendingRoll
  );
  const p1Units = Object.values(completed.view.units as Record<string, any>).filter(
    (unit) => unit.owner === "P1"
  );
  assert.equal(p1Units.length, 7);
  assert(
    p1Units.every((unit: any) => !!unit.heroId && !unit.heroId.startsWith("base-")),
    "drafted roster should contain full heroes only"
  );

  ws1.close();
  ws2.close();
  console.log("server_modes_draft_flow_starts_placement passed");
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

  try {
    await testDefaultRoomModeAndRoomList(server);
    await testStandardStartPreservesFigureSets(wsUrl);
    await testHostModeSelectionAndClassicStart(wsUrl);
    await testDraftRejectsEveryStubWithoutMutation(wsUrl);
    await testDraftFlowStartsPlacement(wsUrl);
  } finally {
    storeTestHooks.reset();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
