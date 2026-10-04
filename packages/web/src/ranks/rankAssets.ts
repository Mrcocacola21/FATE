import type { TranslationKey } from "../i18n";

export type RankTier =
  | "SHADOW"
  | "CRESCENT"
  | "HALF"
  | "FULL"
  | "ECLIPSE"
  | "BLACK_MOON"
  | "NOVA"
  | "DESTINY";

export interface RankPresentation {
  id: RankTier;
  slug: string;
  labelKey: TranslationKey;
  asset: string;
}

/** Approved artwork only. Rank assignment belongs to the competitive domain. */
export const RANK_ASSETS = {
  SHADOW: {
    id: "SHADOW",
    slug: "shadow",
    labelKey: "ranks.shadow",
    asset: new URL("../assets/ranks/shadow.png", import.meta.url).href,
  },
  CRESCENT: {
    id: "CRESCENT",
    slug: "crescent",
    labelKey: "ranks.crescent",
    asset: new URL("../assets/ranks/crescent.png", import.meta.url).href,
  },
  HALF: {
    id: "HALF",
    slug: "half",
    labelKey: "ranks.half",
    asset: new URL("../assets/ranks/half.png", import.meta.url).href,
  },
  FULL: {
    id: "FULL",
    slug: "full",
    labelKey: "ranks.full",
    asset: new URL("../assets/ranks/full.png", import.meta.url).href,
  },
  ECLIPSE: {
    id: "ECLIPSE",
    slug: "eclipse",
    labelKey: "ranks.eclipse",
    asset: new URL("../assets/ranks/eclipse.png", import.meta.url).href,
  },
  BLACK_MOON: {
    id: "BLACK_MOON",
    slug: "black-moon",
    labelKey: "ranks.blackMoon",
    asset: new URL("../assets/ranks/blackmoon.png", import.meta.url).href,
  },
  NOVA: {
    id: "NOVA",
    slug: "nova",
    labelKey: "ranks.nova",
    asset: new URL("../assets/ranks/nova.png", import.meta.url).href,
  },
  DESTINY: {
    id: "DESTINY",
    slug: "destiny",
    labelKey: "ranks.destiny",
    asset: new URL("../assets/ranks/destiny.png", import.meta.url).href,
  },
} as const satisfies Record<RankTier, RankPresentation>;

/** Unknown/future values must never resolve to a different player's medal. */
export function getRankPresentation(rank: unknown): RankPresentation | null {
  return typeof rank === "string" && Object.prototype.hasOwnProperty.call(RANK_ASSETS, rank)
    ? RANK_ASSETS[rank as RankTier]
    : null;
}
