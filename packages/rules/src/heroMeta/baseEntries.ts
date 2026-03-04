import type { UnitClass } from "../model";
import type { HeroMeta } from "./types";
import { buildBaseStats } from "./helpers";

const BASE_HERO_IDS: Record<UnitClass, string> = {
  assassin: "base-assassin",
  archer: "base-archer",
  berserker: "base-berserker",
  rider: "base-rider",
  spearman: "base-spearman",
  trickster: "base-trickster",
  knight: "base-knight",
};

export function buildBaseHeroEntries(): HeroMeta[] {
  return ([
    "assassin",
    "archer",
    "berserker",
    "rider",
    "spearman",
    "trickster",
    "knight",
  ] as UnitClass[]).map((unitClass) => ({
    id: BASE_HERO_IDS[unitClass],
    name: `Base ${unitClass.charAt(0).toUpperCase()}${unitClass.slice(1)}`,
    mainClass: unitClass,
    baseStats: buildBaseStats(unitClass),
    abilities: [],
    description: "Base unit.",
  }));
}
