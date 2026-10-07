import { z } from "zod";
import { ALL_ROLL_KINDS, RULE_DECLARATION_IDS, type GameState, type UnitState } from "rules";

// No canonical runtime GameState validator existed. This server-only v1 contract
// validates every typed field; open domain contexts remain JSON (checked by copyJson).
const number = z.number().finite();
const integer = number.int().nonnegative();
const bool = z.boolean();
const text = z.string();
const player = z.enum(["P1", "P2"]);
const unitClass = z.enum([
  "spearman",
  "rider",
  "trickster",
  "assassin",
  "berserker",
  "archer",
  "knight",
]);
const coord = z.object({ col: integer, row: integer }).strict();
const strings = z.array(text);
const numbers = z.record(number);
const bone = z.enum(["blue", "orange"]);
const chainSource = z.enum([
  "riderPass",
  "elCidUltimate",
  "jackRipperUltimate",
  "aoe",
  "multiAttack",
  "controlledAttack",
  "normal",
]);
const courtAction = z.object({ expiresAtRoundEnd: integer, used: bool }).strict();
const unit: z.ZodType<UnitState> = z
  .object({
    id: text,
    owner: player,
    class: unitClass,
    figureId: text.optional(),
    heroId: text.optional(),
    hp: number,
    attack: number,
    position: coord.nullable(),
    isStealthed: bool,
    stealthTurnsLeft: integer,
    stealthSuccessMinRoll: number.optional(),
    stealthAttemptedThisTurn: bool,
    stealthDuration: z
      .object({
        ownTurnStartsWhileHidden: integer,
        maxOwnTurnStartsHidden: integer,
        lastProcessedOwnTurnStart: integer.optional(),
        kind: z.enum(["normal", "falseTrail"]),
      })
      .strict()
      .optional(),
    bunker: z.object({ active: bool, ownTurnsInBunker: integer }).strict().optional(),
    transformed: bool.optional(),
    movementDisabledNextTurn: bool.optional(),
    ownTurnsStarted: integer.optional(),
    turn: z
      .object({ moveUsed: bool, attackUsed: bool, actionUsed: bool, stealthUsed: bool })
      .strict(),
    charges: numbers,
    cooldowns: numbers,
    chikatiloMarkedTargets: strings.optional(),
    chikatiloTrackedTargets: strings.optional(),
    chikatiloMarkStatus: z
      .object({
        sourceUnitId: text,
        exactTrackingActive: bool,
        trackingStarts: z.literal("startOfChikatiloTurn"),
        trackingExpires: z.literal("afterMarkedUnitTurn"),
      })
      .strict()
      .optional(),
    chikatiloFalseTrailTokenId: text.optional(),
    lechyGuideTravelerTargetId: text.optional(),
    stormStartTurnResolvedTurnNumber: integer.optional(),
    lastChargedTurn: integer.optional(),
    tyrantFinishedAllyIds: strings.optional(),
    tyrantMovementSources: z
      .array(
        z
          .object({
            unitId: text,
            class: unitClass,
            figureId: text.optional(),
            heroId: text.optional(),
            movementClasses: z.array(unitClass),
          })
          .strict(),
      )
      .optional(),
    hasMovedThisTurn: bool,
    hasAttackedThisTurn: bool,
    hasActedThisTurn: bool,
    orangeBoneFirstMoveSatisfied: bool.optional(),
    orangeBonePenaltyAppliedThisTurn: bool.optional(),
    hasSpentMeaningfulTurnAction: bool.optional(),
    genghisKhanDiagonalMoveActive: bool.optional(),
    genghisKhanDecreeMovePending: bool.optional(),
    genghisKhanMongolChargeActive: bool.optional(),
    genghisKhanAttackedThisTurn: strings.optional(),
    genghisKhanAttackedLastTurn: strings.optional(),
    gutsBerserkModeActive: bool.optional(),
    gutsBerserkExitUsed: bool.optional(),
    kaladinMoveLockSources: strings.optional(),
    lokiMoveLockSources: strings.optional(),
    lokiChickenSources: strings.optional(),
    friskPacifismDisabled: bool.optional(),
    friskCleanSoulShield: bool.optional(),
    friskDidAttackWhileStealthedSinceLastEnter: bool.optional(),
    friskPrecisionStrikeReady: bool.optional(),
    friskKillCount: integer.optional(),
    asgorePatienceStealthActive: bool.optional(),
    asgoreBraveryAutoDefenseReady: bool.optional(),
    riverBoatCarryAllyId: text.optional(),
    riverBoatmanMovePending: bool.optional(),
    riverBoatmanExtraMoves: integer.optional(),
    papyrusUnbelieverActive: bool.optional(),
    papyrusLongBoneMode: bool.optional(),
    papyrusLineAxis: z.enum(["row", "col", "diagMain", "diagAnti"]).optional(),
    papyrusBoneStatus: z
      .object({
        sourceUnitId: text,
        kind: bone,
        expiresOnSourceOwnTurn: integer,
        bluePunishedTurnNumber: integer.optional(),
      })
      .strict()
      .optional(),
    sansUnbelieverUnlocked: bool.optional(),
    sansBoneFieldActivated: bool.optional(),
    sansMoveLockArmed: bool.optional(),
    sansMoveLockSourceId: text.optional(),
    sansBoneFieldStatus: z
      .object({ kind: bone, turnNumber: integer, bluePunishedTurnNumber: integer.optional() })
      .strict()
      .optional(),
    sansLastAttackCurseSourceId: text.optional(),
    sansLastAttackLastTickTurnNumber: integer.optional(),
    sansPendingDeath: z.object({ killerId: text.nullable() }).strict().optional(),
    mettatonRating: number.optional(),
    mettatonExUnlocked: bool.optional(),
    mettatonNeoUnlocked: bool.optional(),
    undyneImmortalUsed: bool.optional(),
    undyneImmortalActive: bool.optional(),
    duolingoHitTargetsThisTurn: strings.optional(),
    duolingoHitTargetsLastTurn: strings.optional(),
    duolingoBerserkerUnlocked: bool.optional(),
    duolingoAttackBatchHit: bool.optional(),
    blindUntilOwnTurnStart: bool.optional(),
    blindExpiresAfterOwnTurn: integer.optional(),
    kanekiCentipedeUnlocked: bool.optional(),
    donSorrowfulReactionAvailable: bool.optional(),
    donMadDelusionPending: bool.optional(),
    donMadDelusionOrigin: coord.optional(),
    jackTrapPlacedTurnNumber: integer.optional(),
    jackHolyMotherUsed: bool.optional(),
    jackKnownHpByTarget: numbers.optional(),
    immobilizedUntilOwnTurnStart: bool.optional(),
    courtExtraFlexibleAction: courtAction.optional(),
    courtGlobalMoveOnce: courtAction.optional(),
    courtProceduralRestriction: z
      .object({
        expiresAtRoundEnd: integer,
        spentType: z.enum(["move", "main", "stealth"]).optional(),
      })
      .strict()
      .optional(),
    courtDamageCompensation: courtAction.optional(),
    courtCosts: courtAction.optional(),
    courtStasis: z
      .object({ expiresAtRoundEnd: integer, returnPosition: coord })
      .strict()
      .optional(),
    cannotStealthUntilRoundEnd: integer.optional(),
    isAlive: bool,
  } satisfies { [K in keyof UnitState]-?: z.ZodTypeAny })
  .strict();

const forest = z.object({ owner: player, position: coord }).strict();
// JSONB object keys lose insertion order. Rules consume Object.values(units),
// so v1 persists units as an ordered array and reconstructs the runtime record.
const orderedUnits = z
  .array(unit)
  .superRefine((units, context) => {
    if (new Set(units.map((item) => item.id)).size !== units.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate unit id" });
    }
  })
  .transform(
    (units): Record<string, UnitState> => Object.fromEntries(units.map((item) => [item.id, item])),
  );
const ruleDeclaration = z
  .object({
    selectedRuleId: z.enum(RULE_DECLARATION_IDS).nullable(),
    chooserPlayer: player.nullable(),
    setupComplete: bool,
    ruleData: z
      .object({
        court: z
          .object({
            attackerPlayer: player,
            defenderPlayer: player,
            attackerRoll: number.optional(),
            defenderRoll: number.optional(),
            pendingEffects: z
              .array(
                z
                  .object({
                    side: z.enum(["attacker", "defender"]),
                    player,
                    roll: number,
                    effectId: z.enum([
                      "judicialManeuver",
                      "escortTransfer",
                      "detention",
                      "damageCompensation",
                      "crimeScene",
                      "maximumSentence",
                      "proceduralRestrictions",
                      "forcedAppearance",
                      "falseAlibi",
                      "courtCosts",
                      "exposure",
                      "sentenceAnnulment",
                    ]),
                  })
                  .strict(),
              )
              .optional(),
          })
          .strict()
          .optional(),
        chessParty: z
          .object({ kings: z.object({ P1: text.nullable(), P2: text.nullable() }).strict() })
          .strict()
          .optional(),
        moonGame: z
          .object({
            crater: z
              .object({ center: coord, radius: integer, expiresAtRoundStart: integer })
              .strict()
              .nullable()
              .optional(),
            noStealthUntilRoundEnd: integer.nullable().optional(),
            reverseTurnOrderUntilRoundEnd: integer.nullable().optional(),
            cheeseHoles: z
              .object({ choices: z.object({ P1: text.optional(), P2: text.optional() }).strict() })
              .strict()
              .nullable()
              .optional(),
          })
          .strict()
          .optional(),
        advantageGame: z.object({ threshold: number.nullable() }).strict().optional(),
        pendingRoundAdvance: z
          .object({
            nextRoundNumber: integer,
            nextTurnNumber: integer,
            nextIndex: integer,
            nextUnitId: text,
            nextPlayer: player,
          })
          .strict()
          .nullable()
          .optional(),
      })
      .catchall(z.unknown()),
  })
  .strict();

export const gameStateV1Schema: z.ZodType<GameState, z.ZodTypeDef, unknown> = z
  .object({
    boardSize: integer.positive(),
    phase: z.enum(["lobby", "placement", "battle", "ended"]),
    gameOver: z
      .object({
        winnerPlayerId: player,
        loserPlayerId: player,
        reason: z.enum(["allEnemyUnitsDefeated", "surrender", "disconnect", "debug", "unknown"]),
        endedAtRevision: integer,
        endedAtTurn: integer.optional(),
      })
      .strict()
      .nullable(),
    hostPlayerId: player.nullable(),
    playersReady: z.object({ P1: bool, P2: bool }).strict(),
    seats: z.object({ P1: bool, P2: bool }).strict(),
    currentPlayer: player,
    turnNumber: integer,
    roundNumber: integer,
    activeUnitId: text.nullable(),
    pendingMove: z
      .object({
        unitId: text,
        roll: number.optional(),
        legalTo: z.array(coord),
        expiresTurnNumber: integer,
        mode: z
          .enum([
            "normal",
            "spearman",
            "rider",
            "trickster",
            "assassin",
            "berserker",
            "archer",
            "knight",
          ])
          .optional(),
      })
      .strict()
      .nullable(),
    pendingRoll: z
      .object({
        id: text,
        abilityId: text.optional(),
        abilityUseId: text.optional(),
        abilitySourceUnitId: text.optional(),
        abilitySourceCell: coord.optional(),
        abilitySourceRecipients: z.array(z.enum(["P1", "P2", "spectator"])).optional(),
        player,
        kind: z.enum(ALL_ROLL_KINDS),
        context: z.record(z.unknown()),
        chainId: text.optional(),
        visualBatchId: text.optional(),
        chainSource: chainSource.optional(),
        pendingRollsRemaining: integer.optional(),
        deferVisuals: bool.optional(),
        presentation: z
          .object({
            title: text,
            reason: text,
            rollKind: z.enum([
              "attack",
              "defense",
              "stealth",
              "statusSave",
              "trap",
              "explosion",
              "ability",
              "phantasm",
              "reaction",
              "unknown",
            ]),
            actorUnitId: text.optional(),
            actorName: text.optional(),
            sourceUnitId: text.optional(),
            sourceName: text.optional(),
            targetUnitId: text.optional(),
            targetName: text.optional(),
            abilityId: text.optional(),
            abilityName: text.optional(),
            diceLabel: text,
            successRule: text.optional(),
            successText: text.optional(),
            failureText: text.optional(),
            requestedPlayerId: player,
            requestedPlayerLabel: text.optional(),
            opponentRollTotal: number.optional(),
            comparedAgainst: text.optional(),
            isPrivate: bool.optional(),
            isControlledRoll: bool.optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .nullable(),
    combatResolutionChain: z
      .object({
        chainId: text,
        source: chainSource,
        pendingRollsRemaining: integer,
        isComplete: bool,
      })
      .strict()
      .nullable()
      .optional(),
    pendingCombatQueue: z.array(
      z
        .object({
          attackerId: text,
        abilityId: text.optional(),
        abilityUseId: text.optional(),
        abilitySourceUnitId: text.optional(),
        abilitySourceCell: coord.optional(),
        abilitySourceRecipients: z.array(z.enum(["P1", "P2", "spectator"])).optional(),
          defenderId: text,
          kind: z.enum(["riderPath", "aoe"]),
          ignoreRange: bool.optional(),
          ignoreStealth: bool.optional(),
          damageBonus: number.optional(),
          damageBonusSourceId: text.optional(),
          rangedAttack: bool.optional(),
          damageOverride: number.optional(),
          ignoreBonuses: bool.optional(),
          allowFriendlyTarget: bool.optional(),
          blindOnHit: bool.optional(),
          sourceAbilityId: text.optional(),
          consumeSlots: bool.optional(),
        })
        .strict(),
    ),
    pendingReactionMovement: z.object({
      source: z.enum(["tralala", "genghis"]),
      controllerUnitId: text,
        abilityId: text.optional(),
        abilityUseId: text.optional(),
        abilitySourceUnitId: text.optional(),
        abilitySourceCell: coord.optional(),
        abilitySourceRecipients: z.array(z.enum(["P1", "P2", "spectator"])).optional(),

      targetUnitId: text.optional(),
      path: z.array(coord).min(1),
      stepIndex: integer,
      stepReached: bool,
      stopped: bool,
      processedReactorIds: strings,
      touchedReactorIds: strings,
      reactionQueue: z.array(z.object({ reactorUnitId: text, targetUnitIds: strings }).strict()),
      dropDestination: coord.optional(),
    }).strict().nullable().optional(),
    pendingAoE: z
      .object({
        casterId: text,
        abilityUseId: text.optional(),
        abilitySourceUnitId: text.optional(),
        abilitySourceCell: coord.optional(),
        abilitySourceRecipients: z.array(z.enum(["P1", "P2", "spectator"])).optional(),
        abilityId: text,
        center: coord,
        radius: number,
        affectedUnitIds: strings,
        revealedUnitIds: strings,
        damagedUnitIds: strings,
        damageByUnitId: numbers,
      })
      .strict()
      .nullable(),
    pendingPapyrusBoneChoices: z
      .array(z.object({ papyrusUnitId: text, targetUnitId: text }).strict())
      .optional(),
    rollCounter: integer,
    abilityUseCounter: integer.optional(),
    stakeCounter: integer,
    stakeMarkers: z.array(
      z
        .object({ id: text, owner: player, position: coord, createdAt: number, isRevealed: bool })
        .strict(),
    ),
    forestMarkers: z.array(forest),
    forestMarker: forest.nullable(),
    jackTraps: z
      .array(
        z
          .object({
            id: text,
            sourceUnitId: text,
            owner: player,
            position: coord,
            isRevealed: bool,
            trappedUnitId: text.optional(),
            triggeredTargetIds: strings,
          })
          .strict(),
      )
      .optional(),
    jackTrapCounter: integer.optional(),
    turnOrder: strings,
    turnOrderIndex: integer,
    placementOrder: strings,
    turnQueue: strings,
    turnQueueIndex: integer,
    units: orderedUnits,
    events: z.array(z.never()).max(0),
    knowledge: z.object({ P1: z.record(bool), P2: z.record(bool) }).strict(),
    lastKnownPositions: z.object({ P1: z.record(coord), P2: z.record(coord) }).strict(),
    initiative: z
      .object({ P1: number.nullable(), P2: number.nullable(), winner: player.nullable() })
      .strict(),
    ruleDeclaration,
    placementFirstPlayer: player.nullable(),
    arenaId: text.nullable(),
    arenaEffects: z
      .array(
        z
          .object({
            id: text,
            effectId: text,
            sourceUnitId: text.optional(),
            sourceAbilityId: text.optional(),
            remaining: number,
            durationUnit: z.literal("turn"),
            startedTurnNumber: integer,
          })
          .strict(),
      )
      .optional(),
    boneFieldTurnsLeft: integer.optional(),
    startingUnitId: text.nullable(),
    unitsPlaced: z.object({ P1: integer, P2: integer }).strict(),
  } satisfies { [K in keyof GameState]-?: z.ZodTypeAny })
  .strict();
