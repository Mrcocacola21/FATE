import type { UnitState } from "rules";
import {
  FALLBACK_FIGURE,
  FALLBACK_TOKEN,
  VARIANT_FIGURE_ARTS,
  VARIANT_TOKENS,
  getFigureArtSrc,
  getTokenSrc,
} from "../catalog/tokens";

export type UnitVisualVariant = keyof typeof VARIANT_TOKENS;

export interface UnitVisualAsset {
  id: string;
  src: string;
  variant: UnitVisualVariant | null;
  isFallback: boolean;
}

export interface HeroVisualVariantPreview {
  id: UnitVisualVariant;
  labelKey: string;
  token: string;
  figure: string | null;
}

const HERO_VARIANTS: Record<string, UnitVisualVariant[]> = {
  "grand-kaiser": ["engineering-miracle"],
  frisk: ["frisk-genocide"],
  griffith: ["femto"],
  guts: ["guts-berserk"],
  mettaton: ["mettaton-ex", "mettaton-neo"],
  papyrus: ["papyrus-unbeliever"],
  sans: ["sans-unbeliever"],
  undyne: ["undyne-undying"],
};

const VARIANT_LABEL_KEYS: Record<UnitVisualVariant, string> = {
  "engineering-miracle": "visuals.forms.engineeringMiracle",
  "frisk-genocide": "visuals.forms.friskGenocide",
  "guts-berserk": "visuals.forms.gutsBerserk",
  "mettaton-ex": "visuals.forms.mettatonEx",
  "mettaton-neo": "visuals.forms.mettatonNeo",
  "papyrus-unbeliever": "visuals.forms.papyrusUnbeliever",
  "sans-unbeliever": "visuals.forms.sansUnbeliever",
  "undyne-undying": "visuals.forms.undyneUndying",
  femto: "visuals.forms.femto",
};

function getBaseAssetId(unit: UnitState | null | undefined): string {
  return unit?.figureId ?? unit?.heroId ?? unit?.class ?? "_missing";
}

export function getUnitVisualVariant(unit: UnitState | null | undefined): UnitVisualVariant | null {
  if (!unit) return null;
  if (unit.heroId === "femto") return "femto";
  if (unit.heroId === "grand-kaiser" && unit.transformed) return "engineering-miracle";
  if (unit.heroId === "guts" && unit.gutsBerserkModeActive) return "guts-berserk";
  if (unit.heroId === "mettaton" && unit.mettatonNeoUnlocked) return "mettaton-neo";
  if (unit.heroId === "mettaton" && unit.mettatonExUnlocked) return "mettaton-ex";
  if (unit.heroId === "papyrus" && unit.papyrusUnbelieverActive) {
    return "papyrus-unbeliever";
  }
  if (unit.heroId === "sans" && unit.sansUnbelieverUnlocked) return "sans-unbeliever";
  if (unit.heroId === "undyne" && unit.undyneImmortalActive) return "undyne-undying";
  if (unit.heroId === "frisk" && unit.friskPacifismDisabled) return "frisk-genocide";
  return null;
}

export function getUnitTokenAsset(unit: UnitState | null | undefined): UnitVisualAsset {
  const variant = getUnitVisualVariant(unit);
  if (variant) {
    return {
      id: variant,
      src: VARIANT_TOKENS[variant],
      variant,
      isFallback: false,
    };
  }

  const id = getBaseAssetId(unit);
  const src = getTokenSrc(id);
  return { id, src, variant: null, isFallback: src === FALLBACK_TOKEN };
}

export function getUnitFigureAsset(unit: UnitState | null | undefined): UnitVisualAsset {
  const variant = getUnitVisualVariant(unit);
  const variantFigure =
    variant && variant in VARIANT_FIGURE_ARTS
      ? VARIANT_FIGURE_ARTS[variant as keyof typeof VARIANT_FIGURE_ARTS]
      : null;
  if (variant && variantFigure) {
    return {
      id: variant,
      src: variantFigure,
      variant,
      isFallback: false,
    };
  }

  const id = getBaseAssetId(unit);
  const src = getFigureArtSrc(id);
  return { id, src, variant, isFallback: src === FALLBACK_FIGURE };
}

export function getUnitVisualSignature(unit: UnitState | null | undefined): string {
  const asset = getUnitTokenAsset(unit);
  return `${getBaseAssetId(unit)}:${asset.id}`;
}

export function getUnitVisualVariantLabelKey(variant: UnitVisualVariant | null): string | null {
  return variant ? VARIANT_LABEL_KEYS[variant] : null;
}

export function getHeroVisualVariants(heroId: string): HeroVisualVariantPreview[] {
  return (HERO_VARIANTS[heroId] ?? []).map((id) => ({
    id,
    labelKey: VARIANT_LABEL_KEYS[id],
    token: VARIANT_TOKENS[id],
    figure:
      id in VARIANT_FIGURE_ARTS
        ? VARIANT_FIGURE_ARTS[id as keyof typeof VARIANT_FIGURE_ARTS]
        : null,
  }));
}
