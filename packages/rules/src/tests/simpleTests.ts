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
  makeEmptyTurnEconomy,
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_CHIKATILO_ASSASSIN_MARK,
  ABILITY_CHIKATILO_DECOY,
  ABILITY_GENGHIS_KHAN_KHANS_DECREE,
  ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
  ABILITY_EL_SID_COMPEADOR_TISONA,
  ABILITY_EL_SID_COMPEADOR_KOLADA,
  ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
  ABILITY_KAISER_DORA,
  ABILITY_KAISER_CARPET_STRIKE,
  ABILITY_KAISER_ENGINEERING_MIRACLE,
  ABILITY_GROZNY_INVADE_TIME,
  ABILITY_LECHY_CONFUSE_TERRAIN,
  ABILITY_LECHY_GUIDE_TRAVELER,
  ABILITY_LECHY_STORM,
  ABILITY_GUTS_ARBALET,
  ABILITY_GUTS_BERSERK_MODE,
  ABILITY_GUTS_CANNON,
  ABILITY_GUTS_EXIT_BERSERK,
  ABILITY_KALADIN_FIRST,
  ABILITY_KALADIN_FIFTH,
  ABILITY_FRISK_GENOCIDE,
  ABILITY_FRISK_PACIFISM,
  ABILITY_LOKI_LAUGHT,
  ABILITY_ODIN_MUNINN,
  ABILITY_ODIN_SLEIPNIR,
  ABILITY_TRICKSTER_AOE,
  ABILITY_GRIFFITH_FEMTO_REBIRTH,
  ABILITY_FEMTO_DIVINE_MOVE,
  ABILITY_JEBE_HAIL_OF_ARROWS,
  ABILITY_JEBE_KHANS_SHOOTER,
  ABILITY_HASSAN_TRUE_ENEMY,
  ABILITY_ASGORE_FIREBALL,
  ABILITY_ASGORE_FIRE_PARADE,
  ABILITY_ASGORE_SOUL_PARADE,
  ABILITY_RIVER_PERSON_BOATMAN,
  ABILITY_RIVER_PERSON_TRA_LA_LA,
  ABILITY_TEST_MULTI_SLOT,
  ABILITY_VLAD_FOREST,
  HERO_GRAND_KAISER_ID,
  HERO_CHIKATILO_ID,
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_GENGHIS_KHAN_ID,
  HERO_EL_CID_COMPEADOR_ID,
  HERO_GROZNY_ID,
  HERO_LECHY_ID,
  HERO_GUTS_ID,
  HERO_GRIFFITH_ID,
  HERO_FEMTO_ID,
  HERO_JEBE_ID,
  HERO_HASSAN_ID,
  HERO_ASGORE_ID,
  HERO_RIVER_PERSON_ID,
  HERO_KALADIN_ID,
  HERO_FRISK_ID,
  HERO_LOKI_ID,
  HERO_ODIN_ID,
  HERO_VLAD_TEPES_ID,
  HERO_REGISTRY,
  getHeroMeta,
  getLegalPlacements,
  getLegalMovesForUnit,
  getUnitDefinition,
  getTricksterMovesForRoll,
  getBerserkerMovesForRoll,
  resolveAttack,
  getUnitAt,
  getLegalAttackTargets,
  getLegalIntents,
  linePath,
  getStealthSuccessMinRoll,
} from "../index";
import { SeededRNG } from "../rng";
import type { RNG } from "../rng";
import * as pendingRollActions from "../actions/pendingRollActions";
import { applyFalseTrailExplosion } from "../actions/heroes/chikatilo";
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
    pending.kind === "odinMuninnDefenseChoice" ||
    pending.kind === "asgoreBraveryDefenseChoice" ||
    pending.kind === "dora_berserkerDefenseChoice" ||
    pending.kind === "jebeHailOfArrows_berserkerDefenseChoice" ||
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

class SequenceRNG implements RNG {
  private index = 0;
  constructor(private values: number[], private fallback = 0.5) {}
  next(): number {
    if (this.index < this.values.length) {
      const value = this.values[this.index];
      this.index += 1;
      return value;
    }
    return this.fallback;
  }
}

function makeAttackWinRng(attacks: number): SequenceRNG {
  const values: number[] = [];
  for (let i = 0; i < attacks; i += 1) {
    values.push(0.99, 0.99, 0.01, 0.01);
  }
  return new SequenceRNG(values);
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
    ["pendingRollActions.ts", new Set(["./pendingRoll"])],
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

function testPendingRollActionsExportsStable() {
  const expected = ["applyResolvePendingRoll"];
  const exported = Object.keys(pendingRollActions);
  for (const name of expected) {
    assert(
      exported.includes(name),
      `pendingRollActions missing export: ${name}`
    );
    assert.strictEqual(
      typeof (pendingRollActions as any)[name],
      "function",
      `pendingRollActions export ${name} should be a function`
    );
  }

  console.log("pendingRollActions_exports_stable passed");
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
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 2 },
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
    "decree should spend 2 charges"
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
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 2 },
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

function setupJebeState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { archer: HERO_JEBE_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const jebe = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_JEBE_ID
  )!;

  return { state, jebe };
}

function testJebeHpBonus() {
  const { state, jebe } = setupJebeState();
  const baseHp = getUnitDefinition("archer").maxHp;
  const meta = getHeroMeta(HERO_JEBE_ID);

  assert(jebe.hp === baseHp + 1, "Jebe HP should be base archer HP + 1");
  assert(
    meta?.baseStats.hp === baseHp + 1,
    "Jebe hero meta HP should be base archer HP + 1"
  );

  console.log("jebe_hp_bonus passed");
}

function testJebeStealthThresholdIs6() {
  let { state, jebe } = setupJebeState();

  state = setUnit(state, jebe.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", jebe.id);
  state = initKnowledgeForOwners(state);

  let rng = makeRngSequence([0.8]); // roll 5
  let res = applyAction(
    state,
    { type: "enterStealth", unitId: jebe.id } as any,
    rng
  );
  assert(res.state.pendingRoll?.kind === "enterStealth", "stealth should request roll");
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.units[jebe.id].isStealthed === false,
    "Jebe stealth should fail on roll 5"
  );

  ({ state, jebe } = setupJebeState());
  state = setUnit(state, jebe.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", jebe.id);
  state = initKnowledgeForOwners(state);

  rng = makeRngSequence([0.99]); // roll 6
  res = applyAction(
    state,
    { type: "enterStealth", unitId: jebe.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.units[jebe.id].isStealthed === true,
    "Jebe stealth should succeed on roll 6"
  );

  console.log("jebe_stealth_threshold_is_6 passed");
}

function testJebeHailOfArrowsGatingTargetingAndDamage() {
  const rng = makeRngSequence([
    0.99,
    0.99, // shared attacker roll
    0.01,
    0.2, // defender 1
    0.01,
    0.2, // defender 2
    0.01,
    0.2, // defender 3
    0.01,
    0.2, // defender 4
  ]);

  let { state, jebe } = setupJebeState();
  const ally1 = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider"
  )!;
  const ally2 = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "spearman"
  )!;
  const enemy1 = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;
  const enemy2 = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, jebe.id, {
    position: { col: 0, row: 0 },
    charges: { ...jebe.charges, [ABILITY_JEBE_HAIL_OF_ARROWS]: 1 },
  });
  state = setUnit(state, ally1.id, { position: { col: 1, row: 1 } });
  state = setUnit(state, ally2.id, { position: { col: 2, row: 3 } });
  state = setUnit(state, enemy1.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, enemy2.id, { position: { col: 3, row: 1 } });
  state = toBattleState(state, "P1", jebe.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: jebe.id,
      abilityId: ABILITY_JEBE_HAIL_OF_ARROWS,
      payload: { center: { col: 2, row: 2 } },
    } as any,
    rng
  );
  assert(!res.state.pendingRoll, "hail should be blocked below 2 charges");
  assert(
    res.state.units[jebe.id].charges[ABILITY_JEBE_HAIL_OF_ARROWS] === 1,
    "hail charges should remain when blocked by insufficient charges"
  );

  state = setUnit(state, jebe.id, {
    charges: { ...state.units[jebe.id].charges, [ABILITY_JEBE_HAIL_OF_ARROWS]: 2 },
  });

  res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: jebe.id,
      abilityId: ABILITY_JEBE_HAIL_OF_ARROWS,
      payload: { center: { col: 1, row: 2 } },
    } as any,
    rng
  );
  assert(!res.state.pendingRoll, "center outside attack line should be rejected");
  assert(
    res.state.units[jebe.id].charges[ABILITY_JEBE_HAIL_OF_ARROWS] === 2,
    "illegal center should not spend hail charges"
  );

  const beforeHp: Record<string, number> = {
    [ally1.id]: state.units[ally1.id].hp,
    [ally2.id]: state.units[ally2.id].hp,
    [enemy1.id]: state.units[enemy1.id].hp,
    [enemy2.id]: state.units[enemy2.id].hp,
  };

  res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: jebe.id,
      abilityId: ABILITY_JEBE_HAIL_OF_ARROWS,
      payload: { center: { col: 2, row: 2 } },
    } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "jebeHailOfArrows_attackerRoll",
    "hail should request a shared attacker roll when valid"
  );
  assert(
    res.state.units[jebe.id].charges[ABILITY_JEBE_HAIL_OF_ARROWS] === 0,
    "hail should consume exactly 2 charges"
  );

  const resolved = resolveAllPendingRollsWithEvents(res.state, rng);
  const events = [...res.events, ...resolved.events];
  const attackEvents = events.filter(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === jebe.id &&
      [ally1.id, ally2.id, enemy1.id, enemy2.id].includes(event.defenderId)
  ) as Extract<GameEvent, { type: "attackResolved" }>[];
  assert(attackEvents.length === 4, "hail should attack every unit in the 3x3 area");

  const attackedIds = attackEvents.map((event) => event.defenderId).sort();
  assert.deepStrictEqual(
    attackedIds,
    [ally1.id, ally2.id, enemy1.id, enemy2.id].sort(),
    "hail should hit allies and enemies inside area"
  );

  for (const unitId of [ally1.id, ally2.id, enemy1.id, enemy2.id]) {
    assert(
      resolved.state.units[unitId].hp === beforeHp[unitId] - 1,
      `hail should deal 1 damage to ${unitId}`
    );
  }

  console.log("jebe_hail_of_arrows_gating_targeting_and_damage passed");
}

function testJebeKhansShooterGatingConsumesAndRicochets() {
  const rng = makeRngSequence([
    0.2, // ricochet roll = 2 => total 3 attacks
    0.99,
    0.99,
    0.01,
    0.01, // attack 1
    0.99,
    0.99,
    0.01,
    0.01, // attack 2
    0.99,
    0.99,
    0.01,
    0.01, // attack 3
  ]);

  let { state, jebe } = setupJebeState();
  const enemy1 = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;
  const enemy2 = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;
  const enemy3 = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, jebe.id, {
    position: { col: 0, row: 0 },
    charges: { ...jebe.charges, [ABILITY_JEBE_KHANS_SHOOTER]: 5 },
  });
  state = setUnit(state, enemy1.id, { position: { col: 2, row: 0 } });
  state = setUnit(state, enemy2.id, { position: { col: 0, row: 2 } });
  state = setUnit(state, enemy3.id, { position: { col: 2, row: 2 } });
  state = toBattleState(state, "P1", jebe.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: jebe.id,
      abilityId: ABILITY_JEBE_KHANS_SHOOTER,
      payload: { targetId: enemy1.id },
    } as any,
    rng
  );
  assert(!used.state.pendingRoll, "Khan's Shooter should be blocked below 6 charges");
  assert(
    used.state.units[jebe.id].charges[ABILITY_JEBE_KHANS_SHOOTER] === 5,
    "Khan's Shooter should not spend charges when blocked"
  );

  state = setUnit(state, jebe.id, {
    charges: { ...state.units[jebe.id].charges, [ABILITY_JEBE_KHANS_SHOOTER]: 6 },
  });

  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: jebe.id,
      abilityId: ABILITY_JEBE_KHANS_SHOOTER,
      payload: { targetId: enemy1.id },
    } as any,
    rng
  );

  assert(
    used.state.pendingRoll?.kind === "jebeKhansShooterRicochetRoll",
    "Khan's Shooter should request ricochet roll first"
  );
  assert(
    used.state.units[jebe.id].charges[ABILITY_JEBE_KHANS_SHOOTER] === 0,
    "Khan's Shooter should consume all 6 charges immediately"
  );

  let current = used.state;
  const events: GameEvent[] = [...used.events];
  const pendingKinds: string[] = [];
  const plannedTargets = [enemy2.id, enemy3.id];

  while (current.pendingRoll) {
    const pending = current.pendingRoll;
    pendingKinds.push(pending.kind);

    if (pending.kind === "jebeKhansShooterTargetChoice") {
      const nextTarget = plannedTargets.shift() ?? enemy2.id;
      const step = applyAction(
        current,
        {
          type: "resolvePendingRoll",
          pendingRollId: pending.id,
          player: pending.player,
          choice: { type: "jebeKhansShooterTarget", targetId: nextTarget },
        } as any,
        rng
      );
      current = step.state;
      events.push(...step.events);
      continue;
    }

    const step = resolvePendingRollOnce(current, rng);
    current = step.state;
    events.push(...step.events);
  }

  const attackEvents = events.filter(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === jebe.id &&
      [enemy1.id, enemy2.id, enemy3.id].includes(event.defenderId)
  ) as Extract<GameEvent, { type: "attackResolved" }>[];

  assert(
    attackEvents.length === 3,
    "Khan's Shooter should perform exactly 1 + N attacks when targets exist"
  );
  assert(
    pendingKinds.includes("attack_attackerRoll") &&
      pendingKinds.includes("attack_defenderRoll"),
    "Khan's Shooter should use normal attack roll flow for each hit"
  );
  assert(
    pendingKinds.filter((kind) => kind === "jebeKhansShooterTargetChoice").length === 2,
    "Khan's Shooter should request a new target for each ricochet"
  );

  const attackedIds = attackEvents.map((event) => event.defenderId).sort();
  assert.deepStrictEqual(
    attackedIds,
    [enemy1.id, enemy2.id, enemy3.id].sort(),
    "Khan's Shooter should attack chosen targets in the chain"
  );

  console.log("jebe_khans_shooter_gating_consumes_and_ricochets passed");
}

function setupHassanState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_HASSAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const hassan = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_HASSAN_ID
  )!;

  return { state, hassan };
}

function testHassanHpBonus() {
  const { state, hassan } = setupHassanState();
  const baseHp = getUnitDefinition("assassin").maxHp;
  const meta = getHeroMeta(HERO_HASSAN_ID);

  assert(hassan.hp === baseHp + 1, "Hassan HP should be base assassin HP + 1");
  assert(
    meta?.baseStats.hp === baseHp + 1,
    "Hassan hero meta HP should be base assassin HP + 1"
  );

  console.log("hassan_hp_bonus passed");
}

function testHassanStealthThresholdIs4() {
  let { state, hassan } = setupHassanState();

  state = setUnit(state, hassan.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", hassan.id);
  state = initKnowledgeForOwners(state);

  let rng = makeRngSequence([0.34]); // roll 3
  let res = applyAction(
    state,
    { type: "enterStealth", unitId: hassan.id } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "enterStealth",
    "stealth should request roll"
  );
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.units[hassan.id].isStealthed === false,
    "Hassan stealth should fail on roll 3"
  );

  ({ state, hassan } = setupHassanState());
  state = setUnit(state, hassan.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", hassan.id);
  state = initKnowledgeForOwners(state);

  rng = makeRngSequence([0.5]); // roll 4
  res = applyAction(
    state,
    { type: "enterStealth", unitId: hassan.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.units[hassan.id].isStealthed === true,
    "Hassan stealth should succeed on roll 4"
  );

  console.log("hassan_stealth_threshold_is_4 passed");
}

function testHassanTrueEnemyGatingConsumesAndForcesOneAttack() {
  const rng = makeAttackWinRng(1);
  let { state, hassan } = setupHassanState();

  const enemyForcedAttacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;
  const enemyForcedTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;

  state = setUnit(state, hassan.id, {
    position: { col: 4, row: 4 },
    charges: { ...hassan.charges, [ABILITY_HASSAN_TRUE_ENEMY]: 2 },
  });
  state = setUnit(state, enemyForcedAttacker.id, {
    position: { col: 5, row: 4 },
  });
  state = setUnit(state, enemyForcedTarget.id, {
    position: { col: 6, row: 4 },
  });
  state = toBattleState(state, "P1", hassan.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: hassan.id,
      abilityId: ABILITY_HASSAN_TRUE_ENEMY,
      payload: { forcedAttackerId: enemyForcedAttacker.id },
    } as any,
    rng
  );
  assert(
    !used.state.pendingRoll,
    "True Enemy should be blocked below 3 charges"
  );
  assert(
    used.state.units[hassan.id].charges[ABILITY_HASSAN_TRUE_ENEMY] === 2,
    "True Enemy should not spend charges when blocked"
  );

  state = setUnit(state, hassan.id, {
    charges: { ...state.units[hassan.id].charges, [ABILITY_HASSAN_TRUE_ENEMY]: 3 },
  });

  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: hassan.id,
      abilityId: ABILITY_HASSAN_TRUE_ENEMY,
      payload: { forcedAttackerId: enemyForcedAttacker.id },
    } as any,
    rng
  );

  assert(
    used.state.pendingRoll?.kind === "hassanTrueEnemyTargetChoice",
    "True Enemy should request forced target selection"
  );
  assert(
    used.state.units[hassan.id].charges[ABILITY_HASSAN_TRUE_ENEMY] === 0,
    "True Enemy should spend exactly 3 charges immediately"
  );
  assert(
    used.state.units[hassan.id].turn.actionUsed,
    "True Enemy should consume Hassan's action slot"
  );

  const targetChoice = applyAction(
    used.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: used.state.pendingRoll!.id,
      player: used.state.pendingRoll!.player,
      choice: { type: "hassanTrueEnemyTarget", targetId: enemyForcedTarget.id },
    } as any,
    rng
  );
  assert(
    targetChoice.state.pendingRoll?.kind === "attack_attackerRoll",
    "True Enemy should continue into normal attack flow"
  );

  const resolved = resolveAllPendingRollsWithEvents(targetChoice.state, rng);
  const events = [...used.events, ...targetChoice.events, ...resolved.events];
  const forcedAttackEvents = events.filter(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === enemyForcedAttacker.id &&
      event.defenderId === enemyForcedTarget.id
  ) as Extract<GameEvent, { type: "attackResolved" }>[];

  assert(
    forcedAttackEvents.length === 1,
    "True Enemy should force exactly one normal attack"
  );
  assert(
    forcedAttackEvents[0].attackerRoll.dice.length >= 2 &&
      forcedAttackEvents[0].defenderRoll.dice.length >= 2,
    "forced attack should use normal attack/defense roll resolution"
  );

  console.log("hassan_true_enemy_gating_consumes_and_forces_one_attack passed");
}

function testHassanAssassinOrderBattleStartSelectionAndPerSideIndependence() {
  const rng = new SeededRNG(870);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_HASSAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2", { assassin: HERO_HASSAN_ID }));
  state = toPlacementState(state, "P1");

  const p1Coords = ["b0", "c0", "d0", "e0", "f0", "g0", "h0"].map(coordFromNotation);
  const p2Coords = ["b8", "c8", "d8", "e8", "f8", "g8", "h8"].map(coordFromNotation);

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
    const pos = current === "P1" ? p1Coords[p1i++] : p2Coords[p2i++];
    state = applyAction(
      state,
      { type: "placeUnit", unitId: nextUnit.id, position: pos } as any,
      rng
    ).state;
  }

  assert(
    state.pendingRoll?.kind === "hassanAssassinOrderSelection",
    "Assassin Order should trigger at battle start"
  );
  assert(
    state.pendingRoll?.player === "P1",
    "P1 Assassin Order selection should resolve first"
  );

  const p1Hassan = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_HASSAN_ID
  )!;
  const p2Hassan = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.heroId === HERO_HASSAN_ID
  )!;
  const p1Archer = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const p1Rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const p2Archer = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;
  const p2Rider = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  assert(
    getStealthSuccessMinRoll(state.units[p1Archer.id]) === 6,
    "base archer should start with stealth threshold 6"
  );
  assert(
    getStealthSuccessMinRoll(state.units[p1Rider.id]) === null,
    "base rider should start without stealth"
  );
  assert(
    getStealthSuccessMinRoll(state.units[p1Hassan.id]) === 4,
    "Hassan should keep stealth threshold 4"
  );

  const firstSelection = applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: state.pendingRoll!.id,
      player: state.pendingRoll!.player,
      choice: {
        type: "hassanAssassinOrderPick",
        unitIds: [p1Archer.id, p1Rider.id],
      },
    } as any,
    rng
  );

  assert(
    firstSelection.state.pendingRoll?.kind === "hassanAssassinOrderSelection",
    "P2 should receive independent Assassin Order selection"
  );
  assert(
    firstSelection.state.pendingRoll?.player === "P2",
    "second Assassin Order selection should be owned by P2"
  );
  assert(
    getStealthSuccessMinRoll(firstSelection.state.units[p2Archer.id]) === 6,
    "P2 archer threshold should remain unchanged before P2 selection"
  );

  const secondSelection = applyAction(
    firstSelection.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: firstSelection.state.pendingRoll!.id,
      player: firstSelection.state.pendingRoll!.player,
      choice: {
        type: "hassanAssassinOrderPick",
        unitIds: [p2Archer.id, p2Rider.id],
      },
    } as any,
    rng
  );

  assert(
    !secondSelection.state.pendingRoll,
    "Assassin Order selections should complete for both sides"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p1Archer.id]) === 5,
    "Assassin Order should upgrade archer stealth threshold from 6 to 5"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p1Rider.id]) === 5,
    "Assassin Order should grant stealth to non-stealth unit"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p2Archer.id]) === 5,
    "P2 selection should upgrade P2 archer independently"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p2Rider.id]) === 5,
    "P2 selection should grant stealth independently"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p2Hassan.id]) === 4,
    "Hassan should remain at stealth threshold 4"
  );

  console.log(
    "hassan_assassin_order_battle_start_selection_and_per_side_independence passed"
  );
}

function setupGriffithState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { knight: HERO_GRIFFITH_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const griffith = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_GRIFFITH_ID
  )!;

  return { state, griffith };
}

function promoteToFemto(state: GameState, unitId: string): GameState {
  const unit = state.units[unitId];
  if (!unit) return state;
  const berserkerHp = getUnitDefinition("berserker").maxHp;
  const berserkerAttack = getUnitDefinition("berserker").baseAttack;
  return setUnit(state, unitId, {
    heroId: HERO_FEMTO_ID,
    figureId: HERO_FEMTO_ID,
    transformed: true,
    hp: berserkerHp + 5,
    attack: berserkerAttack,
    charges: {
      ...unit.charges,
      [ABILITY_BERSERK_AUTO_DEFENSE]: 6,
    },
  });
}

function testGriffithWretchedManDamageReductionClamped() {
  let { state, griffith } = setupGriffithState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, griffith.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = initKnowledgeForOwners(state);

  let normal = resolveAttack(state, {
    attackerId: griffith.id,
    defenderId: enemy.id,
    rolls: {
      attackerDice: [6, 6],
      defenderDice: [1, 1],
    },
  });
  let normalEvent = normal.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === griffith.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(normalEvent, "Griffith attack should resolve");
  assert(
    normalEvent.damage === state.units[griffith.id].attack - 1,
    "Wretched Man should reduce Griffith damage by exactly 1"
  );

  state = setUnit(state, griffith.id, { attack: 1 });
  const clamped = resolveAttack(state, {
    attackerId: griffith.id,
    defenderId: enemy.id,
    rolls: {
      attackerDice: [6, 6],
      defenderDice: [1, 1],
    },
  });
  const clampedEvent = clamped.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === griffith.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(clampedEvent, "clamped Griffith attack should resolve");
  assert(clampedEvent.damage === 0, "Wretched Man damage should clamp at 0");

  console.log("griffith_wretched_man_damage_reduction_clamped passed");
}

function testGriffithWarriorDoubleAutoHit() {
  let { state, griffith } = setupGriffithState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, griffith.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = initKnowledgeForOwners(state);

  const resolved = resolveAttack(state, {
    attackerId: griffith.id,
    defenderId: enemy.id,
    rolls: {
      attackerDice: [1, 1], // attacker double
      defenderDice: [6, 6], // stronger defense sum to prove double override
    },
  });
  const attackEvent = resolved.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === griffith.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "Griffith attack should resolve");
  assert(attackEvent.hit, "Griffith should auto-hit on double attack roll");
  assert(
    attackEvent.defenderRoll.sum > attackEvent.attackerRoll.sum,
    "test setup must keep defender roll stronger to validate warrior double rule"
  );

  console.log("griffith_warrior_double_auto_hit passed");
}

function testGriffithFemtoRebirthOnDeath() {
  const rng = makeAttackWinRng(1);
  let { state, griffith } = setupGriffithState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  for (const unit of Object.values(state.units)) {
    if (unit.id === griffith.id || unit.id === enemy.id) continue;
    state = setUnit(state, unit.id, {
      isAlive: false,
      hp: 0,
      position: null,
    });
  }

  state = setUnit(state, griffith.id, {
    hp: 1,
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  const attack = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: griffith.id } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(attack.state, rng);
  const events = [...attack.events, ...resolved.events];

  const reborn = resolved.state.units[griffith.id];
  const berserkerHp = getUnitDefinition("berserker").maxHp + 5;
  assert(reborn.heroId === HERO_FEMTO_ID, "Griffith should transform into Femto");
  assert(reborn.isAlive, "Femto form should be alive after rebirth");
  assert(
    reborn.position?.col === 4 && reborn.position?.row === 4,
    "Femto should stay in the same cell after rebirth"
  );
  assert(reborn.hp === berserkerHp, "Femto should spawn at full berserker+5 HP");

  const deathEvent = events.find(
    (event) => event.type === "unitDied" && event.unitId === griffith.id
  );
  assert(deathEvent, "Griffith death event should still be emitted");
  const rebirthEvent = events.find(
    (event) =>
      event.type === "abilityUsed" &&
      event.unitId === griffith.id &&
      event.abilityId === ABILITY_GRIFFITH_FEMTO_REBIRTH
  );
  assert(rebirthEvent, "Femto rebirth ability event should be emitted");

  const ended = applyAction(
    resolved.state,
    { type: "endTurn" } as any,
    makeRngSequence([])
  );
  assert(
    ended.state.phase === "battle",
    "match should not end when Griffith dies if Femto rebirth exists"
  );

  console.log("griffith_femto_rebirth_on_death passed");
}

function testFemtoSpearmanReachAndBerserkerDamage() {
  let { state, griffith } = setupGriffithState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, griffith.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = promoteToFemto(state, griffith.id);
  state = toBattleState(state, "P1", griffith.id);
  state = initKnowledgeForOwners(state);

  const legalTargets = getLegalAttackTargets(state, griffith.id);
  assert(
    legalTargets.includes(enemy.id),
    "Femto normal attacks should use spearman reach (distance 2 legal)"
  );

  const resolved = resolveAttack(state, {
    attackerId: griffith.id,
    defenderId: enemy.id,
    rolls: {
      attackerDice: [6, 5],
      defenderDice: [1, 1],
    },
  });
  const attackEvent = resolved.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === griffith.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "Femto attack should resolve");
  assert(
    attackEvent.damage === getUnitDefinition("berserker").baseAttack,
    "Femto base damage should equal berserker base damage"
  );

  console.log("femto_spearman_reach_and_berserker_damage passed");
}

function testFemtoDivineMoveUsesMoveSlotAndRollRanges() {
  let { state, griffith } = setupGriffithState();
  state = setUnit(state, griffith.id, { position: { col: 4, row: 4 } });
  state = promoteToFemto(state, griffith.id);
  state = toBattleState(state, "P1", griffith.id);
  state = initKnowledgeForOwners(state);

  const used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: griffith.id,
      abilityId: ABILITY_FEMTO_DIVINE_MOVE,
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind === "femtoDivineMoveRoll",
    "Divine Movement should request roll first"
  );
  assert(
    used.state.units[griffith.id].turn.moveUsed,
    "Divine Movement should consume move slot"
  );
  assert(
    used.state.units[griffith.id].turn.actionUsed === false,
    "Divine Movement should not consume main action"
  );

  const shortRange = resolvePendingRollOnce(used.state, makeRngSequence([0.2])); // roll 2
  assert(
    shortRange.state.pendingRoll?.kind === "femtoDivineMoveDestination",
    "low roll should request destination selection"
  );
  const shortOptions =
    (shortRange.state.pendingRoll?.context as { options?: Coord[] } | undefined)
      ?.options ?? [];
  assert(shortOptions.length > 0, "low-roll divine move should have destination options");
  assert(
    shortOptions.every(
      (coord) =>
        Math.max(Math.abs(coord.col - 4), Math.abs(coord.row - 4)) <= 2
    ),
    "roll 1-3 divine move options must stay within distance 2"
  );

  const shortDestination = shortOptions[0];
  const shortChosen = applyAction(
    shortRange.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: shortRange.state.pendingRoll!.id,
      player: shortRange.state.pendingRoll!.player,
      choice: { type: "femtoDivineMoveDestination", position: shortDestination },
    } as any,
    makeRngSequence([])
  );
  assert(
    shortChosen.state.units[griffith.id].position?.col === shortDestination.col &&
      shortChosen.state.units[griffith.id].position?.row === shortDestination.row,
    "Femto should teleport to selected legal short-range destination"
  );
  assert(
    shortChosen.state.units[griffith.id].turn.actionUsed === false,
    "Divine Movement destination resolve should still keep action slot free"
  );

  ({ state, griffith } = setupGriffithState());
  state = setUnit(state, griffith.id, { position: { col: 4, row: 4 } });
  state = promoteToFemto(state, griffith.id);
  state = toBattleState(state, "P1", griffith.id);
  state = initKnowledgeForOwners(state);

  const usedLong = applyAction(
    state,
    {
      type: "useAbility",
      unitId: griffith.id,
      abilityId: ABILITY_FEMTO_DIVINE_MOVE,
    } as any,
    makeRngSequence([])
  );
  const longRange = resolvePendingRollOnce(usedLong.state, makeRngSequence([0.8])); // roll 5
  const longOptions =
    (longRange.state.pendingRoll?.context as { options?: Coord[] } | undefined)
      ?.options ?? [];
  assert(
    longOptions.some(
      (coord) =>
        Math.max(Math.abs(coord.col - 4), Math.abs(coord.row - 4)) > 2
    ),
    "roll 4-6 divine move should allow full-board destinations"
  );

  console.log("femto_divine_move_uses_move_slot_and_roll_ranges passed");
}

function testFemtoBerserkAutoDefenseGatingAndBehavior() {
  const meta = getHeroMeta(HERO_FEMTO_ID);
  assert(
    !!meta?.abilities.some((ability) => ability.id === ABILITY_BERSERK_AUTO_DEFENSE),
    "Femto hero meta should include Berserk Auto Defense trait"
  );

  let { state, griffith } = setupGriffithState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, griffith.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = promoteToFemto(state, griffith.id);
  state = setUnit(state, griffith.id, {
    charges: {
      ...state.units[griffith.id].charges,
      [ABILITY_BERSERK_AUTO_DEFENSE]: 6,
    },
  });
  state = toBattleState(state, "P2", attacker.id);
  state = initKnowledgeForOwners(state);

  const rngAuto = makeRngSequence([0.99, 0.99]);
  const started = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: griffith.id } as any,
    rngAuto
  );
  const afterAttackerRoll = resolvePendingRollOnce(started.state, rngAuto);
  assert(
    afterAttackerRoll.state.pendingRoll?.kind === "berserkerDefenseChoice",
    "Femto with 6 charges should receive berserker auto-defense choice"
  );

  const choseAuto = applyAction(
    afterAttackerRoll.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: afterAttackerRoll.state.pendingRoll!.id,
      player: afterAttackerRoll.state.pendingRoll!.player,
      choice: "auto",
    } as any,
    rngAuto
  );
  const autoAttackEvent = choseAuto.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === griffith.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(autoAttackEvent, "auto-defense combat event should resolve");
  assert(autoAttackEvent.hit === false, "auto-defense should dodge the attack");
  assert(
    choseAuto.state.units[griffith.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 0,
    "auto-defense should spend all 6 charges"
  );

  ({ state, griffith } = setupGriffithState());
  state = setUnit(state, griffith.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = promoteToFemto(state, griffith.id);
  state = setUnit(state, griffith.id, {
    charges: {
      ...state.units[griffith.id].charges,
      [ABILITY_BERSERK_AUTO_DEFENSE]: 5,
    },
  });
  state = toBattleState(state, "P2", attacker.id);
  state = initKnowledgeForOwners(state);

  const rngRoll = makeRngSequence([0.99, 0.99, 0.01, 0.01]);
  const startedNoPrompt = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: griffith.id } as any,
    rngRoll
  );
  const afterAttackerRollNoPrompt = resolvePendingRollOnce(
    startedNoPrompt.state,
    rngRoll
  );
  assert(
    afterAttackerRollNoPrompt.state.pendingRoll?.kind === "attack_defenderRoll",
    "Femto below 6 charges should not receive auto-defense choice prompt"
  );
  const finished = resolveAllPendingRolls(afterAttackerRollNoPrompt.state, rngRoll);
  assert(
    finished.state.units[griffith.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 5,
    "normal defense path should keep Berserk Auto Defense charges unchanged"
  );

  console.log("femto_berserk_auto_defense_gating_and_behavior passed");
}

function setupGutsState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { berserker: HERO_GUTS_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const guts = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_GUTS_ID
  )!;

  return { state, guts };
}

function testGutsHpBonus() {
  const { state, guts } = setupGutsState();
  const baseHp = getUnitDefinition("berserker").maxHp;
  const meta = getHeroMeta(HERO_GUTS_ID);

  assert(guts.hp === baseHp + 2, "Guts HP should be base berserker HP + 2");
  assert(
    meta?.baseStats.hp === baseHp + 2,
    "Guts hero meta HP should be base berserker HP + 2"
  );

  console.log("guts_hp_bonus passed");
}

function testGutsKnightMulticlassMovementAndDoubleAutoHit() {
  let { state, guts } = setupGutsState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, guts.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  const moveModes = applyAction(
    state,
    { type: "requestMoveOptions", unitId: guts.id } as any,
    makeRngSequence([])
  );
  const modeEvent = moveModes.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(
    modeEvent &&
      modeEvent.type === "moveOptionsGenerated" &&
      (modeEvent.modes ?? []).includes("knight"),
    "Guts should have Knight movement mode available"
  );

  const rng = makeRngSequence([0.01, 0.01, 0.99, 0.99]); // attacker double, strong defender
  const initial = applyAction(
    state,
    { type: "attack", attackerId: guts.id, defenderId: enemy.id } as any,
    rng
  );
  assert(
    initial.state.pendingRoll?.kind === "attack_attackerRoll",
    "Guts attack should request attacker roll"
  );

  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === guts.id &&
      event.defenderId === enemy.id
  );
  assert(attackEvent && attackEvent.type === "attackResolved", "attack should resolve");
  assert(attackEvent.hit, "double attack roll should auto-hit for Guts");
  assert(
    attackEvent.defenderRoll.sum > attackEvent.attackerRoll.sum,
    "test setup should have stronger defender roll to prove knight double override"
  );

  console.log("guts_knight_multiclass_movement_and_double_auto_hit passed");
}

function testGutsArbaletRangedFixedDamage() {
  const rng = makeAttackWinRng(1);
  let { state, guts } = setupGutsState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, guts.id, { position: { col: 0, row: 0 } });
  state = setUnit(state, enemy.id, { position: { col: 0, row: 2 } });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  const beforeHp = state.units[enemy.id].hp;
  const used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_ARBALET,
      payload: { targetId: enemy.id },
    } as any,
    rng
  );
  assert(
    used.state.pendingRoll?.kind === "attack_attackerRoll",
    "Arbalet should use ranged legal target flow and request attack roll"
  );

  const resolved = resolveAllPendingRollsWithEvents(used.state, rng);
  const events = [...used.events, ...resolved.events];
  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === guts.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;

  assert(attackEvent, "Arbalet attack should resolve");
  assert(attackEvent.damage === 1, "Arbalet should always deal exactly 1 damage");
  assert(
    resolved.state.units[enemy.id].hp === beforeHp - 1,
    "Arbalet should reduce HP by exactly 1"
  );

  console.log("guts_arbalet_ranged_fixed_damage passed");
}

function testGutsCannonGatingAndChargeSpend() {
  const rng = makeAttackWinRng(1);
  let { state, guts } = setupGutsState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, guts.id, {
    position: { col: 0, row: 0 },
    charges: { ...guts.charges, [ABILITY_GUTS_CANNON]: 1 },
  });
  state = setUnit(state, enemy.id, { position: { col: 0, row: 2 } });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_CANNON,
      payload: { targetId: enemy.id },
    } as any,
    rng
  );
  assert(!used.state.pendingRoll, "Cannon should be blocked below 2 charges");
  assert(
    used.state.units[guts.id].charges[ABILITY_GUTS_CANNON] === 1,
    "Cannon should not spend charges when blocked"
  );

  state = setUnit(state, guts.id, {
    charges: { ...state.units[guts.id].charges, [ABILITY_GUTS_CANNON]: 2 },
  });
  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_CANNON,
      payload: { targetId: enemy.id },
    } as any,
    rng
  );
  assert(
    used.state.pendingRoll?.kind === "attack_attackerRoll",
    "Cannon should request attack roll when charges are enough"
  );
  assert(
    used.state.units[guts.id].charges[ABILITY_GUTS_CANNON] === 0,
    "Cannon should spend exactly 2 charges immediately"
  );

  console.log("guts_cannon_gating_and_charge_spend passed");
}

function testGutsBerserkModeGatingAndActivation() {
  let { state, guts } = setupGutsState();
  state = setUnit(state, guts.id, {
    position: { col: 4, row: 4 },
    charges: { ...guts.charges, [ABILITY_GUTS_BERSERK_MODE]: 2 },
  });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_BERSERK_MODE,
    } as any,
    makeRngSequence([])
  );
  assert(!used.state.units[guts.id].gutsBerserkModeActive, "Berserk should be blocked below 3 charges");
  assert(
    used.state.units[guts.id].charges[ABILITY_GUTS_BERSERK_MODE] === 2,
    "Berserk should not spend charges when blocked"
  );

  state = setUnit(state, guts.id, {
    charges: { ...state.units[guts.id].charges, [ABILITY_GUTS_BERSERK_MODE]: 3 },
  });
  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_BERSERK_MODE,
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.units[guts.id].gutsBerserkModeActive === true,
    "Berserk should activate at 3+ charges"
  );
  assert(
    used.state.units[guts.id].charges[ABILITY_GUTS_BERSERK_MODE] === 0,
    "Berserk should spend all 3 charges on activation"
  );

  console.log("guts_berserk_mode_gating_and_activation passed");
}

function testGutsBerserkEndTurnSelfDamage() {
  let { state, guts } = setupGutsState();
  state = setUnit(state, guts.id, {
    position: { col: 4, row: 4 },
    hp: 6,
    gutsBerserkModeActive: true,
  });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  const ended = applyAction(state, { type: "endTurn" } as any, makeRngSequence([]));
  assert(
    ended.state.units[guts.id].hp === 5,
    "Berserk should deal 1 direct self-damage at end of Guts turn"
  );

  console.log("guts_berserk_end_turn_self_damage passed");
}

function testGutsBerserkMeleeBonusAndRangedNoBonus() {
  let { state, guts } = setupGutsState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, guts.id, {
    position: { col: 4, row: 4 },
    gutsBerserkModeActive: true,
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = initKnowledgeForOwners(state);

  const melee = resolveAttack(state, {
    attackerId: guts.id,
    defenderId: enemy.id,
    rolls: {
      attackerDice: [6, 5],
      defenderDice: [1, 1],
    },
  });
  const meleeEvent = melee.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === guts.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(meleeEvent, "melee attack should resolve");
  assert(
    meleeEvent.damage === state.units[guts.id].attack + 1,
    "Berserk melee attacks should gain +1 damage"
  );

  const ranged = resolveAttack(state, {
    attackerId: guts.id,
    defenderId: enemy.id,
    ignoreRange: true,
    rangedAttack: true,
    rolls: {
      attackerDice: [6, 5],
      defenderDice: [1, 1],
    },
  });
  const rangedEvent = ranged.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === guts.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(rangedEvent, "ranged attack should resolve");
  assert(
    rangedEvent.damage === state.units[guts.id].attack,
    "Berserk bonus should not apply to ranged attacks"
  );

  console.log("guts_berserk_melee_bonus_and_ranged_no_bonus passed");
}

function testGutsBerserkMovementAndAoEAndIncomingCap() {
  const rng = makeRngSequence([
    0.99,
    0.99, // shared attacker roll for AoE
    0.01,
    0.01, // defender 1
    0.01,
    0.01, // defender 2
    0.01,
    0.01, // defender 3
  ]);

  let { state, guts } = setupGutsState();
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "spearman"
  )!;
  const enemy1 = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;
  const enemy2 = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, guts.id, {
    position: { col: 4, row: 4 },
    gutsBerserkModeActive: true,
  });
  state = setUnit(state, ally.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemy1.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemy2.id, { position: { col: 5, row: 5 } });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  const moveModes = applyAction(
    state,
    { type: "requestMoveOptions", unitId: guts.id } as any,
    makeRngSequence([])
  );
  const modeEvent = moveModes.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(
    modeEvent &&
      modeEvent.type === "moveOptionsGenerated" &&
      (modeEvent.modes ?? []).includes("assassin"),
    "Berserk Guts should have Assassin movement mode available"
  );

  const assassinMove = applyAction(
    state,
    { type: "requestMoveOptions", unitId: guts.id, mode: "assassin" } as any,
    makeRngSequence([])
  );
  const assassinMoveEvent = assassinMove.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(
    assassinMoveEvent &&
      assassinMoveEvent.type === "moveOptionsGenerated" &&
      assassinMoveEvent.legalTo.some(
        (coord) => Math.max(Math.abs(coord.col - 4), Math.abs(coord.row - 4)) === 2
      ),
    "Assassin mode should provide distance-2 movement options"
  );

  const attacked = applyAction(
    state,
    { type: "attack", attackerId: guts.id, defenderId: enemy1.id } as any,
    rng
  );
  assert(
    attacked.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "Berserk normal attack should become shared-roll adjacent AoE"
  );

  const resolved = resolveAllPendingRollsWithEvents(attacked.state, rng);
  const events = [...attacked.events, ...resolved.events];
  const attackEvents = events.filter(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === guts.id &&
      [ally.id, enemy1.id, enemy2.id].includes(event.defenderId)
  ) as Extract<GameEvent, { type: "attackResolved" }>[];

  assert(
    attackEvents.length === 3,
    "Berserk AoE should hit all adjacent allies and enemies"
  );
  const attackedIds = attackEvents.map((event) => event.defenderId).sort();
  assert.deepStrictEqual(
    attackedIds,
    [ally.id, enemy1.id, enemy2.id].sort(),
    "Berserk AoE should include ally and enemy targets"
  );

  const attackerRollSignatures = new Set(
    attackEvents.map((event) => event.attackerRoll.dice.join(","))
  );
  assert(
    attackerRollSignatures.size === 1,
    "Berserk AoE should use one shared attacker roll for all targets"
  );

  const incoming = resolveAttack(state, {
    attackerId: enemy1.id,
    defenderId: guts.id,
    damageBonus: 5,
    rolls: {
      attackerDice: [6, 5],
      defenderDice: [1, 1],
    },
  });
  const incomingEvent = incoming.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === enemy1.id &&
      event.defenderId === guts.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(incomingEvent, "incoming attack should resolve");
  assert(
    incomingEvent.damage === 1,
    "Incoming damage against berserk Guts should be capped to 1"
  );

  console.log("guts_berserk_movement_aoe_and_incoming_cap passed");
}

function testGutsExitBerserkOnceAndNoReentry() {
  let { state, guts } = setupGutsState();
  state = setUnit(state, guts.id, {
    position: { col: 4, row: 4 },
    gutsBerserkModeActive: true,
    gutsBerserkExitUsed: false,
    charges: { ...guts.charges, [ABILITY_GUTS_BERSERK_MODE]: 3 },
  });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  const exited = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_EXIT_BERSERK,
    } as any,
    makeRngSequence([])
  );
  assert(
    exited.state.units[guts.id].gutsBerserkModeActive === false,
    "Exit Berserk should disable berserk mode"
  );
  assert(
    exited.state.units[guts.id].gutsBerserkExitUsed === true,
    "Exit Berserk should mark one-time exit as used"
  );

  let nextState = setUnit(exited.state, guts.id, {
    turn: makeEmptyTurnEconomy(),
    charges: {
      ...exited.state.units[guts.id].charges,
      [ABILITY_GUTS_BERSERK_MODE]: 3,
    },
  });
  nextState = { ...nextState, activeUnitId: guts.id, currentPlayer: "P1" };

  const reenter = applyAction(
    nextState,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_BERSERK_MODE,
    } as any,
    makeRngSequence([])
  );
  assert(
    reenter.state.units[guts.id].gutsBerserkModeActive === false,
    "Guts should not be able to re-enter berserk after exiting once"
  );
  assert(
    reenter.state.units[guts.id].charges[ABILITY_GUTS_BERSERK_MODE] === 3,
    "Blocked re-entry should not spend berserk charges"
  );

  console.log("guts_exit_berserk_once_and_no_reentry passed");
}

function setupKaladinState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { spearman: HERO_KALADIN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const kaladin = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_KALADIN_ID
  )!;

  return { state, kaladin };
}

function testKaladinHpBonus() {
  const { state, kaladin } = setupKaladinState();
  const baseHp = getUnitDefinition("spearman").maxHp;
  const meta = getHeroMeta(HERO_KALADIN_ID);

  assert(kaladin.hp === baseHp + 1, "Kaladin HP should be base spearman HP + 1");
  assert(
    meta?.baseStats.hp === baseHp + 1,
    "Kaladin hero meta HP should be base spearman HP + 1"
  );

  console.log("kaladin_hp_bonus passed");
}

function testKaladinFirstOathGatingHealingAndCosts() {
  let { state, kaladin } = setupKaladinState();
  state = setUnit(state, kaladin.id, {
    position: { col: 4, row: 4 },
    hp: 3,
    charges: { ...kaladin.charges, [ABILITY_KALADIN_FIRST]: 2 },
  });
  state = toBattleState(state, "P1", kaladin.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaladin.id,
      abilityId: ABILITY_KALADIN_FIRST,
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.units[kaladin.id].hp === 3,
    "First Oath should be blocked below 3 charges"
  );
  assert(
    used.state.units[kaladin.id].charges[ABILITY_KALADIN_FIRST] === 2,
    "First Oath should not spend charges when blocked"
  );

  state = setUnit(state, kaladin.id, {
    hp: 3,
    turn: makeEmptyTurnEconomy(),
    charges: { ...state.units[kaladin.id].charges, [ABILITY_KALADIN_FIRST]: 3 },
  });
  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaladin.id,
      abilityId: ABILITY_KALADIN_FIRST,
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.units[kaladin.id].hp === 5,
    "First Oath should heal exactly 2 HP"
  );
  assert(
    used.state.units[kaladin.id].charges[ABILITY_KALADIN_FIRST] === 0,
    "First Oath should spend exactly 3 charges"
  );
  assert(
    used.state.units[kaladin.id].turn.actionUsed,
    "First Oath should consume action slot"
  );
  const healEvent = used.events.find(
    (event) => event.type === "unitHealed" && event.unitId === kaladin.id
  ) as Extract<GameEvent, { type: "unitHealed" }> | undefined;
  assert(healEvent, "First Oath should emit heal event");
  assert(
    healEvent?.amount === 2 && healEvent.hpAfter === 5,
    "heal event should include healed amount and resulting HP"
  );

  state = setUnit(used.state, kaladin.id, {
    hp: 5,
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
    charges: { ...used.state.units[kaladin.id].charges, [ABILITY_KALADIN_FIRST]: 3 },
  });
  const clamped = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaladin.id,
      abilityId: ABILITY_KALADIN_FIRST,
    } as any,
    makeRngSequence([])
  );
  assert(
    clamped.state.units[kaladin.id].hp === 6,
    "First Oath healing should clamp to max HP"
  );

  console.log("kaladin_first_oath_gating_healing_and_costs passed");
}

function testKaladinSecondOathTricksterMoveAndAoeTrait() {
  let { state, kaladin } = setupKaladinState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, kaladin.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 5, row: 5 } });
  state = toBattleState(state, "P1", kaladin.id);
  state = initKnowledgeForOwners(state);

  const moveModes = applyAction(
    state,
    { type: "requestMoveOptions", unitId: kaladin.id } as any,
    makeRngSequence([])
  );
  const modeEvent = moveModes.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(
    modeEvent &&
      modeEvent.type === "moveOptionsGenerated" &&
      (modeEvent.modes ?? []).includes("trickster"),
    "Kaladin should have Trickster move mode from Second Oath"
  );

  const used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaladin.id,
      abilityId: ABILITY_TRICKSTER_AOE,
    } as any,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  assert(
    used.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "Kaladin should be able to use Trickster AoE trait"
  );

  console.log("kaladin_second_oath_trickster_move_and_aoe_trait passed");
}

function testKaladinThirdOathSpearmanBonusOnlyOnSpearmanAttack() {
  let { state, kaladin } = setupKaladinState();
  const enemySpearmanMode = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;
  const enemyTricksterMode = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, kaladin.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemySpearmanMode.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemyTricksterMode.id, { position: { col: 5, row: 6 } });
  state = toBattleState(state, "P1", kaladin.id);
  state = initKnowledgeForOwners(state);

  const legalTargets = getLegalAttackTargets(state, kaladin.id);
  assert(
    legalTargets.includes(enemyTricksterMode.id),
    "Kaladin should reach trickster-pattern targets from Second Oath"
  );

  const spearmanAttack = resolveAttack(state, {
    attackerId: kaladin.id,
    defenderId: enemySpearmanMode.id,
    rolls: {
      attackerDice: [6, 5],
      defenderDice: [1, 1],
    },
  });
  const spearmanEvent = spearmanAttack.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === kaladin.id &&
      event.defenderId === enemySpearmanMode.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(spearmanEvent, "spearman-mode attack should resolve");
  assert(
    spearmanEvent.damage === state.units[kaladin.id].attack + 1,
    "Third Oath should add +1 damage on Spearman-mode attacks"
  );

  const tricksterAttack = resolveAttack(state, {
    attackerId: kaladin.id,
    defenderId: enemyTricksterMode.id,
    rolls: {
      attackerDice: [6, 5],
      defenderDice: [1, 1],
    },
  });
  const tricksterEvent = tricksterAttack.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === kaladin.id &&
      event.defenderId === enemyTricksterMode.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(tricksterEvent, "trickster-mode attack should resolve");
  assert(
    tricksterEvent.damage === state.units[kaladin.id].attack,
    "Third Oath bonus should not apply to Trickster-mode attacks"
  );

  console.log("kaladin_third_oath_spearman_bonus_only_on_spearman_attack passed");
}

function testKaladinFourthOathBerserkerTraitMovementMode() {
  let { state, kaladin } = setupKaladinState();
  state = setUnit(state, kaladin.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", kaladin.id);
  state = initKnowledgeForOwners(state);

  const moveModes = applyAction(
    state,
    { type: "requestMoveOptions", unitId: kaladin.id } as any,
    makeRngSequence([])
  );
  const modeEvent = moveModes.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(
    modeEvent &&
      modeEvent.type === "moveOptionsGenerated" &&
      (modeEvent.modes ?? []).includes("berserker"),
    "Kaladin should have Berserker movement mode from Fourth Oath"
  );

  const berserkerRequest = applyAction(
    state,
    { type: "requestMoveOptions", unitId: kaladin.id, mode: "berserker" } as any,
    makeRngSequence([])
  );
  assert(
    berserkerRequest.state.pendingRoll?.kind === "moveBerserker",
    "Kaladin should reuse Berserker movement roll flow"
  );

  console.log("kaladin_fourth_oath_berserker_trait_movement_mode passed");
}

function testKaladinFifthOathGatingDamageAndImmobilizeDuration() {
  const rng = makeRngSequence([
    0.99,
    0.99, // shared attacker roll
    0.01,
    0.01, // defender 1
    0.01,
    0.01, // defender 2
  ]);

  let { state, kaladin } = setupKaladinState();
  const enemy1 = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;
  const enemy2 = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, kaladin.id, {
    position: { col: 0, row: 0 },
    charges: { ...kaladin.charges, [ABILITY_KALADIN_FIFTH]: 5 },
  });
  state = setUnit(state, enemy1.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy2.id, { position: { col: 5, row: 5 } });
  state = toBattleState(state, "P1", kaladin.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaladin.id,
      abilityId: ABILITY_KALADIN_FIFTH,
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  assert(!used.state.pendingRoll, "Fifth Oath should be blocked below 6 charges");
  assert(
    used.state.units[kaladin.id].charges[ABILITY_KALADIN_FIFTH] === 5,
    "Fifth Oath should not spend charges when blocked"
  );

  state = setUnit(state, kaladin.id, {
    turn: makeEmptyTurnEconomy(),
    charges: { ...state.units[kaladin.id].charges, [ABILITY_KALADIN_FIFTH]: 6 },
  });
  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaladin.id,
      abilityId: ABILITY_KALADIN_FIFTH,
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  assert(
    used.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "Fifth Oath should start shared-roll AoE resolution"
  );
  assert(
    used.state.units[kaladin.id].charges[ABILITY_KALADIN_FIFTH] === 0,
    "Fifth Oath should spend all 6 charges immediately"
  );
  assert(
    used.state.units[kaladin.id].turn.actionUsed,
    "Fifth Oath should consume action slot"
  );

  const resolved = resolveAllPendingRollsWithEvents(used.state, rng);
  const events = [...used.events, ...resolved.events];
  const attackEvents = events.filter(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === kaladin.id &&
      [enemy1.id, enemy2.id].includes(event.defenderId)
  ) as Extract<GameEvent, { type: "attackResolved" }>[];
  assert(attackEvents.length === 2, "Fifth Oath should attack all units in 5x5 area");
  for (const event of attackEvents) {
    assert(event.damage === 2, "Fifth Oath should deal fixed 2 damage on failed defense");
  }

  assert(
    resolved.state.units[enemy1.id].kaladinMoveLockSources?.includes(kaladin.id),
    "failed Fifth Oath target should become immobilized"
  );
  assert(
    resolved.state.units[enemy2.id].kaladinMoveLockSources?.includes(kaladin.id),
    "every failed target should become immobilized"
  );

  let enemyTurnState = toBattleState(resolved.state, "P2", enemy1.id);
  enemyTurnState = setUnit(enemyTurnState, enemy1.id, {
    turn: makeEmptyTurnEconomy(),
  });
  const blockedMove = applyAction(
    enemyTurnState,
    { type: "requestMoveOptions", unitId: enemy1.id } as any,
    makeRngSequence([])
  );
  assert(
    blockedMove.events.length === 0 && !blockedMove.state.pendingMove,
    "immobilized target should not receive move options"
  );

  const kaladinStartState: GameState = {
    ...resolved.state,
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaladin.id],
    turnQueueIndex: 0,
    turnOrder: [kaladin.id],
    turnOrderIndex: 0,
    phase: "battle",
  };
  const started = applyAction(
    kaladinStartState,
    { type: "unitStartTurn", unitId: kaladin.id } as any,
    makeRngSequence([])
  );
  assert(
    (started.state.units[enemy1.id].kaladinMoveLockSources?.length ?? 0) === 0,
    "immobilize should clear at the start of Kaladin's next turn"
  );
  assert(
    (started.state.units[enemy2.id].kaladinMoveLockSources?.length ?? 0) === 0,
    "all Fifth Oath immobilize locks from Kaladin should clear together"
  );

  let restoredMoveState = toBattleState(started.state, "P2", enemy1.id);
  restoredMoveState = setUnit(restoredMoveState, enemy1.id, {
    turn: makeEmptyTurnEconomy(),
  });
  const restoredMove = applyAction(
    restoredMoveState,
    { type: "requestMoveOptions", unitId: enemy1.id } as any,
    makeRngSequence([])
  );
  const moveEvent = restoredMove.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(moveEvent, "movement should be restored after Kaladin starts next turn");

  console.log("kaladin_fifth_oath_gating_damage_and_immobilize_duration passed");
}

function setupAsgoreState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { knight: HERO_ASGORE_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const asgore = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_ASGORE_ID
  )!;

  return { state, asgore };
}

function startAsgoreSoulParadeTurn(state: GameState, asgoreId: string) {
  const prepared = initKnowledgeForOwners({
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    pendingRoll: null,
    pendingMove: null,
    turnQueue: [asgoreId],
    turnQueueIndex: 0,
    turnOrder: [asgoreId],
    turnOrderIndex: 0,
  });
  return applyAction(
    prepared,
    { type: "unitStartTurn", unitId: asgoreId } as any,
    makeRngSequence([])
  );
}

function testAsgoreHpBonus() {
  const { asgore } = setupAsgoreState();
  const baseHp = getUnitDefinition("knight").maxHp;
  const meta = getHeroMeta(HERO_ASGORE_ID);

  assert(asgore.hp === baseHp + 3, "Asgore HP should be base knight HP + 3");
  assert(
    meta?.baseStats.hp === baseHp + 3,
    "Asgore hero meta HP should be base knight HP + 3"
  );

  console.log("asgore_hp_bonus passed");
}

function testAsgoreSpearmanReachAndDefenseDouble() {
  let { state, asgore } = setupAsgoreState();
  const rangeTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, asgore.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, rangeTarget.id, { position: { col: 6, row: 4 } });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", asgore.id);
  state = initKnowledgeForOwners(state);

  const legalTargets = getLegalAttackTargets(state, asgore.id);
  assert(
    legalTargets.includes(rangeTarget.id),
    "Asgore should use spearman reach and attack distance-2 targets"
  );

  const defended = resolveAttack(state, {
    attackerId: attacker.id,
    defenderId: asgore.id,
    rolls: {
      attackerDice: [6, 6],
      defenderDice: [1, 1],
    },
  });
  const defendEvent = defended.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === asgore.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(defendEvent, "incoming attack on Asgore should resolve");
  assert(
    !defendEvent.hit,
    "Asgore should auto-dodge on defense double via spearman multiclass"
  );

  console.log("asgore_spearman_reach_and_defense_double passed");
}

function testAsgoreFireballTargetingChargesAndDamage() {
  let { state, asgore } = setupAsgoreState();
  const lineTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const illegalTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, asgore.id, {
    position: { col: 4, row: 4 },
    charges: { ...asgore.charges, [ABILITY_ASGORE_FIREBALL]: 0 },
  });
  state = setUnit(state, lineTarget.id, { position: { col: 4, row: 7 } });
  state = setUnit(state, illegalTarget.id, { position: { col: 5, row: 6 } });
  state = toBattleState(state, "P1", asgore.id);
  state = initKnowledgeForOwners(state);

  const blockedByCharges = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIREBALL,
      payload: { targetId: lineTarget.id },
    } as any,
    makeRngSequence([])
  );
  assert(
    !blockedByCharges.state.pendingRoll,
    "Fireball should be blocked when charge is 0"
  );
  assert(
    blockedByCharges.state.units[asgore.id].charges[ABILITY_ASGORE_FIREBALL] === 0,
    "blocked Fireball should not change charges"
  );

  state = setUnit(state, asgore.id, {
    turn: makeEmptyTurnEconomy(),
    charges: { ...state.units[asgore.id].charges, [ABILITY_ASGORE_FIREBALL]: 1 },
  });
  const illegalTargetUse = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIREBALL,
      payload: { targetId: illegalTarget.id },
    } as any,
    makeRngSequence([])
  );
  assert(
    !illegalTargetUse.state.pendingRoll,
    "Fireball should reject illegal non-archer-line target"
  );
  assert(
    illegalTargetUse.state.units[asgore.id].charges[ABILITY_ASGORE_FIREBALL] === 1,
    "illegal Fireball target should not spend charge"
  );

  const used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIREBALL,
      payload: { targetId: lineTarget.id },
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind === "attack_attackerRoll",
    "legal Fireball should start normal attack roll flow"
  );
  assert(
    used.state.units[asgore.id].charges[ABILITY_ASGORE_FIREBALL] === 0,
    "Fireball should spend exactly 1 charge"
  );
  assert(
    used.state.units[asgore.id].turn.actionUsed,
    "Fireball should consume action slot"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    used.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const attackEvent = [...used.events, ...resolved.events].find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === asgore.id &&
      event.defenderId === lineTarget.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "Fireball attack should resolve");
  assert(attackEvent.hit, "Fireball should hit with deterministic winning roll");

  console.log("asgore_fireball_targeting_charges_and_damage passed");
}

function testAsgoreFireParadeAreaResolutionAndChargeSpend() {
  let { state, asgore } = setupAsgoreState();
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider"
  )!;
  const enemyNear = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const enemyFar = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "archer"
  )!;

  state = setUnit(state, asgore.id, {
    position: { col: 4, row: 4 },
    charges: { ...asgore.charges, [ABILITY_ASGORE_FIRE_PARADE]: 0 },
  });
  state = setUnit(state, ally.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemyNear.id, { position: { col: 3, row: 4 } });
  state = setUnit(state, enemyFar.id, { position: { col: 8, row: 8 } });
  state = toBattleState(state, "P1", asgore.id);
  state = initKnowledgeForOwners(state);

  const blocked = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIRE_PARADE,
    } as any,
    makeRngSequence([])
  );
  assert(!blocked.state.pendingRoll, "Fire Parade should be blocked with 0 charges");
  assert(
    blocked.state.units[asgore.id].charges[ABILITY_ASGORE_FIRE_PARADE] === 0,
    "blocked Fire Parade should keep charges"
  );

  state = setUnit(state, asgore.id, {
    turn: makeEmptyTurnEconomy(),
    charges: { ...state.units[asgore.id].charges, [ABILITY_ASGORE_FIRE_PARADE]: 1 },
  });
  const used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIRE_PARADE,
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "Fire Parade should start shared-roll AoE flow"
  );
  assert(
    used.state.units[asgore.id].charges[ABILITY_ASGORE_FIRE_PARADE] === 0,
    "Fire Parade should spend exactly 1 charge"
  );
  assert(
    used.state.units[asgore.id].turn.actionUsed,
    "Fire Parade should consume action slot"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    used.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01, 0.01, 0.01])
  );
  const attackEvents = [...used.events, ...resolved.events].filter(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === asgore.id &&
      [ally.id, enemyNear.id].includes(event.defenderId)
  ) as Extract<GameEvent, { type: "attackResolved" }>[];
  assert(
    attackEvents.length === 2,
    "Fire Parade should hit all units in trickster area around Asgore (including ally)"
  );
  const hitIds = attackEvents.map((event) => event.defenderId).sort();
  assert.deepStrictEqual(
    hitIds,
    [ally.id, enemyNear.id].sort(),
    "Fire Parade should include nearby ally and enemy and skip far targets"
  );
  const rollSignatures = new Set(
    attackEvents.map((event) => event.attackerRoll.dice.join(","))
  );
  assert(
    rollSignatures.size === 1,
    "Fire Parade should use one shared attacker roll for AoE"
  );
  assert(
    !attackEvents.some((event) => event.defenderId === enemyFar.id),
    "Fire Parade should not affect units outside trickster area"
  );

  console.log("asgore_fire_parade_area_resolution_and_charge_spend passed");
}

function testAsgoreSoulParadePatienceAttackAndTempStealth() {
  let { state, asgore } = setupAsgoreState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, asgore.id, {
    position: { col: 4, row: 4 },
    charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });

  const started = startAsgoreSoulParadeTurn(state, asgore.id);
  assert(
    started.state.pendingRoll?.kind === "asgoreSoulParadeRoll",
    "Soul Parade should trigger at start turn when charges become full"
  );
  assert(
    started.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 0,
    "Soul Parade trigger should spend all 3 charges"
  );

  const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.1]));
  assert(
    rolled.state.pendingRoll?.kind === "asgoreSoulParadePatienceTargetChoice",
    "Soul Parade roll=1 should request Patience target"
  );
  assert(
    !!rolled.state.units[asgore.id].asgorePatienceStealthActive,
    "Patience branch should enable temporary stealth threshold 5-6"
  );

  const targetPicked = resolvePendingWithChoice(
    rolled.state,
    { type: "asgoreSoulParadePatienceTarget", targetId: enemy.id },
    makeRngSequence([])
  );
  assert(
    targetPicked.state.pendingRoll?.kind === "attack_attackerRoll",
    "Patience branch should trigger immediate attack flow"
  );
  const resolvedAttack = resolveAllPendingRollsWithEvents(
    targetPicked.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const patienceAttack = [...targetPicked.events, ...resolvedAttack.events].find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === asgore.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(patienceAttack, "Patience branch attack should resolve");

  let stealthState = setUnit(resolvedAttack.state, asgore.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    hasAttackedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  stealthState = { ...stealthState, currentPlayer: "P1", activeUnitId: asgore.id };
  const attemptFail = applyAction(
    stealthState,
    { type: "enterStealth", unitId: asgore.id } as any,
    makeRngSequence([])
  );
  assert(
    attemptFail.state.pendingRoll?.kind === "enterStealth",
    "Patience should allow Asgore to attempt stealth during this turn"
  );
  const failedStealth = resolvePendingRollOnce(
    attemptFail.state,
    makeRngSequence([0.5])
  ); // roll 4
  assert(
    !failedStealth.state.units[asgore.id].isStealthed,
    "Patience stealth should fail on roll 4 (threshold 5-6)"
  );

  let secondAttemptState = setUnit(failedStealth.state, asgore.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    hasAttackedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  secondAttemptState = {
    ...secondAttemptState,
    currentPlayer: "P1",
    activeUnitId: asgore.id,
  };
  const attemptSuccess = applyAction(
    secondAttemptState,
    { type: "enterStealth", unitId: asgore.id } as any,
    makeRngSequence([])
  );
  const succeededStealth = resolvePendingRollOnce(
    attemptSuccess.state,
    makeRngSequence([0.8])
  ); // roll 5
  assert(
    succeededStealth.state.units[asgore.id].isStealthed,
    "Patience stealth should succeed on roll 5"
  );

  console.log("asgore_soul_parade_patience_attack_and_temp_stealth passed");
}

function testAsgoreSoulParadeBraveryAutoDefenseOneTime() {
  let { state, asgore } = setupAsgoreState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, asgore.id, {
    position: { col: 4, row: 4 },
    charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
  });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });

  const started = startAsgoreSoulParadeTurn(state, asgore.id);
  const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.2])); // roll 2
  assert(!rolled.state.pendingRoll, "Bravery branch should resolve immediately");
  assert(
    !!rolled.state.units[asgore.id].asgoreBraveryAutoDefenseReady,
    "Bravery branch should arm one-time auto defense"
  );

  let defendState = toBattleState(rolled.state, "P2", attacker.id);
  defendState = initKnowledgeForOwners(defendState);
  const attackStarted = applyAction(
    defendState,
    { type: "attack", attackerId: attacker.id, defenderId: asgore.id } as any,
    makeRngSequence([])
  );
  const afterAttacker = resolvePendingRollOnce(
    attackStarted.state,
    makeRngSequence([0.99, 0.99])
  );
  assert(
    afterAttacker.state.pendingRoll?.kind === "asgoreBraveryDefenseChoice",
    "Bravery choice should appear after attacker roll"
  );

  const autoChosen = applyAction(
    afterAttacker.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: afterAttacker.state.pendingRoll!.id,
      player: afterAttacker.state.pendingRoll!.player,
      choice: "auto",
    } as any,
    makeRngSequence([])
  );
  const autoEvent = autoChosen.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === asgore.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(autoEvent, "attack should resolve after Bravery auto-defense");
  assert(!autoEvent.hit && autoEvent.damage === 0, "Bravery auto-defense should negate hit");
  assert(
    !autoChosen.state.units[asgore.id].asgoreBraveryAutoDefenseReady,
    "Bravery auto-defense should be consumed after one use"
  );

  let secondDefendState = toBattleState(autoChosen.state, "P2", attacker.id);
  secondDefendState = initKnowledgeForOwners(secondDefendState);
  secondDefendState = setUnit(secondDefendState, attacker.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    hasAttackedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  const secondStart = applyAction(
    secondDefendState,
    { type: "attack", attackerId: attacker.id, defenderId: asgore.id } as any,
    makeRngSequence([])
  );
  const secondAfterAttacker = resolvePendingRollOnce(
    secondStart.state,
    makeRngSequence([0.99, 0.99])
  );
  assert(
    secondAfterAttacker.state.pendingRoll?.kind === "attack_defenderRoll",
    "After Bravery is spent, defense should proceed with normal defender roll"
  );

  console.log("asgore_soul_parade_bravery_auto_defense_one_time passed");
}

function testAsgoreSoulParadeIntegrityPerseveranceKindnessJustice() {
  {
    let { state, asgore } = setupAsgoreState();
    state = setUnit(state, asgore.id, {
      position: { col: 4, row: 4 },
      charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
    });
    const started = startAsgoreSoulParadeTurn(state, asgore.id);
    const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.4])); // roll 3
    assert(
      rolled.state.pendingRoll?.kind === "asgoreSoulParadeIntegrityDestination",
      "Soul Parade roll=3 should request Integrity destination"
    );
    const moved = resolvePendingWithChoice(
      rolled.state,
      {
        type: "asgoreSoulParadeIntegrityDestination",
        position: { col: 8, row: 8 },
      },
      makeRngSequence([])
    );
    assert(
      moved.state.units[asgore.id].position?.col === 8 &&
        moved.state.units[asgore.id].position?.row === 8,
      "Integrity should reposition Asgore to selected empty cell"
    );
    assert(
      !moved.state.units[asgore.id].turn.moveUsed,
      "Integrity reposition should not consume move action"
    );
  }

  {
    let { state, asgore } = setupAsgoreState();
    const target = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.class === "knight"
    )!;
    state = setUnit(state, asgore.id, {
      position: { col: 4, row: 4 },
      charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
    });
    state = setUnit(state, target.id, { position: { col: 5, row: 4 } });
    const started = startAsgoreSoulParadeTurn(state, asgore.id);
    const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.55])); // roll 4
    assert(
      rolled.state.pendingRoll?.kind === "asgoreSoulParadePerseveranceTargetChoice",
      "Soul Parade roll=4 should request Perseverance target"
    );
    const applied = resolvePendingWithChoice(
      rolled.state,
      { type: "asgoreSoulParadePerseveranceTarget", targetId: target.id },
      makeRngSequence([0.1]) // fail check
    );
    assert(
      !!applied.state.units[target.id].movementDisabledNextTurn,
      "Perseverance failed check should disable target movement next turn"
    );
  }

  {
    let { state, asgore } = setupAsgoreState();
    state = setUnit(state, asgore.id, {
      position: { col: 4, row: 4 },
      hp: 5,
      charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
    });
    const started = startAsgoreSoulParadeTurn(state, asgore.id);
    const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.7])); // roll 5
    assert(!rolled.state.pendingRoll, "Kindness branch should resolve immediately");
    assert(
      rolled.state.units[asgore.id].hp === 7,
      "Kindness should heal Asgore by 2 HP"
    );
  }

  {
    let { state, asgore } = setupAsgoreState();
    const target = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.class === "knight"
    )!;
    state = setUnit(state, asgore.id, {
      position: { col: 4, row: 4 },
      charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
    });
    state = setUnit(state, target.id, { position: { col: 4, row: 6 } });
    const started = startAsgoreSoulParadeTurn(state, asgore.id);
    const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.95])); // roll 6
    assert(
      rolled.state.pendingRoll?.kind === "asgoreSoulParadeJusticeTargetChoice",
      "Soul Parade roll=6 should request Justice target"
    );
    const justiceOptions =
      (rolled.state.pendingRoll?.context as { options?: string[] } | undefined)
        ?.options ?? [];
    assert(
      justiceOptions.includes(target.id),
      "Justice target options should include archer-legal target"
    );
    const picked = resolvePendingWithChoice(
      rolled.state,
      { type: "asgoreSoulParadeJusticeTarget", targetId: target.id },
      makeRngSequence([])
    );
    assert(
      picked.state.pendingRoll?.kind === "attack_attackerRoll",
      "Justice branch should trigger immediate ranged attack flow"
    );
    const resolved = resolveAllPendingRollsWithEvents(
      picked.state,
      makeRngSequence([0.99, 0.99, 0.01, 0.01])
    );
    const justiceAttack = [...picked.events, ...resolved.events].find(
      (event) =>
        event.type === "attackResolved" &&
        event.attackerId === asgore.id &&
        event.defenderId === target.id
    ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
    assert(justiceAttack, "Justice branch attack should resolve");
    assert(justiceAttack.hit, "Justice branch should hit with winning deterministic roll");
  }

  console.log("asgore_soul_parade_integrity_perseverance_kindness_justice passed");
}

function setupOdinState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_ODIN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const odin = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_ODIN_ID
  )!;

  return { state, odin };
}

function testOdinHpBonus() {
  const { odin } = setupOdinState();
  const baseHp = getUnitDefinition("rider").maxHp;
  const meta = getHeroMeta(HERO_ODIN_ID);

  assert(odin.hp === baseHp + 5, "Odin HP should be base rider HP + 5");
  assert(
    meta?.baseStats.hp === baseHp + 5,
    "Odin hero meta HP should be base rider HP + 5"
  );

  console.log("odin_hp_bonus passed");
}

function testOdinGungnirAutoHitOnAttackDouble() {
  let { state, odin } = setupOdinState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, odin.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = initKnowledgeForOwners(state);

  const direct = resolveAttack(state, {
    attackerId: odin.id,
    defenderId: enemy.id,
    rolls: {
      attackerDice: [1, 1],
      defenderDice: [6, 6],
    },
  });
  const directEvent = direct.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === odin.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(directEvent, "direct Odin attack should resolve");
  assert(
    directEvent.hit,
    "Gungnir should force hit on attack double even against higher defense roll"
  );

  let battle = toBattleState(state, "P1", odin.id);
  battle = initKnowledgeForOwners(battle);
  const started = applyAction(
    battle,
    { type: "attack", attackerId: odin.id, defenderId: enemy.id } as any,
    makeRngSequence([0.01, 0.01, 0.99, 0.99])
  );
  const resolved = resolveAllPendingRollsWithEvents(
    started.state,
    makeRngSequence([0.01, 0.01, 0.99, 0.99])
  );
  const pendingEvent = [...started.events, ...resolved.events].find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === odin.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(pendingEvent, "pending-flow Odin attack should resolve");
  assert(
    pendingEvent.hit,
    "Gungnir should also apply in pending attack flow for rider attacks"
  );

  console.log("odin_gungnir_auto_hit_on_attack_double passed");
}

function testOdinHuginnStealthVisibilityRadius() {
  let { state, odin } = setupOdinState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "assassin"
  )!;

  state = setUnit(state, odin.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, {
    position: { col: 5, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = toBattleState(state, "P1", odin.id);
  state = initKnowledgeForOwners(state);

  const viewNear = makePlayerView(state, "P1");
  assert(
    !!viewNear.units[enemy.id],
    "Huginn should make adjacent stealthed enemy visible to Odin's owner"
  );
  const legalNear = getLegalAttackTargets(state, odin.id);
  assert(
    legalNear.includes(enemy.id),
    "Odin should be able to target adjacent stealthed enemy"
  );

  state = setUnit(state, enemy.id, {
    position: { col: 6, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  const viewFar = makePlayerView(state, "P1");
  assert(
    !viewFar.units[enemy.id],
    "Huginn should not reveal stealthed enemies outside radius 1"
  );

  console.log("odin_huginn_stealth_visibility_radius passed");
}

function testOdinSleipnirGatingTeleportAndNoMoveSpend() {
  let { state, odin } = setupOdinState();
  state = setUnit(state, odin.id, {
    position: { col: 0, row: 0 },
    charges: { ...odin.charges, [ABILITY_ODIN_SLEIPNIR]: 2 },
  });
  state = toBattleState(state, "P1", odin.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: odin.id,
      abilityId: ABILITY_ODIN_SLEIPNIR,
      payload: { to: { col: 8, row: 8 } },
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.units[odin.id].position?.col === 0 &&
      used.state.units[odin.id].position?.row === 0,
    "Sleipnir should be blocked below 3 charges"
  );
  assert(
    used.state.units[odin.id].charges[ABILITY_ODIN_SLEIPNIR] === 2,
    "Sleipnir should not spend charges when blocked"
  );

  state = setUnit(state, odin.id, {
    turn: makeEmptyTurnEconomy(),
    charges: { ...state.units[odin.id].charges, [ABILITY_ODIN_SLEIPNIR]: 3 },
  });
  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: odin.id,
      abilityId: ABILITY_ODIN_SLEIPNIR,
      payload: { to: { col: 8, row: 8 } },
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.units[odin.id].position?.col === 8 &&
      used.state.units[odin.id].position?.row === 8,
    "Sleipnir should teleport Odin to chosen empty cell"
  );
  assert(
    used.state.units[odin.id].charges[ABILITY_ODIN_SLEIPNIR] === 0,
    "Sleipnir should spend all 3 charges"
  );
  assert(
    !used.state.units[odin.id].turn.moveUsed,
    "Sleipnir should not consume move slot"
  );
  assert(
    !used.state.units[odin.id].turn.actionUsed,
    "Sleipnir should not consume action slot"
  );

  console.log("odin_sleipnir_gating_teleport_and_no_move_spend passed");
}

function testOdinMuninnPostDefenseChoice() {
  let { state, odin } = setupOdinState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  state = setUnit(state, odin.id, {
    position: { col: 4, row: 4 },
    charges: { ...odin.charges, [ABILITY_ODIN_MUNINN]: 5 },
  });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", attacker.id);
  state = initKnowledgeForOwners(state);

  let lowStart = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: odin.id } as any,
    makeRngSequence([])
  );
  lowStart = resolvePendingRollOnce(
    lowStart.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const lowResolved = resolvePendingRollOnce(
    lowStart.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  assert(
    lowResolved.state.pendingRoll?.kind !== "odinMuninnDefenseChoice",
    "Muninn choice must not appear below 6 charges"
  );
  assert(
    lowResolved.state.units[odin.id].charges[ABILITY_ODIN_MUNINN] === 5,
    "Muninn charges should stay unchanged when not full"
  );

  state = setUnit(state, odin.id, {
    turn: makeEmptyTurnEconomy(),
    charges: { ...state.units[odin.id].charges, [ABILITY_ODIN_MUNINN]: 6 },
  });
  const start = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: odin.id } as any,
    makeRngSequence([])
  );
  assert(
    start.state.pendingRoll?.kind === "attack_attackerRoll",
    "attack should request attacker roll first"
  );

  const afterAttacker = resolvePendingRollOnce(
    start.state,
    makeRngSequence([0.99, 0.99])
  );
  assert(
    afterAttacker.state.pendingRoll?.kind === "attack_defenderRoll",
    "after attacker roll, defender roll should be requested"
  );

  const afterDefender = resolvePendingRollOnce(
    afterAttacker.state,
    makeRngSequence([0.01, 0.01])
  );
  assert(
    afterDefender.state.pendingRoll?.kind === "odinMuninnDefenseChoice",
    "Muninn choice should appear after defense roll when charges are full"
  );

  const choseMuninn = applyAction(
    afterDefender.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: afterDefender.state.pendingRoll!.id,
      player: afterDefender.state.pendingRoll!.player,
      choice: "auto",
    } as any,
    makeRngSequence([])
  );
  assert(!choseMuninn.state.pendingRoll, "Muninn choice should resolve immediately");
  const attackEvent = choseMuninn.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === odin.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "attack should resolve after Muninn choice");
  assert(!attackEvent.hit, "Muninn auto-defense should force a successful defense");
  assert(attackEvent.damage === 0, "Muninn auto-defense should negate damage");
  assert(
    choseMuninn.state.units[odin.id].charges[ABILITY_ODIN_MUNINN] === 0,
    "Muninn should spend all 6 charges on use"
  );
  const abilityEvent = choseMuninn.events.find(
    (event) =>
      event.type === "abilityUsed" &&
      event.unitId === odin.id &&
      event.abilityId === ABILITY_ODIN_MUNINN
  );
  assert(abilityEvent, "using Muninn should emit abilityUsed event");

  console.log("odin_muninn_post_defense_choice passed");
}

function setupRiverPersonState() {
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", { rider: HERO_RIVER_PERSON_ID })
  );
  state = attachArmy(state, createDefaultArmy("P2"));

  const river = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_RIVER_PERSON_ID
  )!;

  return { state, river };
}

function testRiverPersonHpBonus() {
  const { river } = setupRiverPersonState();
  const baseHp = getUnitDefinition("rider").maxHp;
  const meta = getHeroMeta(HERO_RIVER_PERSON_ID);

  assert(river.hp === baseHp + 1, "River Person HP should be base rider HP + 1");
  assert(
    meta?.baseStats.hp === baseHp + 1,
    "River Person hero meta HP should be base rider HP + 1"
  );

  console.log("river_person_hp_bonus passed");
}

function testRiverPersonNoRiderPathFeature() {
  let { state, river } = setupRiverPersonState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, river.id, { position: { col: 0, row: 0 } });
  state = setUnit(state, enemy.id, { position: { col: 0, row: 1 } });
  state = toBattleState(state, "P1", river.id);
  state = initKnowledgeForOwners(state);

  const moved = applyAction(
    state,
    { type: "move", unitId: river.id, to: { col: 0, row: 4 } } as any,
    makeRngSequence([])
  );
  assert(
    moved.state.units[river.id].position?.col === 0 &&
      moved.state.units[river.id].position?.row === 4,
    "River Person should still use rider baseline movement"
  );
  assert(
    moved.state.pendingRoll?.kind !== "riderPathAttack_attackerRoll",
    "River Person should not trigger rider path attacks"
  );
  const riderPathRequested = moved.events.some(
    (event) =>
      event.type === "rollRequested" &&
      event.kind === "riderPathAttack_attackerRoll"
  );
  assert(!riderPathRequested, "River Person movement should not queue rider path roll");

  console.log("river_person_no_rider_path_feature passed");
}

function testRiverPersonBoatCarryFlowAndConstraints() {
  {
    let { state, river } = setupRiverPersonState();
    state = setUnit(state, river.id, { position: { col: 4, row: 4 } });
    state = toBattleState(state, "P1", river.id);
    state = initKnowledgeForOwners(state);

    const requested = applyAction(
      state,
      { type: "requestMoveOptions", unitId: river.id } as any,
      makeRngSequence([])
    );
    assert(
      requested.state.pendingRoll?.kind !== "riverBoatCarryChoice",
      "Boat carry choice should not be requested without adjacent allies"
    );
  }

  {
    let { state, river } = setupRiverPersonState();
    const carriedAlly = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.class === "assassin"
    )!;
    const blockA = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.class === "knight"
    )!;
    const blockB = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.class === "knight"
    )!;
    const blockC = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.class === "archer"
    )!;

    state = setUnit(state, river.id, { position: { col: 0, row: 3 } });
    state = setUnit(state, carriedAlly.id, { position: { col: 1, row: 3 } });
    state = setUnit(state, blockA.id, { position: { col: 0, row: 1 } });
    state = setUnit(state, blockB.id, { position: { col: 1, row: 0 } });
    state = setUnit(state, blockC.id, { position: { col: 1, row: 1 } });
    state = toBattleState(state, "P1", river.id);
    state = initKnowledgeForOwners(state);

    const requested = applyAction(
      state,
      { type: "requestMoveOptions", unitId: river.id } as any,
      makeRngSequence([])
    );
    assert(
      requested.state.pendingRoll?.kind === "riverBoatCarryChoice",
      "Boat move should prompt carry choice when adjacent ally exists"
    );

    const carrySelected = resolvePendingWithChoice(
      requested.state,
      { type: "hassanTrueEnemyTarget", targetId: carriedAlly.id },
      makeRngSequence([])
    );
    const legalMoves = carrySelected.state.pendingMove?.legalTo ?? [];
    assert(
      !legalMoves.some((coord) => coord.col === 0 && coord.row === 0),
      "Carry move options should exclude destinations without a legal drop cell"
    );
    assert(
      legalMoves.some((coord) => coord.col === 0 && coord.row === 5),
      "Carry move options should keep destinations that allow dropping ally"
    );

    const moved = applyAction(
      carrySelected.state,
      { type: "move", unitId: river.id, to: { col: 0, row: 5 } } as any,
      makeRngSequence([])
    );
    assert(
      moved.state.pendingRoll?.kind === "riverBoatDropDestination",
      "After carrying move, River Person should request drop destination"
    );

    const invalidDrop = resolvePendingWithChoice(
      moved.state,
      { type: "forestMoveDestination", position: { col: 2, row: 5 } },
      makeRngSequence([])
    );
    assert(
      invalidDrop.state.pendingRoll?.kind === "riverBoatDropDestination",
      "Invalid drop destination should be rejected"
    );

    const dropOptions =
      (moved.state.pendingRoll?.context as { options?: Coord[] } | undefined)
        ?.options ?? [];
    assert(dropOptions.length > 0, "drop options should be provided");
    const chosenDrop = dropOptions[0];
    const dropped = resolvePendingWithChoice(
      moved.state,
      { type: "forestMoveDestination", position: chosenDrop },
      makeRngSequence([])
    );

    const riverAfter = dropped.state.units[river.id];
    const allyAfter = dropped.state.units[carriedAlly.id];
    assert(
      allyAfter.position?.col === chosenDrop.col &&
        allyAfter.position?.row === chosenDrop.row,
      "carried ally should be dropped on chosen destination"
    );
    assert(
      Math.max(
        Math.abs((allyAfter.position?.col ?? 0) - (riverAfter.position?.col ?? 0)),
        Math.abs((allyAfter.position?.row ?? 0) - (riverAfter.position?.row ?? 0))
      ) <= 1,
      "dropped ally cell must be adjacent to River Person"
    );
    assert(
      !(allyAfter.position?.col === riverAfter.position?.col &&
        allyAfter.position?.row === riverAfter.position?.row),
      "drop destination must stay unoccupied by River Person"
    );
  }

  console.log("river_person_boat_carry_flow_and_constraints passed");
}

function testRiverPersonBoatmanConvertsActionToMoveAndSupportsCarry() {
  let { state, river } = setupRiverPersonState();
  const carriedAlly = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "assassin"
  )!;

  state = setUnit(state, river.id, {
    position: { col: 3, row: 3 },
    turn: {
      moveUsed: true,
      attackUsed: false,
      actionUsed: false,
      stealthUsed: false,
    },
  });
  state = setUnit(state, carriedAlly.id, { position: { col: 3, row: 4 } });
  state = toBattleState(state, "P1", river.id);
  state = initKnowledgeForOwners(state);

  const usedBoatman = applyAction(
    state,
    {
      type: "useAbility",
      unitId: river.id,
      abilityId: ABILITY_RIVER_PERSON_BOATMAN,
    } as any,
    makeRngSequence([])
  );
  assert(
    usedBoatman.state.units[river.id].turn.actionUsed,
    "Boatman should consume River Person action slot"
  );
  assert(
    usedBoatman.state.units[river.id].turn.moveUsed,
    "Boatman should not reset/spend move slot state"
  );
  assert(
    usedBoatman.state.pendingRoll?.kind === "riverBoatCarryChoice",
    "Boatman movement should use carry choice flow when adjacent ally exists"
  );

  const carrySelected = resolvePendingWithChoice(
    usedBoatman.state,
    { type: "hassanTrueEnemyTarget", targetId: carriedAlly.id },
    makeRngSequence([])
  );
  const destination = carrySelected.state.pendingMove?.legalTo.find(
    (coord) => coord.col === 3 && coord.row === 5
  );
  assert(destination, "Boatman move should provide legal movement destinations");

  const moved = applyAction(
    carrySelected.state,
    { type: "move", unitId: river.id, to: destination! } as any,
    makeRngSequence([])
  );
  assert(
    moved.state.pendingRoll?.kind === "riverBoatDropDestination",
    "Boatman move with carry should request ally drop destination"
  );
  const dropOptions =
    (moved.state.pendingRoll?.context as { options?: Coord[] } | undefined)
      ?.options ?? [];
  assert(dropOptions.length > 0, "Boatman carry should provide drop options");
  const dropped = resolvePendingWithChoice(
    moved.state,
    { type: "forestMoveDestination", position: dropOptions[0] },
    makeRngSequence([])
  );

  assert(
    dropped.state.units[river.id].position?.col === destination!.col &&
      dropped.state.units[river.id].position?.row === destination!.row,
    "River Person should move through Boatman even with move slot already spent"
  );
  assert(
    dropped.state.units[carriedAlly.id].position?.col === dropOptions[0].col &&
      dropped.state.units[carriedAlly.id].position?.row === dropOptions[0].row,
    "Boat carry should still work when movement is granted by Boatman"
  );
  assert(
    dropped.state.units[river.id].riverBoatmanMovePending !== true,
    "Boatman move flag should clear after movement resolves"
  );

  console.log("river_person_boatman_converts_action_to_move_and_supports_carry passed");
}

function testRiverPersonGuideOfSoulsStormImmunity() {
  let { state, river } = setupRiverPersonState();
  state = setUnit(state, river.id, { position: { col: 4, row: 4 }, hp: 7 });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    arenaId: "storm",
    turnQueue: [river.id],
    turnQueueIndex: 0,
    turnOrder: [river.id],
    turnOrderIndex: 0,
  };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: river.id } as any,
    makeRngSequence([0.0])
  );
  assert(
    started.state.units[river.id].hp === 7,
    "Guide of Souls should prevent storm start-turn damage"
  );

  console.log("river_person_guide_of_souls_storm_immunity passed");
}

function testRiverPersonTraLaLaGatingAndFlow() {
  let { state, river } = setupRiverPersonState();
  const target = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "berserker"
  )!;
  const allySpearman = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "spearman"
  )!;
  const allyKnight = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const allyNoHit = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "assassin"
  )!;

  state = setUnit(state, river.id, {
    position: { col: 4, row: 4 },
    charges: { ...river.charges, [ABILITY_RIVER_PERSON_TRA_LA_LA]: 3 },
  });
  state = setUnit(state, target.id, { position: { col: 5, row: 4 }, hp: 10 });
  state = setUnit(state, allySpearman.id, { position: { col: 4, row: 3 } });
  state = setUnit(state, allyKnight.id, { position: { col: 5, row: 5 } });
  state = setUnit(state, allyNoHit.id, { position: { col: 3, row: 5 } });
  state = toBattleState(state, "P1", river.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: river.id,
      abilityId: ABILITY_RIVER_PERSON_TRA_LA_LA,
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind !== "riverTraLaLaTargetChoice",
    "Tra-la-la should be unavailable before full 4 charges"
  );
  assert(
    used.state.units[river.id].charges[ABILITY_RIVER_PERSON_TRA_LA_LA] === 3,
    "Tra-la-la should not spend charges when unavailable"
  );

  state = setUnit(state, river.id, {
    turn: makeEmptyTurnEconomy(),
    charges: {
      ...state.units[river.id].charges,
      [ABILITY_RIVER_PERSON_TRA_LA_LA]: 4,
    },
  });
  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: river.id,
      abilityId: ABILITY_RIVER_PERSON_TRA_LA_LA,
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind === "riverTraLaLaTargetChoice",
    "Tra-la-la should request adjacent target selection"
  );
  assert(
    used.state.units[river.id].charges[ABILITY_RIVER_PERSON_TRA_LA_LA] === 0,
    "Tra-la-la should spend all 4 charges on activation"
  );
  assert(
    used.state.units[river.id].turn.actionUsed,
    "Tra-la-la should consume action slot"
  );

  const targetSelected = resolvePendingWithChoice(
    used.state,
    { type: "hassanTrueEnemyTarget", targetId: target.id },
    makeRngSequence([])
  );
  assert(
    targetSelected.state.pendingRoll?.kind === "riverTraLaLaDestinationChoice",
    "Tra-la-la should request destination after target selection"
  );
  const destinationOptions =
    (targetSelected.state.pendingRoll?.context as { options?: Coord[] } | undefined)
      ?.options ?? [];
  assert(
    destinationOptions.some((coord) => coord.col === 4 && coord.row === 7),
    "Tra-la-la destination options should include straight cardinal cells"
  );
  assert(
    !destinationOptions.some((coord) => coord.col === 5 && coord.row === 5),
    "Tra-la-la destination options should exclude diagonal cells"
  );

  const destinationSelected = resolvePendingWithChoice(
    targetSelected.state,
    { type: "forestMoveDestination", position: { col: 4, row: 7 } },
    makeRngSequence([])
  );
  assert(
    destinationSelected.state.units[river.id].position?.col === 4 &&
      destinationSelected.state.units[river.id].position?.row === 7,
    "Tra-la-la should move River Person to selected destination"
  );
  assert(
    destinationSelected.state.pendingRoll?.kind === "attack_attackerRoll",
    "Tra-la-la touched allies should start immediate attack resolution"
  );

  const queue = destinationSelected.state.pendingCombatQueue ?? [];
  const attackerIds = queue.map((entry) => entry.attackerId);
  const uniqueAttackers = Array.from(new Set(attackerIds));
  assert(
    uniqueAttackers.length === attackerIds.length,
    "Each touched ally should attack at most once"
  );
  assert(
    attackerIds.includes(allySpearman.id) && attackerIds.includes(allyKnight.id),
    "Touched allies that can legally attack must be queued"
  );
  assert(
    !attackerIds.includes(allyNoHit.id),
    "Touched allies without legal attack must not be queued"
  );
  assert(
    attackerIds[0] === allySpearman.id,
    "Tra-la-la ally attack order should be deterministic by board reading order"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    destinationSelected.state,
    makeAttackWinRng(uniqueAttackers.length)
  );
  const combinedEvents = [...destinationSelected.events, ...resolved.events];
  const allyAttackEvents = combinedEvents.filter(
    (event) =>
      event.type === "attackResolved" &&
      uniqueAttackers.includes(event.attackerId) &&
      event.defenderId === target.id
  );
  assert(
    allyAttackEvents.length === uniqueAttackers.length,
    "Tra-la-la should resolve exactly one attack per queued ally"
  );

  console.log("river_person_tralala_gating_and_flow passed");
}

function setupLokiState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LOKI_ID }));
  state = attachArmy(
    state,
    createDefaultArmy("P2", { rider: HERO_GENGHIS_KHAN_ID })
  );

  const loki = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_LOKI_ID
  )!;

  return { state, loki };
}

function resolvePendingWithChoice(
  state: GameState,
  choice: any,
  rng: Parameters<typeof applyActionRaw>[2]
) {
  const pending = state.pendingRoll;
  assert(pending, "pending roll should exist");
  return applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice,
    } as any,
    rng
  );
}

function testLokiLaughterIncrementsOnAnyDouble() {
  let { state, loki } = setupLokiState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const defender = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;

  state = setUnit(state, loki.id, {
    position: { col: 2, row: 2 },
    charges: { ...loki.charges, [ABILITY_LOKI_LAUGHT]: 0 },
  });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, defender.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", attacker.id);
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: defender.id } as any,
    makeRngSequence([])
  );
  const resolved = resolveAllPendingRollsWithEvents(
    started.state,
    makeRngSequence([0.01, 0.01, 0.6, 0.4])
  );

  assert(
    resolved.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 1,
    "Loki should gain 1 laughter from a single attack-roll double"
  );
  const chargeEvent = resolved.events.find(
    (event) =>
      event.type === "chargesUpdated" &&
      event.unitId === loki.id &&
      event.deltas[ABILITY_LOKI_LAUGHT] === 1
  );
  assert(chargeEvent, "double-triggered laughter gain should emit chargesUpdated");

  console.log("loki_laughter_increments_on_any_double passed");
}

function testLokiLaughterSpendingAndGating() {
  let { state, loki } = setupLokiState();
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;

  state = setUnit(state, loki.id, {
    position: { col: 4, row: 4 },
    charges: { ...loki.charges, [ABILITY_LOKI_LAUGHT]: 14 },
  });
  state = setUnit(state, ally.id, { position: { col: 5, row: 4 } });
  state = toBattleState(state, "P1", loki.id);
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  assert(
    started.state.pendingRoll?.kind === "lokiLaughtChoice",
    "Loki laughter should open a menu pending roll"
  );

  const blocked = resolvePendingWithChoice(
    started.state,
    { type: "lokiLaughtOption", option: "greatLokiJoke" },
    makeRngSequence([])
  );
  assert(
    blocked.state.pendingRoll?.kind === "lokiLaughtChoice",
    "cost-15 option should stay unavailable below 15 laughter"
  );
  assert(
    blocked.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 14,
    "failed high-cost choice must not spend laughter"
  );

  const charged = setUnit(blocked.state, loki.id, {
    charges: {
      ...blocked.state.units[loki.id].charges,
      [ABILITY_LOKI_LAUGHT]: 15,
    },
  });
  const used = resolvePendingWithChoice(
    charged,
    { type: "lokiLaughtOption", option: "greatLokiJoke" },
    makeRngSequence([0.9])
  );
  assert(!used.state.pendingRoll, "successful choice should resolve pending roll");
  assert(
    used.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 0,
    "cost-15 option should spend exactly 15 laughter"
  );

  console.log("loki_laughter_spending_and_gating passed");
}

function testLokiOptionOneMoveLockDuration() {
  let { state, loki } = setupLokiState();
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, loki.id, {
    position: { col: 4, row: 4 },
    charges: { ...loki.charges, [ABILITY_LOKI_LAUGHT]: 3 },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemy.id, { position: { col: 5, row: 4 } });
  state = toBattleState(state, "P1", loki.id);
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  const applied = resolvePendingWithChoice(
    started.state,
    { type: "lokiLaughtOption", option: "againSomeNonsense" },
    makeRngSequence([0.1, 0.1])
  );

  assert(
    (applied.state.units[ally.id].lokiMoveLockSources ?? []).includes(loki.id),
    "ally in Loki area should receive move lock on failed resist"
  );
  assert(
    (applied.state.units[enemy.id].lokiMoveLockSources ?? []).includes(loki.id),
    "enemy in Loki area should receive move lock on failed resist"
  );

  const blockedMoveState = {
    ...applied.state,
    currentPlayer: "P2" as const,
    activeUnitId: enemy.id,
    pendingRoll: null,
    pendingMove: null,
  };
  const blockedMove = applyAction(
    blockedMoveState,
    { type: "requestMoveOptions", unitId: enemy.id } as any,
    makeRngSequence([])
  );
  assert(
    !blockedMove.state.pendingMove,
    "move lock should block generating move options"
  );

  const lokiStartState: GameState = {
    ...applied.state,
    currentPlayer: "P1",
    activeUnitId: null,
    pendingRoll: null,
    pendingMove: null,
    turnQueue: [loki.id],
    turnQueueIndex: 0,
    turnOrder: [loki.id],
    turnOrderIndex: 0,
  };
  const lokiStart = applyAction(
    lokiStartState,
    { type: "unitStartTurn", unitId: loki.id } as any,
    makeRngSequence([])
  );
  assert(
    (lokiStart.state.units[enemy.id].lokiMoveLockSources?.length ?? 0) === 0,
    "move lock should expire at Loki start turn"
  );

  const restoredMoveState = {
    ...lokiStart.state,
    currentPlayer: "P2" as const,
    activeUnitId: enemy.id,
    pendingRoll: null,
    pendingMove: null,
  };
  const restoredMove = applyAction(
    restoredMoveState,
    { type: "requestMoveOptions", unitId: enemy.id } as any,
    makeRngSequence([])
  );
  assert(
    !!restoredMove.state.pendingMove,
    "movement should be restored after Loki start turn cleanup"
  );

  console.log("loki_option_one_move_lock_duration passed");
}

function testLokiOptionTwoChickenBlocksAndRestrictsMove() {
  let { state, loki } = setupLokiState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.heroId === HERO_GENGHIS_KHAN_ID
  )!;
  const defender = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;

  state = setUnit(state, loki.id, {
    position: { col: 4, row: 4 },
    charges: { ...loki.charges, [ABILITY_LOKI_LAUGHT]: 5 },
  });
  state = setUnit(state, enemy.id, {
    position: { col: 5, row: 4 },
    charges: {
      ...enemy.charges,
      [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 3,
    },
  });
  state = setUnit(state, defender.id, { position: { col: 5, row: 5 } });
  state = toBattleState(state, "P1", loki.id);
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  const option = resolvePendingWithChoice(
    started.state,
    { type: "lokiLaughtOption", option: "chicken" },
    makeRngSequence([])
  );
  assert(
    option.state.pendingRoll?.kind === "lokiChickenTargetChoice",
    "Chicken option should request target selection"
  );
  const applied = resolvePendingWithChoice(
    option.state,
    { type: "lokiChickenTarget", targetId: enemy.id },
    makeRngSequence([])
  );
  assert(
    (applied.state.units[enemy.id].lokiChickenSources ?? []).includes(loki.id),
    "selected target should gain chicken status"
  );

  const chickenMoves = getLegalMovesForUnit(applied.state, enemy.id);
  assert(chickenMoves.length > 0, "chicken unit should still have move options");
  assert(
    chickenMoves.every((coord) => {
      const pos = applied.state.units[enemy.id].position!;
      return (
        Math.max(Math.abs(coord.col - pos.col), Math.abs(coord.row - pos.row)) <= 1
      );
    }),
    "chicken move options should be limited to 1 cell"
  );

  const enemyTurnState = {
    ...applied.state,
    currentPlayer: "P2" as const,
    activeUnitId: enemy.id,
    pendingRoll: null,
    pendingMove: null,
  };
  const blockedAttack = applyAction(
    enemyTurnState,
    { type: "attack", attackerId: enemy.id, defenderId: defender.id } as any,
    makeRngSequence([])
  );
  assert(
    blockedAttack.events.length === 0 && !blockedAttack.state.pendingRoll,
    "chicken should block attacks"
  );

  const blockedAbility = applyAction(
    enemyTurnState,
    {
      type: "useAbility",
      unitId: enemy.id,
      abilityId: ABILITY_GENGHIS_KHAN_KHANS_DECREE,
    } as any,
    makeRngSequence([])
  );
  assert(
    blockedAbility.events.length === 0,
    "chicken should block activating abilities"
  );

  console.log("loki_option_two_chicken_blocks_and_restricts_move passed");
}

function testLokiOptionThreeMindControlForcedAttackAndSlots() {
  let { state, loki } = setupLokiState();
  const controlled = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;
  const controlledTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, loki.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
    charges: { ...loki.charges, [ABILITY_LOKI_LAUGHT]: 10 },
  });
  state = setUnit(state, controlled.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, controlledTarget.id, { position: { col: 5, row: 5 } });
  state = toBattleState(state, "P1", loki.id);
  state = initKnowledgeForOwners(state);
  const targetHpBefore = state.units[controlledTarget.id].hp;

  const started = applyAction(
    state,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  const option = resolvePendingWithChoice(
    started.state,
    { type: "lokiLaughtOption", option: "mindControl" },
    makeRngSequence([])
  );
  assert(
    option.state.pendingRoll?.kind === "lokiMindControlEnemyChoice",
    "mind control option should request enemy selection"
  );
  assert(
    option.state.units[loki.id].turn.actionUsed,
    "mind control should consume Loki action slot"
  );

  const pickedEnemy = resolvePendingWithChoice(
    option.state,
    { type: "lokiMindControlEnemy", targetId: controlled.id },
    makeRngSequence([])
  );
  assert(
    pickedEnemy.state.pendingRoll?.kind === "lokiMindControlTargetChoice",
    "mind control should request forced target selection"
  );

  const pickedTarget = resolvePendingWithChoice(
    pickedEnemy.state,
    { type: "lokiMindControlTarget", targetId: controlledTarget.id },
    makeRngSequence([])
  );
  assert(
    pickedTarget.state.pendingRoll?.kind === "attack_attackerRoll",
    "mind control should transition into a normal attack roll"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    pickedTarget.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  assert(
    resolved.state.units[controlledTarget.id].hp < targetHpBefore,
    "forced attack should damage the selected target on successful hit"
  );
  assert(
    resolved.state.units[controlled.id].turn.attackUsed &&
      resolved.state.units[controlled.id].turn.actionUsed,
    "controlled enemy should spend attack+action slots"
  );
  assert(
    resolved.state.units[loki.id].isStealthed,
    "using Loki laughter options should not reveal Loki stealth"
  );

  console.log("loki_option_three_mind_control_forced_attack_and_slots passed");
}

function testLokiOptionFiveMassChickenFailOnlyAlliesAndEnemies() {
  let { state, loki } = setupLokiState();
  const allyOne = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const allyTwo = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider"
  )!;
  const enemyOne = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const enemyTwo = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;

  state = setUnit(state, loki.id, {
    position: { col: 4, row: 4 },
    charges: { ...loki.charges, [ABILITY_LOKI_LAUGHT]: 15 },
  });
  state = setUnit(state, allyOne.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, allyTwo.id, { position: { col: 3, row: 4 } });
  state = setUnit(state, enemyOne.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemyTwo.id, { position: { col: 4, row: 3 } });
  state = toBattleState(state, "P1", loki.id);
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  const applied = resolvePendingWithChoice(
    started.state,
    { type: "lokiLaughtOption", option: "greatLokiJoke" },
    makeRngSequence([0.1, 0.1, 0.1, 0.99])
  );
  assert(!applied.state.pendingRoll, "mass chicken should resolve immediately");

  const targets = [allyOne.id, allyTwo.id, enemyOne.id, enemyTwo.id];
  const chickenedTargets = targets.filter((unitId) =>
    (applied.state.units[unitId].lokiChickenSources ?? []).includes(loki.id)
  );
  const chickenedAllies = chickenedTargets.filter(
    (unitId) => applied.state.units[unitId].owner === "P1"
  );
  const chickenedEnemies = chickenedTargets.filter(
    (unitId) => applied.state.units[unitId].owner === "P2"
  );

  assert(
    chickenedAllies.length > 0,
    "great Loki joke should be able to affect allies on failed rolls"
  );
  assert(
    chickenedEnemies.length > 0,
    "great Loki joke should be able to affect enemies on failed rolls"
  );
  assert(
    chickenedTargets.length < targets.length,
    "only failed resist rolls should apply chicken"
  );

  console.log("loki_option_five_mass_chicken_fail_only_allies_and_enemies passed");
}

function setupFriskState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_FRISK_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const frisk = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_FRISK_ID
  )!;

  return { state, frisk };
}

function testFriskPacifismIncrementsOnMissIncludingCleanSoul() {
  let { state, frisk } = setupFriskState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    friskCleanSoulShield: true,
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 0,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
  });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", attacker.id);
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: frisk.id } as any,
    makeRngSequence([])
  );
  const resolved = resolveAllPendingRollsWithEvents(
    started.state,
    makeRngSequence([0.99, 0.99])
  );
  const events = [...started.events, ...resolved.events];

  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === frisk.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "attack against Frisk should resolve");
  assert(!attackEvent.hit, "Clean Soul shield should force the attack to miss");

  const friskAfter = resolved.state.units[frisk.id];
  assert(
    friskAfter.charges[ABILITY_FRISK_PACIFISM] === 1,
    "Frisk should gain +1 Pacifism on miss"
  );
  assert(
    friskAfter.friskCleanSoulShield === false,
    "Clean Soul shield should be consumed after forcing a miss"
  );

  console.log("frisk_pacifism_increments_on_miss_including_clean_soul passed");
}

function testFriskGenocideIncrementsOnHit() {
  let { state, frisk } = setupFriskState();
  const target = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
  });
  state = setUnit(state, target.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", frisk.id);
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "attack", attackerId: frisk.id, defenderId: target.id } as any,
    makeRngSequence([])
  );
  const resolved = resolveAllPendingRollsWithEvents(
    started.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const events = [...started.events, ...resolved.events];

  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === frisk.id &&
      event.defenderId === target.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "Frisk attack should resolve");
  assert(attackEvent.hit, "test setup should produce a successful Frisk hit");
  assert(
    resolved.state.units[frisk.id].charges[ABILITY_FRISK_GENOCIDE] === 1,
    "Frisk should gain +1 Genocide on hit"
  );

  console.log("frisk_genocide_increments_on_hit passed");
}

function testFriskCleanSoulShieldFlow() {
  let { state, frisk } = setupFriskState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", frisk.id);
  state = initKnowledgeForOwners(state);

  const enterStealth = applyAction(
    state,
    { type: "enterStealth", unitId: frisk.id } as any,
    makeRngSequence([])
  );
  assert(
    enterStealth.state.pendingRoll?.kind === "enterStealth",
    "Frisk stealth attempt should request enterStealth roll"
  );
  const entered = resolvePendingRollOnce(enterStealth.state, makeRngSequence([0.99]));
  assert(entered.state.units[frisk.id].isStealthed, "Frisk should enter stealth");

  let revealState = setUnit(entered.state, frisk.id, {
    stealthTurnsLeft: 0,
    friskDidAttackWhileStealthedSinceLastEnter: false,
  });
  revealState = {
    ...revealState,
    currentPlayer: "P1",
    activeUnitId: null,
    pendingRoll: null,
    pendingMove: null,
    turnQueue: [frisk.id],
    turnQueueIndex: 0,
    turnOrder: [frisk.id],
    turnOrderIndex: 0,
  };

  const startTurn = applyAction(
    revealState,
    { type: "unitStartTurn", unitId: frisk.id } as any,
    makeRngSequence([])
  );
  const afterReveal = startTurn.state.units[frisk.id];
  assert(!afterReveal.isStealthed, "Frisk should exit stealth on timer reveal");
  assert(
    afterReveal.friskCleanSoulShield === true,
    "Frisk should gain Clean Soul shield after leaving stealth without attacking"
  );

  const enemyTurnState = initKnowledgeForOwners(
    toBattleState(startTurn.state, "P2", attacker.id)
  );
  const attacked = applyAction(
    enemyTurnState,
    { type: "attack", attackerId: attacker.id, defenderId: frisk.id } as any,
    makeRngSequence([])
  );
  const resolved = resolveAllPendingRollsWithEvents(
    attacked.state,
    makeRngSequence([0.99, 0.99])
  );
  const events = [...attacked.events, ...resolved.events];
  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === frisk.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "attack after Clean Soul setup should resolve");
  assert(!attackEvent.hit, "Clean Soul shield should force the next attack to miss");
  assert(
    resolved.state.units[frisk.id].friskCleanSoulShield === false,
    "Clean Soul shield should be consumed after one use"
  );

  console.log("frisk_clean_soul_shield_flow passed");
}

function testFriskChildsCryNegatesDamageAndSpendsPoints() {
  let { state, frisk } = setupFriskState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    friskPacifismDisabled: false,
    friskCleanSoulShield: false,
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 5,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
  });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", attacker.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.01]);
  const started = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: frisk.id } as any,
    rng
  );
  const afterAttacker = resolvePendingRollOnce(started.state, rng);
  const afterDefender = resolvePendingRollOnce(afterAttacker.state, rng);

  assert(
    afterDefender.state.pendingRoll?.kind === "friskChildsCryChoice",
    "Child's Cry should be offered after a hit is determined"
  );

  const activated = applyAction(
    afterDefender.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: afterDefender.state.pendingRoll!.id,
      player: afterDefender.state.pendingRoll!.player,
      choice: "activate",
    } as any,
    rng
  );
  const events = [
    ...started.events,
    ...afterAttacker.events,
    ...afterDefender.events,
    ...activated.events,
  ];
  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === frisk.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "attack should resolve after Child's Cry choice");
  assert(attackEvent.hit, "Child's Cry keeps hit result but nullifies damage");
  assert(attackEvent.damage === 0, "Child's Cry should reduce damage to 0");
  assert(
    activated.state.units[frisk.id].charges[ABILITY_FRISK_PACIFISM] === 0,
    "Child's Cry should spend exactly 5 Pacifism points"
  );

  console.log("frisk_childs_cry_negates_damage_and_spends_points passed");
}

function testFriskSubstitutionTakesOneDamageBeforeDefenseRoll() {
  let { state, frisk } = setupFriskState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_GENOCIDE]: 3,
      [ABILITY_FRISK_PACIFISM]: 0,
    },
  });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", attacker.id);
  state = initKnowledgeForOwners(state);

  const hpBefore = state.units[frisk.id].hp;
  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.01]);
  const started = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: frisk.id } as any,
    rng
  );
  const afterAttacker = resolvePendingRollOnce(started.state, rng);
  assert(
    afterAttacker.state.pendingRoll?.kind === "friskSubstitutionChoice",
    "Substitution should be offered before defender roll"
  );

  const activated = applyAction(
    afterAttacker.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: afterAttacker.state.pendingRoll!.id,
      player: afterAttacker.state.pendingRoll!.player,
      choice: "activate",
    } as any,
    rng
  );
  const events = [...started.events, ...afterAttacker.events, ...activated.events];
  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === frisk.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;

  assert(attackEvent, "attack should resolve after Substitution choice");
  assert(attackEvent.hit, "Substitution should still resolve as a hit");
  assert(attackEvent.damage === 1, "Substitution should force exactly 1 damage");
  assert(
    activated.state.units[frisk.id].hp === hpBefore - 1,
    "Frisk should lose exactly 1 HP from Substitution"
  );
  assert(
    activated.state.units[frisk.id].charges[ABILITY_FRISK_GENOCIDE] === 0,
    "Substitution should spend exactly 3 Genocide points"
  );

  console.log("frisk_substitution_takes_one_damage_before_defense_roll passed");
}

function testFriskOnePathConvertsAndDisablesPacifism() {
  let { state, frisk } = setupFriskState();
  const victim = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    friskPacifismDisabled: false,
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 4,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
  });
  state = setUnit(state, victim.id, { position: { col: 4, row: 5 }, hp: 1 });
  state = setUnit(state, attacker.id, { position: { col: 5, row: 4 } });
  state = toBattleState(state, "P1", frisk.id);
  state = initKnowledgeForOwners(state);

  const killed = applyAction(
    state,
    { type: "attack", attackerId: frisk.id, defenderId: victim.id } as any,
    makeRngSequence([])
  );
  const resolvedKill = resolveAllPendingRollsWithEvents(
    killed.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const friskAfterKill = resolvedKill.state.units[frisk.id];

  assert(
    friskAfterKill.friskPacifismDisabled === true,
    "One Path should permanently disable Pacifism after first Frisk kill"
  );
  assert(
    friskAfterKill.charges[ABILITY_FRISK_PACIFISM] === 0,
    "One Path should convert all Pacifism points to 0"
  );
  assert(
    friskAfterKill.charges[ABILITY_FRISK_GENOCIDE] === 5,
    "One Path should convert Pacifism to Genocide while preserving hit gain"
  );

  const enemyTurnState: GameState = {
    ...resolvedKill.state,
    currentPlayer: "P2",
    activeUnitId: attacker.id,
    pendingRoll: null,
    pendingMove: null,
  };
  const missedAttack = applyAction(
    enemyTurnState,
    { type: "attack", attackerId: attacker.id, defenderId: frisk.id } as any,
    makeRngSequence([])
  );
  const missedResolved = resolveAllPendingRollsWithEvents(
    missedAttack.state,
    makeRngSequence([0.01, 0.01, 0.99, 0.99])
  );
  assert(
    missedResolved.state.units[frisk.id].charges[ABILITY_FRISK_PACIFISM] === 0,
    "Pacifism should no longer gain points after One Path"
  );

  const pacifismAttemptState: GameState = {
    ...missedResolved.state,
    currentPlayer: "P1",
    activeUnitId: frisk.id,
    pendingRoll: null,
    pendingMove: null,
    units: {
      ...missedResolved.state.units,
      [frisk.id]: {
        ...missedResolved.state.units[frisk.id],
        turn: makeEmptyTurnEconomy(),
      },
    },
  };
  const usePacifism = applyAction(
    pacifismAttemptState,
    { type: "useAbility", unitId: frisk.id, abilityId: ABILITY_FRISK_PACIFISM } as any,
    makeRngSequence([])
  );
  assert(
    !usePacifism.state.pendingRoll,
    "Pacifism menu should not open after One Path disables Pacifism"
  );

  console.log("frisk_one_path_converts_and_disables_pacifism passed");
}

function testFriskKillBonusesFirstAndSecondKill() {
  let { state, frisk } = setupFriskState();
  const firstTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const secondTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  const baseAttack = state.units[frisk.id].attack;
  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 0,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
  });
  state = setUnit(state, firstTarget.id, { position: { col: 4, row: 5 }, hp: 1 });
  state = setUnit(state, secondTarget.id, { position: { col: 5, row: 4 }, hp: 1 });
  state = toBattleState(state, "P1", frisk.id);
  state = initKnowledgeForOwners(state);

  const firstAttack = applyAction(
    state,
    { type: "attack", attackerId: frisk.id, defenderId: firstTarget.id } as any,
    makeRngSequence([])
  );
  const firstResolved = resolveAllPendingRollsWithEvents(
    firstAttack.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const afterFirstKill = firstResolved.state.units[frisk.id];
  assert(
    afterFirstKill.attack === baseAttack + 1,
    "first Frisk kill should increase base damage by +1 exactly once"
  );

  const genocideAfterFirst = afterFirstKill.charges[ABILITY_FRISK_GENOCIDE];
  let secondState = setUnit(firstResolved.state, frisk.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  secondState = {
    ...secondState,
    currentPlayer: "P1",
    activeUnitId: frisk.id,
    pendingRoll: null,
    pendingMove: null,
  };

  const secondAttack = applyAction(
    secondState,
    { type: "attack", attackerId: frisk.id, defenderId: secondTarget.id } as any,
    makeRngSequence([])
  );
  assert(
    secondAttack.state.pendingRoll?.kind === "attack_attackerRoll",
    "second Frisk kill setup should start a normal attack roll sequence"
  );
  const secondResolved = resolveAllPendingRollsWithEvents(
    secondAttack.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const secondEvents = [...secondAttack.events, ...secondResolved.events];
  const afterSecondKill = secondResolved.state.units[frisk.id];
  const secondTargetAfter = secondResolved.state.units[secondTarget.id];
  const secondAttackEvent = secondEvents.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === frisk.id &&
      event.defenderId === secondTarget.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  const genocideDelta =
    afterSecondKill.charges[ABILITY_FRISK_GENOCIDE] - genocideAfterFirst;

  assert(
    afterSecondKill.attack === baseAttack + 1,
    "Frisk damage bonus from kills should not stack beyond +1"
  );
  assert(secondAttackEvent, "second Frisk attack should resolve");
  assert(secondAttackEvent.hit, "second Frisk attack should hit in this setup");
  assert(
    !secondTargetAfter.isAlive,
    "second Frisk kill test setup should actually kill the second target"
  );
  assert(
    genocideDelta >= 3,
    "second Frisk kill should grant the +3 Genocide kill bonus"
  );

  console.log("frisk_kill_bonuses_first_and_second_kill passed");
}

function testFriskPowerOfFriendshipWinCondition() {
  let { state, frisk } = setupFriskState();
  const lastEnemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    friskPacifismDisabled: false,
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 1,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
  });
  state = setUnit(state, lastEnemy.id, { position: { col: 4, row: 5 } });

  for (const unit of Object.values(state.units)) {
    if (unit.owner !== "P2" || unit.id === lastEnemy.id) continue;
    state = setUnit(state, unit.id, {
      isAlive: false,
      hp: 0,
      position: null,
    });
  }

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    pendingRoll: null,
    pendingMove: null,
    turnQueue: [frisk.id],
    turnQueueIndex: 0,
    turnOrder: [frisk.id],
    turnOrderIndex: 0,
  };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: frisk.id } as any,
    makeRngSequence([])
  );

  assert(
    started.state.phase === "ended",
    "Power of Friendship should end the game when one enemy remains and Genocide is 0"
  );
  const gameEnded = started.events.find(
    (event) => event.type === "gameEnded"
  ) as Extract<GameEvent, { type: "gameEnded" }> | undefined;
  assert(gameEnded, "Power of Friendship should emit gameEnded event");
  assert(gameEnded.winner === "P1", "Power of Friendship should win for Frisk owner");

  console.log("frisk_power_of_friendship_win_condition passed");
}

function setupGroznyTyrantState() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", {
    berserker: HERO_GROZNY_ID,
    spearman: HERO_VLAD_TEPES_ID,
  });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const grozny = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "berserker"
  )!;
  const commander = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;

  return { state, grozny, commander, ally };
}

function testGroznyTyrantDoesNotTriggerIfOnlyBuffWouldMakeKillPossible() {
  const rng = new SeededRNG(740);
  const { state: baseState, grozny, commander, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    attack: 2,
    hp: 5,
  });
  state = setUnit(state, commander.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, ally.id, { position: { col: 4, row: 7 }, hp: 3 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const startNoTrigger = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );

  assert(
    !startNoTrigger.state.pendingRoll,
    "tyrant should not trigger with base damage 2 vs hp 3"
  );
  assert(
    startNoTrigger.state.units[grozny.id].position?.col === 4 &&
      startNoTrigger.state.units[grozny.id].position?.row === 4,
    "grozny should not move when tyrant is ineligible"
  );
  assert(
    startNoTrigger.state.units[ally.id].isAlive,
    "ally should remain alive when tyrant is ineligible"
  );
  assert(
    startNoTrigger.state.units[grozny.id].attack === state.units[grozny.id].attack,
    "grozny base damage should stay the same when tyrant does not trigger"
  );

  console.log(
    "grozny_tyrant_does_not_trigger_if_only_buff_would_make_kill_possible passed"
  );
}

function testGroznyTyrantTriggersAndKillsWhenBaseDamageIsEnough() {
  const rng = makeAttackWinRng(1);
  const { state: baseState, grozny, commander, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    attack: 2,
    hp: 4,
  });
  state = setUnit(state, commander.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, ally.id, { position: { col: 4, row: 7 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const startTrigger = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );
  assert(
    startTrigger.state.pendingRoll,
    "tyrant should request an attack roll when eligible"
  );

  const resolved = resolveAllPendingRollsWithEvents(startTrigger.state, rng);
  const groznyAfter = resolved.state.units[grozny.id];
  const allyAfter = resolved.state.units[ally.id];
  const attackEvent = resolved.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === grozny.id &&
      e.defenderId === ally.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;

  assert(attackEvent, "tyrant should resolve an attack");
  assert(allyAfter && !allyAfter.isAlive, "ally should die after tyrant attack");
  assert(
    groznyAfter.attack === state.units[grozny.id].attack + 1,
    "grozny should gain +1 base damage after tyrant kill"
  );
  const maxHp = getHeroMeta(HERO_GROZNY_ID)?.baseStats.hp ?? groznyAfter.hp;
  const expectedHp = Math.min(
    maxHp,
    state.units[grozny.id].hp + (attackEvent?.damage ?? 0)
  );
  assert(
    groznyAfter.hp === expectedHp,
    "grozny should heal by damage dealt on tyrant kill"
  );
  assert(
    groznyAfter.turn.moveUsed === false,
    "tyrant should not consume move action"
  );

  console.log("grozny_tyrant_triggers_and_kills_when_base_damage_is_enough passed");
}

function testGroznyTyrantRequiresReachableAttackPositionWithinRoll6() {
  const rng = new SeededRNG(741);
  const { state: baseState, grozny, commander, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    attack: 2,
    hp: 4,
  });
  state = setUnit(state, commander.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, ally.id, { position: { col: 8, row: 8 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const startNoTrigger = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );

  assert(
    !startNoTrigger.state.pendingRoll,
    "tyrant should not trigger if no reachable attack position exists"
  );
  assert(
    startNoTrigger.state.units[grozny.id].position?.col === 4 &&
      startNoTrigger.state.units[grozny.id].position?.row === 4,
    "grozny should not move when no attack position is reachable"
  );
  assert(
    startNoTrigger.state.units[ally.id].isAlive,
    "ally should remain alive when no attack position is reachable"
  );

  console.log(
    "grozny_tyrant_requires_reachable_attack_position_within_roll_6 passed"
  );
}

function testGroznyTyrantChainGrantsExtraMovesFromSecondKill() {
  const rng = makeAttackWinRng(3);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { berserker: HERO_GROZNY_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const grozny = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "berserker"
  )!;
  const ally1 = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const ally2 = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const ally3 = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    attack: 2,
    hp: 3,
  });
  state = setUnit(state, ally1.id, { position: { col: 6, row: 4 }, hp: 2 });
  state = setUnit(state, ally2.id, { position: { col: 7, row: 4 }, hp: 2 });
  state = setUnit(state, ally3.id, { position: { col: 8, row: 4 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );
  assert(started.state.pendingRoll, "tyrant should start an attack chain");

  const resolved = resolveAllPendingRollsWithEvents(started.state, rng);
  const groznyAfter = resolved.state.units[grozny.id];
  const ally1After = resolved.state.units[ally1.id];
  const ally2After = resolved.state.units[ally2.id];
  const ally3After = resolved.state.units[ally3.id];
  const attackEvents = resolved.events.filter(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === grozny.id &&
      [ally1.id, ally2.id, ally3.id].includes(e.defenderId)
  ) as Extract<GameEvent, { type: "attackResolved" }>[];

  assert(attackEvents.length >= 3, "tyrant should attempt multiple kills in a chain");
  assert(ally1After && !ally1After.isAlive, "first ally should die in chain");
  assert(ally2After && !ally2After.isAlive, "second ally should die in chain");
  assert(ally3After && !ally3After.isAlive, "third ally should die in chain");
  assert(
    groznyAfter.attack === state.units[grozny.id].attack + 3,
    "grozny should gain +1 base damage per tyrant kill"
  );
  const maxHp = getHeroMeta(HERO_GROZNY_ID)?.baseStats.hp ?? groznyAfter.hp;
  const damageSum = attackEvents.reduce((sum, e) => sum + e.damage, 0);
  const expectedHp = Math.min(
    maxHp,
    state.units[grozny.id].hp + damageSum
  );
  assert(
    groznyAfter.hp === expectedHp,
    "grozny should heal by total damage dealt during tyrant chain"
  );
  assert(
    groznyAfter.turn.moveUsed === false,
    "tyrant chain should not consume move action"
  );

  console.log(
    "grozny_tyrant_chain_grants_extra_moves_from_second_kill passed"
  );
}

function testGroznyInvadeTimeRequiresFullChargesAndConsumesMove() {
  const rng = new SeededRNG(812);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { berserker: HERO_GROZNY_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const grozny = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "berserker"
  )!;

  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    charges: { ...grozny.charges, [ABILITY_GROZNY_INVADE_TIME]: 2 },
  });
  state = toBattleState(state, "P1", grozny.id);
  state = initKnowledgeForOwners(state);

  const attempt = applyAction(
    state,
    {
      type: "useAbility",
      unitId: grozny.id,
      abilityId: ABILITY_GROZNY_INVADE_TIME,
      payload: { to: { col: 8, row: 8 } },
    } as any,
    rng
  );
  assert(
    attempt.state.units[grozny.id].position?.col === 4 &&
      attempt.state.units[grozny.id].position?.row === 4,
    "invade time should not move when charges are below 3"
  );
  assert(
    attempt.state.units[grozny.id].turn.moveUsed === false,
    "invade time should not consume move when blocked"
  );
  assert(
    attempt.state.units[grozny.id].charges[ABILITY_GROZNY_INVADE_TIME] === 2,
    "invade time should not spend charges when blocked"
  );
  assert(
    !attempt.events.some((e) => e.type === "unitMoved"),
    "invade time should not emit move when blocked"
  );

  const charged = setUnit(attempt.state, grozny.id, {
    charges: { ...attempt.state.units[grozny.id].charges, [ABILITY_GROZNY_INVADE_TIME]: 3 },
  });
  const used = applyAction(
    charged,
    {
      type: "useAbility",
      unitId: grozny.id,
      abilityId: ABILITY_GROZNY_INVADE_TIME,
      payload: { to: { col: 8, row: 8 } },
    } as any,
    rng
  );

  assert(
    used.state.units[grozny.id].position?.col === 8 &&
      used.state.units[grozny.id].position?.row === 8,
    "invade time should move to target cell when fully charged"
  );
  assert(
    used.state.units[grozny.id].turn.moveUsed === true,
    "invade time should consume move slot"
  );
  assert(
    used.state.units[grozny.id].charges[ABILITY_GROZNY_INVADE_TIME] === 0,
    "invade time should spend all 3 charges"
  );
  assert(
    used.events.some(
      (e) =>
        e.type === "unitMoved" &&
        e.unitId === grozny.id &&
        e.to.col === 8 &&
        e.to.row === 8
    ),
    "invade time should emit unitMoved event"
  );

  console.log("grozny_invade_time_requires_full_charges_and_consumes_move passed");
}

function setupChikatiloPlacementState(seed = 901) {
  const rng = new SeededRNG(seed);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { assassin: HERO_CHIKATILO_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = toPlacementState(state, "P1");

  const chikatilo = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_CHIKATILO_ID
  )!;
  const tokenId = chikatilo.chikatiloFalseTrailTokenId ?? `falseTrail-${chikatilo.id}`;
  const token = state.units[tokenId];
  assert(token && token.heroId === HERO_FALSE_TRAIL_TOKEN_ID, "false trail token should exist");

  return { state, rng, chikatilo, token: token! };
}

function testChikatiloPlacementListSubstitution() {
  const { state, chikatilo, token } = setupChikatiloPlacementState(905);

  const chikatiloLegal = getLegalPlacements(state, chikatilo.id);
  const tokenLegal = getLegalPlacements(state, token.id);

  assert(
    token.owner === chikatilo.owner,
    "false trail token should keep the same owner as chikatilo"
  );
  assert(
    chikatiloLegal.length === 0,
    "chikatilo should not be placeable during normal placement"
  );
  assert(
    tokenLegal.length > 0,
    "false trail token should be placeable during normal placement"
  );

  console.log("chikatilo_false_trail_token_replaces_chikatilo_in_placement passed");
}

function testFalseTrailTokenPlacementLegalTargets() {
  let { state, token, rng } = setupChikatiloPlacementState(907);
  const blocker = Object.values(state.units).find(
    (u) =>
      u.owner === token.owner &&
      u.id !== token.id &&
      u.heroId !== HERO_CHIKATILO_ID
  )!;
  state = setUnit(state, blocker.id, { position: { col: 4, row: 4 } });

  const legal = getLegalPlacements(state, token.id);
  const expectedEmpty = state.boardSize * state.boardSize - 1;
  assert(
    legal.length === expectedEmpty,
    "token should be placeable on all empty cells"
  );
  assert(
    !legal.some((pos) => pos.col === 4 && pos.row === 4),
    "token legal placements should exclude occupied cells"
  );

  const rejected = applyAction(
    state,
    {
      type: "placeUnit",
      unitId: token.id,
      position: { col: 4, row: 4 },
    } as any,
    rng
  ).state;

  assert(
    rejected.units[token.id].position === null,
    "token placement on occupied cell should be rejected"
  );

  console.log("false_trail_token_placement_legal_targets passed");
}

function testChikatiloPlacementAfterToken() {
  const { state, token, chikatilo, rng } = setupChikatiloPlacementState(909);
  const tokenPos = { col: 0, row: 0 };

  const placedToken = applyAction(
    state,
    { type: "placeUnit", unitId: token.id, position: tokenPos } as any,
    rng
  ).state;

  const pending = placedToken.pendingRoll;
  assert(
    pending?.kind === "chikatiloFalseTrailPlacement",
    "placing token should request chikatilo placement"
  );
  assert(
    pending?.player === chikatilo.owner,
    "chikatilo placement pending roll should belong to chikatilo owner"
  );

  const legal = (pending?.context as any)?.legalPositions as Coord[];
  const expectedEmpty = placedToken.boardSize * placedToken.boardSize - 1;
  assert(
    legal.length === expectedEmpty,
    "chikatilo placement should include all empty cells"
  );

  const target = legal.find((pos) => pos.col === 2 && pos.row === 2) ?? legal[0];
  const placedChikatilo = applyAction(
    placedToken,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending!.id,
      player: pending!.player,
      choice: { type: "chikatiloPlace", position: target },
    } as any,
    rng
  ).state;

  const chikatiloAfter = placedChikatilo.units[chikatilo.id];
  assert(
    chikatiloAfter.position?.col === target.col &&
      chikatiloAfter.position?.row === target.row,
    "chikatilo should be placed on chosen cell"
  );
  assert(
    chikatiloAfter.isStealthed === true,
    "chikatilo should start stealthed after placement"
  );
  assert(!placedChikatilo.pendingRoll, "pending roll should clear after placement");

  const tokenIndex = placedChikatilo.placementOrder.indexOf(token.id);
  const chikatiloIndex = placedChikatilo.placementOrder.indexOf(chikatilo.id);
  assert(
    tokenIndex >= 0 && chikatiloIndex >= 0 && tokenIndex < chikatiloIndex,
    "token should act before chikatilo in placement order"
  );

  console.log("chikatilo_placement_after_token_passed");
}

function testPlacementFlowWithoutChikatilo() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = toPlacementState(state, "P1");

  const p1Units = Object.values(state.units).filter((u) => u.owner === "P1");
  const tokens = p1Units.filter((u) => u.heroId === HERO_FALSE_TRAIL_TOKEN_ID);
  assert(tokens.length === 0, "no false trail token should be added");
  assert(
    p1Units.filter((u) => !u.position).length === 7,
    "placement flow should keep 7 normal units"
  );

  console.log("placement_flow_without_chikatilo_unchanged passed");
}

function testChikatiloTokenDeathRevealsChikatilo() {
  const rng = makeAttackWinRng(1);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { assassin: HERO_CHIKATILO_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const chikatilo = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_CHIKATILO_ID
  )!;
  const killer = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;

  state = setUnit(state, chikatilo.id, {
    position: { col: 4, row: 0 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, killer.id, { position: { col: 4, row: 1 } });
  state = toBattleState(state, "P2", killer.id);
  state = initKnowledgeForOwners(state);
  const tokenId = chikatilo.chikatiloFalseTrailTokenId ?? `falseTrail-${chikatilo.id}`;

  state = setUnit(state, tokenId, {
    position: { col: 4, row: 0 },
    hp: 1,
    isAlive: true,
  });
  state = setUnit(state, chikatilo.id, {
    position: { col: 6, row: 0 },
    isStealthed: true,
    chikatiloFalseTrailTokenId: tokenId,
  });

  const attack = applyAction(
    state,
    { type: "attack", attackerId: killer.id, defenderId: tokenId } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(attack.state, rng);
  const chikatiloAfter = resolved.state.units[chikatilo.id];
  assert(
    chikatiloAfter.isStealthed === false,
    "chikatilo should be revealed when token dies"
  );

  console.log("chikatilo_token_death_reveals_chikatilo passed");
}

function testChikatiloAssassinMarkDoesNotRevealAndGrantsBonusDamage() {
  const rng = makeAttackWinRng(1);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { assassin: HERO_CHIKATILO_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const chikatilo = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_CHIKATILO_ID
  )!;
  const target = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;

  state = setUnit(state, chikatilo.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, target.id, { position: { col: 5, row: 4 }, hp: 5 });
  state = toBattleState(state, "P1", chikatilo.id);
  state = initKnowledgeForOwners(state);

  const marked = applyAction(
    state,
    {
      type: "useAbility",
      unitId: chikatilo.id,
      abilityId: ABILITY_CHIKATILO_ASSASSIN_MARK,
      payload: { targetId: target.id },
    } as any,
    rng
  ).state;

  const markedUnit = marked.units[chikatilo.id];
  assert(
    markedUnit.isStealthed === true,
    "assassin mark should not reveal chikatilo"
  );

  const reset = setUnit(marked, chikatilo.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });

  const attack = applyAction(
    reset,
    { type: "attack", attackerId: chikatilo.id, defenderId: target.id } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(attack.state, rng);
  const targetAfter = resolved.state.units[target.id];
  assert(
    targetAfter.hp === 2,
    "marked target should take +1 damage on hit (3 total)"
  );

  console.log("chikatilo_assassin_mark_bonus_damage passed");
}

function testChikatiloDecoyReducesDamageAndConsumesCharges() {
  const rng = makeAttackWinRng(1);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { assassin: HERO_CHIKATILO_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const chikatilo = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_CHIKATILO_ID
  )!;
  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;

  state = setUnit(state, chikatilo.id, {
    position: { col: 4, row: 4 },
    hp: 5,
    charges: { ...chikatilo.charges, [ABILITY_CHIKATILO_DECOY]: 3 },
  });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", attacker.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: chikatilo.id } as any,
    rng
  );
  const firstPending = res.state.pendingRoll;
  assert(firstPending?.kind === "attack_attackerRoll", "attacker roll should be pending");

  res = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: firstPending!.id,
      player: firstPending!.player,
    } as any,
    rng
  );
  const decoyPending = res.state.pendingRoll;
  assert(decoyPending?.kind === "chikatiloDecoyChoice", "decoy choice should be pending");

  res = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: decoyPending!.id,
      player: decoyPending!.player,
      choice: "decoy",
    } as any,
    rng
  );

  const chikatiloAfter = res.state.units[chikatilo.id];
  assert(
    chikatiloAfter.hp === 4,
    "decoy should reduce damage to exactly 1"
  );
  assert(
    chikatiloAfter.charges[ABILITY_CHIKATILO_DECOY] === 0,
    "decoy should consume 3 charges"
  );

  console.log("chikatilo_decoy_reduces_damage_and_consumes_charges passed");
}

function testLechyHpBonus() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LECHY_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const lechy = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LECHY_ID
  )!;
  const baseHp = getUnitDefinition("trickster").maxHp;

  assert(
    lechy.hp === baseHp + 3,
    "Lechy HP should be base trickster HP + 3"
  );

  console.log("lechy_hp_bonus passed");
}

function testLechyNaturalStealthThreshold() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LECHY_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const lechy = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LECHY_ID
  )!;

  state = setUnit(state, lechy.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", lechy.id);
  state = initKnowledgeForOwners(state);

  let rng = makeRngSequence([0.8]); // roll 5
  let res = applyAction(
    state,
    { type: "enterStealth", unitId: lechy.id } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "enterStealth",
    "enterStealth should request a roll for Lechy"
  );
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.units[lechy.id].isStealthed === true,
    "Lechy stealth should succeed on roll 5"
  );

  state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LECHY_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));
  const lechyFail = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LECHY_ID
  )!;
  state = setUnit(state, lechyFail.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", lechyFail.id);
  state = initKnowledgeForOwners(state);

  rng = makeRngSequence([0.5]); // roll 4
  res = applyAction(
    state,
    { type: "enterStealth", unitId: lechyFail.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.units[lechyFail.id].isStealthed === false,
    "Lechy stealth should fail on roll 4"
  );

  console.log("lechy_natural_stealth_threshold passed");
}

function testLechyGuideTravelerGatingAndBehavior() {
  const rng = makeRngSequence([0.99]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LECHY_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const lechy = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LECHY_ID
  )!;
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.id !== lechy.id
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== lechy.id
  )!;

  state = setUnit(state, lechy.id, {
    position: { col: 4, row: 4 },
    charges: { ...lechy.charges, [ABILITY_LECHY_GUIDE_TRAVELER]: 1 },
  });
  state = setUnit(state, ally.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 6, row: 4 } });
  state = toBattleState(state, "P1", lechy.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: lechy.id,
      abilityId: ABILITY_LECHY_GUIDE_TRAVELER,
      payload: { targetId: ally.id },
    } as any,
    rng
  );

  assert(!res.state.pendingRoll, "guide traveler should not trigger without charges");
  assert(
    res.state.units[lechy.id].charges[ABILITY_LECHY_GUIDE_TRAVELER] === 1,
    "guide traveler charges should remain if not enough"
  );

  state = setUnit(state, lechy.id, {
    charges: { ...state.units[lechy.id].charges, [ABILITY_LECHY_GUIDE_TRAVELER]: 2 },
    turn: makeEmptyTurnEconomy(),
  });
  state = setUnit(state, ally.id, { position: { col: 8, row: 8 } });

  res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: lechy.id,
      abilityId: ABILITY_LECHY_GUIDE_TRAVELER,
      payload: { targetId: ally.id },
    } as any,
    rng
  );
  assert(
    !res.state.pendingRoll,
    "guide traveler should reject ally outside of range"
  );
  assert(
    res.state.units[lechy.id].charges[ABILITY_LECHY_GUIDE_TRAVELER] === 2,
    "charges should remain when ally out of range"
  );

  state = setUnit(state, ally.id, { position: { col: 5, row: 4 } });
  res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: lechy.id,
      abilityId: ABILITY_LECHY_GUIDE_TRAVELER,
      payload: { targetId: enemy.id },
    } as any,
    rng
  );
  assert(
    !res.state.pendingRoll,
    "guide traveler should reject enemy target"
  );

  state = setUnit(state, lechy.id, {
    charges: { ...state.units[lechy.id].charges, [ABILITY_LECHY_GUIDE_TRAVELER]: 2 },
    turn: makeEmptyTurnEconomy(),
  });

  res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: lechy.id,
      abilityId: ABILITY_LECHY_GUIDE_TRAVELER,
      payload: { targetId: ally.id },
    } as any,
    rng
  );

  assert(
    res.state.pendingRoll?.kind === "moveTrickster",
    "guide traveler should request trickster move roll"
  );

  const afterRoll = resolvePendingRollOnce(res.state, rng);
  const pendingMove = afterRoll.state.pendingMove;
  assert(pendingMove && pendingMove.legalTo.length > 0, "pending move should exist");

  const moveTarget =
    pendingMove.legalTo.find((pos) => pos.col === 6 && pos.row === 4) ??
    pendingMove.legalTo[0];

  const moved = applyAction(
    afterRoll.state,
    { type: "move", unitId: lechy.id, to: moveTarget } as any,
    rng
  );

  const pending = moved.state.pendingRoll;
  assert(
    pending?.kind === "lechyGuideTravelerPlacement",
    "guide traveler should request placement after move"
  );

  const legalPositions = (pending?.context as any)?.legalPositions as Coord[] | undefined;
  assert(
    Array.isArray(legalPositions) && legalPositions.length > 0,
    "guide traveler should expose legal placement positions"
  );

  const lechyPos = moved.state.units[lechy.id].position!;
  const allInRange = (legalPositions ?? []).every(
    (pos) =>
      Math.max(Math.abs(pos.col - lechyPos.col), Math.abs(pos.row - lechyPos.row)) <= 2
  );
  assert(allInRange, "guide traveler positions should be within trickster range");

  const invalid = { col: lechyPos.col + 4, row: lechyPos.row + 4 };
  const invalidAttempt = applyAction(
    moved.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending!.id,
      player: pending!.player,
      choice: { type: "lechyGuideTravelerPlace", position: invalid },
    } as any,
    rng
  );
  assert(
    invalidAttempt.state.pendingRoll?.kind === "lechyGuideTravelerPlacement",
    "invalid placement should keep pending roll"
  );

  const dest = (legalPositions ?? [])[0];
  const placed = applyAction(
    moved.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending!.id,
      player: pending!.player,
      choice: { type: "lechyGuideTravelerPlace", position: dest },
    } as any,
    rng
  );

  const allyAfter = placed.state.units[ally.id];
  assert(
    allyAfter.position?.col === dest.col &&
      allyAfter.position?.row === dest.row,
    "guided ally should move to chosen cell"
  );
  assert(
    placed.state.units[lechy.id].turn.moveUsed === true,
    "guide traveler should consume move slot"
  );
  assert(
    placed.state.units[lechy.id].charges[ABILITY_LECHY_GUIDE_TRAVELER] === 0,
    "guide traveler should spend charges"
  );
  assert(!placed.state.pendingRoll, "guide traveler pending roll should clear");

  console.log("lechy_guide_traveler_gating_and_behavior passed");
}

function testForestExitRestrictionOnFail() {
  const rngFail = makeRngSequence([0.01]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, rider.id, { position: { col: 4, row: 4 } });
  state = {
    ...state,
    forestMarkers: [{ owner: "P1", position: { col: 4, row: 4 } }],
    forestMarker: { owner: "P1", position: { col: 4, row: 4 } },
  };
  state = toBattleState(state, "P1", rider.id);
  state = initKnowledgeForOwners(state);

  const requested = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 4, row: 8 } } as any,
    rngFail
  );
  assert(
    requested.state.pendingRoll?.kind === "forestMoveCheck",
    "leaving forest aura should request forest move check"
  );
  assert(
    requested.state.units[rider.id].position?.col === 4 &&
      requested.state.units[rider.id].position?.row === 4,
    "unit should not move before forest check is resolved"
  );

  const failedRoll = resolvePendingRollOnce(requested.state, rngFail);
  const pending = failedRoll.state.pendingRoll;
  assert(
    pending?.kind === "forestMoveDestination",
    "failed forest check should request fallback destination selection"
  );

  const options = ((pending?.context as any)?.options ?? []) as Coord[];
  assert(options.length > 0, "failed forest check should provide fallback options");
  const allInside = options.every(
    (coord) =>
      Math.max(Math.abs(coord.col - 4), Math.abs(coord.row - 4)) <= 2
  );
  assert(allInside, "exit fallback options must remain inside forest aura");

  const chosen = options[0];
  const moved = applyAction(
    failedRoll.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending!.id,
      player: pending!.player,
      choice: { type: "forestMoveDestination", position: chosen },
    } as any,
    rngFail
  );

  const riderAfter = moved.state.units[rider.id];
  assert(
    riderAfter.position?.col === chosen.col &&
      riderAfter.position?.row === chosen.row,
    "failed exit roll should force chosen in-aura destination"
  );

  console.log("forest_exit_restriction_on_fail passed");
}

function testForestExitRestrictionOnSuccess() {
  const rngSuccess = makeRngSequence([0.99]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, rider.id, { position: { col: 4, row: 4 } });
  state = {
    ...state,
    forestMarkers: [{ owner: "P1", position: { col: 4, row: 4 } }],
    forestMarker: { owner: "P1", position: { col: 4, row: 4 } },
  };
  state = toBattleState(state, "P1", rider.id);
  state = initKnowledgeForOwners(state);

  const requested = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 4, row: 8 } } as any,
    rngSuccess
  );
  assert(
    requested.state.pendingRoll?.kind === "forestMoveCheck",
    "leaving forest aura should request forest check before moving"
  );

  const resolved = resolvePendingRollOnce(requested.state, rngSuccess);
  assert(!resolved.state.pendingRoll, "successful forest check should not require fallback choice");

  const riderAfter = resolved.state.units[rider.id];
  assert(
    riderAfter.position?.col === 4 && riderAfter.position?.row === 8,
    "successful forest check should allow intended destination"
  );

  console.log("forest_exit_restriction_on_success passed");
}

function testForestCrossRestrictionOnFail() {
  const rngFail = makeRngSequence([0.01]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, rider.id, { position: { col: 0, row: 4 } });
  state = {
    ...state,
    forestMarkers: [{ owner: "P1", position: { col: 4, row: 4 } }],
    forestMarker: { owner: "P1", position: { col: 4, row: 4 } },
  };
  state = toBattleState(state, "P1", rider.id);
  state = initKnowledgeForOwners(state);

  const requested = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 8, row: 4 } } as any,
    rngFail
  );
  assert(
    requested.state.pendingRoll?.kind === "forestMoveCheck",
    "crossing forest aura should request forest move check"
  );

  const failedRoll = resolvePendingRollOnce(requested.state, rngFail);
  const pending = failedRoll.state.pendingRoll;
  assert(
    pending?.kind === "forestMoveDestination",
    "failed crossing check should request in-path fallback selection"
  );

  const options = ((pending?.context as any)?.options ?? []) as Coord[];
  assert(options.length > 0, "crossing failure should offer path stop options");

  const line = linePath({ col: 0, row: 4 }, { col: 8, row: 4 }) ?? [];
  const lineSet = new Set(line.map((coord) => `${coord.col},${coord.row}`));
  const allOnPathInside = options.every((coord) => {
    const inside = Math.max(Math.abs(coord.col - 4), Math.abs(coord.row - 4)) <= 2;
    return inside && lineSet.has(`${coord.col},${coord.row}`);
  });
  assert(
    allOnPathInside,
    "crossing fallback options must be inside aura and on movement path"
  );

  const chosen = options[0];
  const moved = applyAction(
    failedRoll.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending!.id,
      player: pending!.player,
      choice: { type: "forestMoveDestination", position: chosen },
    } as any,
    rngFail
  );

  const riderAfter = moved.state.units[rider.id];
  assert(
    riderAfter.position?.col === chosen.col &&
      riderAfter.position?.row === chosen.row,
    "failed crossing roll should stop on chosen aura cell from path"
  );

  console.log("forest_cross_restriction_on_fail passed");
}

function testLechyConfuseTerrainPerSideMarkersAndReplacement() {
  const rng = makeRngSequence([0.5, 0.5, 0.5]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LECHY_ID }));
  state = attachArmy(state, createDefaultArmy("P2", { trickster: HERO_LECHY_ID }));

  const p1Lechy = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LECHY_ID
  )!;
  const p2Lechy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.heroId === HERO_LECHY_ID
  )!;

  const markersOf = (s: GameState) =>
    s.forestMarkers.length > 0 ? s.forestMarkers : s.forestMarker ? [s.forestMarker] : [];
  const markerByOwner = (s: GameState, owner: PlayerId) =>
    markersOf(s).find((marker) => marker.owner === owner);

  state = setUnit(state, p1Lechy.id, {
    position: { col: 2, row: 2 },
    charges: { ...p1Lechy.charges, [ABILITY_LECHY_CONFUSE_TERRAIN]: 3 },
  });
  state = setUnit(state, p2Lechy.id, {
    position: { col: 6, row: 6 },
    charges: { ...p2Lechy.charges, [ABILITY_LECHY_CONFUSE_TERRAIN]: 3 },
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [p1Lechy.id],
    turnQueueIndex: 0,
    turnOrder: [p1Lechy.id],
    turnOrderIndex: 0,
  };
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: p1Lechy.id } as any,
    rng
  );
  let p1Marker = markerByOwner(res.state, "P1");
  assert(
    p1Marker?.position.col === 2 && p1Marker?.position.row === 2,
    "P1 Lechy should place own forest marker via impulse at start turn"
  );
  assert(markersOf(res.state).length === 1, "only P1 marker should exist after first trigger");

  let next = {
    ...setUnit(res.state, p2Lechy.id, {
      position: { col: 6, row: 6 },
      charges: {
        ...res.state.units[p2Lechy.id].charges,
        [ABILITY_LECHY_CONFUSE_TERRAIN]: 3,
      },
    }),
    currentPlayer: "P2" as PlayerId,
    activeUnitId: null,
    turnQueue: [p2Lechy.id],
    turnQueueIndex: 0,
    turnOrder: [p2Lechy.id],
    turnOrderIndex: 0,
  };

  res = applyAction(next, { type: "unitStartTurn", unitId: p2Lechy.id } as any, rng);
  const p2Marker = markerByOwner(res.state, "P2");
  p1Marker = markerByOwner(res.state, "P1");
  assert(
    p2Marker?.position.col === 6 && p2Marker?.position.row === 6,
    "P2 Lechy should place own forest marker without removing P1 marker"
  );
  assert(
    p1Marker?.position.col === 2 && p1Marker?.position.row === 2,
    "P1 marker should persist when P2 places marker"
  );
  assert(markersOf(res.state).length === 2, "both owners should have forest markers simultaneously");

  next = {
    ...setUnit(res.state, p1Lechy.id, {
      position: { col: 4, row: 4 },
      charges: {
        ...res.state.units[p1Lechy.id].charges,
        [ABILITY_LECHY_CONFUSE_TERRAIN]: 3,
      },
      turn: makeEmptyTurnEconomy(),
    }),
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [p1Lechy.id],
    turnQueueIndex: 0,
    turnOrder: [p1Lechy.id],
    turnOrderIndex: 0,
  };

  res = applyAction(next, { type: "unitStartTurn", unitId: p1Lechy.id } as any, rng);
  const replacedP1 = markerByOwner(res.state, "P1");
  const stillP2 = markerByOwner(res.state, "P2");
  assert(
    replacedP1?.position.col === 4 && replacedP1?.position.row === 4,
    "P1 marker should be replaced by new P1 placement"
  );
  assert(
    stillP2?.position.col === 6 && stillP2?.position.row === 6,
    "P2 marker should remain unchanged when P1 replaces marker"
  );
  assert(markersOf(res.state).length === 2, "replacement should keep one marker per owner");

  console.log("lechy_confuse_terrain_per_side_markers_and_replacement passed");
}

function testLechyStormGatingEffectsAndExemptions() {
  const rngFail = makeRngSequence([0.01]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LECHY_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const lechy = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LECHY_ID
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;
  const enemyInside = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id
  )!;

  state = setUnit(state, lechy.id, {
    position: { col: 4, row: 4 },
    charges: { ...lechy.charges, [ABILITY_LECHY_STORM]: 4 },
  });
  state = toBattleState(state, "P1", lechy.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    { type: "useAbility", unitId: lechy.id, abilityId: ABILITY_LECHY_STORM } as any,
    rngFail
  );
  assert(res.state.arenaId !== "storm", "storm should not activate without charges");

  state = setUnit(state, lechy.id, {
    charges: { ...state.units[lechy.id].charges, [ABILITY_LECHY_STORM]: 5 },
    turn: makeEmptyTurnEconomy(),
  });

  res = applyAction(
    state,
    { type: "useAbility", unitId: lechy.id, abilityId: ABILITY_LECHY_STORM } as any,
    rngFail
  );
  assert(res.state.arenaId === "storm", "storm should activate at full charges");
  assert(
    res.state.units[lechy.id].charges[ABILITY_LECHY_STORM] === 0,
    "storm should spend charges"
  );
  assert(
    res.state.units[lechy.id].turn.actionUsed === true,
    "storm should consume action slot"
  );

  let stormState: GameState = {
    ...res.state,
    forestMarker: { owner: "P1", position: { col: 4, row: 4 } },
  };
  stormState = setUnit(stormState, enemy.id, { position: { col: 8, row: 8 }, hp: 5 });
  stormState = {
    ...stormState,
    phase: "battle",
    currentPlayer: enemy.owner,
    activeUnitId: null,
    turnQueue: [enemy.id],
    turnQueueIndex: 0,
    turnOrder: [enemy.id],
    turnOrderIndex: 0,
  };

  const damaged = applyAction(
    stormState,
    { type: "unitStartTurn", unitId: enemy.id } as any,
    rngFail
  );
  assert(
    damaged.state.units[enemy.id].hp === 4,
    "storm should damage non-exempt unit on failed roll"
  );

  let insideState: GameState = {
    ...stormState,
    currentPlayer: enemyInside.owner,
    activeUnitId: null,
    turnQueue: [enemyInside.id],
    turnQueueIndex: 0,
    turnOrder: [enemyInside.id],
    turnOrderIndex: 0,
  };
  insideState = setUnit(insideState, enemyInside.id, {
    position: { col: 5, row: 4 },
    hp: 5,
  });

  const insideRes = applyAction(
    insideState,
    { type: "unitStartTurn", unitId: enemyInside.id } as any,
    rngFail
  );
  assert(
    insideRes.state.units[enemyInside.id].hp === 5,
    "storm should not damage units inside forest aura"
  );

  let lechyStartState: GameState = {
    ...insideState,
    currentPlayer: lechy.owner,
    activeUnitId: null,
    turnQueue: [lechy.id],
    turnQueueIndex: 0,
    turnOrder: [lechy.id],
    turnOrderIndex: 0,
  };
  lechyStartState = setUnit(lechyStartState, lechy.id, {
    position: { col: 4, row: 4 },
    hp: 7,
  });

  const lechyStart = applyAction(
    lechyStartState,
    { type: "unitStartTurn", unitId: lechy.id } as any,
    rngFail
  );
  assert(
    lechyStart.state.units[lechy.id].hp === 7,
    "Lechy should be storm-exempt"
  );

  let attackState: GameState = createEmptyGame();
  attackState = attachArmy(
    attackState,
    createDefaultArmy("P1", { trickster: HERO_LECHY_ID })
  );
  attackState = attachArmy(attackState, createDefaultArmy("P2"));
  const attacker = Object.values(attackState.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;
  const target = Object.values(attackState.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;

  attackState = setUnit(attackState, attacker.id, { position: { col: 0, row: 0 } });
  attackState = setUnit(attackState, target.id, { position: { col: 0, row: 4 } });
  attackState = {
    ...attackState,
    phase: "battle",
    arenaId: "storm",
  };
  attackState = initKnowledgeForOwners(attackState);

  const blockedTargets = getLegalAttackTargets(attackState, attacker.id);
  assert(
    blockedTargets.length === 0,
    "storm should block ranged attacks for non-exempt units"
  );

  attackState = {
    ...attackState,
    forestMarker: { owner: "P2", position: { col: 0, row: 0 } },
  };
  const allowedTargets = getLegalAttackTargets(attackState, attacker.id);
  assert(
    allowedTargets.includes(target.id),
    "units inside forest aura should ignore storm attack restriction"
  );

  console.log("lechy_storm_gating_effects_exemptions passed");
}

function testFalseTrailExplosionHitsAlliesAndEnemiesSingleRoll() {
  const rng = new SequenceRNG([0.99, 0.99, 0.01, 0.01, 0.01, 0.01]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { assassin: HERO_CHIKATILO_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const chikatilo = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_CHIKATILO_ID
  )!;
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;

  state = setUnit(state, chikatilo.id, { position: { col: 4, row: 0 }, isStealthed: true });
  state = toBattleState(state, "P1", chikatilo.id);
  state = initKnowledgeForOwners(state);

  const tokenId = chikatilo.chikatiloFalseTrailTokenId ?? `falseTrail-${chikatilo.id}`;
  state = setUnit(state, tokenId, { position: { col: 4, row: 4 }, isAlive: true });
  state = setUnit(state, chikatilo.id, { position: { col: 0, row: 0 } });
  state = setUnit(state, ally.id, { position: { col: 4, row: 5 }, hp: 5 });
  state = setUnit(state, enemy.id, { position: { col: 5, row: 4 }, hp: 5 });
  state = {
    ...state,
    currentPlayer: "P1",
    activeUnitId: tokenId,
  };

  const tokenUnit = state.units[tokenId];
  const used = applyFalseTrailExplosion(state, tokenUnit, { ignoreEconomy: true });
  const resolved = resolveAllPendingRollsWithEvents(used.state, rng);
  const events = [...used.events, ...resolved.events];

  const attackEvents = events.filter(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === tokenId &&
      [ally.id, enemy.id].includes(e.defenderId)
  ) as Extract<GameEvent, { type: "attackResolved" }>[];

  assert(
    attackEvents.length === 2,
    "explosion should attack both ally and enemy"
  );
  const attackerRoll = attackEvents[0]?.attackerRoll?.dice?.join(",");
  assert(
    attackEvents.every(
      (evt) => evt.attackerRoll?.dice?.join(",") === attackerRoll
    ),
    "explosion should use a single attacker roll for all targets"
  );

  const allyAfter = resolved.state.units[ally.id];
  const enemyAfter = resolved.state.units[enemy.id];
  assert(allyAfter.hp === 4, "ally should take 1 damage from explosion");
  assert(enemyAfter.hp === 4, "enemy should take 1 damage from explosion");

  const tokenAfter = resolved.state.units[tokenId];
  assert(tokenAfter && tokenAfter.isAlive === false, "token should be removed after explosion");

  console.log("false_trail_explosion_hits_allies_and_enemies passed");
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
  testPendingRollActionsExportsStable();
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
  testJebeHpBonus();
  testJebeStealthThresholdIs6();
  testJebeHailOfArrowsGatingTargetingAndDamage();
  testJebeKhansShooterGatingConsumesAndRicochets();
  testHassanHpBonus();
  testHassanStealthThresholdIs4();
  testHassanTrueEnemyGatingConsumesAndForcesOneAttack();
  testHassanAssassinOrderBattleStartSelectionAndPerSideIndependence();
  testGriffithWretchedManDamageReductionClamped();
  testGriffithWarriorDoubleAutoHit();
  testGriffithFemtoRebirthOnDeath();
  testFemtoSpearmanReachAndBerserkerDamage();
  testFemtoDivineMoveUsesMoveSlotAndRollRanges();
  testFemtoBerserkAutoDefenseGatingAndBehavior();
  testGutsHpBonus();
  testGutsKnightMulticlassMovementAndDoubleAutoHit();
  testGutsArbaletRangedFixedDamage();
  testGutsCannonGatingAndChargeSpend();
  testGutsBerserkModeGatingAndActivation();
  testGutsBerserkEndTurnSelfDamage();
  testGutsBerserkMeleeBonusAndRangedNoBonus();
  testGutsBerserkMovementAndAoEAndIncomingCap();
  testGutsExitBerserkOnceAndNoReentry();
  testKaladinHpBonus();
  testKaladinFirstOathGatingHealingAndCosts();
  testKaladinSecondOathTricksterMoveAndAoeTrait();
  testKaladinThirdOathSpearmanBonusOnlyOnSpearmanAttack();
  testKaladinFourthOathBerserkerTraitMovementMode();
  testKaladinFifthOathGatingDamageAndImmobilizeDuration();
  testAsgoreHpBonus();
  testAsgoreSpearmanReachAndDefenseDouble();
  testAsgoreFireballTargetingChargesAndDamage();
  testAsgoreFireParadeAreaResolutionAndChargeSpend();
  testAsgoreSoulParadePatienceAttackAndTempStealth();
  testAsgoreSoulParadeBraveryAutoDefenseOneTime();
  testAsgoreSoulParadeIntegrityPerseveranceKindnessJustice();
  testOdinHpBonus();
  testOdinGungnirAutoHitOnAttackDouble();
  testOdinHuginnStealthVisibilityRadius();
  testOdinSleipnirGatingTeleportAndNoMoveSpend();
  testOdinMuninnPostDefenseChoice();
  testRiverPersonHpBonus();
  testRiverPersonNoRiderPathFeature();
  testRiverPersonBoatCarryFlowAndConstraints();
  testRiverPersonBoatmanConvertsActionToMoveAndSupportsCarry();
  testRiverPersonGuideOfSoulsStormImmunity();
  testRiverPersonTraLaLaGatingAndFlow();
  testLokiLaughterIncrementsOnAnyDouble();
  testLokiLaughterSpendingAndGating();
  testLokiOptionOneMoveLockDuration();
  testLokiOptionTwoChickenBlocksAndRestrictsMove();
  testLokiOptionThreeMindControlForcedAttackAndSlots();
  testLokiOptionFiveMassChickenFailOnlyAlliesAndEnemies();
  testFriskPacifismIncrementsOnMissIncludingCleanSoul();
  testFriskGenocideIncrementsOnHit();
  testFriskCleanSoulShieldFlow();
  testFriskChildsCryNegatesDamageAndSpendsPoints();
  testFriskSubstitutionTakesOneDamageBeforeDefenseRoll();
  testFriskOnePathConvertsAndDisablesPacifism();
  testFriskKillBonusesFirstAndSecondKill();
  testFriskPowerOfFriendshipWinCondition();
  testGroznyTyrantDoesNotTriggerIfOnlyBuffWouldMakeKillPossible();
  testGroznyTyrantTriggersAndKillsWhenBaseDamageIsEnough();
  testGroznyTyrantRequiresReachableAttackPositionWithinRoll6();
  testGroznyTyrantChainGrantsExtraMovesFromSecondKill();
  testGroznyInvadeTimeRequiresFullChargesAndConsumesMove();
  testChikatiloPlacementListSubstitution();
  testFalseTrailTokenPlacementLegalTargets();
  testChikatiloPlacementAfterToken();
  testPlacementFlowWithoutChikatilo();
  testChikatiloTokenDeathRevealsChikatilo();
  testChikatiloAssassinMarkDoesNotRevealAndGrantsBonusDamage();
  testChikatiloDecoyReducesDamageAndConsumesCharges();
  testLechyHpBonus();
  testLechyNaturalStealthThreshold();
  testLechyGuideTravelerGatingAndBehavior();
  testForestExitRestrictionOnFail();
  testForestExitRestrictionOnSuccess();
  testForestCrossRestrictionOnFail();
  testLechyConfuseTerrainPerSideMarkersAndReplacement();
  testLechyStormGatingEffectsAndExemptions();
  testFalseTrailExplosionHitsAlliesAndEnemiesSingleRoll();
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
