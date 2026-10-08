import type { Coord, DiceRoll, GameEvent } from "../model";

/** Explicit field copies: adding a variant requires policy; new fields never auto-forward. */
function coord(value: Coord): Coord {
  return { col: value.col, row: value.row };
}
function dice(value: DiceRoll): DiceRoll {
  return { dice: [...value.dice], sum: value.sum, isDouble: value.isDouble };
}

export function copyEventPayload(event: GameEvent): GameEvent | undefined {
  const payload = copySemanticPayload(event);
  if (!payload) return payload;
  // Explicitly approved semantic correlation; internal continuation never copied.
  switch (event.type) {
    case "initiativeRolled":
      if (event.rollId !== undefined && payload.type === "initiativeRolled") payload.rollId = event.rollId;
      break;
    case "abilityUsed": case "attackResolved": case "aoeResolved": case "rollResolved":
    case "unitMoved": case "snarePlaced": case "riverBoatPickup": case "riverBoatDisembarked": case "riverBoatResolved": case "riverBoatDisembarkFailed":
    case "riverTraLaLaResolved": case "reactionOpportunity": case "reactionChoiceResolved":
    case "reactionMovementResumed": case "reactionMovementEnded": case "carpetStrikeTriggered": case "carpetStrikeCenter":
    case "carpetStrikeAttackRolled": case "asgoreSoulParadeResolved": case "unitHealed":
    case "lokiChickenApplied": case "lokiChickenGroupApplied": case "controlledAttackDeclared":
    case "lechyStormStarted": case "intimidateResolved":
      if ((event.type === "carpetStrikeCenter" || event.type === "carpetStrikeAttackRolled")
        && event.rollId !== undefined && (payload.type === "carpetStrikeCenter" || payload.type === "carpetStrikeAttackRolled"))
        payload.rollId = event.rollId;
      if (event.abilityUseId !== undefined) payload.abilityUseId = event.abilityUseId;
      if (event.abilityId !== undefined) payload.abilityId = event.abilityId;
      break;
    default: break;
  }
  return payload;
}

function copySemanticPayload(event: GameEvent): GameEvent | undefined {
  switch (event.type) {
    case "combatVisualBatchReady":
      return {
        type: "combatVisualBatchReady",
        chainId: event.chainId,
        visualBatchId: event.visualBatchId,
        isChainComplete: event.isChainComplete,
        deferVisuals: event.deferVisuals,
      };
    case "turnStarted":
      return { type: "turnStarted", player: event.player, turnNumber: event.turnNumber };
    case "roundStarted":
      return { type: "roundStarted", roundNumber: event.roundNumber };
    case "unitPlaced":
      return { type: "unitPlaced", unitId: event.unitId, position: coord(event.position) };
    case "unitMoved":
      return {
        type: "unitMoved",
        unitId: event.unitId,
        from: coord(event.from),
        to: coord(event.to),
        provenance: event.provenance.kind === "forced"
          ? { kind: "forced", cause: event.provenance.cause }
          : event.provenance.kind === "ability"
            ? { kind: "ability", abilityId: event.provenance.abilityId,
                ...(event.provenance.movementKind ? { movementKind: event.provenance.movementKind } : {}) }
            : event.provenance.kind === "boat" || event.provenance.kind === "tralala"
              ? { kind: event.provenance.kind, role: event.provenance.role, phase: event.provenance.phase, stepIndex: event.provenance.stepIndex }
              : { kind: event.provenance.kind },
      };
    case "hiddenCollisionResolved":
      return {
        type: "hiddenCollisionResolved",
        displacedUnitId: event.displacedUnitId,
        from: coord(event.from),
        to: event.to ? coord(event.to) : undefined,
        dieSides: event.dieSides,
        roll: event.roll,
        damage: event.damage,
      };
    case "attackResolved":
      return {
        type: "attackResolved",
        attackerId: event.attackerId,
        defenderId: event.defenderId,
        sourceCell: event.sourceCell ? coord(event.sourceCell) : null,
        targetCell: event.targetCell ? coord(event.targetCell) : null,
        attackerRoll: dice(event.attackerRoll),
        defenderRoll: dice(event.defenderRoll),
        attackerRollIsNew: event.attackerRollIsNew,
        tieBreakDice: event.tieBreakDice
          ? {
              attacker: [...event.tieBreakDice.attacker],
              defender: [...event.tieBreakDice.defender],
            }
          : undefined,
        hit: event.hit,
        damage: event.damage,
        defenderHpAfter: event.defenderHpAfter,
        previousHp: event.previousHp,
        nextHp: event.nextHp,
        maxHp: event.maxHp,
      };
    case "unitDied":
      return {
        type: "unitDied",
        unitId: event.unitId,
        killerId: event.killerId,
        cause: event.cause,
        deathCell: event.deathCell ? coord(event.deathCell) : event.deathCell,
      };
    case "stealthEntered":
      return {
        type: "stealthEntered",
        unitId: event.unitId,
        success: event.success,
        roll: event.roll,
      };
    case "searchStealth":
      return {
        type: "searchStealth",
        unitId: event.unitId,
        mode: event.mode,
        rolls: event.rolls?.map(({ targetId, roll, success }) => ({ targetId, roll, success })),
      };
    case "stealthRevealed":
      return {
        type: "stealthRevealed",
        unitId: event.unitId,
        reason: event.reason,
        revealerId: event.revealerId,
      };
    case "rollRequested":
      return {
        type: "rollRequested",
        rollId: event.rollId,
        kind: event.kind,
        player: event.player,
        actorUnitId: event.actorUnitId,
      };
    case "rollResolved":
      return {
        type: "rollResolved", rollId: event.rollId, rollKind: event.rollKind,
        rollerPlayerId: event.rollerPlayerId, unitId: event.unitId, rollIndex: event.rollIndex,
        dice: [...event.dice], sides: event.sides, total: event.total,
      };
    case "snarePlaced":
      return { type: "snarePlaced", owner: event.owner, sourceUnitId: event.sourceUnitId, cell: coord(event.cell) };
    case "snareTriggered":
      return { type: "snareTriggered", unitId: event.unitId, cell: coord(event.cell), immobilized: true };
    case "pendingRollUnhandled":
      return {
        type: "pendingRollUnhandled",
        rollId: event.rollId,
        kind: event.kind,
        player: event.player,
      };
    case "initiativeRollRequested":
      return { type: "initiativeRollRequested", rollId: event.rollId, player: event.player };
    case "initiativeRolled":
      return { type: "initiativeRolled", player: event.player, dice: event.dice, sum: event.sum };
    case "initiativeResolved":
      return {
        type: "initiativeResolved",
        winner: event.winner,
        P1sum: event.P1sum,
        P2sum: event.P2sum,
      };
    case "placementStarted":
      return { type: "placementStarted", placementFirstPlayer: event.placementFirstPlayer };
    case "ruleDeclarationSelected":
      return {
        type: "ruleDeclarationSelected",
        ruleId: event.ruleId,
        chooserPlayer: event.chooserPlayer,
      };
    case "ruleDeclarationSetupCompleted":
      return { type: "ruleDeclarationSetupCompleted", ruleId: event.ruleId };
    case "courtRolesAssigned":
      return {
        type: "courtRolesAssigned",
        attackerPlayer: event.attackerPlayer,
        defenderPlayer: event.defenderPlayer,
      };
    case "courtRolesSwapped":
      return {
        type: "courtRolesSwapped",
        attackerPlayer: event.attackerPlayer,
        defenderPlayer: event.defenderPlayer,
      };
    case "courtRollResult":
      return {
        type: "courtRollResult",
        side: event.side,
        player: event.player,
        roll: event.roll,
        effectId: event.effectId,
      };
    case "courtEffectApplied":
      return {
        type: "courtEffectApplied",
        effectId: event.effectId,
        player: event.player,
        unitId: event.unitId,
        targetId: event.targetId,
        abilityId: event.abilityId,
        position: event.position ? coord(event.position) : undefined,
      };
    case "chessKingSelected":
      return { type: "chessKingSelected", player: event.player, unitId: event.unitId };
    case "chessKingDeathResolved":
      return {
        type: "chessKingDeathResolved",
        losingPlayer: event.losingPlayer,
        winner: event.winner,
        draw: event.draw,
      };
    case "gameDraw":
      return { type: "gameDraw" };
    case "pureBloodRedirected":
      return {
        type: "pureBloodRedirected",
        kingId: event.kingId,
        redirectedToUnitId: event.redirectedToUnitId,
        damage: event.damage,
      };
    case "moonRollResult":
      return { type: "moonRollResult", roll: event.roll, effectId: event.effectId };
    case "moonEffectApplied":
      return {
        type: "moonEffectApplied",
        effectId: event.effectId,
        center: event.center ? coord(event.center) : undefined,
        centers: event.centers?.map(coord),
        areaRadius: event.areaRadius,
        affectedUnitIds: event.affectedUnitIds,
        damagedUnitIds: event.damagedUnitIds,
        swappedUnitIds: event.swappedUnitIds,
      };
    case "advantageThresholdDeclared":
      return {
        type: "advantageThresholdDeclared",
        player: event.player,
        threshold: event.threshold,
      };
    case "advantageWinTriggered":
      return {
        type: "advantageWinTriggered",
        winner: event.winner,
        threshold: event.threshold,
        P1living: event.P1living,
        P2living: event.P2living,
      };
    case "berserkerDefenseChosen":
      return { type: "berserkerDefenseChosen", defenderId: event.defenderId, choice: event.choice };
    case "damageBonusApplied":
      return {
        type: "damageBonusApplied",
        unitId: event.unitId,
        amount: event.amount,
        source: event.source,
        fromUnitId: event.fromUnitId,
      };
    case "chargesUpdated":
      return { type: "chargesUpdated", unitId: event.unitId, deltas: event.deltas, now: event.now };
    case "bunkerEntered":
      return { type: "bunkerEntered", unitId: event.unitId, roll: event.roll };
    case "bunkerEnterFailed":
      return { type: "bunkerEnterFailed", unitId: event.unitId, roll: event.roll };
    case "bunkerExited":
      return { type: "bunkerExited", unitId: event.unitId, reason: event.reason };
    case "intimidateTriggered":
      return {
        type: "intimidateTriggered",
        defenderId: event.defenderId,
        attackerId: event.attackerId,
        options: event.options.map(coord),
      };
    case "intimidateResolved":
      return {
        type: "intimidateResolved",
        provenance: { kind: "forced", cause: "intimidatingStare" },
        attackerId: event.attackerId,
        from: coord(event.from),
        to: coord(event.to),
      };
    case "stakesPlaced":
      return {
        type: "stakesPlaced",
        owner: event.owner,
        positions: event.positions.map(coord),
        hiddenFromOpponent: event.hiddenFromOpponent,
      };
    case "hiddenSetupCompleted":
      return { type: "hiddenSetupCompleted", owner: event.owner, ability: event.ability };
    case "stakeTriggered":
      return {
        type: "stakeTriggered",
        markerPos: coord(event.markerPos),
        unitId: event.unitId,
        damage: event.damage,
        stopped: event.stopped,
        stakeIdsRevealed: event.stakeIdsRevealed,
      };
    case "forestActivated":
      return {
        type: "forestActivated",
        vladId: event.vladId,
        stakesConsumed: event.stakesConsumed,
      };
    case "carpetStrikeTriggered":
      return { type: "carpetStrikeTriggered", unitId: event.unitId };
    case "carpetStrikeCenter":
      return {
        type: "carpetStrikeCenter",
        unitId: event.unitId,
        dice: event.dice,
        sum: event.sum,
        center: coord(event.center),
        area: { shape: event.area.shape, radius: event.area.radius },
      };
    case "carpetStrikeAttackRolled":
      return {
        type: "carpetStrikeAttackRolled",
        unitId: event.unitId,
        dice: event.dice,
        sum: event.sum,
        center: coord(event.center),
        affectedUnitIds: event.affectedUnitIds,
      };
    case "abilityUsed":
      return { type: "abilityUsed", unitId: event.unitId, abilityId: event.abilityId, sourceCell: event.sourceCell ? coord(event.sourceCell) : undefined };
    case "unitHealed":
      return {
        type: "unitHealed",
        unitId: event.unitId,
        amount: event.amount,
        hpAfter: event.hpAfter,
        sourceAbilityId: event.sourceAbilityId,
      };
    case "aoeResolved":
      return {
        type: "aoeResolved",
        sourceUnitId: event.sourceUnitId,
        sourceCell: event.sourceCell ? coord(event.sourceCell) : undefined,
        abilityId: event.abilityId,
        casterId: event.casterId,
        center: coord(event.center),
        radius: event.radius,
        affectedUnitIds: event.affectedUnitIds,
        revealedUnitIds: event.revealedUnitIds,
        damagedUnitIds: event.damagedUnitIds,
        damageByUnitId: event.damageByUnitId,
        rollsByUnitId: event.rollsByUnitId,
      };
    case "moveOptionsGenerated":
      return {
        type: "moveOptionsGenerated",
        unitId: event.unitId,
        roll: event.roll,
        legalTo: event.legalTo.map(coord),
        mode: event.mode,
        modes: event.modes,
      };
    case "moveBlocked":
      return { type: "moveBlocked", unitId: event.unitId, reason: event.reason };
    case "arenaChosen":
      return { type: "arenaChosen", arenaId: event.arenaId };
    case "battleStarted":
      return {
        type: "battleStarted",
        startingUnitId: event.startingUnitId,
        startingPlayer: event.startingPlayer,
      };
    case "gameEnded":
      return { type: "gameEnded", winner: event.winner };
    case "chikatiloMarkApplied":
      return {
        type: "chikatiloMarkApplied",
        chikatiloId: event.chikatiloId,
        targetId: event.targetId,
        ownerPlayerId: event.ownerPlayerId,
        trackingStarts: event.trackingStarts,
        trackingExpires: event.trackingExpires,
      };
    case "mettatonRatingChanged":
      return {
        type: "mettatonRatingChanged",
        unitId: event.unitId,
        delta: event.delta,
        now: event.now,
        reason: event.reason,
      };
    case "papyrusUnbelieverActivated":
      return {
        type: "papyrusUnbelieverActivated",
        papyrusId: event.papyrusId,
        fallenAllyId: event.fallenAllyId,
      };
    case "papyrusBoneApplied":
      return {
        type: "papyrusBoneApplied",
        papyrusId: event.papyrusId,
        targetId: event.targetId,
        boneType: event.boneType,
        expiresOnSourceOwnTurn: event.expiresOnSourceOwnTurn,
      };
    case "papyrusBonePunished":
      return {
        type: "papyrusBonePunished",
        papyrusId: event.papyrusId,
        targetId: event.targetId,
        boneType: event.boneType,
        damage: event.damage,
        reason: event.reason,
        hpAfter: event.hpAfter,
      };
    case "sansUnbelieverActivated":
      return {
        type: "sansUnbelieverActivated",
        sansId: event.sansId,
        fallenAllyId: event.fallenAllyId,
      };
    case "sansBadassJokeApplied":
      return { type: "sansBadassJokeApplied", sansId: event.sansId, targetId: event.targetId };
    case "sansMoveDenied":
      return { type: "sansMoveDenied", unitId: event.unitId, sourceSansId: event.sourceSansId };
    case "sansBoneFieldActivated":
      return { type: "sansBoneFieldActivated", sansId: event.sansId, duration: event.duration };
    case "sansBoneFieldApplied":
      return {
        type: "sansBoneFieldApplied",
        unitId: event.unitId,
        boneType: event.boneType,
        turnNumber: event.turnNumber,
      };
    case "sansBoneFieldPunished":
      return {
        type: "sansBoneFieldPunished",
        targetId: event.targetId,
        boneType: event.boneType,
        damage: event.damage,
        reason: event.reason,
        hpAfter: event.hpAfter,
      };
    case "sansLastAttackApplied":
      return {
        type: "sansLastAttackApplied",
        sansId: event.sansId,
        targetId: event.targetId,
        targetCell: event.targetCell ? coord(event.targetCell) : undefined,
      };
    case "sansLastAttackTick":
      return {
        type: "sansLastAttackTick",
        targetId: event.targetId,
        targetCell: event.targetCell ? coord(event.targetCell) : undefined,
        damage: event.damage,
        hpAfter: event.hpAfter,
      };
    case "sansLastAttackRemoved":
      return {
        type: "sansLastAttackRemoved",
        targetId: event.targetId,
        reason: event.reason,
        targetCell: event.targetCell ? coord(event.targetCell) : undefined,
      };
    case "friskHugsApplied":
      return { type: "friskHugsApplied", friskId: event.friskId, targetId: event.targetId };
    case "lokiChickenApplied":
      return {
        type: "lokiChickenApplied",
        lokiId: event.lokiId,
        targetId: event.targetId,
        abilityId: event.abilityId,
      };
    case "lokiChickenGroupApplied":
      return {
        type: "lokiChickenGroupApplied",
        lokiId: event.lokiId,
        targetIds: event.targetIds,
        abilityId: event.abilityId,
      };
    case "controlledAttackDeclared":
      return {
        type: "controlledAttackDeclared",
        controllerUnitId: event.controllerUnitId,
        controlledUnitId: event.controlledUnitId,
        targetId: event.targetId,
        abilityId: event.abilityId,
      };
    case "unitTransformed":
      return {
        type: "unitTransformed",
        unitId: event.unitId,
        fromHeroId: event.fromHeroId,
        toHeroId: event.toHeroId,
        fromFormId: event.fromFormId,
        toFormId: event.toFormId,
        reason: event.reason,
        abilityId: event.abilityId,
        rating: event.rating,
        ratingSpent: event.ratingSpent,
      };
    case "riverBoatmanGranted":
      return { type: "riverBoatmanGranted", riverId: event.riverId, extraMoves: event.extraMoves };
    case "riverBoatPickup":
      return { type: event.type, riverId: event.riverId, passengerId: event.passengerId,
        sourceCell: coord(event.sourceCell), passengerCell: coord(event.passengerCell) };
    case "riverBoatDisembarked":
      return { type: event.type, riverId: event.riverId, passengerId: event.passengerId,
        riverDestination: coord(event.riverDestination), dropDestination: coord(event.dropDestination) };
    case "riverBoatResolved":
      return {
        type: "riverBoatResolved",
        riverId: event.riverId,
        passengerId: event.passengerId,
        riverDestination: coord(event.riverDestination),
        dropDestination: coord(event.dropDestination),
      };
    case "riverBoatDisembarkFailed":
      return {
        type: "riverBoatDisembarkFailed",
        riverId: event.riverId,
        passengerId: event.passengerId,
        reason: event.reason,
      };
    case "riverTraLaLaResolved":
      return {
        type: "riverTraLaLaResolved",
        riverId: event.riverId,
        targetId: event.targetId,
        riverDestination: coord(event.riverDestination),
        dropDestination: coord(event.dropDestination),
        touchedAttackerIds: event.touchedAttackerIds,
      };
    case "asgoreSoulParadeResolved":
      return {
        type: "asgoreSoulParadeResolved",
        asgoreId: event.asgoreId,
        sourceCell: event.sourceCell ? coord(event.sourceCell) : undefined,
        roll: event.roll,
        soulId: event.soulId,
        soulName: event.soulName,
        effectDescription: event.effectDescription,
      };
    case "lechyStormStarted":
      return {
        type: "lechyStormStarted",
        sourceUnitId: event.sourceUnitId,
        roll: event.roll,
        duration: event.duration,
        durationUnit: event.durationUnit,
      };
    case "lechyStormRollResult":
      return {
        type: "lechyStormRollResult",
        unitId: event.unitId,
        roll: event.roll,
        success: event.success,
        damage: event.damage,
        hpAfter: event.hpAfter,
      };
    case "reactionOpportunity":
      return {
        type: "reactionOpportunity",
        source: event.source,
        reactorUnitId: event.reactorUnitId,
        targetUnitIds: event.targetUnitIds,
      };
    case "reactionChoiceResolved":
      return {
        type: "reactionChoiceResolved",
        source: event.source,
        reactorUnitId: event.reactorUnitId,
        choice: event.choice,
        targetUnitId: event.targetUnitId,
      };
    case "reactionMovementEnded":
      return { type: event.type, source: event.source, controllerUnitId: event.controllerUnitId, reason: event.reason };
    case "reactionMovementResumed":
      return {
        type: "reactionMovementResumed",
        source: event.source,
        controllerUnitId: event.controllerUnitId,
      };
    default: {
      const unclassified: never = event;
      void unclassified;
      return undefined; // Runtime untrusted/legacy variants also fail closed.
    }
  }
}
