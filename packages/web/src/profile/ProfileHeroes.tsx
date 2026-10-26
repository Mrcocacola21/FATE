import { getFigureArtSrc, getTokenSrc } from "../assets/registry";
import { useI18n } from "../i18n";
import { getClassLabel, getHeroDisplayName } from "../i18n/displayMetadata";
import type { SquadEntry } from "../matches/types";
import { formatWinRate } from "../statistics/presentation";
import type { PlayerStatistics } from "../statistics/types";

export const PROFILE_HERO_LIMIT = 5;

/** The heroes a player brought, as small round tokens; base figures are left out. */
export function SquadStrip({ squad }: { squad: SquadEntry[] | null }) {
  const { t, language } = useI18n();
  const heroes = squad?.filter((entry): entry is SquadEntry & { heroId: string } =>
    Boolean(entry.heroId),
  );
  if (!heroes?.length) return null;
  const names = heroes.map((entry) =>
    getHeroDisplayName(entry.heroId, getClassLabel(entry.class, t), language),
  );
  return (
    <span
      className="profile-squad"
      role="img"
      aria-label={`${t("profile.squad")}: ${names.join(", ")}`}
    >
      {heroes.map((entry, index) => (
        <img
          key={`${entry.class}-${index}`}
          src={getTokenSrc(entry.heroId)}
          alt=""
          title={names[index]}
          loading="lazy"
        />
      ))}
    </span>
  );
}

export function ProfileHeroes({
  stats,
  loading,
  failed,
}: {
  stats?: PlayerStatistics;
  loading: boolean;
  failed: boolean;
}) {
  const { t, language } = useI18n();
  const heroes = stats?.byHero.slice(0, PROFILE_HERO_LIMIT) ?? [];
  return (
    <section
      className="profile-panel profile-heroes"
      aria-labelledby="profile-heroes-title"
      aria-busy={loading}
      data-testid="profile-heroes"
    >
      <div className="profile-panel__head">
        <h2 id="profile-heroes-title" className="profile-panel__title">
          {t("profile.heroes")}
        </h2>
      </div>
      {loading ? (
        <p className="profile-panel__message" role="status">
          {t("statistics.loading")}
        </p>
      ) : failed ? (
        // The statistics panel next to this one carries the error and its retry.
        <p className="profile-panel__message">{t("statistics.unavailable")}</p>
      ) : heroes.length === 0 ? (
        <p className="profile-panel__message">{t("profile.heroesEmpty")}</p>
      ) : (
        <>
          <ol className="profile-hero-list">
            {heroes.map((hero) => {
              const name = getHeroDisplayName(hero.heroId, hero.heroId, language);
              return (
                <li key={hero.heroId} className="profile-hero-row">
                  <span className="profile-hero-row__portrait" aria-hidden="true">
                    <img src={getFigureArtSrc(hero.heroId)} alt="" loading="lazy" />
                  </span>
                  <span className="profile-hero-row__body">
                    <span className="profile-hero-row__head">
                      <strong dir="auto">{name}</strong>
                      <span>
                        {t("statistics.gameCount", { count: hero.gamesPlayed })} ·{" "}
                        <b>{formatWinRate(hero.winRate, language)}</b>
                      </span>
                    </span>
                    <span className="profile-hero-row__bar" aria-hidden="true">
                      <span style={{ width: `${hero.winRate * 100}%` }} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          {stats && stats.heroSampleSize < stats.overall.gamesPlayed && (
            <p className="profile-heroes__note">
              {t("profile.heroesSample", { games: stats.heroSampleSize })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
