import { useEffect, useRef } from "react";
import type { HeroMeta } from "rules";
import type { HeroDefinition } from "./types";
import { getFigureArtSrc, getHeroVisualVariants, getTokenSrc } from "../assets/registry";
import { FigureSetAbilityCard } from "../components/abilities/FigureSetAbilityCard";
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
  const src = token ? getTokenSrc(heroId) : getFigureArtSrc(heroId);
  const missing = src === (token ? getTokenSrc("_missing") : getFigureArtSrc("_missing"));
  return (
    <span className={`figure-portrait ${token ? "figure-portrait-token" : ""}`} aria-hidden="true">
      <img src={src} alt="" loading="lazy" />
      {missing && <span className="figure-portrait-fallback">{label.charAt(0).toUpperCase()}</span>}
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
      <div className="figure-details-scroll" ref={scrollRef}>
        <div className="figure-detail-art">
          <HeroPortrait heroId={hero.id} label={label} />
        </div>
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
              <p className="text-sm leading-6 text-muted">
                {metadata.description === "Base unit."
                  ? t("figureSet.baseDescription")
                  : metadata.description}
              </p>
            )}
            <section aria-label={t("figureSet.stats")}>
              <h4 className="section-kicker">{t("figureSet.stats")}</h4>
              <div className="figure-stats">
                <span>
                  {t("game.hp", { hp: metadata.baseStats.hp })}
                  {metadata.id === LECHY_ID ? ` (${t("figureSet.giantBonus")})` : ""}
                </span>
                <span>{t("figureSet.damage", { value: metadata.baseStats.damage })}</span>
                <span>
                  {t("figureSet.movement", {
                    value: getClassLabel(metadata.baseStats.moveType, t),
                  })}
                </span>
                <span>
                  {t("figureSet.attack", {
                    value: getStatLabel(metadata.baseStats.attackRange, t),
                  })}
                </span>
              </div>
            </section>
            {variants.length > 0 && (
              <section>
                <h4 className="section-kicker">{t("figureSet.availableForms")}</h4>
                <div className="figure-forms">
                  {variants.map((variant) => (
                    <div key={variant.id}>
                      <img src={variant.token} alt="" loading="lazy" />
                      <span>{t(variant.labelKey)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <section aria-label={t("game.abilities")}>
              <h4 className="section-kicker">{t("game.abilities")}</h4>
              {metadata.abilities.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t("figureSet.noAbilities")}</p>
              ) : (
                <div className="figure-abilities">
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
