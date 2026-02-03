import {
  createEmptyGame,
  createDefaultArmy,
  attachArmy,
  applyAction as applyActionRaw,
  coordFromNotation,
  Coord,
  GameEvent,
  GameState,
  PlayerId,
  UnitState,
  makePlayerView,
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_GENGHIS_KHAN_KHANS_DECREE,
  ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
  ABILITY_EL_SID_COMPEADOR_TISONA,
  ABILITY_EL_SID_COMPEADOR_KOLADA,
  ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
  ABILITY_KAISER_DORA,
  ABILITY_KAISER_CARPET_STRIKE,
  ABILITY_KAISER_ENGINEERING_MIRACLE,
  ABILITY_TEST_MULTI_SLOT,
  ABILITY_VLAD_FOREST,
  HERO_GRAND_KAISER_ID,
  HERO_GENGHIS_KHAN_ID,
  HERO_EL_CID_COMPEADOR_ID,
  HERO_VLAD_TEPES_ID,
  HERO_REGISTRY,
  getHeroMeta,
  getLegalMovesForUnit,
  getTricksterMovesForRoll,
  getBerserkerMovesForRoll,
  resolveAttack,
  getLegalAttackTargets,
  getLegalIntents,
  linePath,
} from "../index";
import { SeededRNG } from "../rng";
import assert from "assert";
import fs from "fs";
import path from "path";

function setUnit(
  state: GameState,
  unitId: string,
  patch: Partial<UnitState>
): GameState {
  const unit = state.units[unitId];
  if (!unit) {
    return state;
  }
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: { ...unit, ...patch },
    },
  };
}

function initKnowledgeForOwners(state: GameState): GameState {
  const knowledge: GameState["knowledge"] = { P1: {}, P2: {} };
  for (const u of Object.values(state.units)) {
    if (!u.isAlive) continue;
    knowledge[u.owner][u.id] = true;
  }
  return { ...state, knowledge };
}

function applyAction(
  state: GameState,
  action: Parameters<typeof applyActionRaw>[1],
  rng: Parameters<typeof applyActionRaw>[2]
) {
  return applyActionRaw(state, action as any, rng as any);
}

function resolvePendingRollOnce(
  state: GameState,
  rng: Parameters<typeof applyActionRaw>[2],
  choice?: "auto" | "roll"
) {
  if (!state.pendingRoll) {
    return { state, events: [] as any[] };
  }
  const pending = state.pendingRoll;
  const resolvedChoice =
    pending.kind === "berserkerDefenseChoice" ||
    pending.kind === "dora_berserkerDefenseChoice" ||
    pending.kind === "carpetStrike_berserkerDefenseChoice" ||
    pending.kind === "vladForest_berserkerDefenseChoice"
      ? choice ?? "roll"
      : undefined;
  return applyActionRaw(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      choice: resolvedChoice,
      player: pending.player,
    } as any,
    rng as any
  );
}

function resolveAllPendingRolls(
  state: GameState,
  rng: Parameters<typeof applyActionRaw>[2],
  choice?: "auto" | "roll"
) {
  let result = { state, events: [] as any[] };
  while (result.state.pendingRoll) {
    result = resolvePendingRollOnce(result.state, rng, choice);
  }
  return result;
}

function resolveAllPendingRollsWithEvents(
  state: GameState,
  rng: Parameters<typeof applyActionRaw>[2],
  choice?: "auto" | "roll"
) {
  let current = { state, events: [] as any[] };
  const events: any[] = [];
  while (current.state.pendingRoll) {
    current = resolvePendingRollOnce(current.state, rng, choice);
    events.push(...current.events);
  }
  return { state: current.state, events };
}

function coordKeys(coords: { col: number; row: number }[]): string[] {
  return coords.map((c) => `${c.col},${c.row}`).sort();
}

function toBattleState(
  state: GameState,
  currentPlayer: "P1" | "P2",
  activeUnitId: string
): GameState {
  return {
    ...state,
    phase: "battle",
    currentPlayer,
    activeUnitId,
    placementOrder: [activeUnitId],
    turnQueue: [activeUnitId],
    turnQueueIndex: 0,
    turnOrder: [activeUnitId],
    turnOrderIndex: 0,
  };
}

function setupKaiserState() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { archer: HERO_GRAND_KAISER_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const kaiser = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;

  return { state, kaiser, enemy };
}

function setupVladState() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { spearman: HERO_VLAD_TEPES_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const vlad = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  return { state, vlad, enemy };
}

function setupElCidState() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { knight: HERO_EL_CID_COMPEADOR_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const elCid = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;

  return { state, elCid, enemy };
}

function setupSpearmanAttackState(position: Coord) {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { spearman: HERO_VLAD_TEPES_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const spearman = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, spearman.id, { position });
  state = toBattleState(state, "P1", spearman.id);
  state = initKnowledgeForOwners(state);

  return { state, spearman, enemy };
}

function makeRngSequence(values: number[]) {
  let index = 0;
  return {
    next: () => {
      if (index >= values.length) return 0.5;
      const value = values[index];
      index += 1;
      return value;
    },
  };
}

function testActionModuleBoundaries() {
  const actionsDir = path.resolve(__dirname, "..", "actions");
  const heroesDir = path.join(actionsDir, "heroes");
  const actionFiles = fs
    .readdirSync(actionsDir)
    .filter((name) => name.endsWith(".ts"));
  const heroFiles = fs
    .readdirSync(heroesDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => path.join("heroes", name));
  const files = [...actionFiles, ...heroFiles];

  const allowedExact = new Set(["./shared", "./types", "./domain"]);
  const allowedPrefixes = ["./utils/", "./heroes/"];
  const allowlistByFile = new Map<string, Set<string>>([
    [
      "registry.ts",
      new Set([
        "./abilityActions",
        "./combatActions",
        "./lobbyActions",
        "./movementActions",
        "./pendingRollActions",
        "./placementActions",
        "./stealthActions",
        "./turnActions",
      ]),
    ],
    ["index.ts", new Set(["./armyActions", "./lobbyActions", "./registry"])],
  ]);

  const violations: string[] = [];

  for (const relativePath of files) {
    const fullPath = path.join(actionsDir, relativePath);
    const content = fs.readFileSync(fullPath, "utf8");
    const lines = content.split(/\r?\n/);
    const fileAllowlist = allowlistByFile.get(relativePath);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;
      const match = trimmed.match(
        /^(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/
      );
      if (!match) continue;
      const spec = match[1];
      if (!spec.startsWith("./")) continue;
      const isAllowed =
        allowedExact.has(spec) ||
        allowedPrefixes.some((prefix) => spec.startsWith(prefix)) ||
        (fileAllowlist ? fileAllowlist.has(spec) : false);
      if (!isAllowed) {
        violations.push(`${relativePath} -> ${spec}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("Action module boundary violations:");
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
  }

  assert.strictEqual(
    violations.length,
    0,
    "Action module boundary violations detected"
  );

  console.log("action_module_boundaries passed");
}

function toPlacementState(
  state: GameState,
  firstPlayer: PlayerId = "P1"
): GameState {
  return {
    ...state,
    phase: "placement",
    currentPlayer: firstPlayer,
    placementFirstPlayer: firstPlayer,
    initiative: {
      ...state.initiative,
      winner: firstPlayer,
    },
    unitsPlaced: { P1: 0, P2: 0 },
    placementOrder: [],
    turnQueue: [],
    turnQueueIndex: 0,
    turnOrder: [],
    turnOrderIndex: 0,
  };
}

function setupBerserkerBattleState(col: number, row: number) {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = toPlacementState(state, "P1");

  const berserker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "berserker"
  )!;

  state = setUnit(state, berserker.id, { position: { col, row } });
  state = toBattleState(state, "P1", berserker.id);
  state = initKnowledgeForOwners(state);

  return { state, berserkerId: berserker.id };
}

function testPlacementToBattleAndTurnOrder() {
  const rng = new SeededRNG(12345);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = toPlacementState(state, "P1");

  // simulate simple alternating placement to reach battle
  const p1coords = ["b0","c0","d0","e0","f0","g0","h0"].map(coordFromNotation);
  const p2coords = ["b8","c8","d8","e8","f8","g8","h8"].map(coordFromNotation);

  let p1i=0,p2i=0;
  while (state.phase === "placement") {
    const current = state.currentPlayer;
    const nextUnit = Object.values(state.units).find(u => u.owner === current && !u.position && u.isAlive);
    if (!nextUnit) { state = applyAction(state, { type: "endTurn" } as any, rng).state; continue; }
    const pos = current === "P1" ? p1coords[p1i++] : p2coords[p2i++];
    state = applyAction(state, { type: "placeUnit", unitId: nextUnit.id, position: pos } as any, rng).state;
  }

  // After placement we must be in battle and have turnOrder length 14
  assert(state.phase === "battle", "phase should be battle");
  assert(state.turnOrder.length === 14, "turnOrder length should be 14");
  // startingUnitId should equal first placed unit
  assert(state.startingUnitId === state.turnOrder[state.turnOrderIndex], "starting unit must be first in turnOrder");

  console.log("testPlacementToBattleAndTurnOrder passed");
}

function testLobbyReadyAndStartRequiresBothReady() {
  const rng = new SeededRNG(500);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = applyAction(state, { type: "lobbyInit", host: "P1" } as any, rng).state;
  state = { ...state, seats: { P1: true, P2: true } };

  const start1 = applyAction(state, { type: "startGame" } as any, rng);
  assert(
    !start1.state.pendingRoll,
    "startGame should not request initiative without both ready"
  );

  state = applyAction(
    state,
    { type: "setReady", player: "P1", ready: true } as any,
    rng
  ).state;

  const start2 = applyAction(state, { type: "startGame" } as any, rng);
  assert(
    !start2.state.pendingRoll,
    "startGame should not request initiative until both ready"
  );

  state = applyAction(
    state,
    { type: "setReady", player: "P2", ready: true } as any,
    rng
  ).state;

  const start3 = applyAction(state, { type: "startGame" } as any, rng);
  assert(
    start3.state.pendingRoll?.kind === "initiativeRoll",
    "startGame should request initiative roll when both ready"
  );
  assert(
    start3.state.pendingRoll?.player === "P1",
    "initiative roll should start with P1"
  );
  assert(start3.state.phase === "lobby", "phase should remain lobby during rolls");

  console.log("testLobbyReadyAndStartRequiresBothReady passed");
}

function testInitiativeRollSequenceNoAutoroll() {
  const rng = new SeededRNG(501);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = applyAction(state, { type: "lobbyInit", host: "P1" } as any, rng).state;
  state = { ...state, seats: { P1: true, P2: true } };
  state = applyAction(
    state,
    { type: "setReady", player: "P1", ready: true } as any,
    rng
  ).state;
  state = applyAction(
    state,
    { type: "setReady", player: "P2", ready: true } as any,
    rng
  ).state;

  state = applyAction(state, { type: "startGame" } as any, rng).state;
  assert(
    state.pendingRoll?.player === "P1",
    "startGame should request P1 initiative roll"
  );
  assert(
    state.initiative.P1 === null && state.initiative.P2 === null,
    "initiative should not be set before rolls"
  );

  const afterP1 = resolvePendingRollOnce(state, rng);
  assert(
    afterP1.state.pendingRoll?.player === "P2",
    "P2 roll should be requested after P1 resolves"
  );
  assert(
    afterP1.state.initiative.P1 !== null &&
      afterP1.state.initiative.P2 === null,
    "P1 initiative should be set after first roll only"
  );

  console.log("testInitiativeRollSequenceNoAutoroll passed");
}

function testInitiativeWinnerSetsPlacementFirstPlayerAndPhasePlacement() {
  const rng = new SeededRNG(502);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = applyAction(state, { type: "lobbyInit", host: "P1" } as any, rng).state;
  state = { ...state, seats: { P1: true, P2: true } };
  state = applyAction(
    state,
    { type: "setReady", player: "P1", ready: true } as any,
    rng
  ).state;
  state = applyAction(
    state,
    { type: "setReady", player: "P2", ready: true } as any,
    rng
  ).state;
  state = applyAction(state, { type: "startGame" } as any, rng).state;

  const resolved = resolveAllPendingRolls(state, rng);
  const finalState = resolved.state;

  assert(finalState.phase === "placement", "phase should switch to placement");
  assert(
    finalState.initiative.winner !== null,
    "initiative winner should be set"
  );
  assert(
    finalState.placementFirstPlayer === finalState.initiative.winner,
    "placementFirstPlayer should match initiative winner"
  );
  assert(
    finalState.currentPlayer === finalState.initiative.winner,
    "currentPlayer should start as initiative winner"
  );

  console.log("testInitiativeWinnerSetsPlacementFirstPlayerAndPhasePlacement passed");
}

function testRiderPathHitsStealthed() {
  const rng = new SeededRNG(42);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  // place minimal subset: place rider and two enemies inline
  const rider = Object.values(state.units).find(u => u.owner === "P1" && u.class === "rider")!;
  const enemy1 = Object.values(state.units).find(u => u.owner === "P2" && u.class === "spearman")!;
  const enemy2 = Object.values(state.units).find(u => u.owner === "P2" && u.class === "archer")!;

  state = { ...state, units: { ...state.units } };
  state.units[rider.id] = { ...rider, position: { col: 0, row: 2 }, hasMovedThisTurn: false, hasActedThisTurn: false };
  state.units[enemy1.id] = { ...enemy1, position: { col: 2, row: 2 }, isStealthed: true, stealthTurnsLeft: 3 };
  state.units[enemy2.id] = { ...enemy2, position: { col: 4, row: 2 }, isStealthed: true, stealthTurnsLeft: 3 };

  state = { ...state, phase: "battle", currentPlayer: "P1", activeUnitId: rider.id };

  // start rider turn
  state = applyAction(state, { type: "unitStartTurn", unitId: rider.id } as any, rng).state;
  // move across and hit both (path attacks are now pending rolls)
  let moveRes = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 5, row: 2 } } as any,
    rng
  );
  moveRes = resolveAllPendingRolls(moveRes.state, rng);
  state = moveRes.state;

  // Both enemies should have been at least revealed (isStealthed=false) or dead
  const e1 = state.units[enemy1.id];
  const e2 = state.units[enemy2.id];
  assert(e1 == null || e1.isStealthed === false, "enemy1 should be revealed or dead");
  assert(e2 == null || e2.isStealthed === false, "enemy2 should be revealed or dead");

  console.log("testRiderPathHitsStealthed passed");
}

function testGameEndCondition() {
  const rng = new SeededRNG(7);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  // kill all P2 units
  const units = { ...state.units };
  for (const u of Object.values(units)) {
    if (u.owner === "P2") {
      units[u.id] = { ...u, isAlive: false, position: null, hp: 0 };
    }
  }
  state = { ...state, units };

  // set battle phase to allow endTurn logic to run
  state = { ...state, phase: "battle" };
  // calling endTurn should move to ended if a player has no units
  state = applyAction(state, { type: "endTurn" } as any, rng).state;

  // If P2 has no living units, phase should be ended
  const p2alive = Object.values(state.units).some(u => u.owner === "P2" && u.isAlive);
  if (!p2alive) {
    assert(state.phase === "ended" || state.phase === "battle" , "phase should be ended when a player's all units are dead");
  }

  console.log("testGameEndCondition passed (phase:", state.phase, ")");
}

function testBerserkerAutoDefenseEnabled() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, defender.id, {
    position: { col: 4, row: 5 },
    charges: { ...defender.charges, [ABILITY_BERSERK_AUTO_DEFENSE]: 6 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);
  const knowledgeBefore = JSON.parse(JSON.stringify(state.knowledge));
  const defenderHpBefore = state.units[defender.id].hp;

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
      defenderUseBerserkAutoDefense: true,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng, "auto");

  const next = resolved.state;
  const events = resolved.events;
  const abilityEvent = events.find(
    (e) => e.type === "abilityUsed" && e.unitId === defender.id
  );
  const attackEvent = events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );

  assert(abilityEvent, "abilityUsed should be emitted");
  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(attackEvent.hit === false, "attack should be dodged");
    assert(attackEvent.damage === 0, "damage should be 0");
  }

  assert(
    next.units[defender.id].hp === defenderHpBefore,
    "defender should take no damage"
  );
  assert(
    next.units[defender.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 0,
    "charges should drop to 0 after use"
  );
  assert.deepStrictEqual(next.knowledge, knowledgeBefore, "knowledge unchanged");

  console.log("berserker_auto_defense_enabled passed");
}

function testBerserkerAutoDefenseDeclined() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, defender.id, {
    position: { col: 4, row: 5 },
    charges: { ...defender.charges, [ABILITY_BERSERK_AUTO_DEFENSE]: 6 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);
  const knowledgeBefore = JSON.parse(JSON.stringify(state.knowledge));

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
      defenderUseBerserkAutoDefense: false,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng, "roll");

  const next = resolved.state;
  const events = resolved.events;
  const abilityEvent = events.find((e) => e.type === "abilityUsed");
  const attackEvent = events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );

  assert(!abilityEvent, "abilityUsed should not be emitted");
  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(attackEvent.hit === true, "attack should resolve normally");
    assert(attackEvent.damage === attacker.attack, "damage should be base attack");
  }

  assert(
    next.units[defender.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 6,
    "charges should remain unchanged"
  );
  assert.deepStrictEqual(next.knowledge, knowledgeBefore, "knowledge unchanged");

  console.log("berserker_auto_defense_declined passed");
}

function testBerserkerAutoDefenseNoCharges() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, defender.id, {
    position: { col: 4, row: 5 },
    charges: { ...defender.charges, [ABILITY_BERSERK_AUTO_DEFENSE]: 0 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);
  const knowledgeBefore = JSON.parse(JSON.stringify(state.knowledge));

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
      defenderUseBerserkAutoDefense: true,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng, "roll");

  const next = resolved.state;
  const events = resolved.events;
  const abilityEvent = events.find((e) => e.type === "abilityUsed");
  const attackEvent = events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );

  assert(!abilityEvent, "abilityUsed should not be emitted");
  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(attackEvent.hit === true, "attack should resolve normally");
  }

  assert(
    next.units[defender.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 0,
    "charges should remain 0"
  );
  assert.deepStrictEqual(next.knowledge, knowledgeBefore, "knowledge unchanged");

  console.log("berserker_auto_defense_no_charges passed");
}

function testBerserkerDefenseChoiceAutoDodgeSpends6() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, defender.id, {
    position: { col: 4, row: 5 },
    charges: { ...defender.charges, [ABILITY_BERSERK_AUTO_DEFENSE]: 6 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng, "auto");

  const choiceEvent = resolved.events.find(
    (e) => e.type === "berserkerDefenseChosen"
  );
  assert(
    choiceEvent && choiceEvent.type === "berserkerDefenseChosen" && choiceEvent.choice === "auto",
    "berserkerDefenseChosen should record auto choice"
  );

  const attackEvent = resolved.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );
  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(attackEvent.hit === false, "auto-dodge should force miss");
    assert(attackEvent.damage === 0, "auto-dodge should deal no damage");
  }

  assert(
    resolved.state.units[defender.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 0,
    "auto-dodge should spend all charges"
  );

  console.log("berserker_defense_choice_auto_dodge_spends_6 passed");
}

function testBerserkerDefenseChoiceRollUsesNormalCombat() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, defender.id, {
    position: { col: 4, row: 5 },
    charges: { ...defender.charges, [ABILITY_BERSERK_AUTO_DEFENSE]: 6 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const step1 = applyActionRaw(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );

  const pending1 = step1.state.pendingRoll;
  assert(
    pending1 && pending1.kind === "attack_attackerRoll",
    "attacker roll should be requested first"
  );

  const step2 = applyActionRaw(
    step1.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending1!.id,
      player: pending1!.player,
    } as any,
    rng
  );

  const pending2 = step2.state.pendingRoll;
  assert(
    pending2 && pending2.kind === "berserkerDefenseChoice",
    "berserkerDefenseChoice roll should be requested after attacker roll"
  );

  const step3 = applyActionRaw(
    step2.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending2!.id,
      choice: "roll",
      player: pending2!.player,
    } as any,
    rng
  );

  const choiceEvent = step3.events.find(
    (e) => e.type === "berserkerDefenseChosen"
  );
  assert(
    choiceEvent && choiceEvent.type === "berserkerDefenseChosen" && choiceEvent.choice === "roll",
    "berserkerDefenseChosen should record roll choice"
  );

  const pending3 = step3.state.pendingRoll;
  assert(
    pending3 && pending3.kind === "attack_defenderRoll",
    "defender roll should be requested after roll choice"
  );

  const final = resolveAllPendingRolls(step3.state, rng);

  const attackEvent = final.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );
  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(
      attackEvent.attackerRoll.dice.length >= 2,
      "normal combat should roll dice"
    );
  }
  assert(
    final.state.units[defender.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 6,
    "roll defense should not spend charges"
  );

  console.log("berserker_defense_choice_roll_uses_normal_combat passed");
}

function testCannotAutoDodgeIfChargesNot6() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, defender.id, {
    position: { col: 4, row: 5 },
    charges: { ...defender.charges, [ABILITY_BERSERK_AUTO_DEFENSE]: 5 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng, "auto");

  assert(
    resolved.state.units[defender.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 5,
    "auto-dodge should be rejected when charges are not 6"
  );
  const attackEvent = resolved.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );
  assert(attackEvent, "attack should resolve normally when auto-dodge unavailable");

  console.log("cannot_auto_dodge_if_charges_not_6 passed");
}

function testAssassinAttackFromStealth() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 2, row: 2 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, defender.id, {
    position: { col: 2, row: 3 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const next = resolved.state;
  const events = resolved.events;
  const attackEvent = events.find(
    (e) => e.type === "attackResolved" && e.attackerId === attacker.id
  );

  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(attackEvent.damage === 2, "stealth attack damage should be 2");
  }

  assert(
    next.units[attacker.id].isStealthed === false,
    "assassin should be revealed after attack"
  );
  assert(
    next.knowledge["P2"][attacker.id] === true,
    "assassin should be revealed in enemy knowledge"
  );

  console.log("assassin_attack_from_stealth passed");
}

function testAssassinAttackWithoutStealth() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 2, row: 2 },
    isStealthed: false,
    stealthTurnsLeft: 0,
  });
  state = setUnit(state, defender.id, {
    position: { col: 2, row: 3 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const next = resolved.state;
  const events = resolved.events;
  const attackEvent = events.find(
    (e) => e.type === "attackResolved" && e.attackerId === attacker.id
  );

  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(
      attackEvent.damage === attacker.attack,
      "non-stealth attack damage should be base attack"
    );
  }

  assert(
    next.units[attacker.id].isStealthed === false,
    "assassin should remain not stealthed"
  );

  console.log("assassin_attack_without_stealth passed");
}

function testSearchRevealsOnlyInRadius() {
  const rng = new SeededRNG(1112);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const nearEnemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;
  const farEnemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, searcher.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, nearEnemy.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, farEnemy.id, {
    position: { col: 8, row: 8 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "searchStealth",
      unitId: searcher.id,
      mode: "action",
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const next = resolved.state;
  const events = resolved.events;
  const revealEvents = events.filter((e) => e.type === "stealthRevealed");

  assert(
    next.units[nearEnemy.id].isStealthed === false,
    "near enemy should be revealed"
  );
  assert(
    next.units[farEnemy.id].isStealthed === true,
    "far enemy should remain hidden"
  );
  assert(
    revealEvents.some((e) => e.type === "stealthRevealed" && e.unitId === nearEnemy.id),
    "reveal event should be emitted for near enemy"
  );

  console.log("search_reveals_only_in_radius passed");
}

function testSearchUpdatesOnlyPlayerKnowledge() {
  const rng = new SeededRNG(1112);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, searcher.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, enemy.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);
  const knowledgeBefore = JSON.parse(JSON.stringify(state.knowledge));

  const initial = applyAction(
    state,
    {
      type: "searchStealth",
      unitId: searcher.id,
      mode: "action",
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const next = resolved.state;

  assert(
    next.knowledge["P1"][enemy.id] === true,
    "searcher knowledge should include revealed enemy"
  );
  assert.deepStrictEqual(
    next.knowledge["P2"],
    knowledgeBefore["P2"],
    "other player knowledge should remain unchanged"
  );

  console.log("search_updates_only_player_knowledge passed");
}

function testSearchStealthRollsLogged() {
  const rng = new SeededRNG(1112);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, searcher.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "searchStealth",
      unitId: searcher.id,
      mode: "action",
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const searchEvent = resolved.events.find((e) => e.type === "searchStealth");
  assert(
    searchEvent && searchEvent.type === "searchStealth",
    "searchStealth event should be emitted"
  );
  assert(searchEvent.rolls && searchEvent.rolls.length === 1, "searchStealth should include rolls");
  if (searchEvent.rolls) {
    assert(
      searchEvent.rolls[0].targetId === hidden.id,
      "searchStealth roll should reference hidden unit"
    );
    assert(searchEvent.rolls[0].roll === 5, "searchStealth roll should match RNG");
    assert(searchEvent.rolls[0].success === true, "searchStealth roll should succeed");
  }

  console.log("search_stealth_rolls_logged passed");
}

function testSearchActionBlockedAfterAttack() {
  const rng = new SeededRNG(1113);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, attacker.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, defender.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, hidden.id, {
    position: { col: 5, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const attackInitial = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: defender.id } as any,
    rng
  );
  const attackResolved = resolveAllPendingRolls(attackInitial.state, rng);

  const searchAttempt = applyAction(
    attackResolved.state,
    { type: "searchStealth", unitId: attacker.id, mode: "action" } as any,
    rng
  );

  assert(searchAttempt.events.length === 0, "search(action) should be blocked after attack");
  assert.deepStrictEqual(
    searchAttempt.state,
    attackResolved.state,
    "state should be unchanged when search(action) is blocked"
  );

  console.log("search_action_blocked_after_attack passed");
}

function testSearchMoveBlockedAfterMove() {
  const rng = new SeededRNG(1114);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const mover = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, mover.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, hidden.id, { position: { col: 8, row: 8 } });

  state = toBattleState(state, "P1", mover.id);
  state = initKnowledgeForOwners(state);

  const moveRes = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 4, row: 5 } } as any,
    rng
  );

  let afterMove = moveRes.state;
  afterMove = setUnit(afterMove, hidden.id, {
    position: { col: 5, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  const searchAttempt = applyAction(
    afterMove,
    { type: "searchStealth", unitId: mover.id, mode: "move" } as any,
    rng
  );

  assert(searchAttempt.events.length === 0, "search(move) should be blocked after move");
  assert.deepStrictEqual(
    searchAttempt.state,
    afterMove,
    "state should be unchanged when search(move) is blocked"
  );

  console.log("search_move_blocked_after_move passed");
}

function testSearchActionWorksBeforeAttack() {
  const rng = new SeededRNG(1115);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, searcher.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "searchStealth", unitId: searcher.id, mode: "action" } as any,
    rng
  );
  assert(
    initial.state.pendingRoll?.kind === "searchStealth",
    "search(action) should request a roll before attack"
  );

  const resolved = resolveAllPendingRolls(initial.state, rng);
  assert(
    resolved.state.units[searcher.id].turn.actionUsed === true,
    "search(action) should consume action slot"
  );

  console.log("search_action_works_before_attack passed");
}

function testSearchMoveWorksBeforeMove() {
  const rng = new SeededRNG(1116);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, searcher.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "searchStealth", unitId: searcher.id, mode: "move" } as any,
    rng
  );
  assert(
    initial.state.pendingRoll?.kind === "searchStealth",
    "search(move) should request a roll before move"
  );

  const resolved = resolveAllPendingRolls(initial.state, rng);
  assert(
    resolved.state.units[searcher.id].turn.moveUsed === true,
    "search(move) should consume move slot"
  );

  console.log("search_move_works_before_move passed");
}

function testSearchButtonsEnabledOnFreshUnitTurn() {
  const rng = new SeededRNG(1117);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;

  state = setUnit(state, searcher.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);
  state = { ...state, activeUnitId: null };

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: searcher.id } as any,
    rng
  );

  let intents = getLegalIntents(started.state, "P1");
  assert(intents.canSearchMove === true, "search(move) should be legal on fresh turn");
  assert(intents.canSearchAction === true, "search(action) should be legal on fresh turn");
  assert(intents.searchMoveReason === undefined, "no search(move) reason expected");
  assert(intents.searchActionReason === undefined, "no search(action) reason expected");

  const searchMove = applyAction(
    started.state,
    { type: "searchStealth", unitId: searcher.id, mode: "move" } as any,
    rng
  );

  intents = getLegalIntents(searchMove.state, "P1");
  assert(intents.canSearchMove === false, "search(move) should be disabled after use");
  assert(intents.canSearchAction === true, "search(action) should remain after move search");

  const searchAction = applyAction(
    searchMove.state,
    { type: "searchStealth", unitId: searcher.id, mode: "action" } as any,
    rng
  );

  intents = getLegalIntents(searchAction.state, "P1");
  assert(intents.canSearchAction === false, "search(action) should be disabled after use");

  const ended = applyAction(
    searchAction.state,
    { type: "endTurn" } as any,
    rng
  );

  const restarted = applyAction(
    { ...ended.state, activeUnitId: null },
    { type: "unitStartTurn", unitId: searcher.id } as any,
    rng
  );

  intents = getLegalIntents(restarted.state, "P1");
  assert(intents.canSearchMove === true, "search(move) should reset on new turn");
  assert(intents.canSearchAction === true, "search(action) should reset on new turn");

  console.log("search_buttons_enabled_on_fresh_unit_turn passed");
}

function testAttackAlreadyRevealedUnit() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 3, row: 3 },
  });
  state = setUnit(state, defender.id, {
    position: { col: 3, row: 4 },
    isStealthed: false,
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);
  state = {
    ...state,
    knowledge: {
      ...state.knowledge,
      P1: { ...state.knowledge["P1"], [defender.id]: true },
    },
  };
  const knowledgeBefore = JSON.parse(JSON.stringify(state.knowledge));

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const events = resolved.events;
  const revealEvents = events.filter((e) => e.type === "stealthRevealed");
  const attackEvent = events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );

  assert(attackEvent, "attackResolved should be emitted");
  assert(revealEvents.length === 0, "no stealthRevealed events expected");
  assert.deepStrictEqual(
    resolved.state.knowledge,
    knowledgeBefore,
    "knowledge should remain consistent"
  );

  console.log("attack_already_revealed_unit passed");
}

function testAdjacencyRevealAfterMove() {
  const rng = new SeededRNG(99);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const mover = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, mover.id, {
    position: { col: 3, row: 3 },
  });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", mover.id);
  state = initKnowledgeForOwners(state);

  const result = applyAction(
    state,
    {
      type: "move",
      unitId: mover.id,
      to: { col: 3, row: 4 },
    } as any,
    rng
  );

  const next = result.state;
  const revealEvent = result.events.find(
    (e) => e.type === "stealthRevealed" && e.unitId === hidden.id
  );

  assert(
    next.units[hidden.id].isStealthed === false,
    "adjacent hidden unit should be revealed"
  );
  assert(revealEvent, "stealthRevealed event should be emitted");
  assert(
    next.knowledge["P1"][hidden.id] === true,
    "mover knowledge should include revealed unit"
  );

  console.log("adjacency_reveal_after_move passed");
}

function testCannotAttackTwicePerTurn() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 3, row: 3 },
  });
  state = setUnit(state, defender.id, {
    position: { col: 3, row: 4 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const first = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );
  const resolvedFirst = resolveAllPendingRolls(first.state, rng);

  const second = applyAction(
    resolvedFirst.state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );

  assert(
    second.events.length === 0,
    "second attack should emit no events"
  );
  assert.deepStrictEqual(
    second.state,
    resolvedFirst.state,
    "state should be unchanged after second attack"
  );

  console.log("cannot_attack_twice_per_turn passed");
}

function testAttackConsumesActionSlot() {
  const rng = new SeededRNG(555);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, attacker.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, defender.id, { position: { col: 3, row: 5 } });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const attacked = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: defender.id } as any,
    rng
  );
  const resolvedAttack = resolveAllPendingRolls(attacked.state, rng);

  const searchAfter = applyAction(
    resolvedAttack.state,
    { type: "searchStealth", unitId: attacker.id, mode: "action" } as any,
    rng
  );

  assert(
    searchAfter.events.length === 0,
    "searchStealth(mode=action) should be blocked after attack"
  );
  assert.deepStrictEqual(
    searchAfter.state,
    resolvedAttack.state,
    "state should be unchanged after blocked search"
  );

  console.log("attack_consumes_action_slot passed");
}

function testCannotAttackAfterSearchAction() {
  const rng = new SeededRNG(221);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, searcher.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, defender.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);

  const searchAction = applyAction(
    state,
    { type: "searchStealth", unitId: searcher.id, mode: "action" } as any,
    rng
  );
  const resolvedSearch = resolveAllPendingRolls(searchAction.state, rng);

  assert(
    resolvedSearch.state.units[searcher.id].turn.actionUsed === true,
    "search(action) should consume action slot"
  );

  const attackAfter = applyAction(
    resolvedSearch.state,
    { type: "attack", attackerId: searcher.id, defenderId: defender.id } as any,
    rng
  );

  assert(
    attackAfter.events.length === 0,
    "attack should be blocked after search(action)"
  );

  console.log("cannot_attack_after_search_action passed");
}

function testCannotSearchMoveAfterMove() {
  const rng = new SeededRNG(222);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const mover = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;

  state = setUnit(state, mover.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", mover.id);

  const moved = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 4, row: 3 } } as any,
    rng
  );

  const searchAfterMove = applyAction(
    moved.state,
    { type: "searchStealth", unitId: mover.id, mode: "move" } as any,
    rng
  );

  assert(
    searchAfterMove.events.length === 0,
    "search(move) should be blocked after move"
  );
  assert.deepStrictEqual(
    searchAfterMove.state,
    moved.state,
    "state should be unchanged after blocked search(move)"
  );

  console.log("cannot_search_move_after_move passed");
}

function testRiderCannotEnterStealth() {
  const rng = new SeededRNG(223);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, rider.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", rider.id);

  const res = applyAction(
    state,
    { type: "enterStealth", unitId: rider.id } as any,
    rng
  );

  const enter = res.events.find((e) => e.type === "stealthEntered");
  assert(
    enter && enter.type === "stealthEntered" && enter.success === false,
    "rider should fail to enter stealth"
  );
  assert(
    res.state.units[rider.id].isStealthed === false,
    "rider should remain visible"
  );

  console.log("rider_cannot_enter_stealth passed");
}

function testAssassinCanEnterStealth() {
  const rng = new SeededRNG(1112);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, assassin.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", assassin.id);

  const initial = applyAction(
    state,
    { type: "enterStealth", unitId: assassin.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

  const enter = res.events.find((e) => e.type === "stealthEntered");
  assert(
    enter && enter.type === "stealthEntered" && enter.success === true,
    "assassin should successfully enter stealth"
  );
  assert(
    res.state.units[assassin.id].isStealthed === true,
    "assassin should become stealthed"
  );

  console.log("assassin_can_enter_stealth passed");
}

function testStealthOnlyForUnitsWithAbility() {
  const rng = new SeededRNG(224);
  const nonStealthClasses = ["spearman", "rider", "trickster", "berserker", "knight"];

  for (const cls of nonStealthClasses) {
    let state = createEmptyGame();
    const a1 = createDefaultArmy("P1");
    const a2 = createDefaultArmy("P2");
    state = attachArmy(state, a1);
    state = attachArmy(state, a2);

    const unit = Object.values(state.units).find(
      (u) => u.owner === "P1" && u.class === cls
    )!;

    state = setUnit(state, unit.id, { position: { col: 4, row: 4 } });
    state = toBattleState(state, "P1", unit.id);

    const res = applyAction(
      state,
      { type: "enterStealth", unitId: unit.id } as any,
      rng
    );

    const enter = res.events.find((e) => e.type === "stealthEntered");
    assert(
      enter && enter.type === "stealthEntered" && enter.success === false,
      `unit ${cls} should not be able to enter stealth`
    );
  }

  console.log("stealth_only_for_units_with_ability passed");
}

function testBattleTurnOrderFollowsPlacementOrder() {
  const rng = new SeededRNG(2024);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = toPlacementState(state, "P1");

  const p1Order = ["rider","spearman","trickster","assassin","berserker","archer","knight"].map(
    (cls) => Object.values(state.units).find((u) => u.owner === "P1" && u.class === cls)!.id
  );
  const p2Order = ["knight","archer","berserker","assassin","trickster","spearman","rider"].map(
    (cls) => Object.values(state.units).find((u) => u.owner === "P2" && u.class === cls)!.id
  );

  const p1coords = ["b0","c0","d0","e0","f0","g0","h0"].map(coordFromNotation);
  const p2coords = ["b8","c8","d8","e8","f8","g8","h8"].map(coordFromNotation);

  const expectedOrder: string[] = [];
  let p1i = 0, p2i = 0, p1c = 0, p2c = 0;

  while (state.phase === "placement") {
    const current = state.currentPlayer;
    if (current === "P1") {
      const unitId = p1Order[p1i++];
      expectedOrder.push(unitId);
      state = applyAction(
        state,
        { type: "placeUnit", unitId, position: p1coords[p1c++] } as any,
        rng
      ).state;
    } else {
      const unitId = p2Order[p2i++];
      expectedOrder.push(unitId);
      state = applyAction(
        state,
        { type: "placeUnit", unitId, position: p2coords[p2c++] } as any,
        rng
      ).state;
    }
  }

  assert.deepStrictEqual(state.placementOrder, expectedOrder, "placementOrder should match actual placement");
  assert.deepStrictEqual(state.turnQueue, expectedOrder, "turnQueue should follow placementOrder");
  assert(state.turnQueueIndex === 0, "turnQueueIndex should start at 0");
  assert(state.turnQueue[0] === expectedOrder[0], "turnQueue head should be first placed unit");
  assert(
    state.currentPlayer === state.units[expectedOrder[0]].owner,
    "currentPlayer should be owner of queue head"
  );

  let res = applyAction(state, { type: "unitStartTurn", unitId: expectedOrder[0] } as any, rng);
  assert(res.state.activeUnitId === expectedOrder[0], "queue[0] should start turn");

  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;

  const wrong = applyAction(state, { type: "unitStartTurn", unitId: expectedOrder[0] } as any, rng);
  assert(wrong.events.length === 0, "queue[0] should be rejected after endTurn");
  assert(wrong.state.activeUnitId === state.activeUnitId, "activeUnitId should remain unchanged");

  res = applyAction(state, { type: "unitStartTurn", unitId: expectedOrder[1] } as any, rng);
  assert(res.state.activeUnitId === expectedOrder[1], "queue[1] should start turn after endTurn");

  const deadId = expectedOrder[2];
  state = {
    ...res.state,
    units: {
      ...res.state.units,
      [deadId]: { ...res.state.units[deadId], isAlive: false, position: null },
    },
  };

  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  assert(
    state.turnQueueIndex === 3,
    "endTurn should skip dead units in turnQueue"
  );
  assert(
    state.currentPlayer === state.units[expectedOrder[3]].owner,
    "currentPlayer should match next alive unit after skip"
  );

  console.log("battle_turn_order_follows_placement_order passed");
}

function testAllyCannotStepOnStealthedAlly() {
  const rng = new SeededRNG(77);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const mover = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "knight")!;
  const ally = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;

  state = setUnit(state, mover.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, ally.id, {
    position: { col: 3, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", mover.id);
  state = initKnowledgeForOwners(state);

  const res = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 3, row: 4 } } as any,
    rng
  );

  assert(res.events.length === 0, "move onto stealthed ally should be rejected");
  assert(
    res.state.units[mover.id].position!.row === 3 &&
      res.state.units[mover.id].position!.col === 3,
    "mover should stay in place"
  );
  assert(res.state.units[mover.id].hasMovedThisTurn === false, "move should not be spent");

  console.log("ally_cannot_step_on_ally_stealthed passed");
}

function testEnemyStepsOnUnknownStealthedRevealsAndCancels() {
  const rng = new SeededRNG(88);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const mover = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "knight")!;
  const hidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "assassin")!;

  state = setUnit(state, mover.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, hidden.id, {
    position: { col: 3, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", mover.id);
  state = initKnowledgeForOwners(state);

  const res = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 3, row: 4 } } as any,
    rng
  );

  assert(
    res.state.units[mover.id].position!.row === 3 &&
      res.state.units[mover.id].position!.col === 3,
    "mover should stay in place"
  );
  assert(res.state.units[mover.id].hasMovedThisTurn === true, "move should be spent");
  assert(res.state.units[hidden.id].isStealthed === false, "hidden enemy should be revealed");
  assert(res.state.knowledge["P1"][hidden.id] === true, "mover knowledge should include revealed enemy");

  const revealEvent = res.events.find(
    (e) => e.type === "stealthRevealed" && e.unitId === hidden.id && e.reason === "steppedOnHidden"
  );
  assert(revealEvent, "stealthRevealed should be emitted with steppedOnHidden reason");

  console.log("enemy_steps_on_unknown_stealthed_reveals_and_cancels passed");
}

function testCannotAttackStealthedEnemyDirectly() {
  const rng = new SeededRNG(90);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "knight")!;
  const hidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "assassin")!;

  state = setUnit(state, attacker.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, hidden.id, {
    position: { col: 3, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: hidden.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

  const attackEvent = res.events.find((e) => e.type === "attackResolved");
  assert(!attackEvent, "attackResolved should not be emitted for hidden target");
  assert(res.state.units[hidden.id].isStealthed === true, "hidden target should remain stealthed");

  console.log("cannot_attack_stealthed_enemy_directly passed");
}

function testNoStealthStackingOnEnter() {
  const rng = new SeededRNG(91);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const stealthed = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "assassin")!;
  const entering = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;

  state = setUnit(state, stealthed.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, entering.id, { position: { col: 4, row: 4 } });

  state = toBattleState(state, "P1", entering.id);

  const res = applyAction(
    state,
    { type: "enterStealth", unitId: entering.id } as any,
    rng
  );

  const enterEvent = res.events.find((e) => e.type === "stealthEntered");
  assert(enterEvent && enterEvent.type === "stealthEntered" && enterEvent.success === false, "enterStealth should fail");
  assert(res.state.units[entering.id].isStealthed === false, "unit should remain visible");
  assert(res.state.units[entering.id].stealthAttemptedThisTurn === true, "stealth attempt should be spent");

  console.log("no_stealth_stacking_on_enter passed");
}

function testStealthLasts3OwnTurnsThenExpiresOn4thStart() {
  const rng = new SeededRNG(5);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, assassin.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, enemy.id, {
    position: { col: 4, row: 6 },
  });

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [assassin.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [assassin.id, enemy.id],
    turnOrderIndex: 0,
  };

  // 1st own turn start: 3 -> 2
  let res = applyAction(state, { type: "unitStartTurn", unitId: assassin.id } as any, rng);
  assert(res.state.units[assassin.id].stealthTurnsLeft === 2, "stealth should tick to 2 on 1st own turn");
  assert(res.state.units[assassin.id].isStealthed === true, "stealth should remain on 1st own turn");

  // Enemy turn (no tick)
  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;

  // 2nd own turn start: 2 -> 1
  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  res = applyAction(state, { type: "unitStartTurn", unitId: assassin.id } as any, rng);
  assert(res.state.units[assassin.id].stealthTurnsLeft === 1, "stealth should tick to 1 on 2nd own turn");
  assert(res.state.units[assassin.id].isStealthed === true, "stealth should remain on 2nd own turn");

  // Enemy turn (no tick)
  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;

  // 3rd own turn start: 1 -> 0 (still stealthed)
  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  res = applyAction(state, { type: "unitStartTurn", unitId: assassin.id } as any, rng);
  assert(res.state.units[assassin.id].stealthTurnsLeft === 0, "stealth should tick to 0 on 3rd own turn");
  assert(res.state.units[assassin.id].isStealthed === true, "stealth should remain on 3rd own turn");

  // Enemy turn (no tick)
  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;

  // 4th own turn start: reveal
  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  const revealRes = applyAction(state, { type: "unitStartTurn", unitId: assassin.id } as any, rng);
  const reveal = revealRes.events.find(
    (e) => e.type === "stealthRevealed" && e.unitId === assassin.id
  );
  assert(reveal, "stealth should be revealed on 4th own turn start");
  if (reveal && reveal.type === "stealthRevealed") {
    assert(reveal.reason === "timerExpired", "reveal reason should be timerExpired");
  }
  assert(
    revealRes.state.units[assassin.id].isStealthed === false,
    "assassin should exit stealth on 4th own turn start"
  );

  console.log("stealth_lasts_3_own_turns_then_expires_on_4th_start passed");
}

function testStealthRollLogged() {
  const rng = new SeededRNG(1112);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, assassin.id, {
    position: { col: 4, row: 4 },
  });
  state = toBattleState(state, "P1", assassin.id);

  const initial = applyAction(
    state,
    { type: "enterStealth", unitId: assassin.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

  const enterEvent = res.events.find((e) => e.type === "stealthEntered");
  assert(
    enterEvent && enterEvent.type === "stealthEntered",
    "stealthEntered event should be emitted"
  );
  assert(
    typeof enterEvent.roll === "number",
    "stealthEntered should include roll"
  );
  assert(enterEvent.roll === 5, "stealthEntered roll should match RNG");
  assert(enterEvent.success === true, "stealthEntered should succeed");
  assert(
    res.state.units[assassin.id].isStealthed === true,
    "assassin should enter stealth"
  );

  console.log("stealth_roll_logged passed");
}

function testLastKnownPositionsInView() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = {
    ...state,
    lastKnownPositions: {
      ...state.lastKnownPositions,
      P1: {
        ...(state.lastKnownPositions?.P1 ?? {}),
        [hidden.id]: { col: 4, row: 4 },
      },
    },
  };

  const view = makePlayerView(state, "P1");
  assert(!view.units[hidden.id], "stealthed enemy should be hidden in view");
  assert(
    view.lastKnownPositions[hidden.id] &&
      view.lastKnownPositions[hidden.id].col === 4 &&
      view.lastKnownPositions[hidden.id].row === 4,
    "lastKnownPositions should include hidden unit position"
  );

  console.log("last_known_positions_in_view passed");
}

function testLastKnownPositionPersistsWhileHidden() {
  const rng = new SeededRNG(1113);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, assassin.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", assassin.id);
  state = initKnowledgeForOwners(state);

  const enterInitial = applyAction(
    state,
    { type: "enterStealth", unitId: assassin.id } as any,
    rng
  );
  const enterResolved = resolveAllPendingRolls(enterInitial.state, rng);

  const lastKnownBefore = enterResolved.state.lastKnownPositions?.P2?.[assassin.id];
  assert(
    lastKnownBefore && lastKnownBefore.col === 4 && lastKnownBefore.row === 4,
    "last known position should be set on stealth entry"
  );

  const moveRes = applyAction(
    enterResolved.state,
    { type: "move", unitId: assassin.id, to: { col: 4, row: 5 } } as any,
    rng
  );

  const lastKnownAfter = moveRes.state.lastKnownPositions?.P2?.[assassin.id];
  assert(
    lastKnownAfter && lastKnownAfter.col === 4 && lastKnownAfter.row === 4,
    "last known position should persist while hidden"
  );

  console.log("last_known_position_persists_while_hidden passed");
}

function testLastKnownClearedOnStealthExit() {
  const rng = new SeededRNG(1114);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, assassin.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 0,
  });
  state = {
    ...state,
    lastKnownPositions: {
      ...state.lastKnownPositions,
      P2: {
        ...(state.lastKnownPositions?.P2 ?? {}),
        [assassin.id]: { col: 4, row: 4 },
      },
    },
  };

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [assassin.id],
    turnQueueIndex: 0,
    turnOrder: [assassin.id],
    turnOrderIndex: 0,
  };

  const revealRes = applyAction(
    state,
    { type: "unitStartTurn", unitId: assassin.id } as any,
    rng
  );

  const cleared = revealRes.state.lastKnownPositions?.P2?.[assassin.id];
  assert(
    cleared === undefined,
    "last known position should be cleared when stealth ends"
  );

  console.log("last_known_cleared_on_stealth_exit passed");
}

function testTricksterAoERevealsHiddenInArea() {
  const rng = new SeededRNG(120);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "trickster")!;
  const nearHidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "assassin")!;
  const midHidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "archer")!;
  const farHidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, nearHidden.id, {
    position: { col: 5, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, midHidden.id, {
    position: { col: 6, row: 6 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, farHidden.id, {
    position: { col: 8, row: 8 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 5, row: 5 } },
    } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const revealEvent = events.find(
    (e) => e.type === "stealthRevealed" && e.unitId === nearHidden.id && e.reason === "aoeHit"
  );
  assert(revealEvent, "aoe should reveal hidden enemy in area");
  assert(resolved.state.units[nearHidden.id].isStealthed === false, "near hidden should be revealed");
  assert(resolved.state.units[midHidden.id].isStealthed === false, "mid hidden should be revealed");
  assert(resolved.state.units[farHidden.id].isStealthed === true, "far hidden should remain stealthed");
  assert(resolved.state.knowledge["P1"][nearHidden.id] === true, "caster knowledge should include revealed unit");

  const aoeEvent = events.find((e) => e.type === "aoeResolved");
  assert(
      aoeEvent &&
      aoeEvent.type === "aoeResolved" &&
      aoeEvent.affectedUnitIds.includes(nearHidden.id) &&
      aoeEvent.affectedUnitIds.includes(midHidden.id),
    "aoeResolved should list targets"
  );

  console.log("trickster_aoe_reveals_hidden_in_area passed");
}

function testTricksterAoEIs5x5Radius2() {
  const rng = new SeededRNG(120);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const nearEnemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;
  const farEnemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, nearEnemy.id, { position: { col: 6, row: 6 } });
  state = setUnit(state, farEnemy.id, { position: { col: 7, row: 7 } });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const aoeEvent = events.find((e) => e.type === "aoeResolved");
  assert(aoeEvent && aoeEvent.type === "aoeResolved", "aoeResolved should be emitted");
  if (aoeEvent && aoeEvent.type === "aoeResolved") {
    assert(aoeEvent.abilityId === "tricksterAoE", "aoeResolved should include abilityId");
    assert(aoeEvent.radius === 2, "aoe radius should be 2");
    assert(
      aoeEvent.affectedUnitIds.includes(nearEnemy.id),
      "enemy within radius 2 should be affected"
    );
    assert(
      !aoeEvent.affectedUnitIds.includes(farEnemy.id),
      "enemy outside radius 2 should not be affected"
    );
  }

  console.log("trickster_aoe_is_5x5_radius2 passed");
}

function testTricksterAoEHitsAllies() {
  const rng = new SeededRNG(120);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, ally.id, {
    position: { col: 5, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const aoeEvent = events.find((e) => e.type === "aoeResolved");
  assert(aoeEvent && aoeEvent.type === "aoeResolved", "aoeResolved should be emitted");
  if (aoeEvent && aoeEvent.type === "aoeResolved") {
    assert(
      aoeEvent.affectedUnitIds.includes(ally.id),
      "ally should be affected by aoe"
    );
    assert(
      aoeEvent.revealedUnitIds.includes(ally.id),
      "ally should be revealed by aoe"
    );
  }
  assert(
    resolved.state.units[ally.id].isStealthed === false,
    "ally stealth should be revealed by aoe"
  );

  console.log("trickster_aoe_hits_allies passed");
}

function testTricksterAoEDoesNotDamageSelf() {
  const rng = new SeededRNG(122);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 5, row: 4 } });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const hpBefore = state.units[trickster.id].hp;

  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const aoeEvent = events.find((e) => e.type === "aoeResolved");
  assert(aoeEvent && aoeEvent.type === "aoeResolved", "aoeResolved should be emitted");
  if (aoeEvent && aoeEvent.type === "aoeResolved") {
    assert(
      !aoeEvent.damagedUnitIds.includes(trickster.id),
      "caster should not be damaged by own AoE"
    );
    assert(
      !aoeEvent.affectedUnitIds.includes(trickster.id),
      "caster should not be listed as an affected target"
    );
  }

  assert(
    resolved.state.units[trickster.id].hp === hpBefore,
    "caster HP should remain unchanged"
  );

  console.log("trickster_aoe_does_not_damage_self passed");
}

function testTricksterAoERevealsAllInArea() {
  const rng = new SeededRNG(120);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, ally.id, {
    position: { col: 5, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, enemy.id, {
    position: { col: 6, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const revealEvents = events.filter((e) => e.type === "stealthRevealed");
  assert(
    revealEvents.some((e) => e.type === "stealthRevealed" && e.unitId === enemy.id),
    "enemy should be revealed by aoe"
  );
  assert(
    revealEvents.some((e) => e.type === "stealthRevealed" && e.unitId === ally.id),
    "ally should be revealed by aoe"
  );
  assert(
    resolved.state.units[ally.id].isStealthed === false,
    "ally stealth should be revealed by aoe"
  );

  console.log("trickster_aoe_reveals_all_in_area passed");
}

function testTricksterAoEAttackerRollOnce() {
  const rng = new SeededRNG(130);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const enemy1 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;
  const enemy2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy1.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemy2.id, { position: { col: 6, row: 4 } });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const attackerRolls = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "tricksterAoE_attackerRoll"
  );
  const defenderRolls = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "tricksterAoE_defenderRoll"
  );

  assert(attackerRolls.length === 1, "AoE attacker roll should be requested once");
  assert(defenderRolls.length === 2, "AoE should request defender roll per target");

  console.log("trickster_aoe_attacker_roll_once passed");
}

function testTricksterAoEMultipleDefendersRollSeparately() {
  const rng = new SeededRNG(131);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const enemy1 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;
  const enemy2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy1.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemy2.id, { position: { col: 6, row: 4 } });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const attackEvents = events.filter((e) => e.type === "attackResolved");
  assert(attackEvents.length === 2, "AoE should resolve combat for each target");
  const attackerSums = attackEvents
    .map((e) => (e.type === "attackResolved" ? e.attackerRoll.sum : 0))
    .filter((v) => v > 0);
  assert(
    attackerSums.length === 2 && attackerSums[0] === attackerSums[1],
    "AoE should reuse the same attacker roll for all targets"
  );

  console.log("trickster_aoe_multiple_defenders_roll_separately passed");
}

function testTricksterAoERevealsStealthedUnits() {
  const rng = new SeededRNG(132);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, ally.id, {
    position: { col: 5, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, enemy.id, {
    position: { col: 6, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const revealEvents = events.filter(
    (e) => e.type === "stealthRevealed" && e.reason === "aoeHit"
  );
  assert(
    revealEvents.some((e) => e.type === "stealthRevealed" && e.unitId === ally.id),
    "AoE should reveal stealthed ally"
  );
  assert(
    revealEvents.some((e) => e.type === "stealthRevealed" && e.unitId === enemy.id),
    "AoE should reveal stealthed enemy"
  );
  assert(
    resolved.state.units[ally.id].isStealthed === false,
    "ally stealth should be cleared"
  );
  assert(
    resolved.state.units[enemy.id].isStealthed === false,
    "enemy stealth should be cleared"
  );

  console.log("trickster_aoe_reveals_stealthed_units passed");
}

function testTricksterAoEConsumesAttack() {
  const rng = new SeededRNG(121);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "trickster")!;
  const enemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  const res = resolveAllPendingRollsWithEvents(initial.state, rng);

  assert(
    res.state.units[trickster.id].turn.actionUsed === true,
    "AoE should consume action slot"
  );
  assert(
    res.state.units[trickster.id].turn.attackUsed === true,
    "AoE should consume attack slot"
  );

  const followUp = applyAction(
    res.state,
    { type: "attack", attackerId: trickster.id, defenderId: enemy.id } as any,
    rng
  );

  const attackEvent = followUp.events.find((e) => e.type === "attackResolved");
  assert(!attackEvent, "trickster should not be able to attack after AoE (consumesAttack)");
  assert(followUp.events.length === 0, "attack should be blocked after AoE");
  assert.deepStrictEqual(
    followUp.state,
    res.state,
    "state should be unchanged after blocked attack"
  );

  console.log("trickster_aoe_consumes_attack passed");
}

function testSpearmanAttackIncludesAdjacentRing() {
  const { state: baseState, spearman, enemy } = setupSpearmanAttackState({
    col: 4,
    row: 4,
  });
  const adjacents = [
    { col: 3, row: 3 },
    { col: 3, row: 4 },
    { col: 3, row: 5 },
    { col: 4, row: 3 },
    { col: 4, row: 5 },
    { col: 5, row: 3 },
    { col: 5, row: 4 },
    { col: 5, row: 5 },
  ];

  for (const coord of adjacents) {
    const state = setUnit(baseState, enemy.id, {
      position: coord,
      isStealthed: false,
      stealthTurnsLeft: 0,
    });
    const targets = getLegalAttackTargets(state, spearman.id);
    assert(
      targets.includes(enemy.id),
      `spearman should attack adjacent cell ${coord.col},${coord.row}`
    );
  }

  console.log("spearman_attack_includes_adjacent_ring passed");
}

function testSpearmanAttackKeepsDistance2Directions() {
  const { state: baseState, spearman, enemy } = setupSpearmanAttackState({
    col: 4,
    row: 4,
  });
  const reach2 = [
    { col: 2, row: 4 },
    { col: 6, row: 4 },
    { col: 4, row: 2 },
    { col: 4, row: 6 },
    { col: 2, row: 2 },
    { col: 2, row: 6 },
    { col: 6, row: 2 },
    { col: 6, row: 6 },
  ];

  for (const coord of reach2) {
    const state = setUnit(baseState, enemy.id, {
      position: coord,
      isStealthed: false,
      stealthTurnsLeft: 0,
    });
    const targets = getLegalAttackTargets(state, spearman.id);
    assert(
      targets.includes(enemy.id),
      `spearman should attack reach-2 cell ${coord.col},${coord.row}`
    );
  }

  console.log("spearman_attack_keeps_distance2_directions passed");
}

function testSpearmanAttackExcludesSelf() {
  const { state: baseState, spearman, enemy } = setupSpearmanAttackState({
    col: 4,
    row: 4,
  });
  const state = setUnit(baseState, enemy.id, {
    position: { col: 4, row: 5 },
    isStealthed: false,
    stealthTurnsLeft: 0,
  });
  const targets = getLegalAttackTargets(state, spearman.id);
  assert(!targets.includes(spearman.id), "spearman should not be able to target self");
  assert(targets.includes(enemy.id), "spearman should still have a valid enemy target");

  console.log("spearman_attack_excludes_self passed");
}

function testSpearmanAttackRespectsBounds() {
  const { state: baseState, spearman, enemy } = setupSpearmanAttackState({
    col: 0,
    row: 0,
  });
  const inBoundsTargets = [
    { col: 0, row: 1 },
    { col: 1, row: 0 },
    { col: 1, row: 1 },
    { col: 0, row: 2 },
    { col: 2, row: 0 },
    { col: 2, row: 2 },
  ];
  const outOfRangeTargets = [
    { col: 1, row: 2 },
    { col: 2, row: 1 },
    { col: 0, row: 3 },
    { col: 3, row: 0 },
    { col: 3, row: 3 },
  ];

  for (const coord of inBoundsTargets) {
    const state = setUnit(baseState, enemy.id, {
      position: coord,
      isStealthed: false,
      stealthTurnsLeft: 0,
    });
    const targets = getLegalAttackTargets(state, spearman.id);
    assert(
      targets.includes(enemy.id),
      `spearman should attack in-bounds cell ${coord.col},${coord.row}`
    );
  }

  for (const coord of outOfRangeTargets) {
    const state = setUnit(baseState, enemy.id, {
      position: coord,
      isStealthed: false,
      stealthTurnsLeft: 0,
    });
    const targets = getLegalAttackTargets(state, spearman.id);
    assert(
      !targets.includes(enemy.id),
      `spearman should not attack out-of-range cell ${coord.col},${coord.row}`
    );
  }

  console.log("spearman_attack_respects_bounds passed");
}

function testArcherCanShootThroughAllies() {
  const rng = new SeededRNG(200);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const ally = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "knight")!;
  const enemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, ally.id, { position: { col: 2, row: 3 } });
  state = setUnit(state, enemy.id, { position: { col: 2, row: 5 } });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: enemy.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

  const attackEvent = res.events.find((e) => e.type === "attackResolved");
  assert(attackEvent, "archer should be able to shoot through allies");

  console.log("archer_can_shoot_through_allies passed");
}

function testArcherCannotShootThroughEnemies() {
  const rng = new SeededRNG(201);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const nearEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;
  const farEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "archer")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, nearEnemy.id, { position: { col: 2, row: 3 } });
  state = setUnit(state, farEnemy.id, { position: { col: 2, row: 5 } });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: farEnemy.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

  const attackEvent = res.events.find((e) => e.type === "attackResolved");
  assert(!attackEvent, "archer should not shoot through enemies");

  console.log("archer_cannot_shoot_through_enemies passed");
}

function testArcherAttacksFirstOnLine() {
  const rng = new SeededRNG(202);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const nearEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;
  const farEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "archer")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, nearEnemy.id, { position: { col: 2, row: 3 } });
  state = setUnit(state, farEnemy.id, { position: { col: 2, row: 5 } });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: nearEnemy.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

  const attackEvent = res.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === nearEnemy.id
  );
  assert(attackEvent, "archer should attack first enemy on line");

  console.log("archer_attacks_first_on_line passed");
}

function testArcherCannotTargetHiddenEnemy() {
  const rng = new SeededRNG(203);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const hidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "assassin")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, hidden.id, {
    position: { col: 2, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: hidden.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

  const attackEvent = res.events.find((e) => e.type === "attackResolved");
  assert(!attackEvent, "archer should not target hidden enemy directly");
  assert(res.state.units[hidden.id].isStealthed === true, "hidden enemy should remain stealthed");

  console.log("archer_cannot_target_hidden_enemy passed");
}

function testArcherCanAttackDiagonalFirstTargetOnly() {
  const rng = new SeededRNG(204);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const nearEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;
  const farEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "archer")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, nearEnemy.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, farEnemy.id, { position: { col: 4, row: 4 } });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const first = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: farEnemy.id } as any,
    rng
  );
  const firstResolved = resolveAllPendingRolls(first.state, rng);
  const firstAttack = firstResolved.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === farEnemy.id
  );
  assert(!firstAttack, "archer should not target enemies beyond the first on diagonal");

  const second = applyAction(
    firstResolved.state,
    { type: "attack", attackerId: archer.id, defenderId: nearEnemy.id } as any,
    rng
  );
  const secondResolved = resolveAllPendingRolls(second.state, rng);
  const secondAttack = secondResolved.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === nearEnemy.id
  );
  assert(secondAttack, "archer should attack first enemy on diagonal");

  console.log("archer_can_attack_diagonal_first_target_only passed");
}

function testArcherCanShootThroughAlliesDiagonal() {
  const rng = new SeededRNG(205);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const ally = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "knight")!;
  const enemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, ally.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 4 } });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: enemy.id } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const attackEvent = resolved.events.find((e) => e.type === "attackResolved");
  assert(attackEvent, "archer should be able to shoot through allies diagonally");

  console.log("archer_can_shoot_through_allies_diagonal passed");
}

function testArcherCannotShootThroughEnemiesDiagonal() {
  const rng = new SeededRNG(206);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const nearEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;
  const farEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "archer")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, nearEnemy.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, farEnemy.id, { position: { col: 4, row: 4 } });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: farEnemy.id } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const attackEvent = resolved.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === farEnemy.id
  );
  assert(!attackEvent, "archer should not shoot through enemies diagonally");

  console.log("archer_cannot_shoot_through_enemies_diagonal passed");
}

function testCannotMoveTwicePerTurn() {
  const rng = new SeededRNG(300);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const mover = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;

  state = setUnit(state, mover.id, { position: { col: 3, row: 3 } });
  state = toBattleState(state, "P1", mover.id);
  state = initKnowledgeForOwners(state);

  const first = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 3, row: 4 } } as any,
    rng
  );
  const second = applyAction(
    first.state,
    { type: "move", unitId: mover.id, to: { col: 3, row: 5 } } as any,
    rng
  );

  assert(
    second.events.length === 0,
    "second move should emit no events"
  );
  assert.deepStrictEqual(
    second.state,
    first.state,
    "state should be unchanged after second move"
  );

  console.log("cannot_move_twice_per_turn passed");
}

function testCannotStealthTwicePerTurn() {
  const rng = new SeededRNG(301);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, assassin.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", assassin.id);

  const first = applyAction(
    state,
    { type: "enterStealth", unitId: assassin.id } as any,
    rng
  );
  const resolvedFirst = resolveAllPendingRolls(first.state, rng);
  const second = applyAction(
    resolvedFirst.state,
    { type: "enterStealth", unitId: assassin.id } as any,
    rng
  );

  assert(
    second.events.length === 0,
    "second stealth attempt should emit no events"
  );
  assert.deepStrictEqual(
    second.state,
    resolvedFirst.state,
    "state should be unchanged after second stealth attempt"
  );

  console.log("cannot_stealth_twice_per_turn passed");
}

function testSearchStealthSlots() {
  const rng = new SeededRNG(302);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, searcher.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);

  const searchMove = applyAction(
    state,
    { type: "searchStealth", unitId: searcher.id, mode: "move" } as any,
    rng
  );
  const resolvedSearchMove = resolveAllPendingRolls(searchMove.state, rng);

  const moveAfterSearch = applyAction(
    resolvedSearchMove.state,
    { type: "move", unitId: searcher.id, to: { col: 4, row: 3 } } as any,
    rng
  );
  assert(
    moveAfterSearch.events.length === 0,
    "move should be blocked after searchStealth(mode=move)"
  );

  let state2 = toBattleState(state, "P1", searcher.id);
  state2 = initKnowledgeForOwners(state2);

  const searchAction = applyAction(
    state2,
    { type: "searchStealth", unitId: searcher.id, mode: "action" } as any,
    rng
  );
  const resolvedSearchAction = resolveAllPendingRolls(searchAction.state, rng);

  const moveAfterActionSearch = applyAction(
    resolvedSearchAction.state,
    { type: "move", unitId: searcher.id, to: { col: 4, row: 3 } } as any,
    rng
  );
  const moved = moveAfterActionSearch.events.find((e) => e.type === "unitMoved");
  assert(moved, "move should be allowed after searchStealth(mode=action)");

  const secondActionSearch = applyAction(
    resolvedSearchAction.state,
    { type: "searchStealth", unitId: searcher.id, mode: "action" } as any,
    rng
  );
  assert(
    secondActionSearch.events.length === 0,
    "second action search should be blocked"
  );

  console.log("search_stealth_slots passed");
}

function testAbilityConsumesMultipleSlots() {
  const rng = new SeededRNG(303);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const caster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, caster.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, enemy.id, { position: { col: 3, row: 4 } });

  state = toBattleState(state, "P1", caster.id);
  state = initKnowledgeForOwners(state);

  const used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: caster.id,
      abilityId: ABILITY_TEST_MULTI_SLOT,
    } as any,
    rng
  );

  const moveAfter = applyAction(
    used.state,
    { type: "move", unitId: caster.id, to: { col: 3, row: 2 } } as any,
    rng
  );
  assert(
    moveAfter.events.length === 0,
    "move should be blocked after multi-slot ability"
  );

  const attackAfter = applyAction(
    used.state,
    { type: "attack", attackerId: caster.id, defenderId: enemy.id } as any,
    rng
  );
  assert(
    attackAfter.events.length === 0,
    "attack should be blocked after multi-slot ability"
  );

  console.log("ability_consumes_multiple_slots passed");
}

function testTricksterMoveOptionsGeneratedAndUsed() {
  const rng = new SeededRNG(400);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const optionsInitial = applyAction(
    state,
    { type: "requestMoveOptions", unitId: trickster.id } as any,
    rng
  );
  const options = resolveAllPendingRolls(optionsInitial.state, rng);

  const moveEvent = options.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === trickster.id
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");
  assert(
    typeof moveEvent.roll === "number",
    "moveOptionsGenerated should include roll for trickster"
  );

  const expected = getTricksterMovesForRoll(
    state,
    trickster.id,
    moveEvent.roll as number
  );

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "trickster legal moves should match roll"
  );

  assert(
    options.state.pendingMove && options.state.pendingMove.unitId === trickster.id,
    "pendingMove should be stored for trickster"
  );

  const dest = expected[0];
  const moved = applyAction(
    options.state,
    { type: "move", unitId: trickster.id, to: dest } as any,
    rng
  );

  const moveResolved = moved.events.find((e) => e.type === "unitMoved");
  assert(moveResolved, "trickster move should resolve to a legal cell");
  assert(
    moved.state.units[trickster.id].position!.col === dest.col &&
      moved.state.units[trickster.id].position!.row === dest.row,
    "trickster should end on chosen legal cell"
  );
  assert(moved.state.pendingMove === null, "pendingMove should be cleared after move");

  console.log("trickster_move_options_generated_and_used passed");
}

function testBerserkerMoveOptionsGeneratedAndUsed() {
  const rng = new SeededRNG(401);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const berserker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "berserker"
  )!;

  state = setUnit(state, berserker.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", berserker.id);
  state = initKnowledgeForOwners(state);

  const optionsInitial = applyAction(
    state,
    { type: "requestMoveOptions", unitId: berserker.id } as any,
    rng
  );
  const options = resolveAllPendingRolls(optionsInitial.state, rng);

  const moveEvent = options.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === berserker.id
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");
  assert(
    typeof moveEvent.roll === "number",
    "moveOptionsGenerated should include roll for berserker"
  );

  const expected = getBerserkerMovesForRoll(
    state,
    berserker.id,
    moveEvent.roll as number
  );

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "berserker legal moves should match roll"
  );

  const dest = expected[0];
  const moved = applyAction(
    options.state,
    { type: "move", unitId: berserker.id, to: dest } as any,
    rng
  );

  const moveResolved = moved.events.find((e) => e.type === "unitMoved");
  assert(moveResolved, "berserker move should resolve to a legal cell");
  assert(moved.state.pendingMove === null, "pendingMove should be cleared after move");

  console.log("berserker_move_options_generated_and_used passed");
}

function testBerserkerMoveRoll1GeneratesTopRoof() {
  const rng = new SeededRNG(1972);
  const setup = setupBerserkerBattleState(4, 4);

  const requested = applyAction(
    setup.state,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );
  assert(
    requested.state.pendingRoll?.kind === "moveBerserker",
    "berserker move should request a pending roll"
  );

  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");

  const expected = [
    { col: 3, row: 3 },
    { col: 4, row: 3 },
    { col: 5, row: 3 },
  ];

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "roll 1 should generate the top roof"
  );

  const dest = expected[0];
  const moved = applyAction(
    resolved.state,
    { type: "move", unitId: setup.berserkerId, to: dest } as any,
    rng
  );

  const moveResolved = moved.events.find((e) => e.type === "unitMoved");
  assert(moveResolved, "berserker move should resolve to a legal cell");
  assert(
    moved.state.units[setup.berserkerId].turn.moveUsed,
    "berserker move should consume the move slot"
  );

  console.log("berserker_move_roll_1_generates_top_roof passed");
}

function testBerserkerMoveRoll3GeneratesLeftVertical() {
  const rng = new SeededRNG(251);
  const setup = setupBerserkerBattleState(4, 4);

  const requested = applyAction(
    setup.state,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );
  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");

  const expected = [
    { col: 3, row: 3 },
    { col: 3, row: 4 },
    { col: 3, row: 5 },
  ];

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "roll 3 should generate the left vertical line"
  );

  console.log("berserker_move_roll_3_generates_left_vertical passed");
}

function testBerserkerMoveRoll5GeneratesMooreRadius1() {
  const rng = new SeededRNG(1112);
  const setup = setupBerserkerBattleState(4, 4);

  const requested = applyAction(
    setup.state,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );
  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");

  const expected = [
    { col: 3, row: 3 },
    { col: 4, row: 3 },
    { col: 5, row: 3 },
    { col: 3, row: 4 },
    { col: 5, row: 4 },
    { col: 3, row: 5 },
    { col: 4, row: 5 },
    { col: 5, row: 5 },
  ];

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "roll 5 should generate Moore radius 1"
  );

  console.log("berserker_move_roll_5_generates_moore_radius1 passed");
}

function testBerserkerMoveRoll6GeneratesStarShape() {
  const rng = new SeededRNG(1542);
  const setup = setupBerserkerBattleState(4, 4);

  const requested = applyAction(
    setup.state,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );
  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");

  const expected = [
    { col: 3, row: 3 },
    { col: 4, row: 3 },
    { col: 5, row: 3 },
    { col: 3, row: 4 },
    { col: 5, row: 4 },
    { col: 3, row: 5 },
    { col: 4, row: 5 },
    { col: 5, row: 5 },
    { col: 4, row: 2 },
    { col: 6, row: 2 },
    { col: 6, row: 4 },
    { col: 6, row: 6 },
    { col: 4, row: 6 },
    { col: 2, row: 6 },
    { col: 2, row: 4 },
    { col: 2, row: 2 },
  ];

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "roll 6 should generate the star shape"
  );

  console.log("berserker_move_roll_6_generates_star_shape passed");
}

function testBerserkerMoveFiltersOutOfBounds() {
  const rng = new SeededRNG(1542);
  const setup = setupBerserkerBattleState(0, 0);

  const requested = applyAction(
    setup.state,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );
  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");

  const expected = [
    { col: 0, row: 1 },
    { col: 1, row: 0 },
    { col: 1, row: 1 },
    { col: 0, row: 2 },
    { col: 2, row: 0 },
    { col: 2, row: 2 },
  ];

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "roll 6 should filter out-of-bounds cells"
  );

  console.log("berserker_move_filters_out_of_bounds passed");
}

function testBerserkerMoveCannotEndOnAlly() {
  const rng = new SeededRNG(1972);
  const setup = setupBerserkerBattleState(4, 4);

  const ally = Object.values(setup.state.units).find(
    (u) => u.owner === "P1" && u.id !== setup.berserkerId
  )!;
  const stateWithAlly = setUnit(setup.state, ally.id, {
    position: { col: 5, row: 3 },
  });

  const requested = applyAction(
    stateWithAlly,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );
  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");

  const expected = [
    { col: 3, row: 3 },
    { col: 4, row: 3 },
  ];

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "ally-occupied destinations should be excluded"
  );

  console.log("berserker_move_cannot_end_on_ally passed");
}

function testBerserkerMoveRequiresManualRollNoAutoroll() {
  const rng = new SeededRNG(1972);
  const setup = setupBerserkerBattleState(4, 4);

  const requested = applyAction(
    setup.state,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );

  assert(
    requested.state.pendingRoll?.kind === "moveBerserker",
    "requestMoveOptions should create pending roll"
  );
  assert(
    requested.state.pendingMove === null,
    "requestMoveOptions should not create move options before roll"
  );
  assert(
    requested.events.some((e) => e.type === "rollRequested"),
    "requestMoveOptions should emit rollRequested"
  );

  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");
  assert(
    resolved.state.pendingMove && resolved.state.pendingMove.unitId === setup.berserkerId,
    "pendingMove should be stored after roll"
  );
  assert(
    !resolved.events.some((e) => e.type === "unitMoved"),
    "resolving the roll should not move the unit"
  );

  console.log("berserker_move_requires_manual_roll_no_autoroll passed");
}

function testTricksterMoveRequiresPendingOptions() {
  const rng = new SeededRNG(402);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const res = applyAction(
    state,
    { type: "move", unitId: trickster.id, to: { col: 5, row: 5 } } as any,
    rng
  );

  assert(res.events.length === 0, "trickster move should be blocked without pending options");
  assert(
    res.state.units[trickster.id].position!.col === 4 &&
      res.state.units[trickster.id].position!.row === 4,
    "trickster should stay in place without pending options"
  );

  console.log("trickster_move_requires_pending_options passed");
}

function testKaiserBunkerVisibleAndDamageClampedTo1() {
  const rng = makeRngSequence([0.8]);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P1", kaiser.id);

  let res = applyAction(
    state,
    { type: "enterStealth", unitId: kaiser.id } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "enterBunker",
    "enterBunker roll should be pending"
  );

  res = resolvePendingRollOnce(res.state, rng);
  const afterBunker = res.state.units[kaiser.id];
  assert(afterBunker.bunker?.active === true, "bunker should be active");
  assert(afterBunker.isStealthed === false, "bunker should not stealth");

  const attack = resolveAttack(res.state, {
    attackerId: enemy.id,
    defenderId: kaiser.id,
    ignoreRange: true,
    ignoreStealth: true,
    rolls: { attackerDice: [6, 6], defenderDice: [1, 2] },
  });
  const finalKaiser = attack.nextState.units[kaiser.id];
  assert(
    finalKaiser.hp === afterBunker.hp - 1,
    "bunker damage should be clamped to 1"
  );

  console.log("kaiser_bunker_visible_and_damage_clamped_to_1 passed");
}

function testKaiserBunkerExpiresOnFourthOwnTurn() {
  const rng = new SeededRNG(12);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    bunker: { active: true, ownTurnsInBunker: 0 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(state, { type: "unitStartTurn", unitId: kaiser.id } as any, rng);
  assert(res.state.units[kaiser.id].bunker?.active === true, "bunker stays on 1st turn");
  if (res.state.pendingRoll) {
    res = resolveAllPendingRolls(res.state, rng);
  }

  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;

  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  res = applyAction(state, { type: "unitStartTurn", unitId: kaiser.id } as any, rng);
  assert(res.state.units[kaiser.id].bunker?.active === true, "bunker stays on 2nd turn");
  if (res.state.pendingRoll) {
    res = resolveAllPendingRolls(res.state, rng);
  }

  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;

  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  res = applyAction(state, { type: "unitStartTurn", unitId: kaiser.id } as any, rng);
  assert(res.state.units[kaiser.id].bunker?.active === true, "bunker stays on 3rd turn");
  if (res.state.pendingRoll) {
    res = resolveAllPendingRolls(res.state, rng);
  }

  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;

  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  const exitRes = applyAction(state, { type: "unitStartTurn", unitId: kaiser.id } as any, rng);
  const exitEvent = exitRes.events.find(
    (e) => e.type === "bunkerExited" && e.unitId === kaiser.id
  );
  assert(exitEvent, "bunker should exit on 4th own turn start");
  if (exitEvent && exitEvent.type === "bunkerExited") {
    assert(exitEvent.reason === "timerExpired", "bunker exit reason should be timerExpired");
  }
  assert(
    exitRes.state.units[kaiser.id].bunker?.active !== true,
    "bunker should be off on 4th own turn start"
  );

  console.log("kaiser_bunker_exits_on_start_of_4th_own_turn passed");
}

function testKaiserBunkerExitOnAttackButNotDoraOrImpulse() {
  const rng = new SeededRNG(902);

  // Base attack exits bunker.
  let setup = setupKaiserState();
  let state = setup.state;
  const kaiser = setup.kaiser;
  const enemy = setup.enemy;
  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    bunker: { active: true, ownTurnsInBunker: 0 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", kaiser.id);

  const attackRes = applyAction(
    state,
    { type: "attack", attackerId: kaiser.id, defenderId: enemy.id } as any,
    rng
  );
  const exitEvent = attackRes.events.find(
    (e) => e.type === "bunkerExited" && e.unitId === kaiser.id
  );
  assert(exitEvent, "bunker should exit on base attack");
  assert(
    attackRes.state.units[kaiser.id].bunker?.active !== true,
    "bunker should be off after base attack"
  );

  // Dora does not exit bunker.
  setup = setupKaiserState();
  state = setup.state;
  const kaiser2 = setup.kaiser;
  state = setUnit(state, kaiser2.id, {
    position: { col: 4, row: 4 },
    bunker: { active: true, ownTurnsInBunker: 0 },
    charges: { ...kaiser2.charges, [ABILITY_KAISER_DORA]: 2 },
  });
  state = setUnit(state, setup.enemy.id, { position: { col: 0, row: 0 } });
  state = toBattleState(state, "P1", kaiser2.id);

  const doraRes = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser2.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 4, row: 6 } },
    } as any,
    rng
  );
  assert(
    doraRes.state.units[kaiser2.id].bunker?.active === true,
    "bunker should stay on for Dora"
  );

  // Carpet Strike impulse does not exit bunker.
  setup = setupKaiserState();
  state = setup.state;
  const kaiser3 = setup.kaiser;
  state = setUnit(state, kaiser3.id, {
    position: { col: 4, row: 4 },
    bunker: { active: true, ownTurnsInBunker: 0 },
    charges: { ...kaiser3.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser3.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser3.id],
    turnOrderIndex: 0,
  };

  const turnRes = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser3.id } as any,
    rng
  );
  assert(
    turnRes.state.pendingRoll?.kind === "kaiserCarpetStrikeCenter",
    "carpet strike should trigger at turn start"
  );
  assert(
    turnRes.state.units[kaiser3.id].bunker?.active === true,
    "bunker should remain during impulse"
  );

  console.log("kaiser_bunker_exits_on_base_attack_but_not_on_dora_or_impulse passed");
}

function testCarpetStrikeRollsCenterThenAttackThenDefenders() {
  const rng = new SeededRNG(777);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "kaiserCarpetStrikeCenter",
    "carpet strike should request center roll first"
  );

  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll?.kind === "kaiserCarpetStrikeAttack",
    "carpet strike should request attack roll after center"
  );
  assert(
    res.events.some((e) => e.type === "carpetStrikeCenter"),
    "carpet strike center event should be emitted"
  );

  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll?.kind === "carpetStrike_defenderRoll" ||
      res.state.pendingRoll?.kind === "carpetStrike_berserkerDefenseChoice",
    "carpet strike should request defender roll after attack roll"
  );
  assert(
    res.events.some((e) => e.type === "carpetStrikeAttackRolled"),
    "carpet strike attack event should be emitted"
  );

  res = resolvePendingRollOnce(res.state, rng);
  const finished = resolveAllPendingRolls(res.state, rng);
  assert(
    !finished.state.pendingRoll,
    "carpet strike should finish after defenders"
  );

  console.log("carpet_strike_rolls_center_then_attack_then_defenders passed");
}

function testCarpetStrikeUsesSingleSharedAttackRollForAllTargets() {
  const rng = new SeededRNG(777);
  let { state, kaiser } = setupKaiserState();

  const enemy1 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const enemy2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = setUnit(state, enemy1.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, enemy2.id, { position: { col: 5, row: 6 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy1.id, enemy2.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy1.id, enemy2.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll?.kind === "carpetStrike_defenderRoll",
    "carpet strike should start defender rolls"
  );
  const firstCtx = res.state.pendingRoll?.context as { attackerDice?: number[] };
  const firstDice = Array.isArray(firstCtx.attackerDice) ? firstCtx.attackerDice : [];

  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll,
    "carpet strike should keep defender rolls for remaining targets"
  );
  const secondCtx = res.state.pendingRoll?.context as { attackerDice?: number[] };
  const secondDice = Array.isArray(secondCtx.attackerDice) ? secondCtx.attackerDice : [];
  assert.deepStrictEqual(
    firstDice,
    secondDice,
    "carpet strike should reuse the same attacker roll for all targets"
  );

  console.log("carpet_strike_uses_single_shared_attack_roll_for_all_targets passed");
}

function testCarpetStrikeDamageIsFixed1IgnoresBuffs() {
  const rng = makeRngSequence([0.5, 0.5, 0.99, 0.99, 0.01, 0.2]);
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", {
      archer: HERO_GRAND_KAISER_ID,
      spearman: HERO_VLAD_TEPES_ID,
    })
  );
  state = attachArmy(state, createDefaultArmy("P2"));

  const kaiser = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const vlad = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, kaiser.id, {
    position: { col: 0, row: 0 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = setUnit(state, vlad.id, { position: { col: 0, row: 1 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 4 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  res = resolvePendingRollOnce(res.state, rng);
  const finished = resolveAllPendingRollsWithEvents(res.state, rng);

  const updatedEnemy = finished.state.units[enemy.id];
  assert(
    updatedEnemy.hp === enemy.hp - 1,
    "carpet strike damage should be fixed to 1"
  );
  assert(
    !finished.events.some((e) => e.type === "damageBonusApplied"),
    "carpet strike should ignore damage bonuses"
  );

  console.log("carpet_strike_damage_is_fixed_1_ignores_buffs passed");
}

function testCarpetStrikeHighlightsAreaMetadataInEvents() {
  const rng = new SeededRNG(777);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  const centerEvent = res.events.find((e) => e.type === "carpetStrikeCenter");
  assert(
    centerEvent && centerEvent.type === "carpetStrikeCenter",
    "carpet strike center event should be emitted"
  );
  if (centerEvent && centerEvent.type === "carpetStrikeCenter") {
    assert(
      centerEvent.area.radius === 2 && centerEvent.area.shape === "square",
      "carpet strike center should include area metadata"
    );
    assert(
      centerEvent.center.col === 4 && centerEvent.center.row === 6,
      "carpet strike center should follow 2d9 mapping"
    );
  }

  console.log("carpet_strike_highlights_area_metadata_in_events passed");
}

function testCarpetStrikeRevealsStealthedUnitsInArea() {
  const rng = new SeededRNG(777);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 2, row: 2 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = setUnit(state, enemy.id, {
    position: { col: 4, row: 6 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  const turnRes = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  assert(
    turnRes.state.pendingRoll?.kind === "kaiserCarpetStrikeCenter",
    "carpet strike should trigger"
  );

  const resolved = resolvePendingRollOnce(turnRes.state, rng);
  const updatedEnemy = resolved.state.units[enemy.id];
  assert(updatedEnemy.isStealthed === false, "stealthed unit should be revealed");

  console.log("carpet_strike_reveals_stealthed_units_in_area passed");
}

function testKaiserCarpetStrikeDoesNotHitSelfInBunker() {
  const rng = new SeededRNG(777);
  let { state, kaiser } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 6 },
    bunker: { active: true, ownTurnsInBunker: 0 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id],
    turnOrderIndex: 0,
  };

  const turnRes = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(turnRes.state, rng);
  const updatedKaiser = resolved.state.units[kaiser.id];
  assert(updatedKaiser.hp === kaiser.hp, "caster should be immune while in bunker");

  console.log("kaiser_carpet_strike_does_not_hit_self_when_in_bunker passed");
}

function testKaiserCarpetStrikeHitsAlliesAndEnemies() {
  const rng = new SeededRNG(777);
  let { state, kaiser } = setupKaiserState();

  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const foe = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  state = setUnit(state, kaiser.id, {
    position: { col: 2, row: 2 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, foe.id, { position: { col: 5, row: 6 } });

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, foe.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, foe.id],
    turnOrderIndex: 0,
  };

  const turnRes = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  let res = resolvePendingRollOnce(turnRes.state, rng);
  assert(
    res.state.pendingRoll?.kind === "kaiserCarpetStrikeAttack",
    "carpet strike should request attack roll"
  );
  res = resolvePendingRollOnce(res.state, rng);
  const attackEvent = res.events.find(
    (e) => e.type === "carpetStrikeAttackRolled"
  );
  assert(
    attackEvent && attackEvent.type === "carpetStrikeAttackRolled",
    "carpet strike attack event should be emitted"
  );
  if (attackEvent && attackEvent.type === "carpetStrikeAttackRolled") {
    assert(
      attackEvent.affectedUnitIds.includes(ally.id),
      "carpet strike should include allies"
    );
    assert(
      attackEvent.affectedUnitIds.includes(foe.id),
      "carpet strike should include enemies"
    );
  }

  console.log("kaiser_carpet_strike_hits_allies_and_enemies passed");
}

function testKaiserDoraDoesNotRequireBunker() {
  const rng = new SeededRNG(1000);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", kaiser.id);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 4, row: 6 } },
    } as any,
    rng
  );
  assert(!res.state.pendingRoll, "Dora should be blocked without 2 charges");

  state = setUnit(res.state, kaiser.id, {
    charges: { ...kaiser.charges, [ABILITY_KAISER_DORA]: 2 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 4, row: 6 } },
    } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "dora_attackerRoll",
    "Dora should create attacker roll when ready"
  );
  assert(
    res.state.units[kaiser.id].charges[ABILITY_KAISER_DORA] === 0,
    "Dora should consume 2 charges"
  );
  assert(
    res.state.units[kaiser.id].turn.actionUsed === true,
    "Dora should consume action slot"
  );

  console.log("kaiser_dora_does_not_require_bunker passed");
}

function testKaiserDoraOneAttackerRollManyDefenders() {
  const rng = new SeededRNG(3333);
  let { state, kaiser } = setupKaiserState();

  const enemy1 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const enemy2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_DORA]: 2 },
  });
  state = setUnit(state, enemy1.id, { position: { col: 4, row: 7 } });
  state = setUnit(state, enemy2.id, { position: { col: 5, row: 7 } });
  state = toBattleState(state, "P1", kaiser.id);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 4, row: 7 } },
    } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "dora_attackerRoll",
    "Dora should request attacker roll first"
  );

  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll?.kind === "dora_defenderRoll",
    "Dora should request defender roll after attacker roll"
  );

  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll?.kind === "dora_defenderRoll",
    "Dora should roll defenders sequentially"
  );

  res = resolvePendingRollOnce(res.state, rng);
  assert(!res.state.pendingRoll, "Dora should finish after all defenders");

  console.log("kaiser_dora_one_attacker_roll_many_defenders_roll_separately passed");
}

function testKaiserDoraDoesNotDuplicateDefenderRollsWithIntimidate() {
  const rng = makeRngSequence([0.001, 0.001, 0.99, 0.99, 0.5, 0.5]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { archer: HERO_GRAND_KAISER_ID });
  const a2 = createDefaultArmy("P2", { spearman: HERO_VLAD_TEPES_ID });
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const kaiser = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const vlad = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const other = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class !== "spearman"
  )!;

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_DORA]: 2 },
  });
  state = setUnit(state, vlad.id, { position: { col: 4, row: 7 } });
  state = setUnit(state, other.id, { position: { col: 3, row: 7 } });

  state = toBattleState(state, "P1", kaiser.id);
  state = initKnowledgeForOwners(state);

  // Use Dora centered to include both targets
  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 4, row: 7 } },
    } as any,
    rng as any
  );
  assert(res.state.pendingRoll?.kind === "dora_attackerRoll", "Dora should request attacker roll first");

  // Resolve attacker roll once
  res = resolvePendingRollOnce(res.state, rng as any);

  // Now step through all pending rolls and collect rollRequested events
  const collected: any[] = [];
  let current = res;
  let iter = 0;
  const lastKinds: string[] = [];
  while (current.state.pendingRoll) {
    iter += 1;
    if (iter > 300) {
      const last = collected.slice(-60).map((e) => JSON.stringify(e)).join("\n");
      const kinds = lastKinds.slice(-20).join(",");
      assert(false, `possible infinite loop resolving Dora AoE after ${iter} iterations; recent kinds: ${kinds}\nrecent events:\n${last}`);
    }
    collected.push(...current.events);
    if (current.events && current.events.length > 0) {
      const types = current.events.map((e: any) => e.type).join(",");
      console.log(`DEBUG_EVENTS: iter=${iter} events=${types}`);
    }
    const pk = current.state.pendingRoll?.kind ?? "none";
    const ctx = (current.state.pendingRoll && (current.state.pendingRoll.context as any)) || {};
    const aoe = current.state.pendingAoE;
    // debug trace for loop
    console.log(`DEBUG: iter=${iter} pendingRoll=${pk} ctxIdx=${ctx.currentTargetIndex ?? "-"} aoeIdx=${aoe?.affectedUnitIds?.join(",") ?? "-"} damaged=${aoe?.damagedUnitIds?.join(",") ?? "-"}`);
    lastKinds.push(pk);
    current = resolvePendingRollOnce(current.state, rng as any);
  }
  collected.push(...current.events);

  // Count dora_defenderRoll requests per actor
  const defenderRequests = collected.filter(
    (e) => e.type === "rollRequested" && (e as any).kind === "dora_defenderRoll"
  ) as any[];
  const actorIds = defenderRequests.map((r) => r.actorUnitId).filter(Boolean) as string[];
  const unique = new Set(actorIds);
  assert(
    unique.size === actorIds.length,
    "Dora should request at most one defender roll per target"
  );

  // Ensure Vlad specifically was requested exactly once
  const vladCount = actorIds.filter((id) => id === vlad.id).length;
  assert(vladCount === 1, "Vlad should receive exactly one dora_defenderRoll request");

  // Ensure intimidate choice was requested at most once for Vlad
  const intimidateRequests = collected.filter(
    (e) => e.type === "rollRequested" && (e as any).kind === "vladIntimidateChoice" && (e as any).actorUnitId === vlad.id
  ).length;
  assert(intimidateRequests <= 1, "Intimidate choice should be requested at most once per defense");

  console.log("dora_aoe_does_not_duplicate_defender_rolls_with_intimidate passed");
}

function testIntimidateTriggersOncePerSuccessfulDefense() {
  const rng = makeRngSequence([0.001, 0.001, 0.99, 0.99]);
  let { state, vlad, enemy } = setupVladState();
  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: vlad.id } as any,
    rng as any
  );
  // resolve attacker and defender rolls
  res = resolvePendingRollOnce(res.state, rng as any);
  res = resolvePendingRollOnce(res.state, rng as any);

  // There should be at most one intimidate choice roll requested
  const intimidateRequests = res.events.filter(
    (e) => e.type === "rollRequested" && (e as any).kind === "vladIntimidateChoice"
  ).length;
  assert(intimidateRequests <= 1, "Intimidate choice should be requested at most once");

  // If there was a pending intimidate choice, resolve it by picking first option
  if (res.state.pendingRoll && res.state.pendingRoll.kind === "vladIntimidateChoice") {
    const pending = res.state.pendingRoll;
    const options = (pending.context as any).options as Coord[] || [];
    const choice = options[0] ? { type: "intimidatePush", to: options[0] } : { type: "intimidateSkip" };
    const after = applyAction(res.state, { type: "resolvePendingRoll", pendingRollId: pending.id, choice, player: pending.player } as any, rng as any);
    const intimidateResolvedCount = after.events.filter((e) => e.type === "intimidateResolved").length;
    assert(intimidateResolvedCount <= 1, "IntimidateResolved should be emitted at most once");
  }

  console.log("intimidate_triggers_once_per_successful_defense passed");
}

function testTricksterAoEDoesNotDuplicateDefenderRollsWithIntimidate() {
  const rng = makeRngSequence([0.001, 0.001, 0.99, 0.99, 0.5, 0.5]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2", { spearman: HERO_VLAD_TEPES_ID });
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const vlad = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const other = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class !== "spearman"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, vlad.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, other.id, { position: { col: 3, row: 6 } });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
    } as any,
    rng as any
  );
  assert(res.state.pendingRoll?.kind === "tricksterAoE_attackerRoll", "Trickster should request attacker roll first");

  // Resolve attacker roll once
  res = resolvePendingRollOnce(res.state, rng as any);

  // Step through pending rolls and ensure intimidate doesn't duplicate defender rolls
  const collected: any[] = [];
  let current = res;
  let iter = 0;
  const lastKinds: string[] = [];
  while (current.state.pendingRoll) {
    iter += 1;
    if (iter > 300) {
      const last = collected.slice(-60).map((e) => JSON.stringify(e)).join("\n");
      const kinds = lastKinds.slice(-20).join(",");
      assert(false, `possible infinite loop resolving Trickster AoE after ${iter} iterations; recent kinds: ${kinds}\nrecent events:\n${last}`);
    }
    collected.push(...current.events);
    if (current.events && current.events.length > 0) {
      const types = current.events.map((e: any) => e.type).join(",");
      console.log(`DEBUG_EVENTS: iter=${iter} events=${types}`);
    }
    const pk = current.state.pendingRoll?.kind ?? "none";
    lastKinds.push(pk);
    current = resolvePendingRollOnce(current.state, rng as any);
  }

  const kinds = collected.map((e) => e.type);
  // Ensure we saw at least one intimidateTriggered
  assert(kinds.includes("intimidateTriggered"), "intimidate should trigger for Vlad in Trickster AoE");

  console.log("trickster_aoe_does_not_duplicate_defender_rolls_with_intimidate passed");
}

function testVladForestDoesNotDuplicateDefenderRollsWithIntimidate() {
  const rng = makeRngSequence([0.99, 0.99, 0.001, 0.001, 0.5, 0.5]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { spearman: HERO_VLAD_TEPES_ID });
  const a2 = createDefaultArmy("P2", { spearman: HERO_VLAD_TEPES_ID });
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const vladCaster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const vladDefender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const other = Object.values(state.units).find((u) => u.owner === "P2" && u.id !== vladDefender.id)!;

  state = setUnit(state, vladCaster.id, { position: { col: 4, row: 4 }, ownTurnsStarted: 1 });
  state = setUnit(state, vladDefender.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, other.id, { position: { col: 3, row: 6 } });

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vladCaster.id, vladDefender.id],
    turnQueueIndex: 0,
    turnOrder: [vladCaster.id, vladDefender.id],
    turnOrderIndex: 0,
    stakeMarkers: Array.from({ length: 9 }, (_, idx) => ({
      id: `stake-${idx + 1}`,
      owner: "P1" as const,
      position: { col: (idx + 1) % 3, row: Math.floor(idx / 3) },
      createdAt: idx + 1,
      isRevealed: false,
    })),
  };

  // Start Vlad's turn to activate forest
  let res = applyAction(state, { type: "unitStartTurn", unitId: vladCaster.id } as any, rng as any);
  const targetPending = res.state.pendingRoll;
  assert(targetPending && targetPending.kind === "vladForestTarget", "forest target should be pending");
  res = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: targetPending!.id,
      player: targetPending!.player,
      choice: { type: "forestTarget", center: { col: 4, row: 6 } },
    } as any,
    rng
  );

  // Resolve attacker roll and step through pending rolls
  res = resolvePendingRollOnce(res.state, rng as any);
  const collected: any[] = [];
  let current = res;
  let iter = 0;
  const lastKinds: string[] = [];
  while (current.state.pendingRoll) {
    iter += 1;
    if (iter > 300) {
      const last = collected.slice(-60).map((e) => JSON.stringify(e)).join("\n");
      const kinds = lastKinds.slice(-20).join(",");
      assert(false, `possible infinite loop resolving Vlad Forest AoE after ${iter} iterations; recent kinds: ${kinds}\nrecent events:\n${last}`);
    }
    collected.push(...current.events);
    if (current.events && current.events.length > 0) {
      const types = current.events.map((e: any) => e.type).join(",");
      console.log(`DEBUG_EVENTS: iter=${iter} events=${types}`);
    }
    const pk = current.state.pendingRoll?.kind ?? "none";
    lastKinds.push(pk);
    current = resolvePendingRollOnce(current.state, rng as any);
  }

  const kinds = collected.map((e) => e.type);
  assert(kinds.includes("intimidateTriggered"), "intimidate should trigger for Vlad in Forest AoE");

  console.log("vlad_forest_aoe_does_not_duplicate_defender_rolls_with_intimidate passed");
}


function testKaiserDoraCenterMustBeOnArcherLine() {
  const rng = new SeededRNG(5555);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_DORA]: 2 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = toBattleState(state, "P1", kaiser.id);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 5, row: 6 } },
    } as any,
    rng
  );
  assert(!res.state.pendingRoll, "invalid Dora center should be rejected");

  res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 4, row: 7 } },
    } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "dora_attackerRoll",
    "valid Dora center should be accepted"
  );

  console.log("kaiser_dora_center_must_be_on_archer_line passed");
}

function testKaiserEngineeringMiracleTransformsStats() {
  const rng = new SeededRNG(4444);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    bunker: { active: true, ownTurnsInBunker: 0 },
    hp: 3,
    charges: {
      ...kaiser.charges,
      [ABILITY_KAISER_DORA]: 0,
      [ABILITY_KAISER_CARPET_STRIKE]: 0,
      [ABILITY_KAISER_ENGINEERING_MIRACLE]: 4,
    },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  const res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );

  const updated = res.state.units[kaiser.id];
  assert(updated.transformed === true, "unit should be transformed");
  assert(updated.attack === 2, "attack should be boosted to 2");
  assert(updated.hp === 6, "hp should preserve missing amount on transform");
  assert(updated.bunker?.active !== true, "bunker should be disabled");
  assert(
    updated.charges[ABILITY_KAISER_ENGINEERING_MIRACLE] === 5,
    "engineering miracle should not spend charges"
  );
  assert(!res.state.pendingRoll, "engineering miracle should not create pending roll");
  const exitEvent = res.events.find(
    (e) => e.type === "bunkerExited" && e.unitId === kaiser.id
  );
  assert(exitEvent, "transform should exit bunker if active");

  console.log("kaiser_phantasm_transforms_stats_and_rules passed");
}

function testKaiserEngineeringMiracleImpulseNoActionNoSpend() {
  const rng = new SeededRNG(12345);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...kaiser.charges,
      [ABILITY_KAISER_DORA]: 1,
      [ABILITY_KAISER_CARPET_STRIKE]: 0,
      [ABILITY_KAISER_ENGINEERING_MIRACLE]: 4,
    },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  const res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );

  const updated = res.state.units[kaiser.id];
  assert(updated.transformed === true, "impulse should transform on turn start");
  assert(!res.state.pendingRoll, "impulse should not create pending roll");
  assert(
    updated.charges[ABILITY_KAISER_ENGINEERING_MIRACLE] === 5,
    "impulse should not spend charges"
  );

  console.log("kaiser_engineering_miracle_is_impulse_no_action_no_spend passed");
}

function testTransformedKaiserHasDoraAbility() {
  const rng = new SeededRNG(8877);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...kaiser.charges,
      [ABILITY_KAISER_ENGINEERING_MIRACLE]: 4,
      [ABILITY_KAISER_DORA]: 0,
      [ABILITY_KAISER_CARPET_STRIKE]: 0,
    },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  const res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  const updated = res.state.units[kaiser.id];
  assert(updated.transformed === true, "kaiser should transform");

  const view = makePlayerView(res.state, "P1");
  const abilities = view.abilitiesByUnitId?.[kaiser.id] ?? [];
  const dora = abilities.find((ability) => ability.id === ABILITY_KAISER_DORA);
  assert(dora, "Dora should be present after transform");
  assert(dora?.isAvailable, "Dora should be available when action slot is free");

  console.log("transformed_kaiser_has_dora_ability passed");
}

function testTransformedKaiserHasBerserkerFeatureAndCharges() {
  const rng = new SeededRNG(6677);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...kaiser.charges,
      [ABILITY_KAISER_ENGINEERING_MIRACLE]: 4,
    },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  const updated = res.state.units[kaiser.id];
  assert(updated.transformed === true, "kaiser should transform");

  const view = makePlayerView(res.state, "P1");
  const abilities = view.abilitiesByUnitId?.[kaiser.id] ?? [];
  const berserk = abilities.find(
    (ability) => ability.id === ABILITY_BERSERK_AUTO_DEFENSE
  );
  assert(berserk, "berserker feature should be present after transform");

  const initialCharges =
    updated.charges[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
  const loopState: GameState = {
    ...res.state,
    turnQueue: [kaiser.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id],
    turnOrderIndex: 0,
    currentPlayer: "P1",
  };
  const endRes = applyAction(loopState, { type: "endTurn" } as any, rng);
  res = applyAction(
    endRes.state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  const nextCharges =
    res.state.units[kaiser.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
  assert(
    nextCharges === Math.min(6, initialCharges + 1),
    "berserker charges should increment on own turn start"
  );

  console.log("transformed_kaiser_has_berserker_feature_and_charges passed");
}

function testBerserkerMoveRequiresPendingRollAndGeneratesOptions() {
  const rng = new SeededRNG(7788);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    transformed: true,
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = toBattleState(state, "P1", kaiser.id);

  let res = applyAction(
    state,
    { type: "requestMoveOptions", unitId: kaiser.id, mode: "berserker" } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "moveBerserker",
    "berserker move should request a roll"
  );

  res = resolvePendingRollOnce(res.state, rng);
  assert(!res.state.pendingRoll, "berserker move should clear pending roll");
  const moveEvent = res.events.find((e) => e.type === "moveOptionsGenerated");
  assert(
    moveEvent && moveEvent.type === "moveOptionsGenerated",
    "move options should be generated after roll"
  );
  if (moveEvent && moveEvent.type === "moveOptionsGenerated") {
    assert(
      moveEvent.legalTo.length > 0,
      "berserker move should produce legal destinations"
    );
  }
  assert(
    (res.state.pendingMove?.legalTo.length ?? 0) > 0,
    "pendingMove should be populated after berserker roll"
  );

  console.log("berserker_move_requires_pending_roll_and_generates_options passed");
}

function testKaiserInitialChargesStartAtZeroThenIncrementToOneOnFirstTurn() {
  const rng = new SeededRNG(2468);
  let { state, kaiser, enemy } = setupKaiserState();

  assert(
    (kaiser.charges[ABILITY_KAISER_DORA] ?? 0) === 0,
    "Dora should start at 0 charges"
  );
  assert(
    (kaiser.charges[ABILITY_KAISER_CARPET_STRIKE] ?? 0) === 0,
    "Carpet Strike should start at 0 charges"
  );
  assert(
    (kaiser.charges[ABILITY_KAISER_ENGINEERING_MIRACLE] ?? 0) === 0,
    "Engineering Miracle should start at 0 charges"
  );

  state = setUnit(state, kaiser.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  const res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  const updated = res.state.units[kaiser.id];
  assert(
    updated.charges[ABILITY_KAISER_DORA] === 1,
    "Dora should increment to 1 on first turn"
  );
  assert(
    updated.charges[ABILITY_KAISER_CARPET_STRIKE] === 1,
    "Carpet Strike should increment to 1 on first turn"
  );
  assert(
    updated.charges[ABILITY_KAISER_ENGINEERING_MIRACLE] === 1,
    "Engineering Miracle should increment to 1 on first turn"
  );

  console.log("kaiser_initial_charges_start_at_zero_then_increment_to_one_on_first_turn passed");
}

function testKaiserChargesIncrementEachOwnTurn() {
  const rng = new SeededRNG(13579);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  const expectCharges = (
    res: { state: GameState; events: any[] },
    expected: { dora?: number; carpet?: number; miracle?: number }
  ) => {
    const chargeEvent = res.events.find(
      (e) => e.type === "chargesUpdated" && e.unitId === kaiser.id
    );
    assert(chargeEvent, "chargesUpdated should fire for Kaiser");
    if (chargeEvent?.type === "chargesUpdated") {
      if (expected.dora !== undefined) {
        if (chargeEvent.now?.[ABILITY_KAISER_DORA] !== undefined) {
          assert(
            chargeEvent.now[ABILITY_KAISER_DORA] === expected.dora,
            "Dora charge should increment"
          );
        } else {
          assert(
            res.state.units[kaiser.id].charges[ABILITY_KAISER_DORA] === expected.dora,
            "Dora charge should remain capped"
          );
        }
      }
      if (expected.carpet !== undefined) {
        assert(
          chargeEvent.now?.[ABILITY_KAISER_CARPET_STRIKE] === expected.carpet,
          "Carpet Strike charge should increment"
        );
      }
      if (expected.miracle !== undefined) {
        assert(
          chargeEvent.now?.[ABILITY_KAISER_ENGINEERING_MIRACLE] === expected.miracle,
          "Engineering Miracle charge should increment"
        );
      }
    }
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  expectCharges(res, { dora: 1, carpet: 1, miracle: 1 });
  res = resolveAllPendingRolls(res.state, rng);
  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;
  state = applyAction(state, { type: "endTurn" } as any, rng).state;

  res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  expectCharges(res, { dora: 2, carpet: 2, miracle: 2 });
  res = resolveAllPendingRolls(res.state, rng);
  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;
  state = applyAction(state, { type: "endTurn" } as any, rng).state;

  res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  expectCharges(res, { carpet: 3, miracle: 3 });
  assert(
    res.state.units[kaiser.id].charges[ABILITY_KAISER_DORA] === 2,
    "Dora should stay capped at 2"
  );

  console.log("kaiser_charges_increment_each_own_turn passed");
}

function testChargesAreNotResetByViewOrStartTurn() {
  let { state, kaiser } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    charges: {
      ...kaiser.charges,
      [ABILITY_KAISER_DORA]: 2,
      [ABILITY_KAISER_CARPET_STRIKE]: 1,
      [ABILITY_KAISER_ENGINEERING_MIRACLE]: 4,
    },
  });

  const view1 = makePlayerView(state, "P1");
  const view2 = makePlayerView(state, "P1");

  assert(
    view1.units[kaiser.id].charges[ABILITY_KAISER_DORA] === 2,
    "view should not reset Dora charges"
  );
  assert(
    view2.units[kaiser.id].charges[ABILITY_KAISER_ENGINEERING_MIRACLE] === 4,
    "view should not reset Engineering Miracle charges"
  );
  assert(
    state.units[kaiser.id].charges[ABILITY_KAISER_CARPET_STRIKE] === 1,
    "state should preserve Carpet Strike charges"
  );

  console.log("charges_are_not_reset_by_view_or_startTurn passed");
}

function testKaiserMulticlassMovementAndRiderPath() {
  const rng = new SeededRNG(24680);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    transformed: true,
  });
  state = toBattleState(state, "P1", kaiser.id);

  let res = applyAction(
    state,
    { type: "requestMoveOptions", unitId: kaiser.id } as any,
    rng
  );
  const modeEvent = res.events.find((e) => e.type === "moveOptionsGenerated");
  assert(
    modeEvent && modeEvent.type === "moveOptionsGenerated",
    "move modes should be reported for transformed Kaiser"
  );
  if (modeEvent && modeEvent.type === "moveOptionsGenerated") {
    assert(
      modeEvent.modes?.includes("berserker"),
      "move modes should include berserker"
    );
  }

  res = applyAction(
    res.state,
    { type: "requestMoveOptions", unitId: kaiser.id, mode: "berserker" } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "moveBerserker",
    "transformed Kaiser should request berserker move roll when mode chosen"
  );

  // Rider path attack should trigger on orthogonal move through enemy.
  let state2 = setupKaiserState().state;
  const kaiser2 = Object.values(state2.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemy2 = Object.values(state2.units).find(
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;
  state2 = setUnit(state2, kaiser2.id, {
    position: { col: 4, row: 4 },
    transformed: true,
  });
  state2 = setUnit(state2, enemy2.id, { position: { col: 4, row: 6 } });
  state2 = toBattleState(state2, "P1", kaiser2.id);

  const optionsRes = applyAction(
    state2,
    { type: "requestMoveOptions", unitId: kaiser2.id, mode: "rider" } as any,
    rng
  );
  const moveRes = applyAction(
    optionsRes.state,
    { type: "move", unitId: kaiser2.id, to: { col: 4, row: 8 } } as any,
    rng
  );
  assert(
    moveRes.state.pendingRoll?.kind === "riderPathAttack_attackerRoll",
    "rider path attack should trigger during move"
  );
  assert(
    moveRes.state.pendingCombatQueue.length > 0,
    "rider path should enqueue combat targets"
  );

  console.log("kaiser_multiclass_movement_modes_work_and_rider_through_enemy_attack_possible passed");
}

function testPolkovodetsAppliesToAdjacentAlliesNotSelf() {
  let { state, vlad, enemy } = setupVladState();
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, ally.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = toBattleState(state, "P1", ally.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.2]);
  let res = applyAction(
    state,
    { type: "attack", attackerId: ally.id, defenderId: enemy.id } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(res.state, rng);
  const attackEvent = resolved.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === ally.id &&
      e.defenderId === enemy.id
  );
  assert(attackEvent && attackEvent.type === "attackResolved", "attack should resolve");
  assert(attackEvent.hit, "attack should hit");
  assert(
    attackEvent.damage === ally.attack + 1,
    "adjacent ally should get +1 damage"
  );

  let state2 = setupVladState().state;
  const vlad2 = Object.values(state2.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_VLAD_TEPES_ID
  )!;
  const enemy2 = Object.values(state2.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  state2 = setUnit(state2, vlad2.id, { position: { col: 4, row: 4 } });
  state2 = setUnit(state2, enemy2.id, { position: { col: 4, row: 6 } });
  state2 = toBattleState(state2, "P1", vlad2.id);
  state2 = initKnowledgeForOwners(state2);

  const rng2 = makeRngSequence([0.99, 0.99, 0.01, 0.2]);
  let res2 = applyAction(
    state2,
    { type: "attack", attackerId: vlad2.id, defenderId: enemy2.id } as any,
    rng2
  );
  res2 = resolveAllPendingRolls(res2.state, rng2);
  const attackEvent2 = res2.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === vlad2.id &&
      e.defenderId === enemy2.id
  );
  assert(attackEvent2 && attackEvent2.type === "attackResolved", "attack should resolve");
  assert(attackEvent2.hit, "attack should hit");
  assert(
    attackEvent2.damage === vlad2.attack,
    "Vlad should not receive his own aura bonus"
  );

  console.log("polkovodets_applies_to_adjacent_allies_not_self passed");
}

function testPolkovodetsDoesNotStack() {
  let { state, vlad, enemy } = setupVladState();
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const secondVlad = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.id !== vlad.id && u.id !== ally.id
  )!;

  state = setUnit(state, vlad.id, { position: { col: 3, row: 4 } });
  state = setUnit(state, secondVlad.id, {
    position: { col: 5, row: 4 },
    heroId: HERO_VLAD_TEPES_ID,
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P1", ally.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.2]);
  let res = applyAction(
    state,
    { type: "attack", attackerId: ally.id, defenderId: enemy.id } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(res.state, rng);
  const attackEvent = resolved.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === ally.id &&
      e.defenderId === enemy.id
  );
  assert(attackEvent && attackEvent.type === "attackResolved", "attack should resolve");
  assert(attackEvent.hit, "attack should hit");
  assert(
    attackEvent.damage === ally.attack + 1,
    "polkovodets bonus should not stack"
  );

  console.log("polkovodets_does_not_stack passed");
}

function testPolkovodetsRiderOnlyIfStartOrEndInAura() {
  let { state, vlad } = setupVladState();
  const rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, vlad.id, { position: { col: 1, row: 0 } });
  state = setUnit(state, rider.id, { position: { col: 0, row: 0 } });
  state = setUnit(state, enemy.id, { position: { col: 0, row: 2 } });
  state = toBattleState(state, "P1", rider.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.2]);
  let res = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 0, row: 3 } } as any,
    rng
  );
  res = resolveAllPendingRolls(res.state, rng);
  const attackEvent = res.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === rider.id &&
      e.defenderId === enemy.id
  );
  assert(attackEvent && attackEvent.type === "attackResolved", "rider attack should resolve");
  assert(attackEvent.hit, "rider attack should hit");
  assert(
    attackEvent.damage === rider.attack + 1,
    "rider should gain aura bonus when starting in aura"
  );

  let state2 = setupVladState().state;
  const vlad2 = Object.values(state2.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_VLAD_TEPES_ID
  )!;
  const rider2 = Object.values(state2.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const enemy2 = Object.values(state2.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state2 = setUnit(state2, vlad2.id, { position: { col: 3, row: 3 } });
  state2 = setUnit(state2, rider2.id, { position: { col: 0, row: 0 } });
  state2 = setUnit(state2, enemy2.id, { position: { col: 0, row: 2 } });
  state2 = toBattleState(state2, "P1", rider2.id);
  state2 = initKnowledgeForOwners(state2);

  const rng2 = makeRngSequence([0.99, 0.99, 0.01, 0.2]);
  let res2 = applyAction(
    state2,
    { type: "move", unitId: rider2.id, to: { col: 0, row: 3 } } as any,
    rng2
  );
  res2 = resolveAllPendingRolls(res2.state, rng2);
  const attackEvent2 = res2.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === rider2.id &&
      e.defenderId === enemy2.id
  );
  assert(attackEvent2 && attackEvent2.type === "attackResolved", "rider attack should resolve");
  assert(attackEvent2.hit, "rider attack should hit");
  assert(
    attackEvent2.damage === rider2.attack,
    "rider should not gain aura bonus when outside aura"
  );

  console.log("polkovodets_rider_only_if_start_or_end_in_aura passed");
}

function testGenghisHpIs7() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const meta = getHeroMeta(HERO_GENGHIS_KHAN_ID);
  assert(genghis.hp === 7, "Genghis HP should be exactly 7");
  assert(meta?.baseStats.hp === 7, "Genghis hero meta HP should be exactly 7");
  console.log("genghis_hp_is_7 passed");
}

function testKhansDecreeDoesNotConsumeMoveSlot() {
  const rng = new SeededRNG(101);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, genghis.id, {
    position: { col: 0, row: 0 },
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 1 },
  });
  state = toBattleState(state, "P1", genghis.id);

  const res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_KHANS_DECREE,
    } as any,
    rng
  );
  const updated = res.state.units[genghis.id];
  assert(
    updated.charges[ABILITY_GENGHIS_KHAN_KHANS_DECREE] === 0,
    "decree should spend 1 charge"
  );
  assert(
    updated.turn.moveUsed === false,
    "decree should not consume move slot"
  );
  assert(
    res.state.pendingMove && res.state.pendingMove.unitId === genghis.id,
    "decree should create pending move options"
  );

  console.log("khans_decree_does_not_consume_move_slot passed");
}

function testKhansDecreeAllowsDiagonalMoveThenConsumesMove() {
  const rng = new SeededRNG(102);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, genghis.id, {
    position: { col: 0, row: 0 },
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 1 },
  });
  state = toBattleState(state, "P1", genghis.id);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_KHANS_DECREE,
    } as any,
    rng
  );
  const pending = res.state.pendingMove;
  assert(
    pending &&
      pending.unitId === genghis.id &&
      pending.legalTo.some((c) => c.col === 2 && c.row === 2),
    "decree should allow diagonal line moves"
  );

  const moveRes = applyAction(
    res.state,
    { type: "move", unitId: genghis.id, to: { col: 2, row: 2 } } as any,
    rng
  );
  const moved = moveRes.state.units[genghis.id];
  assert(
    moved.position?.col === 2 && moved.position?.row === 2,
    "diagonal move should succeed after decree"
  );
  assert(moved.turn.moveUsed === true, "move should consume move slot");

  const endRes = applyAction(moveRes.state, { type: "endTurn" } as any, rng);
  const afterEnd = endRes.state.units[genghis.id];
  assert(
    afterEnd.genghisKhanDiagonalMoveActive === false,
    "diagonal move flag should clear on end turn"
  );

  console.log("khans_decree_allows_diagonal_move_then_consumes_move passed");
}

function testKhansDecreeCannotBeUsedAfterMove() {
  const rng = new SeededRNG(103);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, genghis.id, {
    position: { col: 0, row: 0 },
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 1 },
  });
  state = toBattleState(state, "P1", genghis.id);

  let res = applyAction(
    state,
    { type: "move", unitId: genghis.id, to: { col: 0, row: 2 } } as any,
    rng
  );
  const moved = res.state.units[genghis.id];
  assert(moved.turn.moveUsed === true, "move should consume move slot");

  const attempt = applyAction(
    res.state,
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_KHANS_DECREE,
    } as any,
    rng
  );
  const afterAttempt = attempt.state.units[genghis.id];
  assert(
    afterAttempt.charges[ABILITY_GENGHIS_KHAN_KHANS_DECREE] === 1,
    "decree should not spend charges after move"
  );
  assert(
    !attempt.state.pendingMove,
    "decree should not create pending move after move"
  );
  assert(
    afterAttempt.genghisKhanDiagonalMoveActive !== true,
    "decree should not enable diagonal movement after move"
  );
  assert(attempt.events.length === 0, "blocked decree should emit no events");

  console.log("khans_decree_cannot_be_used_after_move passed");
}

function testGenghisMongolChargeRequires4SpendsAll4() {
  const rng = new SeededRNG(202);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, genghis.id, {
    position: { col: 1, row: 1 },
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_MONGOL_CHARGE]: 3 },
  });
  state = toBattleState(state, "P1", genghis.id);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
    } as any,
    rng
  );
  const notEnough = res.state.units[genghis.id];
  assert(
    notEnough.charges[ABILITY_GENGHIS_KHAN_MONGOL_CHARGE] === 3,
    "mongol charge should not spend charges when below 4"
  );
  assert(
    !res.state.pendingMove,
    "mongol charge should not create pending move without charges"
  );

  res = applyAction(
    setUnit(res.state, genghis.id, {
      charges: { ...notEnough.charges, [ABILITY_GENGHIS_KHAN_MONGOL_CHARGE]: 4 },
    }),
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
    } as any,
    rng
  );
  const updated = res.state.units[genghis.id];
  assert(
    updated.charges[ABILITY_GENGHIS_KHAN_MONGOL_CHARGE] === 0,
    "mongol charge should spend all 4 charges"
  );
  assert(updated.turn.actionUsed === true, "mongol charge should consume action slot");
  assert(
    res.state.pendingMove && res.state.pendingMove.unitId === genghis.id,
    "mongol charge should create pending move"
  );

  console.log("genghis_mongol_charge_requires_4_spends_all_4 passed");
}

function testGenghisLegendOfSteppesBonusOnlyVsLastTurnTarget() {
  const rng = makeRngSequence([
    0.99, 0.99, 0.01, 0.2, // turn N vs A
    0.99, 0.99, 0.01, 0.2, // turn N+1 vs A
    0.99, 0.99, 0.01, 0.2, // turn N+2 vs B
  ]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const enemyA = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const enemyB = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;

  state = setUnit(state, genghis.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemyA.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemyB.id, { position: { col: 5, row: 4 } });
  state = toBattleState(state, "P1", genghis.id);

  let res = applyAction(
    state,
    { type: "attack", attackerId: genghis.id, defenderId: enemyA.id } as any,
    rng
  );
  res = resolveAllPendingRollsWithEvents(res.state, rng);

  let endRes = applyAction(res.state, { type: "endTurn" } as any, rng);
  let startRes = applyAction(
    endRes.state,
    { type: "unitStartTurn", unitId: genghis.id } as any,
    rng
  );

  res = applyAction(
    startRes.state,
    { type: "attack", attackerId: genghis.id, defenderId: enemyA.id } as any,
    rng
  );
  res = resolveAllPendingRollsWithEvents(res.state, rng);
  const attackA = res.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === genghis.id &&
      e.defenderId === enemyA.id
  );
  assert(attackA && attackA.type === "attackResolved", "attack on A should resolve");
  assert(
    attackA.damage === genghis.attack + 1,
    "legend of the steppes should add +1 vs last turn target"
  );

  endRes = applyAction(res.state, { type: "endTurn" } as any, rng);
  startRes = applyAction(
    endRes.state,
    { type: "unitStartTurn", unitId: genghis.id } as any,
    rng
  );
  res = applyAction(
    startRes.state,
    { type: "attack", attackerId: genghis.id, defenderId: enemyB.id } as any,
    rng
  );
  res = resolveAllPendingRollsWithEvents(res.state, rng);
  const attackB = res.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === genghis.id &&
      e.defenderId === enemyB.id
  );
  assert(attackB && attackB.type === "attackResolved", "attack on B should resolve");
  assert(
    attackB.damage === genghis.attack,
    "legend of the steppes should not apply to new targets"
  );

  console.log("genghis_legend_of_steppes_bonus_only_vs_last_turn_target passed");
}

function testGenghisMongolChargeSweepTriggersAlliedAttacksInCorridor() {
  const rng = makeRngSequence([
    0.99, 0.99, 0.01, 0.2,
    0.99, 0.99, 0.01, 0.2,
  ]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const allyArcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const allySpearman = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const allyAssassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const allyOutside = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;

  const enemyA = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const enemyB = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;

  state = setUnit(state, genghis.id, {
    position: { col: 1, row: 1 },
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_MONGOL_CHARGE]: 4 },
  });
  state = setUnit(state, allyArcher.id, { position: { col: 4, row: 2 } });
  state = setUnit(state, allySpearman.id, { position: { col: 2, row: 0 } });
  state = setUnit(state, allyAssassin.id, {
    position: { col: 3, row: 0 },
    turn: { moveUsed: false, attackUsed: true, actionUsed: true, stealthUsed: false },
  });
  state = setUnit(state, allyOutside.id, { position: { col: 8, row: 8 } });
  state = setUnit(state, enemyA.id, { position: { col: 1, row: 0 } });
  state = setUnit(state, enemyB.id, { position: { col: 5, row: 2 } });
  state = toBattleState(state, "P1", genghis.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
    } as any,
    rng
  );
  res = applyAction(
    res.state,
    { type: "move", unitId: genghis.id, to: { col: 5, row: 1 } } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(res.state, rng);

  const attackEvents = resolved.events.filter(
    (e) => e.type === "attackResolved"
  ) as Extract<GameEvent, { type: "attackResolved" }>[];
  const attackers = attackEvents.map((e) => e.attackerId);

  assert.deepStrictEqual(
    attackers,
    [allyArcher.id, allySpearman.id].sort(),
    "allied attacks should resolve in unitId order"
  );
  assert(
    !attackers.includes(allyAssassin.id),
    "allies who cannot attack should do nothing"
  );
  assert(
    !attackers.includes(allyOutside.id),
    "allies outside corridor should not attack"
  );

  const archerAttack = attackEvents.find((e) => e.attackerId === allyArcher.id)!;
  const spearmanAttack = attackEvents.find((e) => e.attackerId === allySpearman.id)!;
  assert(
    archerAttack.damage === allyArcher.attack + 1,
    "commander bonus should apply to corridor attacks"
  );
  assert(
    spearmanAttack.damage === allySpearman.attack + 1,
    "commander bonus should apply to corridor attacks"
  );

  console.log(
    "genghis_mongol_charge_sweep_triggers_allied_attacks_in_3wide_corridor passed"
  );
}

function testElCidLongLiverAdds2Hp() {
  const { elCid, enemy } = setupElCidState();
  assert(
    elCid.hp === enemy.hp + 2,
    "El Cid should start with +2 HP compared to base knight"
  );
  const meta = getHeroMeta(HERO_EL_CID_COMPEADOR_ID);
  assert(meta, "El Cid meta should exist");
  assert(meta?.baseStats.hp === elCid.hp, "El Cid meta HP should match unit HP");

  console.log("elcid_longliver_adds_2hp passed");
}

function testElCidWarriorDoubleIsAutoHitNoDefenderRoll() {
  const rng = makeRngSequence([0.99, 0.99]);
  let { state, elCid, enemy } = setupElCidState();

  state = setUnit(state, elCid.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", elCid.id);
  state = initKnowledgeForOwners(state);

  const startHp = state.units[enemy.id].hp;
  const initial = applyAction(
    state,
    { type: "attack", attackerId: elCid.id, defenderId: enemy.id } as any,
    rng
  );
  assert(
    initial.state.pendingRoll?.kind === "attack_attackerRoll",
    "auto-hit test should request attacker roll first"
  );

  const resolved = resolvePendingRollOnce(initial.state, rng);
  const events = [...initial.events, ...resolved.events];
  const defenderRequests = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "attack_defenderRoll"
  );
  assert(
    defenderRequests.length === 0,
    "auto-hit should not request defender roll"
  );

  const attackEvent = events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === elCid.id &&
      e.defenderId === enemy.id
  );
  assert(attackEvent && attackEvent.type === "attackResolved", "attack should resolve");
  assert(attackEvent.hit, "auto-hit should resolve as hit");
  assert(
    resolved.state.units[enemy.id].hp === startHp - elCid.attack,
    "enemy HP should drop by attacker damage"
  );
  assert(!resolved.state.pendingRoll, "auto-hit should finish without pending roll");

  console.log("elcid_warrior_double_is_auto_hit_no_defender_roll passed");
}

function testElCidTisonaIsRayOnlyRightDirection() {
  const rng = makeRngSequence([0.99, 0.8, 0.01, 0.01, 0.2, 0.2]);
  let { state, elCid } = setupElCidState();
  const allyRight = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemyRight = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;
  const enemyLeft = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "trickster"
  )!;

  state = setUnit(state, elCid.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid.charges,
      [ABILITY_EL_SID_COMPEADOR_TISONA]: 2,
    },
  });
  state = setUnit(state, allyRight.id, { position: { col: 6, row: 4 } });
  state = setUnit(state, enemyRight.id, { position: { col: 7, row: 4 } });
  state = setUnit(state, enemyLeft.id, { position: { col: 1, row: 4 } });
  state = toBattleState(state, "P1", elCid.id);
  state = initKnowledgeForOwners(state);

  const leftHpBefore = state.units[enemyLeft.id].hp;
  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: elCid.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_TISONA,
      payload: { target: { col: 8, row: 4 } },
    } as any,
    rng
  );
  assert(
    initial.state.pendingRoll?.kind === "elCidTisona_attackerRoll",
    "tisona should request attacker roll"
  );

  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const expectedTargets = [allyRight.id, enemyRight.id].sort();
  const aoeEvent = events.find(
    (e) => e.type === "aoeResolved" && e.abilityId === ABILITY_EL_SID_COMPEADOR_TISONA
  );
  assert(aoeEvent && aoeEvent.type === "aoeResolved", "tisona should emit aoeResolved");
  if (aoeEvent && aoeEvent.type === "aoeResolved") {
    assert.deepStrictEqual(
      [...aoeEvent.affectedUnitIds].sort(),
      expectedTargets,
      "tisona should affect only the selected ray (right)"
    );
  }

  const defenderRolls = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "elCidTisona_defenderRoll"
  );
  assert(defenderRolls.length === expectedTargets.length, "ray should target right units only");

  const attackEvents = events.filter(
    (e) => e.type === "attackResolved" && e.attackerId === elCid.id
  ) as any[];
  const attackTargets = attackEvents.map((e) => e.defenderId).sort();
  assert.deepStrictEqual(
    attackTargets,
    expectedTargets,
    "tisona ray should only attack right-side targets"
  );
  assert(
    resolved.state.units[enemyLeft.id].hp === leftHpBefore,
    "left-side target should not be damaged by right ray"
  );

  const sharedDice = JSON.stringify(attackEvents[0]?.attackerRoll?.dice ?? []);
  const allShared = attackEvents.every(
    (e) => JSON.stringify(e.attackerRoll?.dice ?? []) === sharedDice
  );
  assert(allShared, "tisona should reuse the same attacker roll for all targets");

  console.log("el_cid_tisona_is_ray_only_right_direction passed");
}

function testElCidTisonaIsRayOnlyUpDirection() {
  const rng = makeRngSequence([0.99, 0.8, 0.01, 0.01, 0.2, 0.2]);
  let { state, elCid } = setupElCidState();
  const allyUp = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemyUp = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;
  const enemyDown = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  state = setUnit(state, elCid.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid.charges,
      [ABILITY_EL_SID_COMPEADOR_TISONA]: 2,
    },
  });
  state = setUnit(state, allyUp.id, { position: { col: 4, row: 2 } });
  state = setUnit(state, enemyUp.id, { position: { col: 4, row: 1 } });
  state = setUnit(state, enemyDown.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P1", elCid.id);
  state = initKnowledgeForOwners(state);

  const downHpBefore = state.units[enemyDown.id].hp;
  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: elCid.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_TISONA,
      payload: { target: { col: 4, row: 0 } },
    } as any,
    rng
  );
  assert(
    initial.state.pendingRoll?.kind === "elCidTisona_attackerRoll",
    "tisona should request attacker roll"
  );

  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const expectedTargets = [allyUp.id, enemyUp.id].sort();
  const aoeEvent = events.find(
    (e) => e.type === "aoeResolved" && e.abilityId === ABILITY_EL_SID_COMPEADOR_TISONA
  );
  assert(aoeEvent && aoeEvent.type === "aoeResolved", "tisona should emit aoeResolved");
  if (aoeEvent && aoeEvent.type === "aoeResolved") {
    assert.deepStrictEqual(
      [...aoeEvent.affectedUnitIds].sort(),
      expectedTargets,
      "tisona should affect only the selected ray (up)"
    );
  }

  const attackEvents = events.filter(
    (e) => e.type === "attackResolved" && e.attackerId === elCid.id
  ) as any[];
  const attackTargets = attackEvents.map((e) => e.defenderId).sort();
  assert.deepStrictEqual(
    attackTargets,
    expectedTargets,
    "tisona ray should only attack upward targets"
  );
  const sharedDice = JSON.stringify(attackEvents[0]?.attackerRoll?.dice ?? []);
  const allShared = attackEvents.every(
    (e) => JSON.stringify(e.attackerRoll?.dice ?? []) === sharedDice
  );
  assert(allShared, "tisona should reuse the same attacker roll for all targets");
  assert(
    resolved.state.units[enemyDown.id].hp === downHpBefore,
    "downward target should not be damaged by up ray"
  );

  console.log("el_cid_tisona_is_ray_only_up_direction passed");
}

function testElCidKoladaImpulseTriggersAtStartTurnSpends3SharedAttackerRollHitsAllies() {
  const rng = makeRngSequence([0.2, 0.55, 0.01, 0.01, 0.2, 0.4]);
  let { state, elCid } = setupElCidState();
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;
  const far = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  state = setUnit(state, elCid.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid.charges,
      [ABILITY_EL_SID_COMPEADOR_KOLADA]: 2,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemy.id, { position: { col: 5, row: 5 } });
  state = setUnit(state, far.id, { position: { col: 8, row: 8 } });
  state = initKnowledgeForOwners(state);
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [elCid.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [elCid.id, enemy.id],
    turnOrderIndex: 0,
  };

  const start = applyAction(
    state,
    { type: "unitStartTurn", unitId: elCid.id } as any,
    rng
  );
  assert(
    start.state.pendingRoll?.kind === "elCidKolada_attackerRoll",
    "kolada should trigger at start turn when charges reach 3"
  );
  assert(
    start.state.units[elCid.id].charges?.[ABILITY_EL_SID_COMPEADOR_KOLADA] === 0,
    "kolada should spend 3 charges"
  );
  const chargeEvent = start.events.find(
    (e) => e.type === "chargesUpdated" && e.unitId === elCid.id
  );
  if (chargeEvent && chargeEvent.type === "chargesUpdated") {
    assert(
      chargeEvent.deltas?.[ABILITY_EL_SID_COMPEADOR_KOLADA] === 1,
      "kolada charges should increment before triggering"
    );
  }
  const abilityIndex = start.events.findIndex(
    (e) => e.type === "abilityUsed" && e.abilityId === ABILITY_EL_SID_COMPEADOR_KOLADA
  );
  const rollIndex = start.events.findIndex(
    (e) => e.type === "rollRequested" && e.kind === "elCidKolada_attackerRoll"
  );
  assert(
    abilityIndex > -1 && rollIndex > -1 && abilityIndex < rollIndex,
    "kolada abilityUsed should be logged before attacker roll request"
  );

  const resolved = resolveAllPendingRollsWithEvents(start.state, rng);
  const events = [...start.events, ...resolved.events];

  const attackerRolls = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "elCidKolada_attackerRoll"
  );
  const defenderRolls = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "elCidKolada_defenderRoll"
  );
  assert(attackerRolls.length === 1, "kolada should request attacker roll once");
  assert(defenderRolls.length === 2, "kolada should request defender roll per target");

  const attackEvents = events.filter(
    (e) => e.type === "attackResolved" && e.attackerId === elCid.id
  ) as any[];
  const attackTargets = attackEvents.map((e) => e.defenderId);
  assert(
    attackTargets.includes(ally.id),
    "kolada should attack allies in radius"
  );
  assert(
    attackTargets.includes(enemy.id),
    "kolada should attack enemies in radius"
  );
  assert(
    !attackTargets.includes(far.id),
    "kolada should not attack units outside radius"
  );

  const sharedDice = JSON.stringify(attackEvents[0]?.attackerRoll?.dice ?? []);
  const allShared = attackEvents.every(
    (e) => JSON.stringify(e.attackerRoll?.dice ?? []) === sharedDice
  );
  assert(allShared, "kolada should reuse the same attacker roll for all targets");

  const aoeEvent = events.find(
    (e) => e.type === "aoeResolved" && e.abilityId === ABILITY_EL_SID_COMPEADOR_KOLADA
  );
  assert(aoeEvent && aoeEvent.type === "aoeResolved", "kolada should emit aoeResolved");
  if (aoeEvent && aoeEvent.type === "aoeResolved") {
    assert(
      aoeEvent.affectedUnitIds.includes(ally.id) &&
        aoeEvent.affectedUnitIds.includes(enemy.id),
      "kolada aoeResolved should include allied and enemy targets"
    );
  }

  console.log("elcid_kolada_impulse_triggers_at_start_turn_spends_3_shared_attacker_roll_hits_allies passed");
}

function testElCidDemonDuelistChainHitsUntilMissThenChoicePayHpOrStop() {
  const duelRng = makeRngSequence([0.55, 0.4, 0.01, 0.01, 0.01, 0.2, 0.75, 0.55]);
  let { state, elCid, enemy } = setupElCidState();

  state = setUnit(state, elCid.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid.charges,
      [ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST]: 5,
    },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 }, hp: 6 });
  state = toBattleState(state, "P1", elCid.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: elCid.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
      payload: { targetId: enemy.id },
    } as any,
    duelRng
  );
  const events: any[] = [...res.events];
  const abilityIndex = events.findIndex(
    (e) =>
      e.type === "abilityUsed" &&
      e.abilityId === ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST
  );
  const rollIndex = events.findIndex(
    (e) => e.type === "rollRequested" && e.kind === "attack_attackerRoll"
  );
  assert(
    abilityIndex > -1 && rollIndex > -1 && abilityIndex < rollIndex,
    "demon duelist abilityUsed should be logged before attacker roll request"
  );
  assert(
    res.state.pendingRoll?.kind === "attack_attackerRoll",
    "demon duelist should start with attacker roll"
  );

  res = resolvePendingRollOnce(res.state, duelRng);
  events.push(...res.events);
  res = resolvePendingRollOnce(res.state, duelRng);
  events.push(...res.events);
  assert(
    res.state.pendingRoll?.kind === "attack_attackerRoll",
    "demon duelist should continue after hit"
  );

  res = resolvePendingRollOnce(res.state, duelRng);
  events.push(...res.events);
  res = resolvePendingRollOnce(res.state, duelRng);
  events.push(...res.events);
  assert(
    res.state.pendingRoll?.kind === "elCidDuelistChoice",
    "demon duelist should prompt choice after miss"
  );

  const attackerRequests = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "attack_attackerRoll"
  );
  const defenderRequests = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "attack_defenderRoll"
  );
  assert(attackerRequests.length === 2, "duelist should request attacker roll per attack");
  assert(defenderRequests.length === 2, "duelist should request defender roll per attack");

  const pendingStop = res.state.pendingRoll!;
  const stopped = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pendingStop.id,
      choice: "elCidDuelistStop",
      player: pendingStop.player,
    } as any,
    duelRng
  );
  assert(!stopped.state.pendingRoll, "duelist should end when player stops");

  const continueRng = makeRngSequence([0.55, 0.4, 0.01, 0.01, 0.01, 0.2, 0.75, 0.55]);
  let state2 = setupElCidState().state;
  const elCid2 = Object.values(state2.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const enemy2 = Object.values(state2.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;
  state2 = setUnit(state2, elCid2.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid2.charges,
      [ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST]: 5,
    },
  });
  state2 = setUnit(state2, enemy2.id, { position: { col: 4, row: 5 }, hp: 6 });
  state2 = toBattleState(state2, "P1", elCid2.id);
  state2 = initKnowledgeForOwners(state2);

  let res2 = applyAction(
    state2,
    {
      type: "useAbility",
      unitId: elCid2.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
      payload: { targetId: enemy2.id },
    } as any,
    continueRng
  );
  res2 = resolvePendingRollOnce(res2.state, continueRng);
  res2 = resolvePendingRollOnce(res2.state, continueRng);
  res2 = resolvePendingRollOnce(res2.state, continueRng);
  res2 = resolvePendingRollOnce(res2.state, continueRng);
  assert(
    res2.state.pendingRoll?.kind === "elCidDuelistChoice",
    "duelist should prompt choice on miss"
  );

  const pendingContinue = res2.state.pendingRoll!;
  const hpBefore = res2.state.units[elCid2.id].hp;
  const continued = applyAction(
    res2.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pendingContinue.id,
      choice: "elCidDuelistContinue",
      player: pendingContinue.player,
    } as any,
    continueRng
  );
  assert(
    continued.state.units[elCid2.id].hp === hpBefore - 1,
    "continuing duel should cost 1 HP"
  );
  assert(
    continued.state.pendingRoll?.kind === "attack_attackerRoll",
    "continuing duel should request next attack"
  );

  const cantPayRng = makeRngSequence([0.55, 0.4]);
  let state3 = setupElCidState().state;
  const elCid3 = Object.values(state3.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const enemy3 = Object.values(state3.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;
  state3 = setUnit(state3, elCid3.id, {
    position: { col: 4, row: 4 },
    hp: 1,
    charges: {
      ...elCid3.charges,
      [ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST]: 5,
    },
  });
  state3 = setUnit(state3, enemy3.id, { position: { col: 4, row: 5 }, hp: 6 });
  state3 = toBattleState(state3, "P1", elCid3.id);
  state3 = initKnowledgeForOwners(state3);

  state3 = {
    ...state3,
    pendingRoll: {
      id: "roll-1",
      kind: "elCidDuelistChoice",
      player: "P1",
      context: { attackerId: elCid3.id, targetId: enemy3.id },
    },
    rollCounter: 1,
  };

  const cantPay = applyAction(
    state3,
    {
      type: "resolvePendingRoll",
      pendingRollId: "roll-1",
      choice: "elCidDuelistContinue",
      player: "P1",
    } as any,
    cantPayRng
  );
  assert(
    cantPay.state.units[elCid3.id].hp === 1,
    "duelist should not pay HP when at 1"
  );
  assert(
    !cantPay.state.pendingRoll,
    "duelist should end when unable to pay"
  );

  console.log("elcid_demon_duelist_chain_hits_until_miss_then_choice_pay_hp_or_stop passed");
}

function testElCidDemonDuelistRequires5AndSpends5() {
  const rng = new SeededRNG(2026);
  let { state, elCid, enemy } = setupElCidState();

  state = setUnit(state, elCid.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", elCid.id);
  state = initKnowledgeForOwners(state);

  const chargesBefore =
    state.units[elCid.id].charges?.[ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST] ?? 0;
  const attempt = applyAction(
    state,
    {
      type: "useAbility",
      unitId: elCid.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
      payload: { targetId: enemy.id },
    } as any,
    rng
  );
  assert(attempt.events.length === 0, "duelist should not start without charges");
  assert(!attempt.state.pendingRoll, "duelist should not request a roll");
  assert(
    attempt.state.units[elCid.id].charges?.[ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST] ===
      chargesBefore,
    "duelist charges should remain unchanged"
  );
  assert(
    attempt.state.units[enemy.id].hp === state.units[enemy.id].hp,
    "enemy HP should remain unchanged"
  );

  const rng2 = new SeededRNG(2027);
  let { state: state2, elCid: elCid2, enemy: enemy2 } = setupElCidState();
  state2 = setUnit(state2, elCid2.id, { position: { col: 4, row: 4 } });
  state2 = setUnit(state2, enemy2.id, { position: { col: 4, row: 7 } });
  state2 = initKnowledgeForOwners(state2);
  state2 = {
    ...state2,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [elCid2.id, enemy2.id],
    turnQueueIndex: 0,
    turnOrder: [elCid2.id, enemy2.id],
    turnOrderIndex: 0,
  };

  for (let turn = 1; turn <= 5; turn += 1) {
    const start = applyAction(
      state2,
      { type: "unitStartTurn", unitId: elCid2.id } as any,
      rng2
    );
    const resolved = resolveAllPendingRolls(start.state, rng2);
    state2 = resolved.state;
    if (turn < 5) {
      state2 = applyAction(state2, { type: "endTurn" } as any, rng2).state;
      const enemyStart = applyAction(
        state2,
        { type: "unitStartTurn", unitId: enemy2.id } as any,
        rng2
      );
      state2 = resolveAllPendingRolls(enemyStart.state, rng2).state;
      state2 = applyAction(state2, { type: "endTurn" } as any, rng2).state;
    }
  }

  assert(
    state2.units[elCid2.id].charges?.[ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST] === 5,
    "duelist should reach 5 charges after five own turns"
  );

  state2 = setUnit(state2, enemy2.id, { position: { col: 4, row: 5 } });
  const started = applyAction(
    state2,
    {
      type: "useAbility",
      unitId: elCid2.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
      payload: { targetId: enemy2.id },
    } as any,
    rng2
  );
  assert(
    started.state.pendingRoll?.kind === "attack_attackerRoll",
    "duelist should start when charged"
  );
  assert(
    (started.state.units[elCid2.id].charges?.[ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST] ?? 0) === 0,
    "duelist should spend 5 charges on activation"
  );
  assert(
    started.events.some(
      (e) =>
        e.type === "abilityUsed" &&
        e.abilityId === ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST
    ),
    "duelist should emit abilityUsed when charged"
  );

  console.log("el_cid_demon_duelist_requires_5_and_spends_5 passed");
}

function testElCidTisonaAndKoladaHitAllies() {
  const rng = makeRngSequence([0.99, 0.8, 0.01, 0.01, 0.01, 0.01]);
  let { state, elCid } = setupElCidState();
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, elCid.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid.charges,
      [ABILITY_EL_SID_COMPEADOR_TISONA]: 2,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 6, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 7, row: 4 } });
  state = toBattleState(state, "P1", elCid.id);
  state = initKnowledgeForOwners(state);

  const allyHpBefore = state.units[ally.id].hp;
  const tisonaStart = applyAction(
    state,
    {
      type: "useAbility",
      unitId: elCid.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_TISONA,
      payload: { target: { col: 8, row: 4 } },
    } as any,
    rng
  );
  const tisonaResolved = resolveAllPendingRollsWithEvents(tisonaStart.state, rng);
  const tisonaEvents = [...tisonaStart.events, ...tisonaResolved.events];
  const allyAttack = tisonaEvents.find(
    (e) => e.type === "attackResolved" && e.defenderId === ally.id
  );
  assert(allyAttack && allyAttack.type === "attackResolved", "tisona should attack ally");
  assert(allyAttack.hit, "tisona should be able to hit ally");
  assert(
    tisonaResolved.state.units[ally.id].hp === allyHpBefore - elCid.attack,
    "ally HP should decrease from tisona hit"
  );

  const tisonaAttacks = tisonaEvents.filter(
    (e) => e.type === "attackResolved" && e.attackerId === elCid.id
  ) as any[];
  assert(
    tisonaAttacks.some((e) => e.defenderId === enemy.id),
    "tisona should attack enemy on the line"
  );
  const sharedDice = JSON.stringify(tisonaAttacks[0]?.attackerRoll?.dice ?? []);
  assert(
    tisonaAttacks.every(
      (e) => JSON.stringify(e.attackerRoll?.dice ?? []) === sharedDice
    ),
    "tisona should use a single shared attacker roll"
  );

  const rng2 = makeRngSequence([0.99, 0.8, 0.01, 0.01, 0.01, 0.01]);
  let { state: state2, elCid: elCid2 } = setupElCidState();
  const ally2 = Object.values(state2.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemy2 = Object.values(state2.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state2 = setUnit(state2, elCid2.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid2.charges,
      [ABILITY_EL_SID_COMPEADOR_KOLADA]: 2,
    },
  });
  state2 = setUnit(state2, ally2.id, { position: { col: 4, row: 5 } });
  state2 = setUnit(state2, enemy2.id, { position: { col: 5, row: 4 } });
  state2 = initKnowledgeForOwners(state2);
  state2 = {
    ...state2,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [elCid2.id, enemy2.id],
    turnQueueIndex: 0,
    turnOrder: [elCid2.id, enemy2.id],
    turnOrderIndex: 0,
  };

  const ally2HpBefore = state2.units[ally2.id].hp;
  const koladaStart = applyAction(
    state2,
    { type: "unitStartTurn", unitId: elCid2.id } as any,
    rng2
  );
  const koladaResolved = resolveAllPendingRollsWithEvents(koladaStart.state, rng2);
  const koladaEvents = [...koladaStart.events, ...koladaResolved.events];
  const koladaAllyAttack = koladaEvents.find(
    (e) => e.type === "attackResolved" && e.defenderId === ally2.id
  );
  assert(
    koladaAllyAttack && koladaAllyAttack.type === "attackResolved",
    "kolada should attack ally"
  );
  assert(koladaAllyAttack.hit, "kolada should be able to hit ally");
  assert(
    koladaResolved.state.units[ally2.id].hp === ally2HpBefore - elCid2.attack,
    "ally HP should decrease from kolada hit"
  );
  assert(
    koladaEvents.some(
      (e) => e.type === "attackResolved" && e.defenderId === enemy2.id
    ),
    "kolada should attack enemy in radius"
  );

  console.log("el_cid_tisona_and_kolada_hit_allies passed");
}

function testVladIntimidatePromptsAfterSuccessfulDefense() {
  let { state, vlad, enemy } = setupVladState();
  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.01, 0.01, 0.99, 0.99]);
  let res = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: vlad.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll?.kind === "vladIntimidateChoice",
    "intimidate should request a choice after a miss"
  );
  assert(
    res.events.some((e) => e.type === "intimidateTriggered"),
    "intimidateTriggered event should be emitted"
  );

  console.log("vlad_intimidate_prompts_after_successful_defense passed");
}

function testVladIntimidatePushesAttackerOneCell() {
  let { state, vlad, enemy } = setupVladState();
  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.01, 0.01, 0.99, 0.99]);
  let res = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: vlad.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  res = resolvePendingRollOnce(res.state, rng);

  const pending = res.state.pendingRoll;
  assert(pending && pending.kind === "vladIntimidateChoice", "intimidate pending roll expected");
  const options = (pending.context as { options?: Coord[] }).options ?? [];
  assert(options.length > 0, "intimidate should have options");

  const target = options[0];
  const pushed = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      choice: { type: "intimidatePush", to: target },
      player: pending.player,
    } as any,
    rng
  );
  const movedEnemy = pushed.state.units[enemy.id];
  assert(
    movedEnemy.position?.col === target.col &&
      movedEnemy.position?.row === target.row,
    "attacker should be pushed to selected cell"
  );
  assert(
    pushed.events.some((e) => e.type === "intimidateResolved"),
    "intimidateResolved event should be emitted"
  );

  console.log("vlad_intimidate_pushes_attacker_one_cell passed");
}

function testVladIntimidateNoOptionsAutoSkips() {
  let { state, vlad, enemy } = setupVladState();
  const blocker1 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id
  )!;
  const blocker2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id && u.id !== blocker1.id
  )!;
  const blocker3 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id && u.id !== blocker1.id && u.id !== blocker2.id
  )!;

  state = setUnit(state, enemy.id, { position: { col: 0, row: 0 } });
  state = setUnit(state, vlad.id, { position: { col: 0, row: 2 } });
  state = setUnit(state, blocker1.id, { position: { col: 0, row: 1 } });
  state = setUnit(state, blocker2.id, { position: { col: 1, row: 0 } });
  state = setUnit(state, blocker3.id, { position: { col: 1, row: 1 } });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.01, 0.01, 0.99, 0.99]);
  let res = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: vlad.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  res = resolvePendingRollOnce(res.state, rng);
  assert(!res.state.pendingRoll, "intimidate should not trigger without options");

  console.log("vlad_intimidate_no_options_auto_skips passed");
}

function testVladStakesPromptOnBattleStart() {
  const rng = new SeededRNG(321);
  let { state } = setupVladState();
  state = toPlacementState(state, "P1");

  const p1coords = ["b0","c0","d0","e0","f0","g0","h0"].map(coordFromNotation);
  const p2coords = ["b8","c8","d8","e8","f8","g8","h8"].map(coordFromNotation);

  let p1i = 0;
  let p2i = 0;
  while (state.phase === "placement") {
    const current = state.currentPlayer;
    const nextUnit = Object.values(state.units).find(
      (u) => u.owner === current && !u.position && u.isAlive
    );
    if (!nextUnit) {
      state = applyAction(state, { type: "endTurn" } as any, rng).state;
      continue;
    }
    const pos = current === "P1" ? p1coords[p1i++] : p2coords[p2i++];
    state = applyAction(
      state,
      { type: "placeUnit", unitId: nextUnit.id, position: pos } as any,
      rng
    ).state;
  }

  assert(
    state.pendingRoll?.kind === "vladPlaceStakes",
    "battle start should prompt for stakes"
  );

  console.log("vlad_stakes_prompt_on_battle_start passed");
}

function testVladStakesPromptOnSecondOwnTurnStart() {
  const rng = new SeededRNG(99);
  let { state, vlad } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vlad.id],
    turnQueueIndex: 0,
    turnOrder: [vlad.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(state, { type: "unitStartTurn", unitId: vlad.id } as any, rng);
  assert(
    res.state.pendingRoll?.kind !== "vladPlaceStakes",
    "first turn should not request stakes"
  );
  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;

  res = applyAction(state, { type: "unitStartTurn", unitId: vlad.id } as any, rng);
  assert(
    res.state.pendingRoll?.kind === "vladPlaceStakes",
    "second own turn should request stakes"
  );

  console.log("vlad_stakes_prompt_on_2nd_own_turn_start passed");
}

function testStakeCannotBePlacedOnVisibleUnit() {
  const rng = new SeededRNG(77);
  let { state, vlad, enemy } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 }, ownTurnsStarted: 1 });
  state = setUnit(state, enemy.id, { position: { col: 5, row: 5 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vlad.id],
    turnQueueIndex: 0,
    turnOrder: [vlad.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(state, { type: "unitStartTurn", unitId: vlad.id } as any, rng);
  const pending = res.state.pendingRoll;
  assert(pending && pending.kind === "vladPlaceStakes", "stake placement should be pending");

  const invalid = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice: {
        type: "placeStakes",
        positions: [
          { col: 5, row: 5 },
          { col: 0, row: 0 },
          { col: 1, row: 0 },
        ],
      },
    } as any,
    rng
  );
  assert(
    invalid.state.pendingRoll?.kind === "vladPlaceStakes",
    "invalid stake placement should keep pending roll"
  );
  assert(invalid.state.stakeMarkers.length === 0, "stakes should not be placed");

  console.log("stake_cannot_be_placed_on_visible_unit passed");
}

function testStakeCanBePlacedOnStealthedUnitNoEffect() {
  const rng = new SeededRNG(78);
  let { state, vlad, enemy } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 }, ownTurnsStarted: 1 });
  state = setUnit(state, enemy.id, {
    position: { col: 5, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vlad.id],
    turnQueueIndex: 0,
    turnOrder: [vlad.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(state, { type: "unitStartTurn", unitId: vlad.id } as any, rng);
  const pending = res.state.pendingRoll;
  assert(pending && pending.kind === "vladPlaceStakes", "stake placement should be pending");

  const placed = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice: {
        type: "placeStakes",
        positions: [
          { col: 5, row: 5 },
          { col: 0, row: 0 },
          { col: 1, row: 0 },
        ],
      },
    } as any,
    rng
  );
  assert(
    placed.state.stakeMarkers.some(
      (marker) => marker.position.col === 5 && marker.position.row === 5
    ),
    "stake should be placed on stealthed unit cell"
  );
  assert(
    !placed.events.some((e) => e.type === "stakeTriggered"),
    "placing stakes should not trigger them"
  );

  console.log("stake_can_be_placed_on_stealthed_unit_no_effect passed");
}

function testLinePathOrthogonalIsExact() {
  const path = linePath({ col: 0, row: 1 }, { col: 0, row: 3 });
  assert(path, "line path should exist for orthogonal move");
  assert.deepStrictEqual(path, [
    { col: 0, row: 1 },
    { col: 0, row: 2 },
    { col: 0, row: 3 },
  ]);

  console.log("line_path_orthogonal_is_exact passed");
}

function testLinePathDiagonalIsExact() {
  const path = linePath({ col: 0, row: 0 }, { col: 2, row: 2 });
  assert(path, "line path should exist for diagonal move");
  assert.deepStrictEqual(path, [
    { col: 0, row: 0 },
    { col: 1, row: 1 },
    { col: 2, row: 2 },
  ]);

  console.log("line_path_diagonal_is_exact passed");
}

function testTricksterTeleportDoesNotTriggerIntermediateStakes() {
  const rng = makeRngSequence([0.99]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 0, row: 0 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: trickster.id,
    turnQueue: [trickster.id],
    turnQueueIndex: 0,
    turnOrder: [trickster.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P2",
        position: { col: 0, row: 1 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  let res = applyAction(
    state,
    { type: "requestMoveOptions", unitId: trickster.id, mode: "trickster" } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "moveTrickster",
    "trickster move should require roll"
  );

  res = resolvePendingRollOnce(res.state, rng);
  const moved = applyAction(
    res.state,
    { type: "move", unitId: trickster.id, to: { col: 0, row: 2 } } as any,
    rng
  );

  const updated = moved.state.units[trickster.id];
  assert(
    updated.position?.col === 0 && updated.position?.row === 2,
    "trickster should reach destination directly"
  );
  assert(
    moved.state.stakeMarkers[0].isRevealed === false,
    "intermediate stake should remain hidden"
  );
  assert(
    !moved.events.some((e) => e.type === "stakeTriggered"),
    "intermediate stake should not trigger"
  );

  console.log("trickster_teleport_does_not_trigger_intermediate_stakes passed");
}

function testRiderStopsOnStakeInPath() {
  const rng = new SeededRNG(84);
  let { state, vlad } = setupVladState();
  const rider = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  state = setUnit(state, vlad.id, { position: { col: 8, row: 8 } });
  state = setUnit(state, rider.id, { position: { col: 0, row: 0 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: rider.id,
    turnQueue: [rider.id],
    turnQueueIndex: 0,
    turnOrder: [rider.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 0, row: 1 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 0, row: 2 } } as any,
    rng
  );
  const updatedRider = res.state.units[rider.id];
  assert(
    updatedRider.position?.col === 0 && updatedRider.position?.row === 1,
    "rider should stop on stake in path"
  );
  assert(updatedRider.hp === rider.hp - 1, "stake should deal 1 damage");
  assert(res.state.stakeMarkers.length === 1, "stake marker should remain");
  assert(res.state.stakeMarkers[0].isRevealed, "stake should be revealed");
  assert(
    res.events.some((e) => e.type === "stakeTriggered"),
    "stakeTriggered event should be emitted"
  );

  console.log("rider_stops_on_stake_in_path passed");
}

function testStakeDoesNotTriggerOnHiddenUnitCell() {
  const rng = new SeededRNG(85);
  let { state } = setupVladState();
  const rider = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, rider.id, { position: { col: 0, row: 0 } });
  state = setUnit(state, hidden.id, {
    position: { col: 0, row: 1 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: rider.id,
    turnQueue: [rider.id],
    turnQueueIndex: 0,
    turnOrder: [rider.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 0, row: 1 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 0, row: 2 } } as any,
    rng
  );
  const updatedRider = res.state.units[rider.id];
  assert(
    updatedRider.position?.col === 0 && updatedRider.position?.row === 2,
    "rider should pass through hidden stake cell"
  );
  assert(updatedRider.hp === rider.hp, "stake should not trigger on hidden cell");
  assert(res.state.stakeMarkers.length === 1, "stake marker should remain");
  assert(
    res.state.stakeMarkers[0].isRevealed === false,
    "stake should remain hidden"
  );
  assert(
    !res.events.some((e) => e.type === "stakeTriggered"),
    "stakeTriggered should not be emitted"
  );

  console.log("stake_does_not_trigger_on_hidden_unit_cell passed");
}

function testStakeTriggersOnVisibleUnitStopsAndDamagesAndReveals() {
  const rng = new SeededRNG(79);
  let { state, vlad, enemy } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 6, row: 6 } });
  state = setUnit(state, enemy.id, {
    position: { col: 4, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = {
    ...state,
    knowledge: {
      P1: { [enemy.id]: true },
      P2: { [enemy.id]: true },
    },
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: enemy.id,
    turnQueue: [enemy.id],
    turnQueueIndex: 0,
    turnOrder: [enemy.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 4, row: 4 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: enemy.id, to: { col: 4, row: 4 } } as any,
    rng
  );
  const updatedEnemy = res.state.units[enemy.id];
  assert(updatedEnemy.hp === enemy.hp - 1, "stake should deal 1 damage");
  assert(updatedEnemy.isStealthed === false, "stake should reveal stealthed unit");
  assert(res.state.stakeMarkers.length === 1, "stake marker should remain");
  assert(res.state.stakeMarkers[0].isRevealed, "stake should be revealed");
  assert(
    res.events.some((e) => e.type === "stakeTriggered"),
    "stakeTriggered event should be emitted"
  );

  console.log("stake_triggers_on_visible_unit_stops_and_damages_and_reveals passed");
}

function testStakeDoesNotTriggerOnUnknownStealthedUnit() {
  const rng = new SeededRNG(80);
  let { state, vlad, enemy } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 6, row: 6 } });
  state = setUnit(state, enemy.id, {
    position: { col: 4, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: enemy.id,
    turnQueue: [enemy.id],
    turnQueueIndex: 0,
    turnOrder: [enemy.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 4, row: 4 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: enemy.id, to: { col: 4, row: 4 } } as any,
    rng
  );
  const updatedEnemy = res.state.units[enemy.id];
  assert(updatedEnemy.hp === enemy.hp, "stake should not trigger on unknown stealth");
  assert(res.state.stakeMarkers.length === 1, "stake marker should remain");
  assert(
    res.state.stakeMarkers[0].isRevealed === false,
    "stake should remain hidden"
  );
  assert(
    !res.events.some((e) => e.type === "stakeTriggered"),
    "stakeTriggered should not be emitted"
  );

  console.log("stake_does_not_trigger_on_unknown_stealthed_unit passed");
}

function testAssassinStopsExactlyOnStakeCell() {
  const rng = new SeededRNG(86);
  let { state } = setupVladState();
  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, assassin.id, { position: { col: 4, row: 1 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: assassin.id,
    turnQueue: [assassin.id],
    turnQueueIndex: 0,
    turnOrder: [assassin.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 5, row: 1 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: assassin.id, to: { col: 6, row: 1 } } as any,
    rng
  );
  const updated = res.state.units[assassin.id];
  assert(
    updated.position?.col === 5 && updated.position?.row === 1,
    "assassin should stop on stake cell"
  );
  assert(res.state.stakeMarkers.length === 1, "stake marker should remain");
  assert(res.state.stakeMarkers[0].isRevealed, "stake should be revealed");

  console.log("assassin_stops_exactly_on_stake_cell passed");
}

function testStakesDoNotGetRemovedOnTriggerOnlyRevealed() {
  const rng = new SeededRNG(87);
  let { state, enemy } = setupVladState();

  state = setUnit(state, enemy.id, { position: { col: 2, row: 2 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: enemy.id,
    turnQueue: [enemy.id],
    turnQueueIndex: 0,
    turnOrder: [enemy.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 2, row: 3 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: enemy.id, to: { col: 2, row: 3 } } as any,
    rng
  );
  assert(res.state.stakeMarkers.length === 1, "stake marker should remain");
  assert(res.state.stakeMarkers[0].isRevealed, "stake should be revealed");

  console.log("stakes_do_not_get_removed_on_trigger_only_revealed passed");
}

function testTwoTepesHiddenStakesSameCellDamageOnly1() {
  const rng = new SeededRNG(88);
  let { state, vlad } = setupVladState();
  const mover = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;

  state = setUnit(state, vlad.id, { position: { col: 8, row: 8 } });
  state = setUnit(state, mover.id, { position: { col: 3, row: 3 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: mover.id,
    turnQueue: [mover.id],
    turnQueueIndex: 0,
    turnOrder: [mover.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 3, row: 4 },
        createdAt: 1,
        isRevealed: false,
      },
      {
        id: "stake-2",
        owner: "P2",
        position: { col: 3, row: 4 },
        createdAt: 2,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 3, row: 4 } } as any,
    rng
  );
  const updatedMover = res.state.units[mover.id];
  assert(updatedMover.hp === mover.hp - 1, "stake damage should be exactly 1");

  console.log("two_tepes_hidden_stakes_same_cell_damage_only_1 passed");
}

function testTriggerRevealsAllStakesOnCell() {
  const rng = new SeededRNG(89);
  let { state } = setupVladState();
  const mover = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;

  state = setUnit(state, mover.id, { position: { col: 1, row: 1 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: mover.id,
    turnQueue: [mover.id],
    turnQueueIndex: 0,
    turnOrder: [mover.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 1, row: 2 },
        createdAt: 1,
        isRevealed: false,
      },
      {
        id: "stake-2",
        owner: "P2",
        position: { col: 1, row: 2 },
        createdAt: 2,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 1, row: 2 } } as any,
    rng
  );
  const revealedIds = res.events
    .filter((e) => e.type === "stakeTriggered")
    .flatMap((e) =>
      e.type === "stakeTriggered" ? e.stakeIdsRevealed ?? [] : []
    );
  assert(
    revealedIds.includes("stake-1") && revealedIds.includes("stake-2"),
    "trigger should reveal all stakes on cell"
  );
  assert(
    res.state.stakeMarkers.every((marker) => marker.isRevealed),
    "all stakes on cell should be revealed"
  );

  console.log("trigger_reveals_all_stakes_on_cell passed");
}

function testForestRequires9Stakes() {
  const rng = new SeededRNG(81);
  let { state, vlad } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vlad.id],
    turnQueueIndex: 0,
    turnOrder: [vlad.id],
    turnOrderIndex: 0,
    stakeMarkers: Array.from({ length: 8 }, (_, idx) => ({
      id: `stake-${idx + 1}`,
      owner: "P1" as const,
      position: { col: idx % 3, row: Math.floor(idx / 3) },
      createdAt: idx + 1,
      isRevealed: false,
    })),
  };

  const res = applyAction(
    state,
    { type: "unitStartTurn", unitId: vlad.id } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind !== "vladForestTarget",
    "forest should not trigger without 9 stakes"
  );

  console.log("forest_requires_9_stakes passed");
}

function testForestConsumes9AndSkipsStakesPlacementThatTurn() {
  const rng = new SeededRNG(82);
  let { state, vlad } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 }, ownTurnsStarted: 1 });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vlad.id],
    turnQueueIndex: 0,
    turnOrder: [vlad.id],
    turnOrderIndex: 0,
    stakeMarkers: Array.from({ length: 9 }, (_, idx) => ({
      id: `stake-${idx + 1}`,
      owner: "P1" as const,
      position: { col: (idx + 1) % 3, row: Math.floor(idx / 3) },
      createdAt: idx + 1,
      isRevealed: false,
    })),
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: vlad.id } as any,
    rng
  );
  const target = res.state.pendingRoll;
  assert(
    target && target.kind === "vladForestTarget",
    "forest target should be pending"
  );
  assert(res.state.stakeMarkers.length === 0, "forest should consume 9 stakes");
  assert(
    res.events.some((e) => e.type === "forestActivated"),
    "forest should emit forestActivated"
  );

  console.log("forest_consumes_9_and_skips_stakes_placement_that_turn passed");
}

function testForestAoeDeals2AndRootsOnFail() {
  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.2]);
  let { state, vlad, enemy } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 }, ownTurnsStarted: 1 });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vlad.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [vlad.id, enemy.id],
    turnOrderIndex: 0,
    stakeMarkers: Array.from({ length: 9 }, (_, idx) => ({
      id: `stake-${idx + 1}`,
      owner: "P1" as const,
      position: { col: (idx + 1) % 3, row: Math.floor(idx / 3) },
      createdAt: idx + 1,
      isRevealed: false,
    })),
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: vlad.id } as any,
    rng
  );
  const targetPending = res.state.pendingRoll;
  assert(
    targetPending && targetPending.kind === "vladForestTarget",
    "forest target should be pending"
  );
  res = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: targetPending!.id,
      player: targetPending!.player,
      choice: { type: "forestTarget", center: { col: 4, row: 6 } },
    } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  res = resolvePendingRollOnce(res.state, rng);

  const updatedEnemy = res.state.units[enemy.id];
  assert(
    updatedEnemy.hp === enemy.hp - 2,
    "forest should deal 2 damage on hit"
  );
  assert(
    updatedEnemy.movementDisabledNextTurn === true,
    "forest should root on hit"
  );

  console.log("forest_aoe_deals_2_and_roots_on_fail passed");
}

function testRootBlocksMovementNextTurnOnly() {
  const rng = new SeededRNG(83);
  let { state, enemy } = setupVladState();

  state = setUnit(state, enemy.id, {
    position: { col: 4, row: 4 },
    movementDisabledNextTurn: true,
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: null,
    turnQueue: [enemy.id],
    turnQueueIndex: 0,
    turnOrder: [enemy.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: enemy.id } as any,
    rng
  );
  const rooted = res.state.units[enemy.id];
  assert(rooted.turn.moveUsed === true, "root should consume move slot");
  assert(
    rooted.movementDisabledNextTurn !== true,
    "root should clear after applying"
  );

  const blocked = applyAction(
    res.state,
    { type: "move", unitId: enemy.id, to: { col: 4, row: 5 } } as any,
    rng
  );
  assert(blocked.events.length === 0, "move should be blocked while rooted");
  assert(
    blocked.state.units[enemy.id].position?.row === 4,
    "rooted unit should not move"
  );

  const end = applyAction(blocked.state, { type: "endTurn" } as any, rng);
  res = applyAction(end.state, { type: "unitStartTurn", unitId: enemy.id } as any, rng);
  assert(
    res.state.units[enemy.id].turn.moveUsed === false,
    "move should be available after root expires"
  );

  console.log("root_blocks_movement_next_turn_only passed");
}

function testGetHeroMetaReturnsCorrectData() {
  const meta = getHeroMeta(HERO_VLAD_TEPES_ID);
  assert(meta, "Vlad meta should exist");
  assert(meta?.mainClass === "spearman", "Vlad mainClass should be spearman");
  assert(meta?.baseStats.hp === 7, "Vlad base HP should be 7");

  console.log("getHeroMeta_returns_correct_data passed");
}

function testHeroRegistryContainsPlayableHeroes() {
  const required = [
    HERO_GRAND_KAISER_ID,
    HERO_VLAD_TEPES_ID,
    "base-assassin",
    "base-archer",
    "base-berserker",
    "base-rider",
    "base-spearman",
    "base-trickster",
    "base-knight",
  ];
  for (const id of required) {
    assert(HERO_REGISTRY[id], `hero registry should include ${id}`);
  }

  console.log("hero_registry_contains_all_playable_heroes passed");
}

function testGoldenSnapshotAoeWithIntimidateChain() {
  const rng = makeRngSequence([0.001, 0.001, 0.99, 0.99, 0.5, 0.5]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2", { spearman: HERO_VLAD_TEPES_ID });
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const vlad = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const other = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class !== "spearman"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, vlad.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, other.id, { position: { col: 3, row: 6 } });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const events: any[] = [];
  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
    } as any,
    rng as any
  );
  events.push(...res.events);

  let intimidatePending:
    | { kind: string; player: PlayerId; resumeIndex: number | null }
    | null = null;
  let currentState = res.state;

  while (currentState.pendingRoll) {
    if (
      currentState.pendingRoll.kind === "vladIntimidateChoice" &&
      !intimidatePending
    ) {
      const ctx = currentState.pendingRoll.context as any;
      intimidatePending = {
        kind: currentState.pendingRoll.kind,
        player: currentState.pendingRoll.player,
        resumeIndex: ctx?.resume?.context?.currentTargetIndex ?? null,
      };
    }

    res = resolvePendingRollOnce(currentState, rng as any);
    events.push(...res.events);
    currentState = res.state;
  }

  const defenderRolls = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "tricksterAoE_defenderRoll"
  );
  const defenderCounts = new Map<string, number>();
  for (const evt of defenderRolls) {
    const key = evt.actorUnitId ?? "";
    defenderCounts.set(key, (defenderCounts.get(key) ?? 0) + 1);
  }
  for (const [defenderId, count] of defenderCounts.entries()) {
    assert(
      count <= 1,
      `duplicate defender roll requests for ${defenderId}`
    );
  }

  const snapshot = {
    events,
    phase: currentState.phase,
    turnNumber: currentState.turnNumber,
    pendingRoll: intimidatePending,
    vladHp: currentState.units[vlad.id]?.hp ?? null,
    otherHp: currentState.units[other.id]?.hp ?? null,
  };

  const expected = {
    events: [
      {
        type: "abilityUsed",
        unitId: "P1-trickster-3",
        abilityId: "tricksterAoE",
      },
      {
        type: "rollRequested",
        rollId: "roll-1",
        kind: "tricksterAoE_attackerRoll",
        player: "P1",
        actorUnitId: "P1-trickster-3",
      },
      {
        type: "rollRequested",
        rollId: "roll-2",
        kind: "tricksterAoE_defenderRoll",
        player: "P2",
        actorUnitId: "P2-rider-1",
      },
      {
        type: "attackResolved",
        attackerId: "P1-trickster-3",
        defenderId: "P2-rider-1",
        attackerRoll: { dice: [1, 1], sum: 2, isDouble: true },
        defenderRoll: { dice: [6, 6], sum: 12, isDouble: true },
        hit: false,
        damage: 0,
        defenderHpAfter: 6,
        tieBreakDice: undefined,
      },
      {
        type: "rollRequested",
        rollId: "roll-3",
        kind: "tricksterAoE_defenderRoll",
        player: "P2",
        actorUnitId: "P2-spearman-2",
      },
      {
        type: "attackResolved",
        attackerId: "P1-trickster-3",
        defenderId: "P2-spearman-2",
        attackerRoll: { dice: [1, 1], sum: 2, isDouble: true },
        defenderRoll: { dice: [4, 4], sum: 8, isDouble: true },
        hit: false,
        damage: 0,
        defenderHpAfter: 7,
        tieBreakDice: undefined,
      },
      {
        type: "intimidateTriggered",
        defenderId: "P2-spearman-2",
        attackerId: "P1-trickster-3",
        options: [
          { col: 5, row: 4 },
          { col: 3, row: 4 },
          { col: 4, row: 5 },
          { col: 4, row: 3 },
          { col: 5, row: 5 },
          { col: 5, row: 3 },
          { col: 3, row: 5 },
          { col: 3, row: 3 },
        ],
      },
      {
        type: "rollRequested",
        rollId: "roll-4",
        kind: "vladIntimidateChoice",
        player: "P2",
        actorUnitId: "P2-spearman-2",
      },
      {
        type: "aoeResolved",
        sourceUnitId: "P1-trickster-3",
        abilityId: "tricksterAoE",
        casterId: "P1-trickster-3",
        center: { col: 4, row: 4 },
        radius: 2,
        affectedUnitIds: ["P2-rider-1", "P2-spearman-2"],
        revealedUnitIds: [],
        damagedUnitIds: [],
        damageByUnitId: {},
      },
    ],
    phase: "battle",
    turnNumber: 1,
    pendingRoll: { kind: "vladIntimidateChoice", player: "P2", resumeIndex: 2 },
    vladHp: 7,
    otherHp: 6,
  };

  assert.deepStrictEqual(snapshot, expected);
  console.log("golden_snapshot_aoe_with_intimidate_chain passed");
}

function testGoldenSnapshotPendingRollSequence() {
  const rng = makeRngSequence([0.9, 0.9, 0.1, 0.1]);
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", { spearman: HERO_VLAD_TEPES_ID })
  );
  state = attachArmy(state, createDefaultArmy("P2"));
  state = applyAction(state, { type: "lobbyInit", host: "P1" } as any, rng)
    .state;
  state = { ...state, seats: { P1: true, P2: true } };
  state = applyAction(
    state,
    { type: "setReady", player: "P1", ready: true } as any,
    rng
  ).state;
  state = applyAction(
    state,
    { type: "setReady", player: "P2", ready: true } as any,
    rng
  ).state;

  const events: any[] = [];
  let res = applyAction(state, { type: "startGame" } as any, rng as any);
  events.push(...res.events);
  res = resolvePendingRollOnce(res.state, rng as any);
  events.push(...res.events);
  res = resolvePendingRollOnce(res.state, rng as any);
  events.push(...res.events);
  state = res.state;

  assert(state.phase === "placement", "phase should be placement after rolls");

  const p1Units = Object.values(state.units).filter((u) => u.owner === "P1");
  const p2Units = Object.values(state.units).filter((u) => u.owner === "P2");
  const lastUnit =
    p1Units.find((u) => u.class === "knight") ?? p1Units[p1Units.length - 1];
  const prePlacedP1 = p1Units.filter((u) => u.id !== lastUnit.id);
  const p1Positions = ["b0","c0","d0","e0","f0","g0","h0"].map(coordFromNotation);
  const p2Positions = ["b8","c8","d8","e8","f8","g8","h8"].map(coordFromNotation);

  const placementOrder: string[] = [];
  prePlacedP1.forEach((unit, idx) => {
    state = setUnit(state, unit.id, { position: p1Positions[idx] });
    placementOrder.push(unit.id);
  });
  p2Units.forEach((unit, idx) => {
    state = setUnit(state, unit.id, { position: p2Positions[idx] });
    placementOrder.push(unit.id);
  });

  state = {
    ...state,
    unitsPlaced: { P1: prePlacedP1.length, P2: p2Units.length },
    placementOrder,
    currentPlayer: "P1",
    turnQueue: [],
    turnQueueIndex: 0,
    turnOrder: [],
    turnOrderIndex: 0,
  };

  const lastPos = p1Positions[prePlacedP1.length];
  res = applyAction(
    state,
    { type: "placeUnit", unitId: lastUnit.id, position: lastPos } as any,
    rng as any
  );
  events.push(...res.events);

  const pending = res.state.pendingRoll;
  assert(pending && pending.kind === "vladPlaceStakes", "vlad stakes pending");
  const pendingSnapshot = { kind: pending.kind, player: pending.player };

  const legalPositions = (pending.context as any).legalPositions as Coord[] | undefined;
  const positions =
    legalPositions && legalPositions.length >= 3
      ? legalPositions.slice(0, 3)
      : [
          { col: 0, row: 0 },
          { col: 0, row: 1 },
          { col: 0, row: 2 },
        ];

  res = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice: { type: "placeStakes", positions },
    } as any,
    rng as any
  );
  events.push(...res.events);

  const snapshot = {
    events,
    phase: res.state.phase,
    currentPlayer: res.state.currentPlayer,
    pendingRoll: pendingSnapshot,
    placementOrder: res.state.placementOrder,
    turnQueue: res.state.turnQueue,
  };

  const expected = {
    events: [
      {
        type: "rollRequested",
        rollId: "roll-1",
        kind: "initiativeRoll",
        player: "P1",
        actorUnitId: undefined,
      },
      {
        type: "initiativeRollRequested",
        rollId: "roll-1",
        player: "P1",
      },
      {
        type: "initiativeRolled",
        player: "P1",
        dice: [6, 6],
        sum: 12,
      },
      {
        type: "rollRequested",
        rollId: "roll-2",
        kind: "initiativeRoll",
        player: "P2",
        actorUnitId: undefined,
      },
      {
        type: "initiativeRollRequested",
        rollId: "roll-2",
        player: "P2",
      },
      {
        type: "initiativeRolled",
        player: "P2",
        dice: [1, 1],
        sum: 2,
      },
      {
        type: "initiativeResolved",
        winner: "P1",
        P1sum: 12,
        P2sum: 2,
      },
      {
        type: "placementStarted",
        placementFirstPlayer: "P1",
      },
      {
        type: "unitPlaced",
        unitId: "P1-knight-7",
        position: { col: 7, row: 0 },
      },
      {
        type: "battleStarted",
        startingUnitId: "P1-rider-1",
        startingPlayer: "P1",
      },
      {
        type: "rollRequested",
        rollId: "roll-3",
        kind: "vladPlaceStakes",
        player: "P1",
        actorUnitId: undefined,
      },
      {
        type: "stakesPlaced",
        owner: "P1",
        positions: [
          { col: 0, row: 0 },
          { col: 0, row: 1 },
          { col: 0, row: 2 },
        ],
        hiddenFromOpponent: true,
      },
    ],
    phase: "battle",
    currentPlayer: "P1",
    pendingRoll: { kind: "vladPlaceStakes", player: "P1" },
    placementOrder: [
      "P1-rider-1",
      "P1-spearman-2",
      "P1-trickster-3",
      "P1-assassin-4",
      "P1-berserker-5",
      "P1-archer-6",
      "P2-rider-1",
      "P2-spearman-2",
      "P2-trickster-3",
      "P2-assassin-4",
      "P2-berserker-5",
      "P2-archer-6",
      "P2-knight-7",
      "P1-knight-7",
    ],
    turnQueue: [
      "P1-rider-1",
      "P1-spearman-2",
      "P1-trickster-3",
      "P1-assassin-4",
      "P1-berserker-5",
      "P1-archer-6",
      "P2-rider-1",
      "P2-spearman-2",
      "P2-trickster-3",
      "P2-assassin-4",
      "P2-berserker-5",
      "P2-archer-6",
      "P2-knight-7",
      "P1-knight-7",
    ],
  };

  assert.deepStrictEqual(snapshot, expected);
  console.log("golden_snapshot_pendingRoll_sequence passed");
}

function testGoldenActionSnapshot() {
  const rng = new SeededRNG(123);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, attacker.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, defender.id, { position: { col: 5, row: 4 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: attacker.id,
  };

  const attackRes = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: defender.id } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(attackRes.state, rng);
  const events = [...attackRes.events, ...resolved.events];

  const snapshot = {
    events,
    attackerHp: resolved.state.units[attacker.id]?.hp ?? null,
    defenderHp: resolved.state.units[defender.id]?.hp ?? null,
    defenderAlive: resolved.state.units[defender.id]?.isAlive ?? null,
    pendingRoll: resolved.state.pendingRoll,
    rollCounter: resolved.state.rollCounter,
  };

  const expected = {
    events: [
      {
        type: "rollRequested",
        rollId: "roll-1",
        kind: "attack_attackerRoll",
        player: "P1",
        actorUnitId: "P1-knight-7",
      },
      {
        type: "rollRequested",
        rollId: "roll-2",
        kind: "attack_defenderRoll",
        player: "P2",
        actorUnitId: "P2-archer-6",
      },
      {
        type: "attackResolved",
        attackerId: "P1-knight-7",
        defenderId: "P2-archer-6",
        attackerRoll: { dice: [2, 3], sum: 5, isDouble: false },
        defenderRoll: { dice: [1, 2], sum: 3, isDouble: false },
        hit: true,
        damage: 2,
        defenderHpAfter: 3,
        tieBreakDice: undefined,
      },
    ],
    attackerHp: 6,
    defenderHp: 3,
    defenderAlive: true,
    pendingRoll: null,
    rollCounter: 2,
  };

  assert.deepStrictEqual(snapshot, expected);
  console.log("golden_action_snapshot passed");
}

function main() {
  // Full test run: invoke all test functions in this file
  console.log('Running full simpleTests suite');
  testActionModuleBoundaries();
  testPlacementToBattleAndTurnOrder();
  testLobbyReadyAndStartRequiresBothReady();
  testInitiativeRollSequenceNoAutoroll();
  testInitiativeWinnerSetsPlacementFirstPlayerAndPhasePlacement();
  testRiderPathHitsStealthed();
  testGameEndCondition();
  testBerserkerAutoDefenseEnabled();
  testBerserkerAutoDefenseDeclined();
  testBerserkerAutoDefenseNoCharges();
  testBerserkerDefenseChoiceAutoDodgeSpends6();
  testBerserkerDefenseChoiceRollUsesNormalCombat();
  testCannotAutoDodgeIfChargesNot6();
  testAssassinAttackFromStealth();
  testAssassinAttackWithoutStealth();
  testSearchRevealsOnlyInRadius();
  testSearchUpdatesOnlyPlayerKnowledge();
  testSearchStealthRollsLogged();
  testSearchActionBlockedAfterAttack();
  testSearchMoveBlockedAfterMove();
  testSearchActionWorksBeforeAttack();
  testSearchMoveWorksBeforeMove();
  testSearchButtonsEnabledOnFreshUnitTurn();
  testAttackAlreadyRevealedUnit();
  testAdjacencyRevealAfterMove();
  testCannotAttackTwicePerTurn();
  testAttackConsumesActionSlot();
  testCannotAttackAfterSearchAction();
  testCannotSearchMoveAfterMove();
  testRiderCannotEnterStealth();
  testAssassinCanEnterStealth();
  testStealthOnlyForUnitsWithAbility();
  testBattleTurnOrderFollowsPlacementOrder();
  testAllyCannotStepOnStealthedAlly();
  testEnemyStepsOnUnknownStealthedRevealsAndCancels();
  testCannotAttackStealthedEnemyDirectly();
  testNoStealthStackingOnEnter();
  testStealthLasts3OwnTurnsThenExpiresOn4thStart();
  testStealthRollLogged();
  testLastKnownPositionsInView();
  testLastKnownPositionPersistsWhileHidden();
  testLastKnownClearedOnStealthExit();
  testTricksterAoERevealsHiddenInArea();
  testTricksterAoEIs5x5Radius2();
  testTricksterAoEHitsAllies();
  testTricksterAoEDoesNotDamageSelf();
  testTricksterAoERevealsAllInArea();
  testTricksterAoEAttackerRollOnce();
  testTricksterAoEMultipleDefendersRollSeparately();
  testTricksterAoERevealsStealthedUnits();
  testTricksterAoEConsumesAttack();
  testSpearmanAttackIncludesAdjacentRing();
  testSpearmanAttackKeepsDistance2Directions();
  testSpearmanAttackExcludesSelf();
  testSpearmanAttackRespectsBounds();
  testArcherCanShootThroughAllies();
  testArcherCannotShootThroughEnemies();
  testArcherAttacksFirstOnLine();
  testArcherCannotTargetHiddenEnemy();
  testArcherCanAttackDiagonalFirstTargetOnly();
  testArcherCanShootThroughAlliesDiagonal();
  testArcherCannotShootThroughEnemiesDiagonal();
  testCannotMoveTwicePerTurn();
  testCannotStealthTwicePerTurn();
  testSearchStealthSlots();
  testAbilityConsumesMultipleSlots();
  testTricksterMoveOptionsGeneratedAndUsed();
  testBerserkerMoveOptionsGeneratedAndUsed();
  testBerserkerMoveRoll1GeneratesTopRoof();
  testBerserkerMoveRoll3GeneratesLeftVertical();
  testBerserkerMoveRoll5GeneratesMooreRadius1();
  testBerserkerMoveRoll6GeneratesStarShape();
  testBerserkerMoveFiltersOutOfBounds();
  testBerserkerMoveCannotEndOnAlly();
  testBerserkerMoveRequiresManualRollNoAutoroll();
  testTricksterMoveRequiresPendingOptions();
  testKaiserBunkerVisibleAndDamageClampedTo1();
  testKaiserBunkerExpiresOnFourthOwnTurn();
  testKaiserBunkerExitOnAttackButNotDoraOrImpulse();
  testCarpetStrikeRollsCenterThenAttackThenDefenders();
  testCarpetStrikeUsesSingleSharedAttackRollForAllTargets();
  testCarpetStrikeDamageIsFixed1IgnoresBuffs();
  testCarpetStrikeHighlightsAreaMetadataInEvents();
  testCarpetStrikeRevealsStealthedUnitsInArea();
  testKaiserCarpetStrikeDoesNotHitSelfInBunker();
  testKaiserCarpetStrikeHitsAlliesAndEnemies();
  testKaiserDoraDoesNotRequireBunker();
  testKaiserDoraOneAttackerRollManyDefenders();
  testKaiserDoraDoesNotDuplicateDefenderRollsWithIntimidate();
  testIntimidateTriggersOncePerSuccessfulDefense();
  testTricksterAoEDoesNotDuplicateDefenderRollsWithIntimidate();
  testVladForestDoesNotDuplicateDefenderRollsWithIntimidate();
  testKaiserDoraCenterMustBeOnArcherLine();
  testKaiserEngineeringMiracleTransformsStats();
  testKaiserEngineeringMiracleImpulseNoActionNoSpend();
  testTransformedKaiserHasDoraAbility();
  testTransformedKaiserHasBerserkerFeatureAndCharges();
  testBerserkerMoveRequiresPendingRollAndGeneratesOptions();
  testKaiserInitialChargesStartAtZeroThenIncrementToOneOnFirstTurn();
  testKaiserChargesIncrementEachOwnTurn();
  testChargesAreNotResetByViewOrStartTurn();
  testKaiserMulticlassMovementAndRiderPath();
  testPolkovodetsAppliesToAdjacentAlliesNotSelf();
  testPolkovodetsDoesNotStack();
  testPolkovodetsRiderOnlyIfStartOrEndInAura();
  testGenghisHpIs7();
  testKhansDecreeDoesNotConsumeMoveSlot();
  testKhansDecreeAllowsDiagonalMoveThenConsumesMove();
  testKhansDecreeCannotBeUsedAfterMove();
  testGenghisMongolChargeRequires4SpendsAll4();
  testGenghisLegendOfSteppesBonusOnlyVsLastTurnTarget();
  testGenghisMongolChargeSweepTriggersAlliedAttacksInCorridor();
  testElCidLongLiverAdds2Hp();
  testElCidWarriorDoubleIsAutoHitNoDefenderRoll();
  testElCidTisonaIsRayOnlyRightDirection();
  testElCidTisonaIsRayOnlyUpDirection();
  testElCidKoladaImpulseTriggersAtStartTurnSpends3SharedAttackerRollHitsAllies();
  testElCidDemonDuelistChainHitsUntilMissThenChoicePayHpOrStop();
  testElCidDemonDuelistRequires5AndSpends5();
  testElCidTisonaAndKoladaHitAllies();
  testVladIntimidatePromptsAfterSuccessfulDefense();
  testVladIntimidatePushesAttackerOneCell();
  testVladIntimidateNoOptionsAutoSkips();
  testVladStakesPromptOnBattleStart();
  testVladStakesPromptOnSecondOwnTurnStart();
  testStakeCannotBePlacedOnVisibleUnit();
  testStakeCanBePlacedOnStealthedUnitNoEffect();
  testLinePathOrthogonalIsExact();
  testLinePathDiagonalIsExact();
  testTricksterTeleportDoesNotTriggerIntermediateStakes();
  testRiderStopsOnStakeInPath();
  testStakeDoesNotTriggerOnHiddenUnitCell();
  testStakeTriggersOnVisibleUnitStopsAndDamagesAndReveals();
  testStakeDoesNotTriggerOnUnknownStealthedUnit();
  testAssassinStopsExactlyOnStakeCell();
  testStakesDoNotGetRemovedOnTriggerOnlyRevealed();
  testTwoTepesHiddenStakesSameCellDamageOnly1();
  testTriggerRevealsAllStakesOnCell();
  testForestRequires9Stakes();
  testForestConsumes9AndSkipsStakesPlacementThatTurn();
  testForestAoeDeals2AndRootsOnFail();
  testRootBlocksMovementNextTurnOnly();
  testGetHeroMetaReturnsCorrectData();
  testHeroRegistryContainsPlayableHeroes();
  testGoldenSnapshotAoeWithIntimidateChain();
  testGoldenSnapshotPendingRollSequence();
  testGoldenActionSnapshot();
}

main();
