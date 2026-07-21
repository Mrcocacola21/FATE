import { HERO_CATALOG as FIGURE_SET_HERO_CATALOG } from "../catalog/figures";
import { FIGURE_ARTS, TOKENS, getFigureArtSrc, getTokenSrc } from "../catalog/tokens";

export type AssetInfo = { figureId: string; art: string; token: string };

export type BoardMarkerAssetId = "jack_trap" | "lechy_forest" | "vlad_stake";

const BOARD_MARKER_ASSETS: Record<BoardMarkerAssetId, string> = {
  jack_trap: new URL("./markers/trap.png", import.meta.url).href,
  lechy_forest: new URL("./markers/Forest.png", import.meta.url).href,
  vlad_stake: new URL("./markers/vladStake.webp", import.meta.url).href,
};

export function getBoardMarkerAsset(id: BoardMarkerAssetId): string {
  return BOARD_MARKER_ASSETS[id];
}

export {
  getActiveBoardFieldVisual,
  getBoardFieldAsset,
  getBoardFieldDescriptionKey,
  getBoardFieldLabelKey,
} from "./boardFields";
export type { BoardFieldVisualId } from "./boardFields";

export { getFigureArtSrc, getTokenSrc };
export {
  getHeroVisualVariants,
  getUnitFigureAsset,
  getUnitTokenAsset,
  getUnitVisualSignature,
  getUnitVisualVariant,
  getUnitVisualVariantLabelKey,
} from "./unitVisuals";
export type { HeroVisualVariantPreview, UnitVisualAsset, UnitVisualVariant } from "./unitVisuals";

const registeredHeroIds = Array.from(
  new Set([
    ...FIGURE_SET_HERO_CATALOG.map((hero) => hero.id),
    ...Object.keys(FIGURE_ARTS),
    ...Object.keys(TOKENS),
  ]),
);
export const ASSETS: Record<string, AssetInfo> = Object.fromEntries(
  registeredHeroIds.map((heroId) => [
    heroId,
    {
      figureId: heroId,
      art: getFigureArtSrc(heroId),
      token: getTokenSrc(heroId),
    },
  ]),
);
