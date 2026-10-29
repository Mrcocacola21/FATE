import type { HTMLAttributes, ReactNode } from "react";
import {
  AbilityRuneGlyph,
  ActionRuneGlyph,
  hasAbilityRune,
  type ActionRuneId,
} from "./abilityRunes";

/**
 * "Grimoire" building blocks shared by the battle Figure tab, the Figure Set
 * and the Draft hero details: arched portrait head, pips, and the rune-marked ability row.
 * Styles live in visual-theme.css ("Figure tab, grimoire variant").
 */

export const GRIMOIRE_ABILITY_RUNES: Record<string, string> = {
  passive: "◆",
  active: "✦",
  impulse: "ϟ",
  phantasm: "✶",
};

export function grimoireRune(kind: string): string {
  return GRIMOIRE_ABILITY_RUNES[kind] ?? "✦";
}

/**
 * The diamond rune: the ability's own glyph when it has one, else the rune of its type.
 * The diamond takes its colour from --rune, which the row or button sets per ability type.
 */
export function GrimoireRune({
  kind,
  abilityId,
  action,
  className,
}: {
  kind?: string;
  abilityId?: string;
  action?: ActionRuneId;
  className?: string;
}) {
  const glyph = action ? (
    <ActionRuneGlyph action={action} />
  ) : abilityId && hasAbilityRune(abilityId) ? (
    <AbilityRuneGlyph abilityId={abilityId} />
  ) : (
    grimoireRune(kind ?? "active")
  );
  return (
    <span
      className={className ? `grimoire-ability__rune ${className}` : "grimoire-ability__rune"}
      data-rune-glyph={action ?? (abilityId && hasAbilityRune(abilityId) ? abilityId : undefined)}
      aria-hidden="true"
    >
      <span>{glyph}</span>
    </span>
  );
}

/** Small row of filled/empty pips; long tracks fall back to a number so the row never wraps. */
export function GrimoirePips({
  current,
  max,
  tone,
}: {
  current: number;
  max: number;
  tone: "hp" | "charge";
}) {
  if (max <= 0 || max > 12) return null;
  return (
    <span
      className={
        tone === "hp" ? "grimoire-pips grimoire-pips--hp" : "grimoire-pips grimoire-pips--charge"
      }
      aria-hidden="true"
    >
      {Array.from({ length: max }, (_, index) => (
        <span key={index} data-filled={index < current ? "true" : undefined} />
      ))}
    </span>
  );
}

/**
 * Arched gold portrait with the small-caps kicker, the serif name and an optional HP line.
 * "stacked" puts a wide portrait above the text (detail panes); the default sits it beside.
 */
export function GrimoireHead({
  portraitSrc,
  portrait,
  owner,
  kicker,
  name,
  hp,
  hpLabel,
  layout = "inline",
  children,
}: {
  portraitSrc?: string;
  /** Replaces the plain image, e.g. a portrait with a missing-art fallback. */
  portrait?: ReactNode;
  owner?: string | null;
  kicker: ReactNode;
  name: ReactNode;
  hp?: { current: number; max: number };
  hpLabel?: ReactNode;
  layout?: "inline" | "stacked";
  children?: ReactNode;
}) {
  return (
    <div
      className={layout === "stacked" ? "grimoire-head grimoire-head--stacked" : "grimoire-head"}
    >
      <div className="grimoire-portrait" data-owner={owner ?? undefined}>
        {portrait ?? <img src={portraitSrc} alt="" loading="lazy" />}
      </div>
      <div className="grimoire-head__body">
        <span className="grimoire-kicker">{kicker}</span>
        <strong className="grimoire-name">{name}</strong>
        {hp ? (
          <span className="grimoire-hp">
            <GrimoirePips current={hp.current} max={hp.max} tone="hp" />
            <span>{hpLabel}</span>
          </span>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** One ruled ability line: the ability's diamond rune coloured by type, the serif name and its type label. */
export function GrimoireAbilityRow({
  kind,
  abilityId,
  name,
  kindLabel,
  muted = false,
  children,
  ...rest
}: {
  kind: string;
  /** Draws the ability's own rune; without it the row shows the rune of its type. */
  abilityId?: string;
  name: ReactNode;
  kindLabel: ReactNode;
  muted?: boolean;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  return (
    <div
      {...rest}
      className={rest.className ? `grimoire-ability ${rest.className}` : "grimoire-ability"}
      data-ability-kind={kind}
      data-muted={muted ? "true" : undefined}
    >
      <GrimoireRune kind={kind} abilityId={abilityId} />
      <div className="min-w-0">
        <div className="grimoire-ability__head">
          <strong>{name}</strong>
          <span className="grimoire-ability__kind">{kindLabel}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
