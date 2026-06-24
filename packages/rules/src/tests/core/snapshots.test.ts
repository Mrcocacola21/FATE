import {
  applyAction,
  assert,
  attachArmy,
  Coord,
  coordFromNotation,
  createDefaultArmy,
  createEmptyGame,
  HERO_VLAD_TEPES_ID,
  initKnowledgeForOwners,
  makeRngSequence,
  PlayerId,
  resolveAllPendingRollsWithEvents,
  resolvePendingRollOnce,
  SeededRNG,
  setUnit,
  toBattleState,
} from "../helpers/testUtils";
export function testGoldenSnapshotAoeWithIntimidateChain() {
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


export function testGoldenSnapshotPendingRollSequence() {
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


export function testGoldenActionSnapshot() {
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
