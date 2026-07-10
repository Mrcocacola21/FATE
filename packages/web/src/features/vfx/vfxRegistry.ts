import type { VfxEffectId, VfxPlacement } from "./vfxTypes";

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
const portalGreenStrip = new URL(
  "../../assets/vfx/curated/pipoya-warp-portal/portal-green-strip.png",
  import.meta.url,
).href;
const portalRedStrip = new URL(
  "../../assets/vfx/curated/pipoya-warp-portal/portal-red-strip.png",
  import.meta.url,
).href;

export type VfxAssetType = "spriteStrip" | "particle" | "lineParticle";

export interface VfxDefinition {
  id: VfxEffectId;
  asset: string;
  assetType: VfxAssetType;
  sourcePack: string;
  sourceFile: string;
  defaultPlacement: VfxPlacement;
  durationMs: number;
  defaultScaleCells: number;
  opacity: number;
  frameWidth?: number;
  frameHeight?: number;
  frames?: number;
  fps?: number;
  blendMode?: "normal" | "screen" | "plus-lighter";
  reducedMotion: "hide" | "static" | "short";
}

export const vfxRegistry = {
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
    fps: 24,
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
    id: "soulParade",
    asset: mysticMarkStrip,
    assetType: "spriteStrip",
    sourcePack: "PIPOYA FREE VFX Mysterious Object",
    sourceFile: "192x192/pipo-mapeffect021_192.png",
    defaultPlacement: "unit",
    durationMs: 900,
    defaultScaleCells: 1.75,
    opacity: 0.58,
    frameWidth: 192,
    frameHeight: 192,
    frames: 20,
    fps: 24,
    blendMode: "screen",
    reducedMotion: "short",
  },
  fireParade: {
    id: "fireParade",
    asset: fireBurst,
    assetType: "particle",
    sourcePack: "kenney_particle-pack",
    sourceFile: "PNG (Transparent)/fire_01.png",
    defaultPlacement: "area",
    durationMs: 850,
    defaultScaleCells: 1,
    opacity: 0.32,
    blendMode: "screen",
    reducedMotion: "short",
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
    fps: 24,
    blendMode: "screen",
    reducedMotion: "short",
  },
  portal: {
    id: "portal",
    asset: portalGreenStrip,
    assetType: "spriteStrip",
    sourcePack: "Pipoya VFX WarpPortal",
    sourceFile: "192x192/pipo-gate01c192.png",
    defaultPlacement: "cell",
    durationMs: 720,
    defaultScaleCells: 1.35,
    opacity: 0.68,
    frameWidth: 192,
    frameHeight: 192,
    frames: 15,
    fps: 24,
    blendMode: "screen",
    reducedMotion: "short",
  },
  phantasm: {
    id: "phantasm",
    asset: portalRedStrip,
    assetType: "spriteStrip",
    sourcePack: "Pipoya VFX WarpPortal",
    sourceFile: "192x192/pipo-gate01a192.png",
    defaultPlacement: "cell",
    durationMs: 720,
    defaultScaleCells: 1.4,
    opacity: 0.62,
    frameWidth: 192,
    frameHeight: 192,
    frames: 15,
    fps: 24,
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
    asset: portalRedStrip,
    assetType: "spriteStrip",
    sourcePack: "Pipoya VFX WarpPortal",
    sourceFile: "192x192/pipo-gate01a192.png",
    defaultPlacement: "unit",
    durationMs: 900,
    defaultScaleCells: 1.55,
    opacity: 0.66,
    frameWidth: 192,
    frameHeight: 192,
    frames: 15,
    fps: 24,
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
  boat: {
    id: "boat",
    asset: portalGreenStrip,
    assetType: "spriteStrip",
    sourcePack: "Pipoya VFX WarpPortal",
    sourceFile: "192x192/pipo-gate01c192.png",
    defaultPlacement: "cell",
    durationMs: 720,
    defaultScaleCells: 1.3,
    opacity: 0.62,
    frameWidth: 192,
    frameHeight: 192,
    frames: 15,
    fps: 24,
    blendMode: "screen",
    reducedMotion: "short",
  },
  tralala: {
    id: "tralala",
    asset: portalGreenStrip,
    assetType: "spriteStrip",
    sourcePack: "Pipoya VFX WarpPortal",
    sourceFile: "192x192/pipo-gate01c192.png",
    defaultPlacement: "path",
    durationMs: 850,
    defaultScaleCells: 1.25,
    opacity: 0.5,
    frameWidth: 192,
    frameHeight: 192,
    frames: 15,
    fps: 24,
    blendMode: "screen",
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
    if (!definition.asset) errors.push(`${id}: missing asset import`);
    if (definition.durationMs <= 0) errors.push(`${id}: duration must be positive`);
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
  }
  return errors;
}
