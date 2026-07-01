import {
  ABILITY_JEBE_HAIL_OF_ARROWS,
  ABILITY_JEBE_KHANS_SHOOTER,
  applyAction,
  assert,
  GameEvent,
  getHeroMeta,
  getUnitDefinition,
  HERO_JEBE_ID,
  initKnowledgeForOwners,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  resolvePendingRollOnce,
  setUnit,
  setupJebeState,
  toBattleState,
} from "../helpers/testUtils";
export function testJebeHpBonus() {
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


export function testJebeStealthThresholdIs6() {
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


export function testJebeHailOfArrowsGatingTargetingAndDamage() {
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
    } as any,
    rng
  );
  assert(!res.state.pendingRoll, "hail without a center should not resolve");
  assert(
    res.state.units[jebe.id].charges[ABILITY_JEBE_HAIL_OF_ARROWS] === 2,
    "hail without center confirmation should not spend charges"
  );

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


export function testJebeKhansShooterGatingConsumesAndRicochets() {
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
    } as any,
    rng
  );
  assert(!used.state.pendingRoll, "Khan's Shooter without a target should not resolve");
  assert(
    used.state.units[jebe.id].charges[ABILITY_JEBE_KHANS_SHOOTER] === 6,
    "Khan's Shooter without target confirmation should not spend charges"
  );

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
    "Khan's Shooter should consume all 6 charges on initial target resolution"
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
