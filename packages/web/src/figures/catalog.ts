import type { BaseClass, HeroCatalog } from "./types";

export const HERO_CATALOG: HeroCatalog = [
  { id: "base-assassin", name: "Base Assassin", mainClass: "assassin" },
  { id: "base-archer", name: "Base Archer", mainClass: "archer" },
  { id: "grand-kaiser", name: "Grand Kaiser", mainClass: "archer" },
  { id: "base-berserker", name: "Base Berserker", mainClass: "berserker" },
  { id: "base-rider", name: "Base Rider", mainClass: "rider" },
  { id: "base-spearman", name: "Base Spearman", mainClass: "spearman" },
  { id: "vladTepes", name: "Vlad III Tepes", mainClass: "spearman" },
  { id: "base-trickster", name: "Base Trickster", mainClass: "trickster" },
  { id: "base-knight", name: "Base Knight", mainClass: "knight" },
];

export const BASE_HERO_IDS: Record<BaseClass, string> = {
  assassin: "base-assassin",
  archer: "base-archer",
  berserker: "base-berserker",
  rider: "base-rider",
  spearman: "base-spearman",
  trickster: "base-trickster",
  knight: "base-knight",
};
