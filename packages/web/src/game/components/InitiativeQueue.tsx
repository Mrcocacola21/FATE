import type { FC } from "react";
import type { PlayerId, PlayerView } from "rules";
import { useI18n } from "../../i18n";
import { getUnitFigureDisplayName } from "../../i18n/displayMetadata";
import { getUnitTokenAsset } from "../../assets/registry";
import { StatusBadges } from "../../features/vfx/UnitStatusVfx";
import { resolveUnitStatuses } from "../../features/vfx/persistentStatuses";

interface InitiativeQueueProps {
  view: PlayerView;
  playerId: PlayerId | null;
  selectedUnitId: string | null;
  onSelectUnit: (unitId: string | null) => void;
}

/**
 * Minimal-layout turn queue that fits a full 15-figure round without scrolling:
 * finished figures collapse into a row of tokens, the acting one gets a card,
 * the rest are thin rows and the defeated sit at the bottom.
 * Like InitiativeColumn it reads only the recipient's roster projection.
 */
export const InitiativeQueue: FC<InitiativeQueueProps> = ({
  view,
  playerId,
  selectedUnitId,
  onSelectUnit,
}) => {
  const { language, t } = useI18n();
  const queue = view.turnQueue?.length ? view.turnQueue : view.turnOrder;
  const queueIndex = view.turnQueue?.length ? view.turnQueueIndex : view.turnOrderIndex;
  const roster = view.rosterUnits ?? {};
  const isAlive = (unitId: string) => roster[unitId]?.isAlive !== false;
  const done = queue.slice(0, Math.max(0, queueIndex)).filter(isAlive);
  const currentId = queueIndex >= 0 ? queue[queueIndex] : undefined;
  const upcoming = queue.slice(queueIndex + 1).filter(isAlive);
  const defeated = Object.keys(roster).filter((unitId) => !isAlive(unitId));

  const nameOf = (unitId: string) =>
    roster[unitId]
      ? getUnitFigureDisplayName(roster[unitId], { language, t })
      : t("game.statusHidden");
  const hpOf = (unitId: string) => {
    const entry = roster[unitId];
    return entry?.hpVisibility === "exact" &&
      typeof entry.hp === "number" &&
      typeof entry.maxHp === "number"
      ? `${entry.hp}/${entry.maxHp}`
      : null;
  };
  const token = (unitId: string, className: string) =>
    roster[unitId] ? (
      <img src={getUnitTokenAsset(roster[unitId]).src} alt="" className={className} />
    ) : (
      <span className={`${className} initiative-queue__unknown`} aria-hidden="true">
        ?
      </span>
    );
  const statuses = (unitId: string) => {
    const unit = view.units[unitId];
    return unit ? resolveUnitStatuses(unit, playerId, view) : [];
  };

  return (
    <section
      className="initiative-queue"
      data-testid="initiative-queue"
      aria-label={t("game.initiative")}
    >
      <header className="initiative-queue__head">
        <h2>{t("game.initiative")}</h2>
        <span>
          <bdi dir="ltr">
            {Math.max(0, queueIndex) + 1}/{queue.length}
          </bdi>
        </span>
      </header>

      {done.length ? (
        <div className="initiative-queue__done">
          <span className="initiative-queue__label">
            {t("game.turnsDone")} · {done.length}
          </span>
          <div className="flex flex-wrap gap-1">
            {done.map((unitId) => (
              <button
                key={unitId}
                type="button"
                className="initiative-queue__done-token"
                data-owner={roster[unitId]?.owner}
                title={nameOf(unitId)}
                aria-label={nameOf(unitId)}
                aria-pressed={selectedUnitId === unitId}
                disabled={!roster[unitId]}
                onClick={() => onSelectUnit(unitId)}
              >
                {token(unitId, "h-full w-full rounded-full object-cover object-top")}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {currentId ? (
        <button
          type="button"
          className="initiative-queue__current"
          data-owner={roster[currentId]?.owner}
          aria-pressed={selectedUnitId === currentId}
          disabled={!roster[currentId]}
          onClick={() => onSelectUnit(currentId)}
        >
          {token(currentId, "initiative-queue__current-token")}
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-semibold">{nameOf(currentId)}</span>
            <span className="initiative-queue__current-meta block truncate text-[11px]">
              {t("common.current")}
              {hpOf(currentId) ? ` · ${hpOf(currentId)} ${t("game.healthShort")}` : ""}
            </span>
          </span>
          <StatusBadges statuses={statuses(currentId)} t={t} maxBadges={3} />
        </button>
      ) : null}

      <ol className="initiative-queue__list">
        {upcoming.map((unitId, index) => {
          const hp = hpOf(unitId);
          return (
            <li key={unitId}>
              <button
                type="button"
                className="initiative-queue__row"
                data-owner={roster[unitId]?.owner}
                data-next={String(index === 0)}
                aria-pressed={selectedUnitId === unitId}
                disabled={!roster[unitId]}
                onClick={() => onSelectUnit(unitId)}
              >
                <span className="initiative-queue__owner" aria-hidden="true" />
                {token(unitId, "initiative-queue__row-token")}
                <span className="min-w-0 flex-1 truncate text-left text-xs">{nameOf(unitId)}</span>
                {hp ? <span className="text-[10px] text-muted">{hp}</span> : null}
                <StatusBadges statuses={statuses(unitId)} t={t} maxBadges={3} />
                <span className="initiative-queue__when">
                  {index === 0 ? t("game.queueNext") : `+${index + 1}`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {defeated.length ? (
        <div className="initiative-queue__defeated">
          <span className="initiative-queue__label">{t("game.defeatedShort")}</span>
          {defeated.map((unitId) => (
            <span key={unitId} className="initiative-queue__defeated-token" title={nameOf(unitId)}>
              {token(unitId, "h-full w-full rounded-full object-cover object-top")}
              <span aria-hidden="true">☠</span>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
};
