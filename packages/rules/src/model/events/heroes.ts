import type { PapyrusBoneType } from "../unit";

export type HeroGameEvent =
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
      papyrusId: string;
      targetId: string;
      boneType: PapyrusBoneType;
      damage: number;
      reason: "moveSpent" | "moveNotSpent";
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
      targetId: string;
      boneType: PapyrusBoneType;
      damage: number;
      reason: "moveSpent" | "moveNotSpent";
      hpAfter: number;
    }
  | {
      type: "sansLastAttackApplied";
      sansId: string;
      targetId: string;
    }
  | {
      type: "sansLastAttackTick";
      targetId: string;
      damage: number;
      hpAfter: number;
    }
  | {
      type: "sansLastAttackRemoved";
      targetId: string;
      reason: "hpOne" | "targetDead";
    };
