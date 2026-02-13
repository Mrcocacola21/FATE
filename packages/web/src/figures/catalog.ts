import type { BaseClass, HeroCatalog } from "./types";

export const HERO_CATALOG: HeroCatalog = [
  { id: "base-assassin", name: "Base Assassin", mainClass: "assassin" },
  { id: "chikatilo", name: "Andrei Chikatilo", mainClass: "assassin" },
  { id: "base-archer", name: "Base Archer", mainClass: "archer" },
  { id: "grand-kaiser", name: "Grand Kaiser", mainClass: "archer" },
  { id: "base-berserker", name: "Base Berserker", mainClass: "berserker" },
  { id: "grozny", name: "Ivan Grozny", mainClass: "berserker" },
  { id: "base-rider", name: "Base Rider", mainClass: "rider" },
  { id: "base-spearman", name: "Base Spearman", mainClass: "spearman" },
  { id: "vladTepes", name: "Vlad III Tepes", mainClass: "spearman" },
  { id: "base-trickster", name: "Base Trickster", mainClass: "trickster" },
  { id: "lechy", name: "Lechy", mainClass: "trickster" },
  { id: "base-knight", name: "Base Knight", mainClass: "knight" },
  { id: "elCidCompeador", name: "El Cid Compeador", mainClass: "knight" },
  { id: "genghisKhan", name: "Genghis Khan", mainClass: "rider" },
  /*
  AFTER REALISATION UNCOMMENT;
  { id: "chikatilo", name: "Andrei Chikatilo", mainClass: "assassin" },
  { id: "grozny", name: "Ivan Grozny", mainClass: "berserker" },
  { id: "elCidCompeador", name: "El Cid Compeador", mainClass: "knight" },
  { id: "lechy", name: "Lechy", mainClass: "trickster" },
  { id: "genghisKhan", name: "Genghis Khan", mainClass: "rider" },
 
  { id: "duolingo", name: "Duolingo", mainClass: "trickster" },
  { id: "luche", name: "Luche", mainClass: "spearman" },
  { id: "donKigote", name: "Don Kihote", mainClass: "rider" },
  { id: "jackRipper", name: "Jack Ripper", mainClass: "assassin" },
  { id: "kaneki" , name: "Kaneki Ken", mainClass: "berserker" },
  { id: "zoro" , name: "Roronoa Zoro", mainClass: "knight" },
  { id: "artemida" , name: "Artemida", mainClass: "archer" },

  { id: "mettaton", name: "Mettaton", mainClass: "archer" },
  { id: "riverPerson", name: "River Person", mainClass: "rider" },
  { id: "papyrus", name: "Papyrus", mainClass: "spearman" },
  { id: "sans", name: "Sans", mainClass: "trickster" },
  { id: "undyne", name: "Undyne", mainClass: "berserker" },
  { id: "frisk", name: "Frisk", mainClass: "assassin" },
  { id: "asgore", name: "Asgore", mainClass: "knight" },

  { id: "odin" , name: "Odin", mainClass: "rider" },
  { id: "loki" , name: "Loki", mainClass: "trickster" },
  { id: "hassan" , name: "Hassan", mainClass: "assassin" },
  { id:"guts" , name: "Guts", mainClass: "berserker" },
  { id: "griffith" , name: "Griffith", mainClass: "knight" },
  { id: "jebe" , name: "Jebe", mainClass: "archer" },
  { id: "kaladin" , name: "Kaladin", mainClass: "spearman" },

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
