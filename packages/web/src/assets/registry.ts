import { HERO_CATALOG } from "../catalog/figures";
import { getFigureArtSrc, getTokenSrc } from "../catalog/tokens";

export type AssetInfo = { figureId: string; art: string; token: string };

export { getFigureArtSrc, getTokenSrc };

export const ASSETS: Record<string, AssetInfo> = Object.fromEntries(
  HERO_CATALOG.map((hero) => [
    hero.id,
    {
      figureId: hero.id,
      art: getFigureArtSrc(hero.id),
      token: getTokenSrc(hero.id),
    },
  ])
);
