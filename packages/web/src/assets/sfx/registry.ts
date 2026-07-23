import type * as Rules from "rules";

type RulesHeroId =
  | typeof Rules.HERO_ARTEMIDA_ID
  | typeof Rules.HERO_ASGORE_ID
  | typeof Rules.HERO_CHIKATILO_ID
  | typeof Rules.HERO_DON_KIHOTE_ID
  | typeof Rules.HERO_DUOLINGO_ID
  | typeof Rules.HERO_EL_CID_COMPEADOR_ID
  | typeof Rules.HERO_FEMTO_ID
  | typeof Rules.HERO_FRISK_ID
  | typeof Rules.HERO_GENGHIS_KHAN_ID
  | typeof Rules.HERO_GRAND_KAISER_ID
  | typeof Rules.HERO_GRIFFITH_ID
  | typeof Rules.HERO_GROZNY_ID
  | typeof Rules.HERO_GUTS_ID
  | typeof Rules.HERO_HASSAN_ID
  | typeof Rules.HERO_JACK_RIPPER_ID
  | typeof Rules.HERO_JEBE_ID
  | typeof Rules.HERO_KALADIN_ID
  | typeof Rules.HERO_KANEKI_ID
  | typeof Rules.HERO_LECHY_ID
  | typeof Rules.HERO_LOKI_ID
  | typeof Rules.HERO_LUCHE_ID
  | typeof Rules.HERO_METTATON_ID
  | typeof Rules.HERO_ODIN_ID
  | typeof Rules.HERO_PAPYRUS_ID
  | typeof Rules.HERO_RIVER_PERSON_ID
  | typeof Rules.HERO_SANS_ID
  | typeof Rules.HERO_UNDYNE_ID
  | typeof Rules.HERO_VLAD_TEPES_ID
  | typeof Rules.HERO_ZORO_ID;

/**
 * Hero IDs that may own SFX. Values come from the rules package so paths and
 * registry keys cannot silently drift from gameplay IDs.
 */
export const HERO_SFX_IDS = [
  "grand-kaiser",
  "vladTepes",
  "elCidCompeador",
  "genghisKhan",
  "hassan",
  "loki",
  "chikatilo",
  "papyrus",
  "sans",
  "jackRipper",
  "luche",
  "kaneki",
  "zoro",
  "duolingo",
  "donKihote",
  "artemida",
  "guts",
  "griffith",
  "kaladin",
  "odin",
  "frisk",
  "asgore",
  "riverPerson",
  "jebe",
  "grozny",
  "lechy",
  "femto",
  "undyne",
  "mettaton",
] as const satisfies readonly RulesHeroId[];

export type HeroId = (typeof HERO_SFX_IDS)[number];
export type BasicSfxKey = "attack" | "hit" | "death" | "move";
export type HeroSfxCategory = "basic" | "abilities" | "phantasms" | "transformations" | "statuses";
export type CommonSfxCategory = "ui" | "combat" | "movement" | "status";

export type SfxKey =
  | `common.${CommonSfxCategory}.${string}`
  | `hero.${HeroId}.${HeroSfxCategory}.${string}`;

export type HeroSfxMap = {
  basic?: Partial<Record<BasicSfxKey, string>>;
  abilities?: Record<string, string>;
  phantasms?: Record<string, string>;
  transformations?: Record<string, string>;
  statuses?: Record<string, string>;
};

export type HeroSfxRegistry = Partial<Record<HeroId, HeroSfxMap>>;
export type CommonSfxRegistry = Partial<Record<CommonSfxCategory, Record<string, string>>>;

/**
 * Add explicit Vite imports above and register only files that exist.
 *
 * Example:
 * import lokiLaughSfx from "./heroes/loki/phantasms/lokiLaught.mp3";
 * export const heroSfx = {
 *   loki: { phantasms: { lokiLaught: lokiLaughSfx } },
 * } satisfies HeroSfxRegistry;
 */
export const heroSfx: HeroSfxRegistry = {};

/**
 * Common fallbacks use the same explicit-import strategy as hero sounds.
 * Generic event fallbacks are named attack, hit, death, move, ability,
 * phantasm, transform, and applied.
 */
export const commonSfx: CommonSfxRegistry = {};

const heroIdSet: ReadonlySet<string> = new Set(HERO_SFX_IDS);

export function isHeroId(value: string | undefined): value is HeroId {
  return typeof value === "string" && heroIdSet.has(value);
}
