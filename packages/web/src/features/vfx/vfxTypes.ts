import type { Coord, ProjectedGameEvent, PlayerView } from "rules";

export type VfxEffectId =
  | "stakePlace"
  | "stakeTrigger"
  | "snarePlace"
  | "snareTrigger"
  | "searchReveal"
  | "hiddenReveal"
  | "markApply"
  | "storm"
  | "soulParade"
  | "fireParade"
  | "shield"
  | "portal"
  | "phantasm"
  | "phantasmTrace"
  | "chicken"
  | "transformation"
  | "stageSpark"
  | "boat"
  | "boatPickup"
  | "boatDrop"
  | "tralala"
  | "muzzle"
  | "snareExplosion"
  | "berserkAoE"
  | "combatHit"
  | "combatMiss"
  | "unitDeath"
  | "statusSmall"
  | "doraImpact"
  | "carpetImpact"
  | "forestEruption"
  | "vladGaze"
  | "gasterBeam"
  | "gasterCannon"
  | "sansCurseApply"
  | "sansCurseStatus"
  | "sansCurseTick"
  | "sansCurseRemove"
  | "bunkerStatus"
  | "fireball"
  | "fireballCast"
  | "fireballImpact"
  | "jackCoverTracks"
  | "jackSlaughter"
  | "hassanOrder"
  | "hassanControl"
  | "genghisDecree"
  | "chikatiloMark"
  | "chikatiloDecoy"
  | "falseTrailSetup"
  | "falseTrailBlast"
  | "papyrusBones"
  | "papyrusSpaghetti"
  | "papyrusUnbeliever"
  | "lechyGuide"
  | "lechyForest"
  | "lechyStorm"
  | "gutsCrossbow"
  | "gutsCannon"
  | "gutsBerserk"
  | "gutsExit"
  | "griffithRebirth"
  | "femtoMove"
  | "odinSleipnir"
  | "odinMuninn"
  | "jebeHail"
  | "kaladinHeal"
  | "kaladinFifth"
  | "lokiEntangle"
  | "lokiChicken"
  | "lokiControl"
  | "friskHugs"
  | "friskHeal"
  | "groznyInvade"
  | "groznyTyrant"
  | "undyneThrow"
  | "undyneUndying"
  | "duolingoPush"
  | "kanekiRegen"
  | "zoroOni"
  | "zoroAsura"
  | "donSorrow"
  | "artemidaReveal"
  | "lucheRadiance"
  | "mettatonEx"
  | "mettatonNeo"
  | "mettatonPoppins"
  | "kaiserEngineering"
  | "sansJoke"
  | "sansUnbeliever"
  | "sansField"
  | "sansSleep";

export type VfxPlacement = "cell" | "unit" | "area" | "line" | "ray" | "path" | "projectile";

export type BoardVfxRequest = {
  id: string;
  effectId: VfxEffectId;
  placement: VfxPlacement;
  sourceCell?: Coord;
  targetCell?: Coord;
  cells?: Coord[];
  path?: Coord[];
  unitId?: string;
  /** One-shots default to the frozen sourceCell; status previews opt into following. */
  anchorMode?: "event" | "followUnit";
  widthCells?: number;
  heightCells?: number;
  direction?: Coord;
  rayToEdge?: boolean;
  /** Local inspection only: production plays all composition layers. */
  composition?: "primary" | "accent";
  durationMs?: number;
  delayMs?: number;
  scaleCells?: number;
  opacity?: number;
};

export type QueuedBoardVfxRequest = BoardVfxRequest & {
  startedAt: number;
  expiresAt: number;
};

export type BoardVfxEventBatch = import("../../game/effects/types").BoardEventBatch;

export type VisibleUnitPositions = Record<string, Coord>;

export interface VfxMapperContext {
  view: PlayerView;
  previousPositions: VisibleUnitPositions;
  revision: number;
  presentationId?: string;
  streamId?: string;
  events: ProjectedGameEvent[];
  eventIndex: number;
}
