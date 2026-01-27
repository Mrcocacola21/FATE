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
  /*
  AFTER REALISATION UNCOMMENT;
  { id: "base-knight", name: "Base Knight", mainClass: "knight" },
  { id: "chikatilo", name: "Andrei Chikatilo", mainClass: "assassin" },
  { id: "grozny", name: "Ivan Grozny", mainClass: "berserker" },
  { id: "elCidCompeador", name: "El Cid Compeador", mainClass: "knight" },
  { id: "lechy", name: "Lechy", mainClass: "trickster" },
  { id: "genghisKhan", name: "Genghis Khan", mainClass: "rider" },
  */
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
