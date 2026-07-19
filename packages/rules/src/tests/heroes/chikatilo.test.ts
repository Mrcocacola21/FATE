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
  makePlayerView,
  getLegalAttackTargets,
  resolveAllPendingRolls,
  resolveAllPendingRollsWithEvents,
  SequenceRNG,
  setUnit,
  setupChikatiloPlacementState,
  toBattleState,
  toPlacementState,
} from "../helpers/testUtils";
import { makeSpectatorView, projectEventsForRecipient } from "../../view";
import {
  canPlaceFalsePromiseToken,
  canPlaceRealChikatilo,
  isAnyPlayerDeploymentLine,
  isNormalDeploymentCell,
} from "../../legal";
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
  state = setUnit(state, blocker.id, { position: { col: 4, row: 0 } });

  const legal = getLegalPlacements(state, token.id);
  assert(
    legal.length === state.boardSize - 3,
    "token should use the owner's normal deployment cells minus occupied cells"
  );
  assert(
    legal.every((pos) => isNormalDeploymentCell(token.owner, pos, state.boardSize)),
    "token legal placements should stay on the owner's normal deployment zone"
  );
  assert(
    canPlaceFalsePromiseToken(token.owner, { col: 1, row: 0 }, state.boardSize),
    "token should be allowed on an unoccupied own deployment cell"
  );
  assert(
    !legal.some((pos) => pos.row === state.boardSize - 1),
    "token legal placements should exclude the enemy deployment zone"
  );
  assert(
    !legal.some((pos) => pos.col === 0 || pos.col === state.boardSize - 1),
    "token legal placements should exclude side cells"
  );
  assert(
    !legal.some((pos) => pos.col === 4 && pos.row === 0),
    "token legal placements should exclude occupied cells"
  );

  const originalPlacementOrder = [...state.placementOrder];
  const originalUnitsPlaced = { ...state.unitsPlaced };
  for (const position of [
    { col: 4, row: 4 },
    { col: 4, row: state.boardSize - 1 },
    { col: 0, row: 0 },
  ]) {
    const rejected = applyAction(
      state,
      {
        type: "placeUnit",
        unitId: token.id,
        position,
      } as any,
      rng
    );

    assert(
      rejected.rejectionReason ===
        "false_promise_token_must_be_in_deployment_zone",
      "invalid token placement should return the deployment-zone rejection reason"
    );
    assert(rejected.state === state, "invalid token placement should not replace state");
    assert(
      rejected.state.units[token.id].position === null,
      "invalid token placement should not position the token"
    );
    assert(
      JSON.stringify(rejected.state.placementOrder) ===
        JSON.stringify(originalPlacementOrder) &&
        JSON.stringify(rejected.state.unitsPlaced) ===
          JSON.stringify(originalUnitsPlaced),
      "invalid token placement should not advance placement"
    );
  }

  const occupied = applyAction(
    state,
    {
      type: "placeUnit",
      unitId: token.id,
      position: { col: 4, row: 0 },
    } as any,
    rng
  );

  assert(
    occupied.state.units[token.id].position === null,
    "token placement on occupied cell should be rejected"
  );

  const accepted = applyAction(
    state,
    {
      type: "placeUnit",
      unitId: token.id,
      position: { col: 1, row: 0 },
    } as any,
    rng
  );
  assert(
    accepted.state.units[token.id].position?.col === 1 &&
      accepted.state.units[token.id].position?.row === 0,
    "token should be accepted on an empty own deployment cell"
  );

  console.log("false_trail_token_placement_legal_targets passed");
}


export function testChikatiloPlacementAfterToken() {
  const { state, token, chikatilo, rng } = setupChikatiloPlacementState(909);
  const tokenPos = { col: 1, row: 0 };

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
  assert(
    legal.length === placedToken.boardSize * (placedToken.boardSize - 2),
    "chikatilo placement should include every empty non-deployment-line cell"
  );
  assert(
    legal.every(
      (pos) =>
        canPlaceRealChikatilo(pos, placedToken.boardSize) &&
        !isAnyPlayerDeploymentLine(pos, placedToken.boardSize)
    ),
    "chikatilo legal placements should exclude both deployment lines"
  );

  for (const position of [
    { col: 4, row: 0 },
    { col: 0, row: 0 },
    { col: 4, row: placedToken.boardSize - 1 },
    { col: placedToken.boardSize - 1, row: placedToken.boardSize - 1 },
  ]) {
    const rejected = applyAction(
      placedToken,
      {
        type: "resolvePendingRoll",
        pendingRollId: pending!.id,
        player: pending!.player,
        choice: { type: "chikatiloPlace", position },
      } as any,
      rng
    );
    assert(
      rejected.rejectionReason ===
        "chikatilo_cannot_be_placed_on_deployment_line",
      "deployment-line Chikatilo placement should return the explicit rejection reason"
    );
    assert(
      rejected.state === placedToken &&
        rejected.state.pendingRoll?.id === pending!.id &&
        rejected.state.units[chikatilo.id].position === null,
      "rejected Chikatilo placement should preserve state and the placement step"
    );
  }

  const target = legal.find((pos) => pos.col === 4 && pos.row === 4) ?? legal[0];
  const placement = applyAction(
    placedToken,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending!.id,
      player: pending!.player,
      choice: { type: "chikatiloPlace", position: target },
    } as any,
    rng
  );
  const placedChikatilo = placement.state;

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

  const ownerView = makePlayerView(placedChikatilo, chikatilo.owner);
  const opponentId = chikatilo.owner === "P1" ? "P2" : "P1";
  const opponentView = makePlayerView(placedChikatilo, opponentId);
  assert(
    ownerView.units[chikatilo.id]?.position?.col === target.col &&
      ownerView.units[chikatilo.id]?.position?.row === target.row,
    "owner projection should include real Chikatilo's placement"
  );
  assert(
    !opponentView.units[chikatilo.id],
    "opponent projection should not include real Chikatilo or his position"
  );
  assert(
    opponentView.pendingRoll === null,
    "opponent projection should not expose the private Chikatilo placement prompt"
  );
  const opponentEvents = projectEventsForRecipient(
    placedChikatilo,
    placement.events,
    opponentId
  );
  const placedEvent = opponentEvents.find(
    (event) => event.type === "unitPlaced" && event.unitId === chikatilo.id
  );
  assert(
    placedEvent?.type === "unitPlaced" && !("position" in placedEvent),
    "opponent placement event should redact real Chikatilo's position"
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

  const opened = applyAction(
    state,
    {
      type: "useAbility",
      unitId: chikatilo.id,
      abilityId: ABILITY_CHIKATILO_ASSASSIN_MARK,
    } as any,
    rng
  ).state;
  assert(
    !opened.units[chikatilo.id].turn.actionUsed,
    "assassin mark without a target should not spend action"
  );

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
  assert(
    markedUnit.turn.actionUsed,
    "assassin mark should spend action when the target is applied"
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


export function testChikatiloAssassinMarkApplicationFlowAndRedaction() {
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

  const cancel = applyAction(
    state,
    {
      type: "useAbility",
      unitId: chikatilo.id,
      abilityId: ABILITY_CHIKATILO_ASSASSIN_MARK,
    } as any,
    rng
  );
  assert(
    !cancel.state.units[chikatilo.id].turn.actionUsed,
    "opening assassin mark targeting should not spend action"
  );
  assert(
    !cancel.state.units[chikatilo.id].chikatiloMarkedTargets?.includes(target.id),
    "opening assassin mark targeting should not mark a target"
  );

  const hiddenTargetState = setUnit(state, target.id, {
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  const rejected = applyAction(
    hiddenTargetState,
    {
      type: "useAbility",
      unitId: chikatilo.id,
      abilityId: ABILITY_CHIKATILO_ASSASSIN_MARK,
      payload: { targetId: target.id },
    } as any,
    rng
  );
  assert(
    !rejected.state.units[chikatilo.id].turn.actionUsed,
    "invalid hidden mark target should not spend action"
  );
  assert(
    !rejected.state.units[chikatilo.id].chikatiloMarkedTargets?.includes(target.id),
    "invalid hidden mark target should not mutate marks"
  );

  const marked = applyAction(
    state,
    {
      type: "useAbility",
      unitId: chikatilo.id,
      abilityId: ABILITY_CHIKATILO_ASSASSIN_MARK,
      payload: { targetId: target.id },
    } as any,
    rng
  );

  const markedChikatilo = marked.state.units[chikatilo.id];
  assert(
    markedChikatilo.turn.actionUsed,
    "successful assassin mark should spend action exactly once"
  );
  assert(
    markedChikatilo.chikatiloMarkedTargets?.filter((id) => id === target.id).length === 1,
    "successful assassin mark should apply one persistent mark"
  );
  assert(
    !markedChikatilo.chikatiloTrackedTargets?.includes(target.id),
    "successful assassin mark should not grant exact tracking until chikatilo start turn"
  );
  assert(
    marked.events.some(
      (event) =>
        event.type === "chikatiloMarkApplied" &&
        event.targetId === target.id &&
        event.ownerPlayerId === "P1"
    ),
    "successful assassin mark should emit a mark-applied event"
  );

  const duplicate = applyAction(
    marked.state,
    {
      type: "useAbility",
      unitId: chikatilo.id,
      abilityId: ABILITY_CHIKATILO_ASSASSIN_MARK,
      payload: { targetId: target.id },
    } as any,
    rng
  );
  assert(
    duplicate.events.filter((event) => event.type === "chikatiloMarkApplied").length === 0,
    "duplicate assassin mark command after cost spend should not emit a second mark event"
  );
  assert(
    duplicate.state.units[chikatilo.id].chikatiloMarkedTargets?.filter(
      (id) => id === target.id
    ).length === 1,
    "duplicate assassin mark command should not duplicate mark state"
  );

  const ownerEvents = projectEventsForRecipient(marked.state, marked.events, "P1");
  const opponentEvents = projectEventsForRecipient(marked.state, marked.events, "P2");
  const spectatorEvents = projectEventsForRecipient(marked.state, marked.events, "spectator");
  assert(
    ownerEvents.some(
      (event) => event.type === "chikatiloMarkApplied" && event.targetId === target.id
    ),
    "mark owner should receive the full mark-applied event"
  );
  assert(
    opponentEvents.some(
      (event) => event.type === "chikatiloMarkApplied" && !("targetId" in event)
    ),
    "opponent should receive a redacted mark-applied event"
  );
  assert(
    spectatorEvents.some(
      (event) => event.type === "chikatiloMarkApplied" && !("targetId" in event)
    ),
    "spectator should receive a redacted mark-applied event"
  );
  assert(
    opponentEvents.some(
      (event) => event.type === "abilityUsed" && !("unitId" in event)
    ),
    "hidden chikatilo ability use should be redacted for the opponent"
  );

  console.log("chikatilo_assassin_mark_application_flow_and_redaction passed");
}


export function testChikatiloAssassinMarkTrackingProjectionAttackAndExpiry() {
  const rng = makeAttackWinRng(2);
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
  const hiddenTarget = setUnit(marked, target.id, {
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  const beforeTrackingView = makePlayerView(hiddenTarget, "P1");
  assert(
    !beforeTrackingView.units[target.id],
    "marked hidden target should remain hidden before chikatilo start-turn tracking"
  );
  assert(
    !getLegalAttackTargets(hiddenTarget, chikatilo.id).includes(target.id),
    "marked hidden target should not be attackable before exact tracking activates"
  );

  const startReady = {
    ...hiddenTarget,
    currentPlayer: "P1" as const,
    activeUnitId: null,
    turnOrder: [chikatilo.id, target.id],
    turnQueue: [chikatilo.id, target.id],
    turnOrderIndex: 0,
    turnQueueIndex: 0,
  };
  const started = applyAction(
    startReady,
    { type: "unitStartTurn", unitId: chikatilo.id } as any,
    rng
  ).state;
  assert(
    started.units[chikatilo.id].chikatiloTrackedTargets?.includes(target.id),
    "chikatilo start turn should activate exact tracking for marked targets"
  );

  const ownerView = makePlayerView(started, "P1");
  const projectedTarget = ownerView.units[target.id];
  assert(projectedTarget, "authorized owner should see tracked hidden target");
  assert(
    projectedTarget.position?.col === 5 && projectedTarget.position.row === 4,
    "authorized owner should receive tracked hidden target exact cell"
  );
  assert(
    projectedTarget.chikatiloMarkStatus?.exactTrackingActive === true,
    "authorized owner should receive active mark tracking metadata"
  );
  assert(
    makePlayerView(started, "P2").units[target.id].chikatiloMarkStatus === undefined,
    "opposing target owner should not receive chikatilo's private mark metadata"
  );
  assert(
    !makeSpectatorView(started).units[target.id],
    "spectator should not see the tracked hidden enemy"
  );
  assert(
    ownerView.legal?.attackTargetsByUnitId[chikatilo.id]?.includes(target.id),
    "authorized chikatilo should receive tracked hidden target as a legal attack target"
  );

  const attack = applyAction(
    started,
    { type: "attack", attackerId: chikatilo.id, defenderId: target.id } as any,
    rng
  );
  assert(
    attack.state.pendingRoll?.kind === "attack_attackerRoll",
    "server should accept chikatilo attack against tracked hidden target in legal range"
  );

  const movedWhileTracked = setUnit(started, target.id, {
    position: { col: 4, row: 5 },
  });
  const movedOwnerView = makePlayerView(movedWhileTracked, "P1");
  assert(
    movedOwnerView.units[target.id].position?.col === 4 &&
      movedOwnerView.units[target.id].position?.row === 5,
    "authorized owner should receive tracked hidden target movement updates"
  );

  const targetTurn = {
    ...movedWhileTracked,
    currentPlayer: "P2" as const,
    activeUnitId: target.id,
    turnOrder: [chikatilo.id, target.id],
    turnQueue: [chikatilo.id, target.id],
    turnOrderIndex: 1,
    turnQueueIndex: 1,
  };
  const expired = applyAction(targetTurn, { type: "endTurn" } as any, rng).state;
  assert(
    expired.units[chikatilo.id].chikatiloMarkedTargets?.includes(target.id),
    "persistent mark should survive exact-tracking expiry"
  );
  assert(
    !expired.units[chikatilo.id].chikatiloTrackedTargets?.includes(target.id),
    "tracked target should expire when the marked unit finishes its turn"
  );
  assert(
    !makePlayerView(expired, "P1").units[target.id],
    "authorized owner should lose hidden target exact cell after tracking expires"
  );
  assert(
    !getLegalAttackTargets(expired, chikatilo.id).includes(target.id),
    "tracked hidden target should stop being attackable after tracking expires"
  );

  const visibleAfterExpiry = setUnit(expired, target.id, {
    isStealthed: false,
    stealthTurnsLeft: 0,
  });
  const visibleProjection = makePlayerView(visibleAfterExpiry, "P1").units[target.id];
  assert(
    visibleProjection.chikatiloMarkStatus?.exactTrackingActive === false,
    "visible target should keep mark indicator after exact tracking expires"
  );

  console.log("chikatilo_assassin_mark_tracking_projection_attack_and_expiry passed");
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
