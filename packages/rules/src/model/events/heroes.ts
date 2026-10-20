import type { PapyrusBoneType } from "../unit";
import type { Coord, PlayerId } from "../shared";

export type HeroGameEvent =
  | { type: "lokiGreatJokeCommitted"; unitId: string; sourceCell?: Coord; radius: number }
  | { type: "duolingoBerserkerUnlocked"; unitId: string; sourceCell?: Coord }
  | { type: "riverStormWard"; unitId: string; sourceCell?: Coord; turnNumber: number }
  | { type: "heroSelfCost"; unitId: string; sourceCell?: Coord; sourceAbilityId: "gutsBerserkMode" | "undyneUndying"; damage: number; hpAfter: number }
  | { type: "groznyTyrantRewarded"; unitId: string; sourceCell?: Coord }
  | { type: "forestMovementStopped"; unitId: string; sourceCell?: Coord }
  | { type: "unitDeathFinalized"; unitId: string; sourceCell?: Coord }
  | {
      type: "chikatiloMarkApplied";
      chikatiloId: string;
      targetId: string;
      ownerPlayerId: PlayerId;
      trackingStarts: "startOfChikatiloTurn";
      trackingExpires: "afterMarkedUnitTurn";
    }
  | {
      type: "mettatonRatingChanged";
      unitId: string;
      delta: number;
      now: number;
      reason:
        | "attackHit"
        | "defenseSuccess"
        | "defenseRoll"
        | "stagePhenomenon"
        | "abilitySpend";
    }
  | {
      type: "papyrusUnbelieverActivated";
      papyrusId: string;
      fallenAllyId: string;
    }
  | {
      type: "papyrusBoneApplied";
      papyrusId: string;
      targetId: string;
      boneType: PapyrusBoneType;
      expiresOnSourceOwnTurn: number;
    }
  | {
      type: "papyrusBonePunished";
      targetCell?: Coord;
      papyrusId: string;
      targetId: string;
      boneType: PapyrusBoneType;
      damage: number;
      reason: "moveSpent" | "nonMoveFirst";
      hpAfter: number;
    }
  | {
      type: "sansUnbelieverActivated";
      sansId: string;
      fallenAllyId: string;
    }
  | {
      type: "sansBadassJokeApplied";
      sansId: string;
      targetId: string;
    }
  | {
      type: "sansMoveDenied";
      unitId: string;
      sourceSansId?: string;
    }
  | {
      type: "sansBoneFieldActivated";
      sansId: string;
      duration: number;
    }
  | {
      type: "sansBoneFieldApplied";
      unitId: string;
      boneType: PapyrusBoneType;
      turnNumber: number;
    }
  | {
      type: "sansBoneFieldPunished";
      targetCell?: Coord;
      targetId: string;
      boneType: PapyrusBoneType;
      damage: number;
      reason: "moveSpent" | "nonMoveFirst";
      hpAfter: number;
    }
  | {
      type: "sansLastAttackApplied";
      sansId: string;
      targetId: string;
      targetCell?: Coord;
    }
  | {
      type: "sansLastAttackTick";
      targetId: string;
      targetCell?: Coord;
      damage: number;
      hpAfter: number;
    }
  | {
      type: "sansLastAttackRemoved";
      targetId: string;
      targetCell?: Coord;
      reason: "hpOne" | "targetDead";
    }
  | {
      type: "friskHugsApplied";
      friskId: string;
      targetId: string;
    }
  | {
      type: "lokiChickenApplied";
      lokiId: string;
      targetId: string;
      abilityId: string;
    }
  | {
      type: "lokiChickenGroupApplied";
      lokiId?: string;
      targetIds: string[];
      abilityId: string;
    }
  | {
      type: "controlledAttackDeclared";
      controllerUnitId: string;
      controlledUnitId: string;
      targetId: string;
      abilityId: string;
    }
  | {
      type: "unitTransformed";
      unitId: string;
      fromHeroId: string;
      toHeroId: string;
      fromFormId?: string;
      toFormId?: string;
      reason: "griffithFemtoRebirth" | "mettatonThreshold";
      abilityId?: string;
      rating?: number;
      ratingSpent?: boolean;
    }
  | {
      type: "riverBoatmanGranted";
      riverId: string;
      extraMoves: number;
    }
  | {
      type: "riverBoatPickup";
      riverId: string;
      passengerId: string;
      sourceCell: Coord;
      passengerCell: Coord;
    }
  | {
      type: "riverBoatDisembarked";
      riverId: string;
      passengerId: string;
      riverDestination: Coord;
      dropDestination: Coord;
    }
  | {
      type: "riverBoatResolved";
      riverId: string;
      passengerId: string;
      riverDestination: Coord;
      dropDestination: Coord;
    }
  | {
      type: "riverBoatDisembarkFailed";
      riverId: string;
      passengerId: string;
      reason: "noLegalDestinations" | "carrierDied";
    }
  | {
      type: "riverTraLaLaResolved";
      riverId: string;
      targetId: string;
      riverDestination: Coord;
      dropDestination: Coord;
      touchedAttackerIds: string[];
    }
  | {
      type: "asgoreSoulParadeResolved";
      asgoreId?: string;
      sourceCell?: Coord;
      roll: number;
      soulId: string;
      soulName: string;
      effectDescription: string;
    }
  | {
      type: "lechyStormStarted";
      sourceUnitId?: string;
      roll: number;
      duration: number;
      durationUnit: "turn" | "round";
    }
  | {
      type: "lechyStormRollResult";
      targetCell?: Coord;
      unitId: string;
      roll: number;
      success: boolean;
      damage: number;
      hpAfter: number;
    }
  | { type: "kanekiFormEntered"; unitId: string; form: "scolopendra"; sourceCell?: Coord }
  | { type: "friskOnePathUnlocked"; unitId: string; sourceCell?: Coord }
  | { type: "friskFriendshipWon"; unitId: string; sourceCell?: Coord }
  | { type: "lokiSpinCommitted"; unitId: string; sourceCell?: Coord };
