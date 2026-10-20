import { expansionAssets, type ExpansionEffectId } from "./expansionCatalog.generated";
import type { VfxDefinition, VfxRenderLayer } from "./vfxRegistry";
import { expansionStaging, expansionStagingProfile } from "./expansionStaging";

export const expansionIds = Object.keys(expansionAssets) as ExpansionEffectId[];
const byRole = new Map(expansionIds.map(id => [
  `${expansionAssets[id].heroId}/${expansionAssets[id].role}`, id,
]));
// These authored point strips use a small central footprint. Give their arc /
// threshold crown room around the portrait rather than burying it inside it.
const POINT_ACCENTS = new Set(["berserker_unlock", "clean_soul_break", "storm_ward"]);

export function expansionEffect(heroId: string | null | undefined, role: string): ExpansionEffectId | undefined {
  return heroId ? byRole.get(`${heroId}/${role}`) : undefined;
}

/** Import layers describe art intent; only these translated layers reach the board. */
export const expansionRegistry = Object.fromEntries(expansionIds.map(id => {
  const art = expansionAssets[id];
  const staging = expansionStaging(art.role);
  const profile = expansionStagingProfile(art.heroId);
  const layer: VfxRenderLayer = staging ? "ground" : art.frames === 1 ? "ground"
    : art.geometry === "projectile" ? "projectile"
    : art.geometry === "trail" ? "movement"
    : art.layer === "ground" || art.layer === "area" ? "ground" : "impact";
  const definition: VfxDefinition = {
    id, asset: art.asset, frames: art.frames, frameWidth: art.frameWidth, frameHeight: art.frameHeight,
    meleeSwing: art.geometry === "swing",
    staging, stagingProfile: staging ? profile : undefined,
    assetType: art.frames === 1 ? "static" : "spriteStrip",
    sourcePack: "FATE hero expansion", sourceFile: `${art.heroId}/expansion/${art.role}.png`,
    defaultPlacement: art.geometry === "projectile" ? "projectile" : "cell",
    layer, durationMs: staging === "deploy" ? profile.deployDuration : staging === "moveArrive" ? profile.arrivalDuration : art.durationMs || 1000,
    defaultScaleCells: POINT_ACCENTS.has(art.role) ? 1.7 : art.geometry === "swing" ? 1.3 : 1.15,
    opacity: staging ? profile.opacity : art.frames === 1 ? 0.65 : 0.85, blendMode: "normal",
    anchorPoint: art.anchorPoint, facingOffsetDeg: 0,
    orientToTarget: art.authoredFacing === "+X",
    reducedMotion: art.geometry === "trail" ? "hide" : "static",
  };
  return [id, definition];
})) as Record<ExpansionEffectId, VfxDefinition>;
