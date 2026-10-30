import type { FC } from "react";
import type { HeroMeta, PlayerView, UnitClass, UnitState } from "rules";
import { getUnitTokenAsset } from "../../../../assets/registry";
import { FigureSetAbilityCard } from "../../../../components/abilities/FigureSetAbilityCard";
import { GrimoireHead } from "../../../../components/grimoire";
import { HpBar } from "../../../../components/HpBar";
import { useSharedHeroes } from "../../../../figures/useHeroes";
import { useI18n } from "../../../../i18n";
import { getCellLabel, getClassLabel } from "../../../../i18n/displayMetadata";
import {
  FALSE_TRAIL_TOKEN_ID,
  GRAND_KAISER_ID,
  KAISER_BUNKER_ID,
  METTATON_ID,
  getMaxHp,
} from "../../../../rulesHints";
import { FalseTrailRules, UnitEffectPanels, UnitEffectPills } from "./BattleUnitSummary";

interface InspectedUnitCardProps {
  unit: UnitState;
  heroName: string | null;
  view: PlayerView;
  isSpectator: boolean;
  metadata?: HeroMeta;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * Read-only card of a figure the viewer does not control. The abilities come from the public
 * hero metadata, because the projection sends ability views only to the figure's owner.
 * HP is the same stepped bar as on the board; exact HP and charges never reach this client.
 */
export const InspectedUnitCard: FC<InspectedUnitCardProps> = ({
  unit,
  heroName,
  view,
  isSpectator,
  metadata,
  loading,
  failed,
  onRetry,
  onClose,
}) => {
  const { t } = useI18n();
  const maxHp = getMaxHp(unit.class as UnitClass, unit.heroId, unit.transformed);
  const transformedKaiser = unit.heroId === GRAND_KAISER_ID && unit.transformed === true;
  const classLabel = transformedKaiser
    ? `${getClassLabel("rider", t)} + ${getClassLabel("berserker", t)}`
    : getClassLabel(unit.class, t);
  const abilities = (metadata?.abilities ?? []).filter(
    (ability) => !(transformedKaiser && ability.id === KAISER_BUNKER_ID),
  );

  return (
    <div
      className="unit-grimoire mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-200"
      data-testid="inspected-unit-card"
      data-unit-id={unit.id}
    >
      <div className="inspect-banner" data-testid="inspect-banner">
        <span>{t(isSpectator ? "game.inspectSpectatorLabel" : "game.inspectEnemyLabel")}</span>
        <button
          type="button"
          className="inspect-banner__close"
          data-testid="inspect-close"
          onClick={onClose}
        >
          {t("game.inspectClose")}
        </button>
      </div>

      <GrimoireHead
        portraitSrc={getUnitTokenAsset(unit).src}
        owner={unit.owner}
        kicker={`${classLabel} · ${unit.owner}`}
        name={heroName}
      >
        <div className="grimoire-hp" data-testid="inspect-hp">
          <HpBar current={unit.hp} max={maxHp} showText={false} band={unit.hpBand} className="w-24" />
          <span>{t("game.inspectMaxHp", { value: maxHp })}</span>
        </div>
      </GrimoireHead>

      <div className="grimoire-effects">
        <span className="status-pill border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-200">
          {t("game.damage", { value: unit.attack })}
        </span>
        {unit.position ? (
          <span className="status-pill border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {t("game.position", { position: getCellLabel(unit.position) })}
          </span>
        ) : null}
        <UnitEffectPills
          unit={unit}
          mettatonRating={
            unit.heroId === METTATON_ID ? Math.max(0, unit.mettatonRating ?? 0) : null
          }
        />
      </div>
      <UnitEffectPanels unit={unit} view={view} />

      <div className="grimoire-section">
        <div className="grimoire-section__title">{t("game.abilities")}</div>
        {unit.heroId === FALSE_TRAIL_TOKEN_ID ? (
          <FalseTrailRules />
        ) : loading ? (
          <div role="status" className="mt-2">
            <div className="figure-skeleton" />
            <div className="figure-skeleton" />
          </div>
        ) : failed ? (
          <div role="alert" className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            <p>{t("figureSet.loadError")}</p>
            <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={onRetry}>
              {t("figureSet.retry")}
            </button>
          </div>
        ) : abilities.length === 0 ? (
          <div className="mt-2 text-sm text-slate-400 dark:text-slate-400">
            {t("game.noAbilities")}
          </div>
        ) : (
          <div className="grimoire-abilities">
            {abilities.map((ability) => (
              <FigureSetAbilityCard key={ability.id} ability={ability} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/** Loads the public hero list for the card; only a viewer who opens an enemy pays for it. */
export const InspectedUnitPanel: FC<
  Pick<InspectedUnitCardProps, "unit" | "heroName" | "view" | "isSpectator" | "onClose">
> = (props) => {
  const { heroes, loading, error, retry } = useSharedHeroes();
  const { unit } = props;
  const heroId = unit.heroId ?? unit.figureId ?? `base-${unit.class}`;
  return (
    <InspectedUnitCard
      {...props}
      metadata={heroes.find((hero) => hero.id === heroId)}
      loading={loading}
      failed={!!error}
      onRetry={retry}
    />
  );
};
