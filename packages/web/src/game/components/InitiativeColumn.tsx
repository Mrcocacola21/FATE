import type { FC } from "react";
import type { PlayerId, PlayerView } from "rules";
import { PanelCard, SectionHeader, StatusBadge } from "../../components/ui";
import { useI18n } from "../../i18n";
import { getUnitFigureDisplayName } from "../../i18n/displayMetadata";
import { getUnitTokenAsset } from "../../assets/registry";
import { StatusBadges } from "../../features/vfx/UnitStatusVfx";
import { resolveUnitStatuses } from "../../features/vfx/persistentStatuses";

interface InitiativeColumnProps {
  view: PlayerView;
  playerId: PlayerId | null;
  selectedUnitId: string | null;
  onSelectUnit: (unitId: string | null) => void;
}

/**
 * Vertical turn queue. Reads only the recipient's roster projection: enemy HP stays
 * hidden exactly as in the Players roster, and units absent from it render as unknown.
 */
export const InitiativeColumn: FC<InitiativeColumnProps> = ({
  view,
  playerId,
  selectedUnitId,
  onSelectUnit,
}) => {
  const { language, t } = useI18n();
  const queue = view.turnQueue?.length ? view.turnQueue : view.turnOrder;
  const queueIndex = view.turnQueue?.length ? view.turnQueueIndex : view.turnOrderIndex;

  return (
    <PanelCard variant="hud" className="p-3" data-testid="initiative-column">
      <SectionHeader
        kicker={t("game.initiative")}
        title={t("game.turnQueue")}
        action={
          <StatusBadge tone="neutral">
            <bdi dir="ltr">
              {view.roundNumber} / {view.turnNumber}
            </bdi>
          </StatusBadge>
        }
      />
      <ol className="mt-3 space-y-1.5">
        {queue.map((unitId, index) => {
          const roster = view.rosterUnits?.[unitId];
          const unit = view.units[unitId];
          const offset = index - queueIndex;
          const isCurrent = offset === 0;
          const name = roster ? getUnitFigureDisplayName(roster, { language, t }) : t("game.statusHidden");
          const exactHp =
            roster?.hpVisibility === "exact" &&
            typeof roster.hp === "number" &&
            typeof roster.maxHp === "number";
          const when = isCurrent
            ? t("common.current")
            : offset === 1
              ? t("game.queueNext")
              : offset > 1
                ? `+${offset}`
                : "";
          const statuses = unit ? resolveUnitStatuses(unit, playerId, view) : [];
          return (
            <li key={`${unitId}-${index}`}>
              <button
                type="button"
                className="initiative-entry"
                data-current={String(isCurrent)}
                data-done={String(offset < 0)}
                data-owner={roster?.owner}
                data-defeated={String(roster ? !roster.isAlive : false)}
                aria-pressed={selectedUnitId === unitId}
                disabled={!roster}
                onClick={() => onSelectUnit(unitId)}
              >
                {roster ? (
                  <img
                    src={getUnitTokenAsset(roster).src}
                    alt=""
                    className="initiative-token"
                  />
                ) : (
                  <span className="initiative-token initiative-token--unknown" aria-hidden="true">
                    ?
                  </span>
                )}
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-xs font-semibold">{name}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {roster ? roster.owner : ""}
                    {exactHp ? ` · ${roster!.hp}/${roster!.maxHp} ${t("game.healthShort")}` : ""}
                    {when ? ` · ${when}` : ""}
                  </span>
                </span>
                {statuses.length ? <StatusBadges statuses={statuses} t={t} maxBadges={3} /> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </PanelCard>
  );
};
