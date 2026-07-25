import { useMemo } from "react";
import type { ProjectedUnitForRoster, PlayerView } from "rules";
import { getUnitTokenAsset } from "../../../assets/registry";
import { PanelCard, SectionHeader, StatusBadge } from "../../../components/ui";
import { useI18n } from "../../../i18n";
import { getClassLabel, getUnitFigureDisplayName } from "../../../i18n/displayMetadata";

function unitStatusLabel(unit: ProjectedUnitForRoster, t: ReturnType<typeof useI18n>["t"]) {
  if (!unit.isAlive) return t("game.statusDefeated");
  if (!unit.isPlaced) return t("common.unplaced");
  if (unit.isStealthed) return t("game.statusHidden");
  return t("game.statusAlive");
}

export function RosterList({
  owner,
  units,
  activeUnitId,
  selectedUnitId,
  onSelectUnit,
}: {
  owner: "P1" | "P2";
  units: ProjectedUnitForRoster[];
  activeUnitId: string | null | undefined;
  selectedUnitId: string | null;
  onSelectUnit: (unitId: string | null) => void;
}) {
  const { language, t } = useI18n();

  return (
    <PanelCard variant="hud" className="p-4">
      <SectionHeader
        kicker={t("game.roster")}
        title={owner}
        action={<StatusBadge tone={owner === "P1" ? "info" : "danger"}>{units.length}</StatusBadge>}
      />
      {units.length === 0 ? (
        <div className="panel-card-muted mt-3 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t("game.noVisibleUnits")}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {units.map((unit) => {
            const tokenAsset = getUnitTokenAsset(unit);
            const selected = selectedUnitId === unit.id;
            const active = activeUnitId === unit.id;
            const heroName = getUnitFigureDisplayName(unit, { language, t });
            const exactHp =
              unit.hpVisibility === "exact" &&
              typeof unit.hp === "number" &&
              typeof unit.maxHp === "number";
            const hpPercent = exactHp
              ? Math.max(0, Math.min(100, Math.round((unit.hp! / Math.max(1, unit.maxHp!)) * 100)))
              : null;

            return (
              <button
                key={unit.id}
                type="button"
                className={`flex w-full items-center gap-3 rounded-xl border px-2.5 py-2.5 text-left text-xs shadow-sm transition focus-visible:ring-4 focus-visible:ring-amber-500/15 ${
                  selected
                    ? "border-amber-500 bg-amber-50 text-amber-950 ring-2 ring-amber-500/15 dark:bg-amber-950/35 dark:text-amber-100"
                    : "border-stone-300/70 bg-stone-100/55 text-stone-700 hover:border-amber-500/45 hover:bg-white dark:border-stone-800 dark:bg-black/20 dark:text-stone-200 dark:hover:border-amber-500/40 dark:hover:bg-stone-900"
                } ${!unit.isAlive ? "opacity-55" : ""}`}
                onClick={() => onSelectUnit(unit.id)}
                data-unit-id={unit.id}
                data-owner={unit.owner}
                data-hp-visibility={unit.hpVisibility}
              >
                <img
                  src={tokenAsset.src}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg border border-white/40 bg-stone-950 object-contain shadow dark:border-black/50"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{heroName}</span>
                    {active ? (
                      <StatusBadge tone="warning">{t("common.current")}</StatusBadge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] opacity-75">
                    {getClassLabel(unit.class, t)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {exactHp ? (
                      <StatusBadge tone={unit.isAlive ? "success" : "danger"}>
                        {unit.hp}/{unit.maxHp} {t("game.healthShort")}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">{t("game.hpHidden")}</StatusBadge>
                    )}
                    <StatusBadge tone={unit.isStealthed ? "special" : "neutral"}>
                      {unitStatusLabel(unit, t)}
                    </StatusBadge>
                    {unit.blindUntilOwnTurnStart ? (
                      <StatusBadge tone="warning">{t("game.blind")}</StatusBadge>
                    ) : null}
                  </div>
                  {exactHp ? (
                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-300/70 dark:bg-stone-700"
                      role="progressbar"
                      aria-label={`${heroName}: ${unit.hp}/${unit.maxHp} ${t("game.healthShort")}`}
                      aria-valuemin={0}
                      aria-valuemax={unit.maxHp}
                      aria-valuenow={unit.hp}
                      data-testid={`roster-hp-bar-${unit.id}`}
                    >
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${hpPercent}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}

export function PlayersRosterSection({
  view,
  selectedUnitId,
  onSelectUnit,
}: {
  view: Pick<PlayerView, "activeUnitId" | "lastKnownPositions" | "rosterUnits">;
  selectedUnitId: string | null;
  onSelectUnit: (unitId: string | null) => void;
}) {
  const { t } = useI18n();
  const unitsByOwner = useMemo(() => {
    const entries = Object.values(view.rosterUnits);
    return {
      P1: entries.filter((unit) => unit.owner === "P1"),
      P2: entries.filter((unit) => unit.owner === "P2"),
    };
  }, [view.rosterUnits]);
  const lastKnownEntries = Object.entries(view.lastKnownPositions);

  return (
    <div className="space-y-3">
      <RosterList
        owner="P1"
        units={unitsByOwner.P1}
        activeUnitId={view.activeUnitId}
        selectedUnitId={selectedUnitId}
        onSelectUnit={onSelectUnit}
      />
      <RosterList
        owner="P2"
        units={unitsByOwner.P2}
        activeUnitId={view.activeUnitId}
        selectedUnitId={selectedUnitId}
        onSelectUnit={onSelectUnit}
      />
      {lastKnownEntries.length > 0 ? (
        <PanelCard variant="muted" className="p-4">
          <SectionHeader kicker={t("game.intel")} title={t("game.lastKnownPositions")} />
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {lastKnownEntries.map(([unitId, coord], index) => (
              <StatusBadge key={unitId} tone="neutral">
                {t("common.unknown")} {index + 1}: {coord.col}, {coord.row}
              </StatusBadge>
            ))}
          </div>
        </PanelCard>
      ) : null}
    </div>
  );
}
