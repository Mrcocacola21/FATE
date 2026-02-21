export const FALLBACK_FIGURE = new URL("../assets/figures/_missing.webp", import.meta.url).href;
export const FALLBACK_TOKEN = new URL("../assets/tokens/_missing.webp", import.meta.url).href;

const GRAND_KAISER_ART = new URL("../assets/figures/grand-kaiser.webp", import.meta.url).href;
const VLAD_TEPES_ART = new URL("../assets/figures/vladTepes.webp", import.meta.url).href;
const GENGHIS_KHAN_ART = new URL("../assets/figures/genghisKhan.webp", import.meta.url).href;
const EL_CID_COMPEADOR_ART = new URL("../assets/figures/elCidCompeador.webp", import.meta.url).href;
const LECHY_ART = new URL("../assets/figures/lechy.webp", import.meta.url).href;
const CHIKATILO_ART = new URL("../assets/figures/chikatilo.webp", import.meta.url).href;
const GROZNY_ART = new URL("../assets/figures/grozny.webp", import.meta.url).href;
const FRISK_ART = new URL("../assets/figures/frisk.webp", import.meta.url).href;
const ASGORE_ART = new URL("../assets/figures/asgore.webp", import.meta.url).href;
const JEBE_ART = new URL("../assets/figures/jebe.webp", import.meta.url).href;
const HASSAN_ART = new URL("../assets/figures/hassan.webp", import.meta.url).href;
const KALADIN_ART = new URL("../assets/figures/kalladin.webp", import.meta.url).href;
const PAPYRUS_ART = new URL("../assets/figures/papyrus.webp", import.meta.url).href;
const LOKI_ART = new URL("../assets/figures/loki.webp", import.meta.url).href;
const RIVER_PERSON_ART = new URL("../assets/figures/riverPerson.webp", import.meta.url).href;

const GRAND_KAISER_TOKEN = new URL("../assets/tokens/grand-kaiser.webp", import.meta.url).href;
const VLAD_TEPES_TOKEN = new URL("../assets/tokens/vladTepes.webp", import.meta.url).href;
const GENGHIS_KHAN_TOKEN = new URL("../assets/tokens/genghisKhan.webp", import.meta.url).href;
const EL_CID_COMPEADOR_TOKEN = new URL("../assets/tokens/elCidCompeador.webp", import.meta.url).href;
const LECHY_TOKEN = new URL("../assets/tokens/lechy.webp", import.meta.url).href;
const CHIKATILO_TOKEN = new URL("../assets/tokens/chikatilo.webp", import.meta.url).href;
const GROZNY_TOKEN = new URL("../assets/tokens/grozny.webp", import.meta.url).href;
const FRISK_TOKEN = new URL("../assets/tokens/frisk.webp", import.meta.url).href;
const ASGORE_TOKEN = new URL("../assets/tokens/asgore.webp", import.meta.url).href;
const JEBE_TOKEN = new URL("../assets/tokens/jebe.webp", import.meta.url).href;
const HASSAN_TOKEN = new URL("../assets/tokens/hassan.webp", import.meta.url).href;
const KALADIN_TOKEN = new URL("../assets/tokens/kalladin.webp", import.meta.url).href;
const PAPYRUS_TOKEN = new URL("../assets/tokens/papyrus.webp", import.meta.url).href;
const METTATON_TOKEN = new URL("../assets/tokens/mettaton_ex.webp", import.meta.url).href;
const LOKI_TOKEN = new URL("../assets/tokens/loki.webp", import.meta.url).href;
const RIVER_PERSON_TOKEN = new URL("../assets/tokens/riverPerson.webp", import.meta.url).href;
const ODIN_TOKEN = new URL("../assets/tokens/odin.webp", import.meta.url).href;
const GRIFFITH_TOKEN = new URL("../assets/tokens/griffith.webp", import.meta.url).href;
const FEMTO_TOKEN = new URL("../assets/tokens/femto.webp", import.meta.url).href;

export const FIGURE_ARTS: Record<string, string> = {
  "grand-kaiser": GRAND_KAISER_ART,
  "vladTepes": VLAD_TEPES_ART,
  "genghisKhan": GENGHIS_KHAN_ART,
  "elCidCompeador": EL_CID_COMPEADOR_ART,
  "lechy": LECHY_ART,
  "chikatilo": CHIKATILO_ART,
  "falseTrailToken": CHIKATILO_ART,
  "grozny": GROZNY_ART,
  "frisk": FRISK_ART,
  "asgore": ASGORE_ART,
  "guts": FALLBACK_FIGURE,
  "griffith": FALLBACK_FIGURE,
  "femto": FALLBACK_FIGURE,
  "jebe": JEBE_ART,
  "hassan": HASSAN_ART,
  "kaladin": KALADIN_ART,
  "papyrus": PAPYRUS_ART,
  "mettaton": FALLBACK_FIGURE,
  "loki": LOKI_ART,
  "riverPerson": RIVER_PERSON_ART,
  "odin": FALLBACK_FIGURE,
  _missing: FALLBACK_FIGURE,
};

export const TOKENS: Record<string, string> = {
  "grand-kaiser": GRAND_KAISER_TOKEN,
  "vladTepes": VLAD_TEPES_TOKEN,
  "genghisKhan": GENGHIS_KHAN_TOKEN,
  "elCidCompeador": EL_CID_COMPEADOR_TOKEN,
  "lechy": LECHY_TOKEN,
  "chikatilo": CHIKATILO_TOKEN,
  "falseTrailToken": CHIKATILO_TOKEN,
  "grozny": GROZNY_TOKEN,
  "frisk": FRISK_TOKEN,
  "asgore": ASGORE_TOKEN,
  "guts": FALLBACK_TOKEN,
  "griffith": GRIFFITH_TOKEN,
  "femto": FEMTO_TOKEN,
  "jebe": JEBE_TOKEN,
  "hassan": HASSAN_TOKEN,
  "kaladin": KALADIN_TOKEN,
  "papyrus": PAPYRUS_TOKEN,
  "mettaton": METTATON_TOKEN,
  "loki": LOKI_TOKEN,
  "riverPerson": RIVER_PERSON_TOKEN,
  "odin": ODIN_TOKEN,
  _missing: FALLBACK_TOKEN,
};

export function getFigureArtSrc(figureId: string): string {
  return FIGURE_ARTS[figureId] ?? FALLBACK_FIGURE;
}

export function getTokenSrc(figureId: string): string {
  return TOKENS[figureId] ?? FALLBACK_TOKEN;
}
