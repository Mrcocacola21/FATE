/**
 * Selection halos drawn around the grimoire arch, one per hero. Each is a 256×256 cell with the
 * figure's arch left empty, so the halo only lights the outside of the token.
 */
export const SELECTION_HALOS: Record<string, string> = {
  artemida: new URL("../../assets/selection/artemida.webp", import.meta.url).href,
  asgore: new URL("../../assets/selection/asgore.webp", import.meta.url).href,
  chikatilo: new URL("../../assets/selection/chikatilo.webp", import.meta.url).href,
  donKihote: new URL("../../assets/selection/donKihote.webp", import.meta.url).href,
  duolingo: new URL("../../assets/selection/duolingo.webp", import.meta.url).href,
  elCidCompeador: new URL("../../assets/selection/elCidCompeador.webp", import.meta.url).href,
  femto: new URL("../../assets/selection/femto.webp", import.meta.url).href,
  frisk: new URL("../../assets/selection/frisk.webp", import.meta.url).href,
  genghisKhan: new URL("../../assets/selection/genghisKhan.webp", import.meta.url).href,
  "grand-kaiser": new URL("../../assets/selection/grand-kaiser.webp", import.meta.url).href,
  griffith: new URL("../../assets/selection/griffith.webp", import.meta.url).href,
  grozny: new URL("../../assets/selection/grozny.webp", import.meta.url).href,
  guts: new URL("../../assets/selection/guts.webp", import.meta.url).href,
  hassan: new URL("../../assets/selection/hassan.webp", import.meta.url).href,
  jackRipper: new URL("../../assets/selection/jackRipper.webp", import.meta.url).href,
  jebe: new URL("../../assets/selection/jebe.webp", import.meta.url).href,
  kaladin: new URL("../../assets/selection/kaladin.webp", import.meta.url).href,
  kaneki: new URL("../../assets/selection/kaneki.webp", import.meta.url).href,
  lechy: new URL("../../assets/selection/lechy.webp", import.meta.url).href,
  loki: new URL("../../assets/selection/loki.webp", import.meta.url).href,
  luche: new URL("../../assets/selection/luche.webp", import.meta.url).href,
  mettaton: new URL("../../assets/selection/mettaton.webp", import.meta.url).href,
  odin: new URL("../../assets/selection/odin.webp", import.meta.url).href,
  papyrus: new URL("../../assets/selection/papyrus.webp", import.meta.url).href,
  riverPerson: new URL("../../assets/selection/riverPerson.webp", import.meta.url).href,
  sans: new URL("../../assets/selection/sans.webp", import.meta.url).href,
  undyne: new URL("../../assets/selection/undyne.webp", import.meta.url).href,
  vladTepes: new URL("../../assets/selection/vladTepes.webp", import.meta.url).href,
  zoro: new URL("../../assets/selection/zoro.webp", import.meta.url).href,
};

/** The halo for a selection effect id such as `expansion.<heroId>.select_ring`. */
export function getSelectionHalo(effectId: string): string | undefined {
  const heroId = /^expansion\.(.+)\.select_ring$/.exec(effectId)?.[1];
  return heroId ? SELECTION_HALOS[heroId] : undefined;
}
