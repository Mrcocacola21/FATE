import type { BaseClass, HeroCatalog } from "../figures/types";

export const HERO_CATALOG: HeroCatalog = [
  { id: "base-assassin", name: "Base Assassin", mainClass: "assassin" },
  { id: "chikatilo", name: "Andrei Chikatilo", mainClass: "assassin" },
  { id: "hassan", name: "Hassan-i Sabbah", mainClass: "assassin" },
  { id: "frisk", name: "Frisk", mainClass: "assassin" },
  { id: "base-archer", name: "Base Archer", mainClass: "archer" },
  { id: "grand-kaiser", name: "Grand Kaiser", mainClass: "archer" },
  { id: "jebe", name: "Jebe", mainClass: "archer" },
  { id: "base-berserker", name: "Base Berserker", mainClass: "berserker" },
  { id: "grozny", name: "Ivan Grozny", mainClass: "berserker" },
  { id: "guts", name: "Guts", mainClass: "berserker" },
  { id: "base-rider", name: "Base Rider", mainClass: "rider" },
  { id: "odin", name: "Odin", mainClass: "rider" },
  { id: "riverPerson", name: "River Person", mainClass: "rider" },
  { id: "base-spearman", name: "Base Spearman", mainClass: "spearman" },
  { id: "vladTepes", name: "Vlad III Tepes", mainClass: "spearman" },
  { id: "kaladin", name: "Kaladin Stormblessed", mainClass: "spearman" },
  { id: "base-trickster", name: "Base Trickster", mainClass: "trickster" },
  { id: "lechy", name: "Lechy", mainClass: "trickster" },
  { id: "loki", name: "Loki", mainClass: "trickster" },
  { id: "base-knight", name: "Base Knight", mainClass: "knight" },
  { id: "elCidCompeador", name: "El Cid Compeador", mainClass: "knight" },
  { id: "griffith", name: "Griffith", mainClass: "knight" },
  { id: "asgore", name: "Asgore Dreemurr", mainClass: "knight" },
  { id: "genghisKhan", name: "Genghis Khan", mainClass: "rider" },
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
