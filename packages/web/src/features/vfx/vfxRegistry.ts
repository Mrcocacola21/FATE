import type { VfxEffectId, VfxPlacement } from "./vfxTypes";
import { FIREBALL_TIMING } from "../../game/effects/asgorePresentation";

const fireBurst = new URL(
  "../../assets/vfx/curated/kenney-particle-pack/fire-burst.png",
  import.meta.url,
).href;
const muzzleFlash = new URL(
  "../../assets/vfx/curated/kenney-particle-pack/muzzle-flash.png",
  import.meta.url,
).href;
const revealStar = new URL(
  "../../assets/vfx/curated/kenney-particle-pack/reveal-star.png",
  import.meta.url,
).href;
const phantasmTrace = new URL(
  "../../assets/vfx/curated/kenney-particle-pack/ricochet-trace.png",
  import.meta.url,
).href;
const smokePuff = new URL(
  "../../assets/vfx/curated/kenney-particle-pack/smoke-puff.png",
  import.meta.url,
).href;
const stormBolt = new URL(
  "../../assets/vfx/curated/kenney-particle-pack/storm-bolt.png",
  import.meta.url,
).href;
const hexShieldStrip = new URL(
  "../../assets/vfx/curated/pipoya-hex-shield/hex-shield-strip.png",
  import.meta.url,
).href;
const mysticMarkStrip = new URL(
  "../../assets/vfx/curated/pipoya-mysterious-object/mystic-mark-strip.png",
  import.meta.url,
).href;
export type VfxAssetType =
  | "static"
  | "spriteStrip"
  | "particle"
  | "lineParticle"
  | "proceduralPortal";

export type VfxRenderLayer = "ground" | "movement" | "projectile" | "impact" | "status" | "overlay";
export const BOARD_LAYERS = {
  ground: 5,
  unit: 10,
  status: 20,
  movement: 30,
  projectile: 30,
  impact: 40,
  overlay: 45,
  outcome: 50,
  decision: 60,
} as const;
export const BOARD_LAYER_STYLES = Object.fromEntries(
  Object.entries(BOARD_LAYERS).map(([name, value]) => [`--board-layer-${name}`, value]),
) as Record<`--board-layer-${string}`, number>;

export interface VfxArtwork {
  asset?: string;
  assetType: VfxAssetType;
  frameWidth?: number;
  frameHeight?: number;
  frames?: number;
  /** Inclusive frame slice; timing remains duration-authoritative. */
  startFrame?: number;
  endFrame?: number;
  /** Optional source-frame viewport, used to remove authored beam padding without editing PNGs. */
  frameCrop?: { left: number; top: number; width: number; height: number };
  blendMode?: "normal" | "screen" | "plus-lighter";
}

export interface VfxDefinition extends VfxArtwork {
  id: VfxEffectId;
  sourcePack: string;
  sourceFile: string;
  defaultPlacement: VfxPlacement;
  durationMs: number;
  defaultScaleCells: number;
  opacity: number;
  /** Ordered composition: primary first, accent above. Shared parent timing. */
  layers?: readonly (VfxArtwork & { role: "primary" | "accent" })[];
  layer?: VfxRenderLayer;
  widthCells?: number;
  heightCells?: number;
  beamThicknessCells?: number;
  /** Artwork attachment point, as fractions of its rendered box. */
  anchorPoint?: { x: number; y: number };
  /** Rotation from the artwork's authored facing to the logical ray. */
  facingOffsetDeg?: number;
  reducedMotion: "hide" | "static" | "short";
}

const generated = (
  id: VfxEffectId,
  asset: string,
  frames: number,
  durationMs: number,
  defaultPlacement: VfxPlacement,
  layer: VfxRenderLayer,
): VfxDefinition => ({
  id,
  asset,
  frames,
  durationMs,
  defaultPlacement,
  layer,
  assetType: frames === 1 ? "static" : "spriteStrip",
  frameWidth: 128,
  frameHeight: 128,
  sourcePack: "FATE generated pack",
  sourceFile: asset.split("/").pop() ?? asset,
  defaultScaleCells: 1,
  opacity: 0.8,
  blendMode: "normal",
  reducedMotion: "static",
});

const doraPrimary = new URL(
  "../../assets/vfx/heroes/grand-kaiser/dora_impact_primary.png",
  import.meta.url,
).href;
const doraAccent = new URL(
  "../../assets/vfx/heroes/grand-kaiser/dora_impact_accent.png",
  import.meta.url,
).href;
const carpetPrimary = new URL(
  "../../assets/vfx/heroes/grand-kaiser/carpet_impact_primary.png",
  import.meta.url,
).href;
const carpetAccent = new URL(
  "../../assets/vfx/heroes/grand-kaiser/carpet_impact_accent.png",
  import.meta.url,
).href;
const forestPrimary = new URL(
  "../../assets/vfx/heroes/vladTepes/forest_eruption_primary.png",
  import.meta.url,
).href;
const forestAccent = new URL(
  "../../assets/vfx/heroes/vladTepes/forest_eruption_accent.png",
  import.meta.url,
).href;
const beamPrimary = new URL("../../assets/vfx/heroes/sans/gaster_beam_primary.png", import.meta.url)
  .href;
const beamAccent = new URL("../../assets/vfx/heroes/sans/gaster_beam_accent.png", import.meta.url)
  .href;
const fireball = new URL("../../assets/vfx/heroes/asgore/fireball.png", import.meta.url).href;
const paradePrimary = new URL(
  "../../assets/vfx/heroes/asgore/fire_parade_primary.png",
  import.meta.url,
).href;
const paradeAccent = new URL(
  "../../assets/vfx/heroes/asgore/fire_parade_accent.png",
  import.meta.url,
).href;
const paired = (
  primary: string,
  accent: string,
  frames: number,
): NonNullable<VfxDefinition["layers"]> => [
  {
    role: "primary",
    asset: primary,
    assetType: frames > 1 ? "spriteStrip" : "static",
    frames,
    frameWidth: 128,
    frameHeight: 128,
  },
  {
    role: "accent",
    asset: accent,
    assetType: frames > 1 ? "spriteStrip" : "static",
    frames,
    frameWidth: 128,
    frameHeight: 128,
  },
];

export const vfxRegistry: Record<VfxEffectId, VfxDefinition> = {
  jackCoverTracks: {
    ...generated(
      "jackCoverTracks",
      new URL("../../assets/vfx/heroes/jackRipper/cover_tracks_primary.png", import.meta.url).href,
      20,
      850,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/jackRipper/cover_tracks_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/jackRipper/cover_tracks_accent.png", import.meta.url).href,
      20,
    ),
    reducedMotion: "static",
  },
  jackSlaughter: {
    ...generated(
      "jackSlaughter",
      new URL("../../assets/vfx/heroes/jackRipper/slaughter_primary.png", import.meta.url).href,
      32,
      1800,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/jackRipper/slaughter_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/jackRipper/slaughter_accent.png", import.meta.url).href,
      32,
    ).map((layer) => ({ ...layer, startFrame: 0, endFrame: 7 })),
    reducedMotion: "static",
    startFrame: 0,
    endFrame: 7,
  },
  hassanOrder: {
    ...generated(
      "hassanOrder",
      new URL("../../assets/vfx/heroes/hassan/order.png", import.meta.url).href,
      16,
      650,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  hassanControl: {
    ...generated(
      "hassanControl",
      new URL("../../assets/vfx/heroes/hassan/true_enemy.png", import.meta.url).href,
      17,
      700,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  genghisDecree: {
    ...generated(
      "genghisDecree",
      new URL("../../assets/vfx/heroes/genghisKhan/decree.png", import.meta.url).href,
      16,
      650,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  chikatiloMark: {
    ...generated(
      "chikatiloMark",
      new URL("../../assets/vfx/heroes/chikatilo/mark.png", import.meta.url).href,
      16,
      650,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  chikatiloDecoy: {
    ...generated(
      "chikatiloDecoy",
      new URL("../../assets/vfx/heroes/chikatilo/decoy.png", import.meta.url).href,
      14,
      600,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  falseTrailSetup: {
    ...generated(
      "falseTrailSetup",
      new URL("../../assets/vfx/heroes/chikatilo/false_trail.png", import.meta.url).href,
      13,
      550,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  falseTrailBlast: {
    ...generated(
      "falseTrailBlast",
      new URL(
        "../../assets/vfx/heroes/chikatilo/false_trail_explosion_primary.png",
        import.meta.url,
      ).href,
      23,
      950,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL(
        "../../assets/vfx/heroes/chikatilo/false_trail_explosion_primary.png",
        import.meta.url,
      ).href,
      new URL("../../assets/vfx/heroes/chikatilo/false_trail_explosion_accent.png", import.meta.url)
        .href,
      23,
    ),
    reducedMotion: "static",
  },
  papyrusBones: {
    ...generated(
      "papyrusBones",
      new URL("../../assets/vfx/heroes/papyrus/bones.png", import.meta.url).href,
      1,
      600,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  papyrusSpaghetti: {
    ...generated(
      "papyrusSpaghetti",
      new URL("../../assets/vfx/heroes/papyrus/spaghetti.png", import.meta.url).href,
      14,
      600,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  papyrusUnbeliever: {
    ...generated(
      "papyrusUnbeliever",
      new URL("../../assets/vfx/heroes/papyrus/unbeliever.png", import.meta.url).href,
      28,
      1150,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  lechyGuide: {
    ...generated(
      "lechyGuide",
      new URL("../../assets/vfx/heroes/lechy/guide.png", import.meta.url).href,
      19,
      800,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  lechyForest: {
    ...generated(
      "lechyForest",
      new URL("../../assets/vfx/heroes/lechy/forest.png", import.meta.url).href,
      1,
      700,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  lechyStorm: {
    ...generated(
      "lechyStorm",
      new URL("../../assets/vfx/heroes/lechy/storm_primary.png", import.meta.url).href,
      1,
      1100,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/lechy/storm_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/lechy/storm_accent.png", import.meta.url).href,
      1,
    ),
    reducedMotion: "static",
  },
  gutsCrossbow: {
    ...generated(
      "gutsCrossbow",
      new URL("../../assets/vfx/heroes/guts/crossbow.png", import.meta.url).href,
      14,
      600,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
    startFrame: 0,
    endFrame: 4,
  },
  gutsCannon: {
    ...generated(
      "gutsCannon",
      new URL("../../assets/vfx/heroes/guts/cannon_primary.png", import.meta.url).href,
      19,
      800,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/guts/cannon_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/guts/cannon_accent.png", import.meta.url).href,
      19,
    ).map((layer) => ({ ...layer, startFrame: 0, endFrame: 5 })),
    reducedMotion: "static",
    startFrame: 0,
    endFrame: 5,
  },
  gutsBerserk: {
    ...generated(
      "gutsBerserk",
      new URL("../../assets/vfx/heroes/guts/berserk_primary.png", import.meta.url).href,
      31,
      1300,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/guts/berserk_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/guts/berserk_accent.png", import.meta.url).href,
      31,
    ),
    reducedMotion: "static",
  },
  gutsExit: {
    ...generated(
      "gutsExit",
      new URL("../../assets/vfx/heroes/guts/berserk_exit_drain.png", import.meta.url).href,
      10,
      400,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  griffithRebirth: {
    ...generated(
      "griffithRebirth",
      new URL("../../assets/vfx/heroes/griffith/rebirth_primary.png", import.meta.url).href,
      32,
      1500,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/griffith/rebirth_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/griffith/rebirth_accent.png", import.meta.url).href,
      32,
    ),
    reducedMotion: "static",
  },
  femtoMove: {
    ...generated(
      "femtoMove",
      new URL("../../assets/vfx/heroes/femto/divine_move.png", import.meta.url).href,
      18,
      750,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  odinSleipnir: {
    ...generated(
      "odinSleipnir",
      new URL("../../assets/vfx/heroes/odin/sleipnir.png", import.meta.url).href,
      18,
      750,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  odinMuninn: {
    ...generated(
      "odinMuninn",
      new URL("../../assets/vfx/heroes/odin/muninn.png", import.meta.url).href,
      14,
      600,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  jebeHail: {
    ...generated(
      "jebeHail",
      new URL("../../assets/vfx/heroes/jebe/hail_primary.png", import.meta.url).href,
      25,
      1050,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/jebe/hail_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/jebe/hail_accent.png", import.meta.url).href,
      25,
    ),
    reducedMotion: "static",
  },
  kaladinHeal: {
    ...generated(
      "kaladinHeal",
      new URL("../../assets/vfx/heroes/kaladin/first.png", import.meta.url).href,
      16,
      650,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  kaladinFifth: {
    ...generated(
      "kaladinFifth",
      new URL("../../assets/vfx/heroes/kaladin/fifth_primary.png", import.meta.url).href,
      32,
      1400,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/kaladin/fifth_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/kaladin/fifth_accent.png", import.meta.url).href,
      32,
    ),
    reducedMotion: "static",
  },
  lokiEntangle: {
    ...generated(
      "lokiEntangle",
      new URL("../../assets/vfx/heroes/loki/entangle.png", import.meta.url).href,
      20,
      850,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  lokiChicken: {
    ...generated(
      "lokiChicken",
      new URL("../../assets/vfx/heroes/loki/chicken.png", import.meta.url).href,
      17,
      700,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  lokiControl: {
    ...generated(
      "lokiControl",
      new URL("../../assets/vfx/heroes/loki/control.png", import.meta.url).href,
      16,
      650,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  friskHugs: {
    ...generated(
      "friskHugs",
      new URL("../../assets/vfx/heroes/frisk/hugs.png", import.meta.url).href,
      14,
      600,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  friskHeal: {
    ...generated(
      "friskHeal",
      new URL("../../assets/vfx/heroes/frisk/warm_words.png", import.meta.url).href,
      14,
      600,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  groznyInvade: {
    ...generated(
      "groznyInvade",
      new URL("../../assets/vfx/heroes/grozny/invade.png", import.meta.url).href,
      20,
      850,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  groznyTyrant: {
    ...generated(
      "groznyTyrant",
      new URL("../../assets/vfx/heroes/grozny/tyrant_primary.png", import.meta.url).href,
      24,
      1000,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/grozny/tyrant_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/grozny/tyrant_accent.png", import.meta.url).href,
      24,
    ),
    reducedMotion: "static",
  },
  undyneThrow: {
    ...generated(
      "undyneThrow",
      new URL("../../assets/vfx/heroes/undyne/throw.png", import.meta.url).href,
      17,
      700,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
    startFrame: 0,
    endFrame: 5,
  },
  undyneUndying: {
    ...generated(
      "undyneUndying",
      new URL("../../assets/vfx/heroes/undyne/undying_primary.png", import.meta.url).href,
      31,
      1300,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/undyne/undying_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/undyne/undying_accent.png", import.meta.url).href,
      31,
    ),
    reducedMotion: "static",
  },
  duolingoPush: {
    ...generated(
      "duolingoPush",
      new URL("../../assets/vfx/heroes/duolingo/push.png", import.meta.url).href,
      17,
      700,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  kanekiRegen: {
    ...generated(
      "kanekiRegen",
      new URL("../../assets/vfx/heroes/kaneki/regen.png", import.meta.url).href,
      16,
      650,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  zoroOni: {
    ...generated(
      "zoroOni",
      new URL("../../assets/vfx/heroes/zoro/oni_giri.png", import.meta.url).href,
      19,
      800,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
    startFrame: 0,
    endFrame: 5,
  },
  zoroAsura: {
    ...generated(
      "zoroAsura",
      new URL("../../assets/vfx/heroes/zoro/asura_primary.png", import.meta.url).href,
      31,
      1300,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/zoro/asura_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/zoro/asura_accent.png", import.meta.url).href,
      31,
    ),
    reducedMotion: "static",
  },
  donSorrow: {
    ...generated(
      "donSorrow",
      new URL("../../assets/vfx/heroes/donKihote/sorrow_move.png", import.meta.url).href,
      11,
      450,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  artemidaReveal: {
    ...generated(
      "artemidaReveal",
      new URL("../../assets/vfx/heroes/artemida/moon_reveal.png", import.meta.url).href,
      18,
      750,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  lucheRadiance: {
    ...generated(
      "lucheRadiance",
      new URL("../../assets/vfx/heroes/luche/radiance.png", import.meta.url).href,
      11,
      450,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  mettatonEx: {
    ...generated(
      "mettatonEx",
      new URL("../../assets/vfx/heroes/mettaton/ex.png", import.meta.url).href,
      26,
      1100,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  mettatonNeo: {
    ...generated(
      "mettatonNeo",
      new URL("../../assets/vfx/heroes/mettaton/neo_primary.png", import.meta.url).href,
      32,
      1400,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/mettaton/neo_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/mettaton/neo_accent.png", import.meta.url).href,
      32,
    ),
    reducedMotion: "static",
  },
  mettatonPoppins: {
    ...generated(
      "mettatonPoppins",
      new URL("../../assets/vfx/heroes/mettaton/poppins_primary.png", import.meta.url).href,
      23,
      950,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/mettaton/poppins_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/mettaton/poppins_accent.png", import.meta.url).href,
      23,
    ),
    reducedMotion: "static",
  },
  kaiserEngineering: {
    ...generated(
      "kaiserEngineering",
      new URL("../../assets/vfx/heroes/grand-kaiser/engineering_primary.png", import.meta.url).href,
      32,
      1500,
      "cell",
      "impact",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/grand-kaiser/engineering_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/grand-kaiser/engineering_accent.png", import.meta.url).href,
      32,
    ),
    reducedMotion: "static",
  },
  sansJoke: {
    ...generated(
      "sansJoke",
      new URL("../../assets/vfx/heroes/sans/joke.png", import.meta.url).href,
      20,
      850,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  sansUnbeliever: {
    ...generated(
      "sansUnbeliever",
      new URL("../../assets/vfx/heroes/sans/unbeliever.png", import.meta.url).href,
      24,
      1000,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  sansField: {
    ...generated(
      "sansField",
      new URL("../../assets/vfx/heroes/sans/bone_field.png", import.meta.url).href,
      1,
      800,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },
  sansSleep: {
    ...generated(
      "sansSleep",
      new URL("../../assets/vfx/heroes/sans/sleep.png", import.meta.url).href,
      13,
      550,
      "cell",
      "impact",
    ),
    reducedMotion: "static",
  },

  stakePlace: generated(
    "stakePlace",
    new URL("../../assets/vfx/heroes/vladTepes/stakes_place.png", import.meta.url).href,
    10,
    400,
    "cell",
    "ground",
  ),
  stakeTrigger: generated(
    "stakeTrigger",
    new URL("../../assets/vfx/heroes/vladTepes/stake_trigger.png", import.meta.url).href,
    13,
    550,
    "cell",
    "impact",
  ),
  snarePlace: generated(
    "snarePlace",
    new URL("../../assets/vfx/heroes/jackRipper/snare_place.png", import.meta.url).href,
    10,
    400,
    "cell",
    "ground",
  ),
  snareTrigger: generated(
    "snareTrigger",
    new URL("../../assets/vfx/heroes/jackRipper/snare_reveal_trigger.png", import.meta.url).href,
    13,
    550,
    "cell",
    "impact",
  ),
  combatHit: generated(
    "combatHit",
    new URL("../../assets/vfx/combat/combat_hit_light.png", import.meta.url).href,
    7,
    300,
    "cell",
    "impact",
  ),
  combatMiss: generated(
    "combatMiss",
    new URL("../../assets/vfx/combat/combat_miss.png", import.meta.url).href,
    7,
    300,
    "cell",
    "impact",
  ),
  unitDeath: generated(
    "unitDeath",
    new URL("../../assets/vfx/combat/unit_death.png", import.meta.url).href,
    12,
    520,
    "cell",
    "impact",
  ),
  statusSmall: generated(
    "statusSmall",
    new URL("../../assets/vfx/status/status_small.png", import.meta.url).href,
    1,
    650,
    "cell",
    "status",
  ),
  doraImpact: {
    ...generated("doraImpact", doraPrimary, 28, 1150, "area", "impact"),
    widthCells: 3,
    heightCells: 3,
    layers: paired(doraPrimary, doraAccent, 28),
  },
  carpetImpact: {
    ...generated("carpetImpact", carpetPrimary, 32, 1600, "area", "ground"),
    widthCells: 5,
    heightCells: 5,
    layers: paired(carpetPrimary, carpetAccent, 32),
  },
  forestEruption: {
    ...generated("forestEruption", forestPrimary, 30, 1250, "area", "impact"),
    widthCells: 3,
    heightCells: 3,
    layers: paired(forestPrimary, forestAccent, 30),
  },
  vladGaze: {
    ...generated(
      "vladGaze",
      new URL("../../assets/vfx/heroes/vladTepes/gaze.png", import.meta.url).href,
      12,
      500,
      "cell",
      "movement",
    ),
    defaultScaleCells: 0.6,
  },
  gasterCannon: {
    ...generated(
      "gasterCannon",
      new URL("../../assets/vfx/heroes/sans/gaster_blaster.png", import.meta.url).href,
      1,
      1350,
      "cell",
      "projectile",
    ),
    defaultScaleCells: 1.05,
    frameWidth: 2000,
    frameHeight: 2000,
    sourcePack: "User-provided Sans artwork",
    opacity: 1,
    // This skull faces down. Slight mouth overlap keeps it close to the cell center.
    anchorPoint: { x: 0.5, y: 0.8 },
    facingOffsetDeg: -90,
  },
  sansCurseApply: {
    ...generated(
      "sansCurseApply",
      new URL("../../assets/vfx/heroes/sans/curse_apply.png", import.meta.url).href,
      14,
      600,
      "cell",
      "status",
    ),
    defaultScaleCells: 0.75,
  },
  sansCurseTick: {
    ...generated(
      "sansCurseTick",
      new URL("../../assets/vfx/heroes/sans/curse_tick_end.png", import.meta.url).href,
      10,
      400,
      "cell",
      "status",
    ),
    defaultScaleCells: 0.6,
    opacity: 0.65,
  },
  sansCurseRemove: {
    ...generated(
      "sansCurseRemove",
      new URL("../../assets/vfx/heroes/sans/curse_tick_end.png", import.meta.url).href,
      10,
      240,
      "cell",
      "status",
    ),
    startFrame: 5,
    endFrame: 9,
    defaultScaleCells: 0.45,
    opacity: 0.4,
  },
  gasterBeam: {
    ...generated("gasterBeam", beamPrimary, 20, 850, "ray", "projectile"),
    beamThicknessCells: 1.125,
    layers: paired(beamPrimary, beamAccent, 20)?.map((art) => ({
      ...art,
      frameCrop: { left: 12, top: 48, width: 104, height: 32 },
    })),
  },
  bunkerStatus: generated(
    "bunkerStatus",
    new URL("../../assets/vfx/heroes/grand-kaiser/bunker_status.png", import.meta.url).href,
    1,
    1000,
    "unit",
    "status",
  ),
  fireball: {
    ...generated("fireball", fireball, 17, FIREBALL_TIMING.travelMs, "projectile", "projectile"),
    // Visually verified compact early ember. No undocumented later flames on misses.
    startFrame: 1,
    endFrame: 1,
    defaultScaleCells: 0.65,
  },
  fireballCast: {
    ...generated("fireballCast", fireball, 17, FIREBALL_TIMING.castMs, "cell", "projectile"),
    startFrame: 0,
    endFrame: 1,
    defaultScaleCells: 0.65,
  },
  fireballImpact: {
    ...generated("fireballImpact", fireball, 17, FIREBALL_TIMING.impactMs, "cell", "impact"),
    // Only a confirmed hit may use the unsliced combined artwork.
    defaultScaleCells: 0.85,
  },
  searchReveal: {
    id: "searchReveal",
    asset: revealStar,
    assetType: "particle",
    sourcePack: "kenney_particle-pack",
    sourceFile: "PNG (Transparent)/magic_04.png",
    defaultPlacement: "cell",
    durationMs: 650,
    defaultScaleCells: 1.35,
    opacity: 0.58,
    blendMode: "screen",
    reducedMotion: "short",
  },
  hiddenReveal: {
    id: "hiddenReveal",
    asset: smokePuff,
    assetType: "particle",
    sourcePack: "kenney_particle-pack",
    sourceFile: "PNG (Transparent)/smoke_03.png",
    defaultPlacement: "cell",
    durationMs: 760,
    defaultScaleCells: 1.35,
    opacity: 0.52,
    blendMode: "screen",
    reducedMotion: "short",
  },
  markApply: {
    id: "markApply",
    asset: mysticMarkStrip,
    assetType: "spriteStrip",
    sourcePack: "PIPOYA FREE VFX Mysterious Object",
    sourceFile: "192x192/pipo-mapeffect021_192.png",
    defaultPlacement: "unit",
    durationMs: 850,
    defaultScaleCells: 1.55,
    opacity: 0.68,
    frameWidth: 192,
    frameHeight: 192,
    frames: 20,
    blendMode: "screen",
    reducedMotion: "short",
  },
  storm: {
    id: "storm",
    asset: stormBolt,
    assetType: "particle",
    sourcePack: "kenney_particle-pack",
    sourceFile: "PNG (Transparent)/spark_06.png",
    defaultPlacement: "unit",
    durationMs: 740,
    defaultScaleCells: 1.55,
    opacity: 0.72,
    blendMode: "screen",
    reducedMotion: "short",
  },
  soulParade: {
    ...generated(
      "soulParade",
      new URL("../../assets/vfx/heroes/asgore/soul_parade.png", import.meta.url).href,
      22,
      900,
      "cell",
      "status",
    ),
    defaultScaleCells: 1.2,
  },
  fireParade: {
    ...generated("fireParade", paradePrimary, 29, 1200, "area", "ground"),
    layers: paired(paradePrimary, paradeAccent, 29),
    widthCells: 5,
    heightCells: 5,
  },
  shield: {
    id: "shield",
    asset: hexShieldStrip,
    assetType: "spriteStrip",
    sourcePack: "Pipoya VFX HEXShield",
    sourceFile: "192x192/pipo-btleffect206_192.png",
    defaultPlacement: "unit",
    durationMs: 850,
    defaultScaleCells: 1.45,
    opacity: 0.66,
    frameWidth: 192,
    frameHeight: 192,
    frames: 20,
    blendMode: "screen",
    reducedMotion: "short",
  },
  portal: {
    id: "portal",
    assetType: "proceduralPortal",
    sourcePack: "FATE procedural VFX",
    sourceFile: "src/features/vfx/PortalEffect.tsx",
    defaultPlacement: "cell",
    durationMs: 820,
    defaultScaleCells: 1.5,
    opacity: 0.9,
    blendMode: "screen",
    reducedMotion: "short",
  },
  phantasm: {
    id: "phantasm",
    assetType: "proceduralPortal",
    sourcePack: "FATE procedural VFX",
    sourceFile: "src/features/vfx/PortalEffect.tsx",
    defaultPlacement: "cell",
    durationMs: 780,
    defaultScaleCells: 1.5,
    opacity: 0.84,
    blendMode: "screen",
    reducedMotion: "short",
  },
  phantasmTrace: {
    id: "phantasmTrace",
    asset: phantasmTrace,
    assetType: "lineParticle",
    sourcePack: "kenney_particle-pack",
    sourceFile: "PNG (Transparent)/trace_03.png",
    defaultPlacement: "line",
    durationMs: 500,
    defaultScaleCells: 1,
    opacity: 0.55,
    blendMode: "screen",
    reducedMotion: "hide",
  },
  chicken: {
    id: "chicken",
    asset: smokePuff,
    assetType: "particle",
    sourcePack: "kenney_particle-pack",
    sourceFile: "PNG (Transparent)/smoke_03.png",
    defaultPlacement: "unit",
    durationMs: 700,
    defaultScaleCells: 1.25,
    opacity: 0.5,
    blendMode: "screen",
    reducedMotion: "short",
  },
  transformation: {
    id: "transformation",
    assetType: "proceduralPortal",
    sourcePack: "FATE procedural VFX",
    sourceFile: "src/features/vfx/PortalEffect.tsx",
    defaultPlacement: "unit",
    durationMs: 900,
    defaultScaleCells: 1.55,
    opacity: 0.86,
    blendMode: "screen",
    reducedMotion: "short",
  },
  stageSpark: {
    id: "stageSpark",
    asset: revealStar,
    assetType: "particle",
    sourcePack: "kenney_particle-pack",
    sourceFile: "PNG (Transparent)/magic_04.png",
    defaultPlacement: "unit",
    durationMs: 780,
    defaultScaleCells: 1.55,
    opacity: 0.62,
    blendMode: "screen",
    reducedMotion: "short",
  },
  boatPickup: generated(
    "boatPickup",
    new URL("../../assets/vfx/heroes/riverPerson/boat_start_pickup.png", import.meta.url).href,
    14,
    600,
    "cell",
    "movement",
  ),
  boatDrop: generated(
    "boatDrop",
    new URL("../../assets/vfx/heroes/riverPerson/boat_drop.png", import.meta.url).href,
    13,
    550,
    "cell",
    "movement",
  ),
  boat: generated(
    "boat",
    new URL("../../assets/vfx/heroes/riverPerson/boat_travel.png", import.meta.url).href,
    20,
    850,
    "projectile",
    "movement",
  ),
  tralala: {
    ...generated(
      "tralala",
      new URL("../../assets/vfx/heroes/riverPerson/tralala_primary.png", import.meta.url).href,
      26,
      1100,
      "projectile",
      "movement",
    ),
    layers: paired(
      new URL("../../assets/vfx/heroes/riverPerson/tralala_primary.png", import.meta.url).href,
      new URL("../../assets/vfx/heroes/riverPerson/tralala_accent.png", import.meta.url).href,
      26,
    ),
    reducedMotion: "short",
  },
  muzzle: {
    id: "muzzle",
    asset: muzzleFlash,
    assetType: "particle",
    sourcePack: "kenney_particle-pack",
    sourceFile: "PNG (Transparent)/muzzle_03.png",
    defaultPlacement: "unit",
    durationMs: 360,
    defaultScaleCells: 1,
    opacity: 0.62,
    blendMode: "screen",
    reducedMotion: "hide",
  },
  snareExplosion: {
    id: "snareExplosion",
    asset: fireBurst,
    assetType: "particle",
    sourcePack: "kenney_particle-pack",
    sourceFile: "PNG (Transparent)/fire_01.png",
    defaultPlacement: "cell",
    durationMs: 520,
    defaultScaleCells: 0.9,
    opacity: 0.58,
    blendMode: "screen",
    reducedMotion: "short",
  },
  berserkAoE: {
    id: "berserkAoE",
    asset: fireBurst,
    assetType: "particle",
    sourcePack: "kenney_particle-pack",
    sourceFile: "PNG (Transparent)/fire_01.png",
    defaultPlacement: "area",
    durationMs: 850,
    defaultScaleCells: 1,
    opacity: 0.3,
    blendMode: "screen",
    reducedMotion: "short",
  },
} satisfies Record<VfxEffectId, VfxDefinition>;

export function validateVfxRegistry(): string[] {
  const errors: string[] = [];
  for (const [id, definition] of Object.entries(vfxRegistry)) {
    if (id !== definition.id) errors.push(`${id}: id mismatch`);
    if (definition.assetType !== "proceduralPortal" && !definition.asset) {
      errors.push(`${id}: missing asset import`);
    }
    if (!Number.isFinite(definition.durationMs) || definition.durationMs <= 0)
      errors.push(`${id}: duration must be positive`);
    if (definition.defaultScaleCells <= 0) {
      errors.push(`${id}: defaultScaleCells must be positive`);
    }
    if (
      definition.assetType === "spriteStrip" &&
      (!definition.frameWidth ||
        !definition.frameHeight ||
        !definition.frames ||
        definition.frames <= 1)
    ) {
      errors.push(`${id}: invalid sprite strip metadata`);
    }
    for (const art of definition.layers ?? [definition]) {
      if (!art.asset && art.assetType !== "proceduralPortal")
        errors.push(`${id}: missing layer asset`);
      if (art.assetType !== "spriteStrip") continue;
      const start = art.startFrame ?? 0,
        end = art.endFrame ?? (art.frames ?? 1) - 1;
      if (
        !Number.isInteger(art.frames) ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end < start ||
        end >= (art.frames ?? 0) ||
        !art.frameWidth ||
        !art.frameHeight
      )
        errors.push(`${id}: invalid layer frame range`);
      if (
        art.frameCrop &&
        (art.frameCrop.left < 0 ||
          art.frameCrop.top < 0 ||
          art.frameCrop.width <= 0 ||
          art.frameCrop.height <= 0 ||
          art.frameCrop.left + art.frameCrop.width > (art.frameWidth ?? 0) ||
          art.frameCrop.top + art.frameCrop.height > (art.frameHeight ?? 0))
      ) {
        errors.push(`${id}: invalid frame crop`);
      }
    }
    if (
      definition.layers &&
      new Set(definition.layers.map((art) => art.role)).size !== definition.layers.length
    ) {
      errors.push(`${id}: duplicate composition role`);
    }
  }
  return errors;
}
