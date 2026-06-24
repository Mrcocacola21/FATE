import {
  ABILITY_ODIN_MUNINN,
  ABILITY_ODIN_SLEIPNIR,
  applyAction,
  assert,
  GameEvent,
  getHeroMeta,
  getLegalAttackTargets,
  getUnitDefinition,
  HERO_ODIN_ID,
  initKnowledgeForOwners,
  makeEmptyTurnEconomy,
  makePlayerView,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  resolveAttack,
  resolvePendingRollOnce,
  setUnit,
  setupOdinState,
  toBattleState,
} from "../helpers/testUtils";
export function testOdinHpBonus() {
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


export function testOdinGungnirAutoHitOnAttackDouble() {
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


export function testOdinHuginnStealthVisibilityRadius() {
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


export function testOdinSleipnirGatingTeleportAndNoMoveSpend() {
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


export function testOdinMuninnPostDefenseChoice() {
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
