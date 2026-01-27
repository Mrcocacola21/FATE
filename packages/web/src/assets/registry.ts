import { HERO_CATALOG } from "../figures/catalog";

export type AssetInfo = { figureId: string; art: string; token: string };

const FALLBACK_FIGURE = new URL("./figures/_missing.webp", import.meta.url).href;
const FALLBACK_TOKEN = new URL("./tokens/_missing.webp", import.meta.url).href;

const GRAND_KAISER_ART = new URL("./figures/grand-kaiser.webp", import.meta.url).href;
const VLAD_TEPES_ART = new URL("./figures/vladTepes.webp", import.meta.url).href;
const GENGHIS_KHAN_ART = new URL("./figures/genghisKhan.webp", import.meta.url).href;
const EL_CID_COMPEADOR_ART = new URL("./figures/elCidCompeador.webp", import.meta.url).href;
const LECHY_ART = new URL("./figures/lechy.webp", import.meta.url).href;
const CHIKATILO_ART = new URL("./figures/chikatilo.webp", import.meta.url).href;
const GROZNY_ART = new URL("./figures/grozny.webp", import.meta.url).href;

const GRAND_KAISER_TOKEN = new URL("./tokens/grand-kaiser.webp", import.meta.url).href;
const VLAD_TEPES_TOKEN = new URL("./tokens/vladTepes.webp", import.meta.url).href;
const GENGHIS_KHAN_TOKEN = new URL("./tokens/genghisKhan.webp", import.meta.url).href;
const EL_CID_COMPEADOR_TOKEN = new URL("./tokens/elCidCompeador.webp", import.meta.url).href;
const LECHY_TOKEN = new URL("./tokens/lechy.webp", import.meta.url).href;
const CHIKATILO_TOKEN = new URL("./tokens/chikatilo.webp", import.meta.url).href;
const GROZNY_TOKEN = new URL("./tokens/grozny.webp", import.meta.url).href;

const FIGURE_ARTS: Record<string, string> = {
  "grand-kaiser": GRAND_KAISER_ART,
  "vladTepes": VLAD_TEPES_ART,
  "genghisKhan": GENGHIS_KHAN_ART,
  "elCidCompeador": EL_CID_COMPEADOR_ART,
  "lechy": LECHY_ART,
  "chikatilo": CHIKATILO_ART,
  "grozny": GROZNY_ART,
  _missing: FALLBACK_FIGURE,
};

const TOKENS: Record<string, string> = {
  "grand-kaiser": GRAND_KAISER_TOKEN,
  "vladTepes": VLAD_TEPES_TOKEN,
  "genghisKhan": GENGHIS_KHAN_TOKEN,
  "elCidCompeador": EL_CID_COMPEADOR_TOKEN,
  "lechy": LECHY_TOKEN,
  "chikatilo": CHIKATILO_TOKEN,
  "grozny": GROZNY_TOKEN,
  _missing: FALLBACK_TOKEN,
};

export function getFigureArtSrc(figureId: string): string {
  return FIGURE_ARTS[figureId] ?? FALLBACK_FIGURE;
}

export function getTokenSrc(figureId: string): string {
  return TOKENS[figureId] ?? FALLBACK_TOKEN;
}

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
