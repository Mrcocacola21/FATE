import { REMAINING_CASTS, REMAINING_AREAS } from "./remainingHeroPresentation";

export type HeroCoverageStatus =
  | "COMPLETE"
  | "GENERIC_ONLY"
  | "INTENTIONALLY_SILENT"
  | "MISSING_ASSET"
  | "BLOCKED_BY_EVENT_DATA"
  | "NOT_IMPLEMENTED";
export type HeroAbilityCoverage = {
  status: HeroCoverageStatus;
  events: string;
  template: string;
  visibility: string;
  notes: string;
};

const silent = (
  notes = "Stat/trait/counter only; current UI restores silently. No invented cast.",
): HeroAbilityCoverage => ({
  status: "INTENTIONALLY_SILENT",
  events: "current projected state",
  template: "STATUS",
  visibility: "recipient-safe state",
  notes,
});
const generic = (events: string, template: string, notes: string): HeroAbilityCoverage => ({
  status: "GENERIC_ONLY",
  events,
  template,
  visibility: "recipient-authorized events",
  notes,
});
const previous = (events: string, template: string, notes: string): HeroAbilityCoverage => ({
  ...generic(events, template, notes),
  status: "COMPLETE",
});
const blocked = (notes: string): HeroAbilityCoverage => ({
  status: "BLOCKED_BY_EVENT_DATA",
  events: "current projected state",
  template: "STATUS",
  visibility: "owner state",
  notes,
});

/** Explicit exceptions make new abilities fail the roster-derived coverage test.
 * This is documentation/validation metadata, never a gameplay registry. */
export const HERO_COVERAGE_EXCEPTIONS: Record<string, HeroAbilityCoverage> = {
  ...Object.fromEntries(
    [
      "griffithWretchedMan",
      "femtoGodHp",
      "femtoMultiBerserkSpear",
      "jebeDurable",
      "lucheLongLived",
      "lucheSunGlory",
      "kanekiGhoul",
      "kanekiRcCells",
      "kanekiRinkakuKagune",
      "zoroCheatedDeath",
      "zoroDetermination",
      "donKihoteHardy",
      "jackRipperResilient",
      "jackRipperSurgery",
      "artemidaGod",
      "artemidaNatureMovement",
      "artemidaAccurateArrow",
      "sansLongLiver",
      "sansSpearmanFeature",
      "undyneTough",
      "undyneSpearmanMulticlass",
      "papyrusOssified",
      "mettatonLongLiver",
      "mettatonRating",
      "mettatonWorkOnCamera",
      "mettatonStagePhenomenon",
      "mettatonRiderFeature",
      "mettatonBerserkerMulticlass",
      "mettatonGrace",
      "riverGuideOfSouls",
      "duolingoLongLived",
      "duolingoSkipClasses",
      "lechyGiant",
      "chikatiloTough",
      "kaladinSecond",
      "kaladinFourth",
      "odinHuginn",
    ].map((id) => [id, silent()]),
  ),
  ...Object.fromEntries(
    ["hassanOneWithSand", "lokiNaturalStealth", "lechyNaturalStealth", "artemidaStealth"].map(
      (id) => [
        id,
        generic(
          "stealthEntered / stealthRevealed",
          "STEALTH",
          "Authoritative success only; hidden paths never reconstructed.",
        ),
      ],
    ),
  ),
  ...Object.fromEntries(
    [
      "vladPolkovodets",
      "genghisKhanLegendOfTheSteppes",
      "kaladinThird",
      "duolingoStrick",
      "zoro3SwordStyle",
      "odinGungnir",
      "lokiIllusoryDouble",
      "friskCleanSoul",
      "falseTrailTrap",
    ].map((id) => [
      id,
      generic(
        "attackResolved / damageBonusApplied / unitDied",
        "COMBAT",
        "Real combat outcomes reflect the passive; no cinematic cast.",
      ),
    ]),
  ),
  berserkAutoDefense: generic(
    "berserkerDefenseChosen / attackResolved",
    "REACTION / COMBAT",
    "Authoritative defense choice and miss; no client roll.",
  ),
  tricksterAoE: generic(
    "aoeResolved / attackResolved",
    "AREA / COMBAT",
    "Shared generic area/outcomes/HP; no per-hero duplication.",
  ),
  undyneSwitchDirection: {
    status: "NOT_IMPLEMENTED",
    events: "none",
    template: "MOVEMENT / REACTION",
    visibility: "none",
    notes:
      "Direction Shift is listed in canonical metadata, but no runtime force-move resolver/trigger exists. Implement rules separately before adding presentation; do not invent a displacement.",
  },
  papyrusLongBone: generic(
    "aoeResolved / attackResolved",
    "COMBAT",
    "Full chosen line geometry/axis absent from aggregate; retain actual per-target outcomes.",
  ),
  friskPacifism: generic(
    "abilityUsed / friskHugsApplied / unitHealed / attackResolved / gameEnded",
    "STATUS / REACTION / COMBAT",
    "Hugs and Warm Words signatures wired. Child's Cry/Power of Friendship have no distinct result discriminator; generic defense/end UI.",
  ),
  friskGenocide: generic(
    "abilityUsed / stealthRevealed / attackResolved",
    "STEALTH / REACTION / COMBAT",
    "Keen Eye, Substitution and Precision use real reveal/combat. Commitment lacks option discriminator; do not guess a signature from resource spend.",
  ),
  friskOnePath: blocked(
    "One Path state changes without a dedicated unlock event. Add a recipient-safe semantic trigger before using one_path.png or unlock audio.",
  ),
  duolingoBerserker: blocked(
    "Permanent unlock has no distinct semantic event. Current multiclass state restores silently; add an unlock event for berserker.png.",
  ),
  kanekiScolopendra: blocked(
    "Centipede unlock has no distinct event. Extra move/actual reached movement works generically; add an unlock event before transformation art/audio.",
  ),
  chikatiloFalseTrail: generic(
    "unitPlaced / stealthRevealed / aoeResolved",
    "STEALTH / AREA",
    "Public token gets separate setup art and confirmed explosion; real placement stays owner-only, never connected.",
  ),
  jackRipperSnares: {
    status: "COMPLETE",
    events: "snarePlaced / snareTriggered",
    template: "TRAP / MOVEMENT / STATUS",
    visibility: "owner-only placement; authorized trigger cell",
    notes:
      "Existing hazard scheduler; immobilization only, no invented damage. Remaining snares stay hidden.",
  },
  chikatiloAssassinMark: {
    status: "COMPLETE",
    events: "chikatiloMarkApplied",
    template: "STATUS",
    visibility: "owner-only event and commitment",
    notes: "No source cast duplicate or public target/audio cue. No historical mark replay.",
  },
  papyrusBlueBone: {
    status: "COMPLETE",
    events: "papyrusBoneApplied / papyrusBonePunished",
    template: "STATUS / COMBAT",
    visibility: "authorized target",
    notes: "One apply and actual tick; shared HP/death. Current simple status UI only.",
  },
  papyrusOrangeBone: {
    status: "COMPLETE",
    events: "papyrusBoneApplied / papyrusBonePunished",
    template: "STATUS / COMBAT",
    visibility: "authorized target",
    notes: "Distinct apply audio; existing shared HP/tick. No persistent loops.",
  },
  papyrusUnbeliever: {
    status: "COMPLETE",
    events: "papyrusUnbelieverActivated",
    template: "STATUS",
    visibility: "authorized source",
    notes: "Actual unlock event only; silent hydration.",
  },
  lechyStorm: {
    status: "COMPLETE",
    events: "lechyStormStarted / lechyStormRollResult",
    template: "STATUS / COMBAT",
    visibility: "public arena start; authorized unit ticks",
    notes:
      "One start sound/source accent; existing arena state and shared actual damage. End silently reconciles.",
  },
  griffithFemtoRebirth: {
    status: "COMPLETE",
    events: "unitTransformed",
    template: "STATUS",
    visibility: "authorized transformed unit",
    notes: "Rebirth signature; final death remains unitDied only.",
  },
  mettatonEx: {
    status: "COMPLETE",
    events: "unitTransformed",
    template: "STATUS",
    visibility: "authorized transformed unit",
    notes: "Actual threshold event; no repeated state-diff cast.",
  },
  mettatonNeo: {
    status: "COMPLETE",
    events: "unitTransformed",
    template: "STATUS",
    visibility: "authorized transformed unit",
    notes: "Actual NEO event; no synthetic EX replay when rules emit NEO only.",
  },
  // Previous packs, including the genuinely uncovered one-shots added here.
  kaiserBunker: previous(
    "bunkerEntered / bunkerExited / attackResolved",
    "STATUS / COMBAT",
    "Existing Kaiser pack preserved.",
  ),
  kaiserDora: previous(
    "aoeResolved / attackResolved",
    "AREA / COMBAT",
    "Existing Dora composite/audio and outcomes preserved.",
  ),
  kaiserCarpetStrike: previous(
    "abilityUsed / aoeResolved / attackResolved",
    "CAST / AREA",
    "Existing launch/impact and combat preserved.",
  ),
  vladIntimidate: previous(
    "intimidateResolved",
    "MOVEMENT / REACTION",
    "Existing gaze and authoritative forced move preserved.",
  ),
  vladStakes: previous(
    "stakesPlaced / stakeTriggered",
    "TRAP / MOVEMENT",
    "Existing owner placement and authorized triggers preserved.",
  ),
  vladForest: previous(
    "aoeResolved / attackResolved",
    "AREA / STATUS",
    "Existing eruption/audio/HP preserved.",
  ),
  sansGasterBlaster: previous(
    "aoeResolved / attackResolved",
    "CAST / AREA",
    "Existing summon/charge/beam scheduling preserved.",
  ),
  sansLastAttack: previous(
    "sansLastAttackApplied / sansLastAttackTick / sansLastAttackRemoved / unitDied",
    "STATUS / COMBAT",
    "Existing pre-death and curse pack preserved.",
  ),
  sansUnbeliever: {
    status: "COMPLETE",
    events: "sansUnbelieverActivated",
    template: "STATUS",
    visibility: "authorized source",
    notes: "Previously generic unlock now gets existing hero art.",
  },
  sansBoneField: {
    status: "COMPLETE",
    events: "sansBoneFieldActivated / sansBoneFieldPunished",
    template: "STATUS / COMBAT",
    visibility: "authorized source/ticks",
    notes: "Previously generic activation now gets existing art/audio; no new arena renderer.",
  },
  asgoreFireball: previous(
    "abilityUsed / attackResolved",
    "PROJECTILE / COMBAT",
    "Existing cast/travel/confirmed impact preserved.",
  ),
  asgoreFireParade: previous(
    "abilityUsed / aoeResolved / attackResolved",
    "AREA / COMBAT",
    "Existing composite and shared outcomes preserved.",
  ),
  asgoreSoulParade: previous(
    "asgoreSoulParadeResolved",
    "STATUS",
    "Existing soul reveal and authoritative choices preserved.",
  ),
  riverBoat: previous(
    "abilityUsed / riverBoatPickup / unitMoved / riverBoatDisembarked",
    "MOVEMENT",
    "Existing transport pack preserved.",
  ),
  riverBoatman: previous(
    "riverBoatmanGranted",
    "CAST / STATUS",
    "Existing confirmed grant preserved.",
  ),
  riverTraLaLa: previous(
    "abilityUsed / unitMoved / reactionOpportunity / reactionChoiceResolved",
    "MOVEMENT / REACTION",
    "Existing independent reactions/manual dice/transport preserved.",
  ),
};

export function heroAbilityCoverage(abilityId: string): HeroAbilityCoverage | undefined {
  if (HERO_COVERAGE_EXCEPTIONS[abilityId]) return HERO_COVERAGE_EXCEPTIONS[abilityId];
  if (REMAINING_AREAS[abilityId]) {
    const sparse = !REMAINING_AREAS[abilityId].square;
    return {
      status: sparse ? "GENERIC_ONLY" : "COMPLETE",
      events: "aoeResolved / attackResolved / unitDied",
      template: "AREA / COMBAT",
      visibility: "recipient-projected source/area/targets",
      notes: sparse
        ? "Compact origin cue and signature audio; exact sparse/line geometry absent. Shared actual outcomes/HP; never fill its bounding square."
        : "One aggregate signature, actual per-target generic outcomes and HP once.",
    };
  }
  if (REMAINING_CASTS[abilityId])
    return {
      status: "COMPLETE",
      events: "abilityUsed / confirmed outcome / unitDied",
      template: "CAST / STATUS / MOVEMENT / COMBAT",
      visibility: abilityId.startsWith("hassan")
        ? "owner-only commitment"
        : "recipient-authorized frozen source",
      notes:
        "Committed source cue; actual movement/combat/heal uses existing scheduler. Missing custom audio uses generic outcome audio/silence.",
    };
  return undefined;
}
