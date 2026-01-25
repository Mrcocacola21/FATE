import { HERO_CATALOG, BASE_HERO_IDS } from "./catalog";
import { BASE_CLASSES } from "./types";
import { loadFigureSetState } from "./storage";
import type { HeroDefinition } from "./types";

export function getSelectedHeroes(): HeroDefinition[] {
  const state = loadFigureSetState(HERO_CATALOG);
  const byId = new Map(HERO_CATALOG.map((hero) => [hero.id, hero]));

  return BASE_CLASSES.map((slot) => {
    const heroId = state.selection[slot] ?? BASE_HERO_IDS[slot];
    return byId.get(heroId) ?? byId.get(BASE_HERO_IDS[slot]);
  }).filter((hero): hero is HeroDefinition => !!hero);
}
