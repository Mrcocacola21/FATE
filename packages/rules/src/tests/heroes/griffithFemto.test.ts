import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_FEMTO_DIVINE_MOVE,
  ABILITY_GRIFFITH_FEMTO_REBIRTH,
  applyAction,
  assert,
  Coord,
  GameEvent,
  getHeroMeta,
  getLegalAttackTargets,
  getUnitDefinition,
  HERO_FEMTO_ID,
  HERO_GRIFFITH_ID,
  initKnowledgeForOwners,
  makeAttackWinRng,
  makeRngSequence,
  promoteToFemto,
  resolveAllPendingRolls,
  resolveAllPendingRollsWithEvents,
  resolveAttack,
  resolvePendingRollOnce,
  setUnit,
  setupGriffithState,
  toBattleState,
} from "../helpers/testUtils";
import { getAbilitySpec } from "../../abilities";
export function testGriffithWretchedManDamageReductionClamped() {
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


export function testGriffithWarriorDoubleAutoHit() {
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


export function testGriffithBasicAttackAndReadOnlyRebirth() {
  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.01]);
  let { state, griffith } = setupGriffithState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  assert(
    getAbilitySpec(ABILITY_GRIFFITH_FEMTO_REBIRTH)?.kind === "passive",
    "Femto Rebirth should be exposed as read-only passive metadata"
  );

  state = setUnit(state, griffith.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", griffith.id);
  state = initKnowledgeForOwners(state);

  const manualRebirth = applyAction(
    state,
    {
      type: "useAbility",
      unitId: griffith.id,
      abilityId: ABILITY_GRIFFITH_FEMTO_REBIRTH,
    } as any,
    makeRngSequence([])
  );
  assert(
    manualRebirth.events.length === 0 &&
      manualRebirth.state.units[griffith.id].heroId === HERO_GRIFFITH_ID,
    "manual Femto Rebirth command should not transform or emit an ability event"
  );
  assert(
    manualRebirth.state.units[griffith.id].turn.actionUsed === false,
    "manual Femto Rebirth command should not spend action"
  );

  const invalidState = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  const invalidTargets = getLegalAttackTargets(invalidState, griffith.id);
  assert(
    !invalidTargets.includes(enemy.id),
    "distance-2 target should not be legal for Griffith's normal knight attack"
  );
  const invalidAttack = applyAction(
    invalidState,
    { type: "attack", attackerId: griffith.id, defenderId: enemy.id } as any,
    makeRngSequence([])
  );
  assert(
    !invalidAttack.state.pendingRoll &&
      invalidAttack.state.units[griffith.id].turn.actionUsed === false &&
      invalidAttack.state.units[griffith.id].turn.attackUsed === false,
    "invalid Griffith attack should be rejected without spending slots"
  );

  const legalTargets = getLegalAttackTargets(state, griffith.id);
  assert(
    legalTargets.includes(enemy.id),
    "adjacent enemy should be legal for Griffith's normal attack"
  );
  const attacked = applyAction(
    state,
    { type: "attack", attackerId: griffith.id, defenderId: enemy.id } as any,
    rng
  );
  assert(
    attacked.state.pendingRoll?.kind === "attack_attackerRoll",
    "valid Griffith attack should enter normal attack roll flow"
  );
  assert(
    attacked.state.units[griffith.id].turn.actionUsed === false &&
      attacked.state.units[griffith.id].turn.attackUsed === false,
    "Griffith attack should not spend slots before the attack resolves"
  );

  const resolved = resolveAllPendingRollsWithEvents(attacked.state, rng);
  const attackEvent = resolved.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === griffith.id &&
      event.defenderId === enemy.id
  );
  assert(attackEvent, "valid Griffith attack should resolve");
  assert(
    resolved.state.units[griffith.id].turn.actionUsed === true &&
      resolved.state.units[griffith.id].turn.attackUsed === true,
    "resolved Griffith attack should spend action and attack once"
  );

  console.log("griffith_basic_attack_and_read_only_rebirth passed");
}


export function testGriffithFemtoRebirthOnDeath() {
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
  assert(
    events.filter(
      (event) =>
        event.type === "abilityUsed" &&
        event.unitId === griffith.id &&
        event.abilityId === ABILITY_GRIFFITH_FEMTO_REBIRTH
    ).length === 1,
    "Femto rebirth should be emitted exactly once"
  );

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


export function testFemtoSpearmanReachAndBerserkerDamage() {
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


export function testFemtoDivineMoveUsesMoveSlotAndRollRanges() {
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


export function testFemtoBerserkAutoDefenseGatingAndBehavior() {
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
