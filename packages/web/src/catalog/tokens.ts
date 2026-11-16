export const FALLBACK_FIGURE = new URL("../assets/figures/_missing.webp", import.meta.url).href;
export const FALLBACK_TOKEN = new URL("../assets/tokens/_missing.webp", import.meta.url).href;

export const FIGURE_ARTS: Record<string, string> = {
  "grand-kaiser": new URL("../assets/figures/grand-kaiser.webp", import.meta.url).href,
  vladTepes: new URL("../assets/figures/vladTepes.webp", import.meta.url).href,
  genghisKhan: new URL("../assets/figures/genghisKhan.webp", import.meta.url).href,
  elCidCompeador: new URL("../assets/figures/elCidCompeador.webp", import.meta.url).href,
  lechy: new URL("../assets/figures/lechy.webp", import.meta.url).href,
  chikatilo: new URL("../assets/figures/chikatilo.webp", import.meta.url).href,
  falseTrailToken: new URL("../assets/figures/chikatilo.webp", import.meta.url).href,
  grozny: new URL("../assets/figures/grozny.webp", import.meta.url).href,
  frisk: new URL("../assets/figures/frisk.webp", import.meta.url).href,
  sans: new URL("../assets/figures/sans.webp", import.meta.url).href,
  asgore: new URL("../assets/figures/asgore.webp", import.meta.url).href,
  undyne: new URL("../assets/figures/undyne.webp", import.meta.url).href,
  guts: new URL("../assets/figures/guts.jpg", import.meta.url).href,
  griffith: new URL("../assets/figures/griffith.png", import.meta.url).href,
  femto: FALLBACK_FIGURE,
  jebe: new URL("../assets/figures/jebe.webp", import.meta.url).href,
  hassan: new URL("../assets/figures/hassan.webp", import.meta.url).href,
  kaladin: new URL("../assets/figures/kalladin.webp", import.meta.url).href,
  papyrus: new URL("../assets/figures/papyrus.webp", import.meta.url).href,
  mettaton: new URL("../assets/figures/mettaton.png", import.meta.url).href,
  loki: new URL("../assets/figures/loki.webp", import.meta.url).href,
  riverPerson: new URL("../assets/figures/riverPerson.webp", import.meta.url).href,
  odin: new URL("../assets/figures/odin.png", import.meta.url).href,
  duolingo: new URL("../assets/figures/duolingo.webp", import.meta.url).href,
  jackRipper: new URL("../assets/figures/jackRipper.webp", import.meta.url).href,
  kaneki: new URL("../assets/figures/kaneki.webp", import.meta.url).href,
  artemida: new URL("../assets/figures/artemida.png", import.meta.url).href,
  donKihote: new URL("../assets/figures/DonKihote.jpg", import.meta.url).href,
  luche: new URL("../assets/figures/luche.png", import.meta.url).href,
  zoro: new URL("../assets/figures/zoro.png", import.meta.url).href,
  _missing: FALLBACK_FIGURE,
};

export const TOKENS: Record<string, string> = {
  "grand-kaiser": new URL("../assets/tokens/grand-kaiser.webp", import.meta.url).href,
  vladTepes: new URL("../assets/tokens/vladTepes.webp", import.meta.url).href,
  genghisKhan: new URL("../assets/tokens/genghisKhan.webp", import.meta.url).href,
  elCidCompeador: new URL("../assets/tokens/elCidCompeador.webp", import.meta.url).href,
  lechy: new URL("../assets/tokens/lechy.webp", import.meta.url).href,
  chikatilo: new URL("../assets/tokens/chikatilo.webp", import.meta.url).href,
  falseTrailToken: new URL("../assets/tokens/chikatilo.webp", import.meta.url).href,
  grozny: new URL("../assets/tokens/grozny.webp", import.meta.url).href,
  frisk: new URL("../assets/tokens/frisk.webp", import.meta.url).href,
  sans: new URL("../assets/tokens/sans.webp", import.meta.url).href,
  asgore: new URL("../assets/tokens/asgore.webp", import.meta.url).href,
  undyne: new URL("../assets/tokens/undyne.png", import.meta.url).href,
  guts: new URL("../assets/tokens/guts.png", import.meta.url).href,
  griffith: new URL("../assets/tokens/griffith.webp", import.meta.url).href,
  femto: new URL("../assets/tokens/femto.webp", import.meta.url).href,
  jebe: new URL("../assets/tokens/jebe.webp", import.meta.url).href,
  hassan: new URL("../assets/tokens/hassan.webp", import.meta.url).href,
  kaladin: new URL("../assets/tokens/kalladin.webp", import.meta.url).href,
  papyrus: new URL("../assets/tokens/papyrus.webp", import.meta.url).href,
  mettaton: new URL("../assets/tokens/mettaton.png", import.meta.url).href,
  loki: new URL("../assets/tokens/loki.webp", import.meta.url).href,
  riverPerson: new URL("../assets/tokens/riverPerson.webp", import.meta.url).href,
  odin: new URL("../assets/tokens/odin.webp", import.meta.url).href,
  duolingo: new URL("../assets/tokens/duolingo.webp", import.meta.url).href,
  jackRipper: new URL("../assets/tokens/jackRipper.webp", import.meta.url).href,
  artemida: new URL("../assets/tokens/artemida.webp", import.meta.url).href,
  donKihote: new URL("../assets/tokens/donKihote.webp", import.meta.url).href,
  luche: new URL("../assets/tokens/luche.webp", import.meta.url).href,
  zoro: new URL("../assets/tokens/zoro.webp", import.meta.url).href,
  kaneki: new URL("../assets/tokens/kaneki.png", import.meta.url).href,
  _missing: FALLBACK_TOKEN,
};

export const VARIANT_FIGURE_ARTS = {
  chicken: new URL("../assets/tokens/chicken.png", import.meta.url).href,
  "duolingo-berserker": new URL("../assets/tokens/duolingoBerserker.png", import.meta.url).href,
  "kaneki-centipede": new URL("../assets/tokens/kanekiScolopendra.png", import.meta.url).href,
  "undyne-undying": new URL("../assets/figures/undyne_the_undying.png", import.meta.url).href,
} as const;

export const VARIANT_TOKENS = {
  chicken: new URL("../assets/tokens/chicken.png", import.meta.url).href,
  "duolingo-berserker": new URL("../assets/tokens/duolingoBerserker.png", import.meta.url).href,
  "engineering-miracle": new URL("../assets/tokens/kaiser_miracle.png", import.meta.url).href,
  "frisk-genocide": new URL("../assets/tokens/friskGenocide.png", import.meta.url).href,
  "guts-berserk": new URL("../assets/tokens/gutsBerserk.png", import.meta.url).href,
  "kaneki-centipede": new URL("../assets/tokens/kanekiScolopendra.png", import.meta.url).href,
  "mettaton-ex": new URL("../assets/tokens/mettaton_ex.webp", import.meta.url).href,
  "mettaton-neo": new URL("../assets/tokens/mettaton_neo.png", import.meta.url).href,
  "papyrus-unbeliever": new URL("../assets/tokens/unbeliever_papyrus.png", import.meta.url).href,
  "sans-unbeliever": new URL("../assets/tokens/sansBT.png", import.meta.url).href,
  "undyne-undying": new URL("../assets/tokens/undyne_the_undying.png", import.meta.url).href,
  femto: new URL("../assets/tokens/femto.webp", import.meta.url).href,
} as const;

/**
 * Ring-free portraits for grimoire arches, cut inside each round token so the framing stays
 * the same. The arch frame draws its own outline, so these carry no gold ring.
 */
export const ARCH_TOKENS: Record<string, string> = {
  "grand-kaiser": new URL("../assets/tokens/arch/grand-kaiser.webp", import.meta.url).href,
  vladTepes: new URL("../assets/tokens/arch/vladTepes.webp", import.meta.url).href,
  genghisKhan: new URL("../assets/tokens/arch/genghisKhan.webp", import.meta.url).href,
  elCidCompeador: new URL("../assets/tokens/arch/elCidCompeador.webp", import.meta.url).href,
  lechy: new URL("../assets/tokens/arch/lechy.webp", import.meta.url).href,
  chikatilo: new URL("../assets/tokens/arch/chikatilo.webp", import.meta.url).href,
  falseTrailToken: new URL("../assets/tokens/arch/chikatilo.webp", import.meta.url).href,
  grozny: new URL("../assets/tokens/arch/grozny.webp", import.meta.url).href,
  frisk: new URL("../assets/tokens/arch/frisk.webp", import.meta.url).href,
  sans: new URL("../assets/tokens/arch/sans.webp", import.meta.url).href,
  asgore: new URL("../assets/tokens/arch/asgore.webp", import.meta.url).href,
  undyne: new URL("../assets/tokens/arch/undyne.webp", import.meta.url).href,
  guts: new URL("../assets/tokens/arch/guts.webp", import.meta.url).href,
  griffith: new URL("../assets/tokens/arch/griffith.webp", import.meta.url).href,
  femto: new URL("../assets/tokens/arch/femto.webp", import.meta.url).href,
  jebe: new URL("../assets/tokens/arch/jebe.webp", import.meta.url).href,
  hassan: new URL("../assets/tokens/arch/hassan.webp", import.meta.url).href,
  kaladin: new URL("../assets/tokens/arch/kalladin.webp", import.meta.url).href,
  papyrus: new URL("../assets/tokens/arch/papyrus.webp", import.meta.url).href,
  mettaton: new URL("../assets/tokens/arch/mettaton.webp", import.meta.url).href,
  loki: new URL("../assets/tokens/arch/loki.webp", import.meta.url).href,
  riverPerson: new URL("../assets/tokens/arch/riverPerson.webp", import.meta.url).href,
  odin: new URL("../assets/tokens/arch/odin.webp", import.meta.url).href,
  duolingo: new URL("../assets/tokens/arch/duolingo.webp", import.meta.url).href,
  jackRipper: new URL("../assets/tokens/arch/jackRipper.webp", import.meta.url).href,
  artemida: new URL("../assets/tokens/arch/artemida.webp", import.meta.url).href,
  donKihote: new URL("../assets/tokens/arch/donKihote.webp", import.meta.url).href,
  luche: new URL("../assets/tokens/arch/luche.webp", import.meta.url).href,
  zoro: new URL("../assets/tokens/arch/zoro.webp", import.meta.url).href,
  kaneki: new URL("../assets/tokens/arch/kaneki.webp", import.meta.url).href,
};

export const VARIANT_ARCH_TOKENS: Record<keyof typeof VARIANT_TOKENS, string> = {
  chicken: new URL("../assets/tokens/arch/chicken.webp", import.meta.url).href,
  "duolingo-berserker": new URL("../assets/tokens/arch/duolingoBerserker.webp", import.meta.url).href,
  "engineering-miracle": new URL("../assets/tokens/arch/kaiser_miracle.webp", import.meta.url).href,
  "frisk-genocide": new URL("../assets/tokens/arch/friskGenocide.webp", import.meta.url).href,
  "guts-berserk": new URL("../assets/tokens/arch/gutsBerserk.webp", import.meta.url).href,
  "kaneki-centipede": new URL("../assets/tokens/arch/kanekiScolopendra.webp", import.meta.url).href,
  "mettaton-ex": new URL("../assets/tokens/arch/mettaton_ex.webp", import.meta.url).href,
  "mettaton-neo": new URL("../assets/tokens/arch/mettaton_neo.webp", import.meta.url).href,
  "papyrus-unbeliever": new URL("../assets/tokens/arch/unbeliever_papyrus.webp", import.meta.url).href,
  "sans-unbeliever": new URL("../assets/tokens/arch/sansBT.webp", import.meta.url).href,
  "undyne-undying": new URL("../assets/tokens/arch/undyne_the_undying.webp", import.meta.url).href,
  femto: new URL("../assets/tokens/arch/femto.webp", import.meta.url).href,
};

export function getTokenArchSrc(figureId: string): string {
  return ARCH_TOKENS[figureId] ?? FALLBACK_TOKEN;
}

export function getFigureArtSrc(figureId: string): string {
  return FIGURE_ARTS[figureId] ?? FALLBACK_FIGURE;
}

export function getTokenSrc(figureId: string): string {
  return TOKENS[figureId] ?? FALLBACK_TOKEN;
}
