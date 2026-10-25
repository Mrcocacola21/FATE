import { useEffect, useRef } from "react";
import type { HeroMeta } from "rules";
import type { HeroDefinition } from "./types";
import { getFigureArtSrc, getHeroVisualVariants, getTokenSrc } from "../assets/registry";
import { FigureSetAbilityCard } from "../components/abilities/FigureSetAbilityCard";
import { GrimoireHead } from "../components/grimoire";
import { useI18n } from "../i18n";
import { getClassLabel, getHeroDisplayName, getStatLabel } from "../i18n/displayMetadata";
import { LECHY_ID } from "../rulesHints";

export function HeroPortrait({
  heroId,
  label,
  token = false,
}: {
  heroId: string;
  label: string;
  token?: boolean;
}) {
  const { language } = useI18n();
  const src = token ? getTokenSrc(heroId) : getFigureArtSrc(heroId);
  const missing = src === (token ? getTokenSrc("_missing") : getFigureArtSrc("_missing"));
  return (
    <span className={`figure-portrait ${token ? "figure-portrait-token" : ""}`} aria-hidden="true">
      <img src={src} alt="" loading="lazy" />
      {missing && (
        <span className="figure-portrait-fallback">
          {label.charAt(0).toLocaleUpperCase(language)}
        </span>
      )}
    </span>
  );
}

export function HeroDetails({
  hero,
  metadata,
  loading,
  failed,
  selected,
  canReset,
  onRetry,
  onSelect,
  onReset,
}: {
  hero: HeroDefinition;
  metadata?: HeroMeta;
  loading: boolean;
  failed: boolean;
  selected: boolean;
  canReset: boolean;
  onRetry: () => void;
  onSelect: () => void;
  onReset: () => void;
}) {
  const { language, t } = useI18n();
  const label = getHeroDisplayName(hero.id, hero.name, language);
  const variants = getHeroVisualVariants(hero.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [hero.id]);
  return (
    <div
      className="figure-details"
      data-testid="hero-details"
      data-hero-id={hero.id}
      role="group"
      aria-label={label}
    >
      <div className="figure-details-scroll unit-grimoire grimoire-sheet" ref={scrollRef}>
        <GrimoireHead
          layout="stacked"
          portrait={<HeroPortrait heroId={hero.id} label={label} />}
          kicker={getClassLabel(hero.mainClass, t)}
          name={label}
          hp={metadata ? { current: metadata.baseStats.hp, max: metadata.baseStats.hp } : undefined}
          hpLabel={
            metadata
              ? `${metadata.baseStats.hp} ${t("game.healthShort")}${
                  metadata.id === LECHY_ID ? ` (${t("figureSet.giantBonus")})` : ""
                }`
              : undefined
          }
        />
        {loading ? (
          <div role="status" className="figure-details-loading">
            <p>{t("figureSet.loadingHeroes")}</p>
            <div className="figure-skeleton" />
            <div className="figure-skeleton" />
          </div>
        ) : failed ? (
          <div role="alert" className="figure-details-error">
            <p>{t("figureSet.loadError")}</p>
            <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={onRetry}>
              {t("figureSet.retry")}
            </button>
          </div>
        ) : metadata ? (
          <>
            {metadata.description && (
              <p className="grimoire-lore">
                {metadata.description === "Base unit."
                  ? t("figureSet.baseDescription")
                  : metadata.description}
              </p>
            )}
            <section className="grimoire-section" aria-label={t("figureSet.stats")}>
              <h4 className="grimoire-section__title">{t("figureSet.stats")}</h4>
              <div className="grimoire-effects">
                <span className="status-pill border-rose-200 text-rose-700">
                  {t("figureSet.damage", { value: metadata.baseStats.damage })}
                </span>
                <span className="status-pill border-slate-200 text-slate-700">
                  {t("figureSet.movement", {
                    value: getClassLabel(metadata.baseStats.moveType, t),
                  })}
                </span>
                <span className="status-pill border-slate-200 text-slate-700">
                  {t("figureSet.attack", {
                    value: getStatLabel(metadata.baseStats.attackRange, t),
                  })}
                </span>
              </div>
            </section>
            {variants.length > 0 && (
              <section className="grimoire-section">
                <h4 className="grimoire-section__title">{t("figureSet.availableForms")}</h4>
                <div className="grimoire-forms">
                  {variants.map((variant) => (
                    <div key={variant.id}>
                      <img src={variant.token} alt="" loading="lazy" />
                      <span>{t(variant.labelKey)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <section className="grimoire-section" aria-label={t("game.abilities")}>
              <h4 className="grimoire-section__title">{t("game.abilities")}</h4>
              {metadata.abilities.length === 0 ? (
                <p className="grimoire-ability__text">{t("figureSet.noAbilities")}</p>
              ) : (
                <div className="grimoire-abilities">
                  {metadata.abilities.map((ability) => (
                    <FigureSetAbilityCard key={ability.id} ability={ability} />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <p className="text-sm text-muted">{t("figureSet.unavailableDetails")}</p>
        )}
      </div>
      <footer className="figure-details-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={selected}
          data-testid="select-hero"
          onClick={onSelect}
        >
          {selected ? (
            <>
              <span aria-hidden="true">✓ </span>
              {t("common.selected")}
            </>
          ) : (
            t("figureSet.selectFor", { class: getClassLabel(hero.mainClass, t) })
          )}
        </button>
        {canReset && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="reset-slot"
            onClick={onReset}
            title={t("figureSet.resetSlot", { class: getClassLabel(hero.mainClass, t) })}
          >
            {t("figureSet.resetBase")}
          </button>
        )}
      </footer>
    </div>
  );
}
