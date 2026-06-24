import {
  ABILITY_CHIKATILO_ASSASSIN_MARK,
  ABILITY_CHIKATILO_DECOY,
  applyAction,
  applyFalseTrailExplosion,
  assert,
  attachArmy,
  Coord,
  createDefaultArmy,
  createEmptyGame,
  GameEvent,
  getLegalPlacements,
  HERO_CHIKATILO_ID,
  HERO_FALSE_TRAIL_TOKEN_ID,
  initKnowledgeForOwners,
  makeAttackWinRng,
  makeEmptyTurnEconomy,
  resolveAllPendingRolls,
  resolveAllPendingRollsWithEvents,
  SequenceRNG,
  setUnit,
  setupChikatiloPlacementState,
  toBattleState,
  toPlacementState,
} from "../helpers/testUtils";
export function testChikatiloPlacementListSubstitution() {
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


export function testFalseTrailTokenPlacementLegalTargets() {
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


export function testChikatiloPlacementAfterToken() {
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


export function testPlacementFlowWithoutChikatilo() {
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


export function testChikatiloTokenDeathRevealsChikatilo() {
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


export function testChikatiloAssassinMarkDoesNotRevealAndGrantsBonusDamage() {
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


export function testChikatiloDecoyReducesDamageAndConsumesCharges() {
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


export function testFalseTrailExplosionHitsAlliesAndEnemiesSingleRoll() {
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
