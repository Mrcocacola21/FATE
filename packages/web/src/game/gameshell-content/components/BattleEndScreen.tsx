import { useEffect, useMemo, useState } from "react";
import {
  type GameOverResult,
  type PlayerId,
  type PlayerView,
  type UnitState,
} from "rules";
import { useI18n } from "../../../i18n";
import { getUnitFigureDisplayName } from "../../../i18n/displayMetadata";

export type BattleEndPerspective = "winner" | "loser" | "spectator";
export type BattleEndOverlayEvent = "resultArrived" | "viewBoard" | "results";

export function getBattleEndOverlayState(
  current: boolean,
  event: BattleEndOverlayEvent
): boolean {
  if (event === "viewBoard") return false;
  if (event === "results" || event === "resultArrived") return true;
  return current;
}

export function getBattleEndPerspective(
  result: GameOverResult,
  viewer: PlayerId | null
): BattleEndPerspective {
  if (viewer === result.winnerPlayerId) return "winner";
  if (viewer === result.loserPlayerId) return "loser";
  return "spectator";
}

export function isBattleUnit(unit: UnitState): boolean {
  // Mirrors rules/isRealRosterUnit without pulling a runtime rules constant into Vite.
  return unit.heroId !== "falseTrailToken" && !unit.id.startsWith("debug-marker-");
}

function ResultUnitList({
  title,
  units,
  showHp,
}: {
  title: string;
  units: UnitState[];
  showHp?: boolean;
}) {
  const { language, t } = useI18n();
  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/70">
        {title}
      </h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {units.length ? (
          units.map((unit) => (
            <span
              key={unit.id}
              className="rounded-full border border-stone-600/70 bg-stone-950/65 px-2.5 py-1 text-xs text-stone-200"
            >
              {getUnitFigureDisplayName(unit, { language, t })}
              {showHp ? ` · ${Math.max(0, unit.hp)} HP` : ""}
            </span>
          ))
        ) : (
          <span className="text-sm text-stone-400">{t("game.battleEnd.none")}</span>
        )}
      </div>
    </section>
  );
}

export function BattleEndScreen({ vm }: { vm: any }) {
  const { t } = useI18n();
  const view = vm.view as PlayerView | null;
  const result = view?.gameOver ?? null;
  const resultRevision = result?.endedAtRevision ?? null;
  const [open, setOpen] = useState(view?.phase === "ended" && !!result);

  useEffect(() => {
    if (view?.phase === "ended" && result) {
      setOpen((current) => getBattleEndOverlayState(current, "resultArrived"));
    }
  }, [view?.phase, resultRevision]);

  const summary = useMemo(() => {
    if (!view || !result) return null;
    const units = Object.values(view.units).filter(isBattleUnit);
    return {
      survivors: units.filter(
        (unit) => unit.owner === result.winnerPlayerId && unit.isAlive
      ),
      defeated: units.filter(
        (unit) => unit.owner === result.loserPlayerId && !unit.isAlive
      ),
    };
  }, [view, result]);

  if (!view || view.phase !== "ended" || !result || !summary) return null;

  const viewer = (vm.seat ?? (vm.role === "P1" || vm.role === "P2" ? vm.role : null)) as
    | PlayerId
    | null;
  const perspective = getBattleEndPerspective(result, viewer);
  const names = vm.roomMeta?.playerNames ?? {};
  const winnerName = names[result.winnerPlayerId] || t(`roles.${result.winnerPlayerId}`);
  const loserName = names[result.loserPlayerId] || t(`roles.${result.loserPlayerId}`);
  const title = t(`game.battleEnd.${perspective}.title`);
  const subtitle =
    perspective === "winner"
      ? t("game.battleEnd.winner.subtitle")
      : perspective === "loser"
        ? t("game.battleEnd.loser.subtitle")
        : t("game.battleEnd.spectator.subtitle", { player: winnerName });
  const reason =
    result.reason === "allEnemyUnitsDefeated"
      ? t(
          perspective === "loser"
            ? "game.battleEnd.reasonAllied"
            : "game.battleEnd.reasonEnemy"
        )
      : t(`game.battleEnd.reasons.${result.reason}`);

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-950/80 backdrop-blur-[3px] sm:items-center sm:p-5"
          data-testid="battle-end-overlay"
          role="presentation"
        >
          <section
            aria-labelledby="battle-end-title"
            aria-modal="true"
            className="relative flex max-h-dvh w-full flex-col overflow-hidden border border-amber-400/25 bg-gradient-to-b from-stone-900 via-stone-950 to-black shadow-[0_0_80px_rgba(245,158,11,0.16)] sm:max-h-[90dvh] sm:max-w-[640px] sm:rounded-2xl"
            data-perspective={perspective}
            role="dialog"
          >
            <div className="h-1 shrink-0 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
            <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pb-7 sm:pt-8">
              <header className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.42em] text-amber-300/60">
                  {t("game.battleEnd.kicker")}
                </p>
                <h2
                  id="battle-end-title"
                  className={`mt-2 font-serif text-4xl font-black uppercase tracking-[0.08em] sm:text-6xl ${
                    perspective === "loser" ? "text-rose-300" : "text-amber-300"
                  }`}
                >
                  {title}
                </h2>
                <p className="mt-2 text-lg font-semibold text-stone-100 sm:text-xl">{subtitle}</p>
                <p className="mt-1 text-sm text-stone-400">
                  {t("game.battleEnd.winnerLine", { winner: winnerName })}
                </p>
              </header>

              <div className="my-5 grid grid-cols-2 gap-2 sm:my-6 sm:gap-3">
                <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-3">
                  <span className="block text-[10px] uppercase tracking-[0.18em] text-stone-500">
                    {t("game.battleEnd.winnerLabel")}
                  </span>
                  <strong className="mt-1 block truncate text-sm text-amber-200">{winnerName}</strong>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <span className="block text-[10px] uppercase tracking-[0.18em] text-stone-500">
                    {t("game.battleEnd.loserLabel")}
                  </span>
                  <strong className="mt-1 block truncate text-sm text-stone-200">{loserName}</strong>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="block text-[10px] uppercase tracking-[0.18em] text-stone-500">
                      {t("game.battleEnd.reason")}
                    </span>
                    <span className="mt-1 block text-sm font-medium text-stone-100">{reason}</span>
                  </div>
                  {result.endedAtTurn ? (
                    <span className="rounded-full border border-stone-700 px-2.5 py-1 text-xs text-stone-400">
                      {t("game.battleEnd.turn", { turn: result.endedAtTurn })}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <ResultUnitList
                  title={t("game.battleEnd.survivors")}
                  units={summary.survivors}
                  showHp
                />
                <ResultUnitList title={t("game.battleEnd.defeated")} units={summary.defeated} />
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="btn btn-primary min-h-12 w-full"
                  data-testid="battle-end-view-board"
                  onClick={() => setOpen((current) => getBattleEndOverlayState(current, "viewBoard"))}
                >
                  {t("game.battleEnd.viewBoard")}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary min-h-12 w-full"
                  data-testid="battle-end-leave"
                  disabled={vm.leavingRoom}
                  onClick={vm.handleLeave}
                >
                  {vm.leavingRoom
                    ? t("game.leaving")
                    : t("game.battleEnd.backToLobby")}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div
          className="fixed left-1/2 top-2 z-[70] flex w-[calc(100%-1rem)] max-w-lg -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-stone-950/95 px-3 py-2.5 shadow-2xl backdrop-blur sm:top-4 sm:px-4"
          data-testid="battle-end-banner"
          role="status"
        >
          <p className="min-w-0 truncate text-sm font-medium text-stone-200">
            {t("game.battleEnd.banner", { winner: winnerName })}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm shrink-0"
            data-testid="battle-end-results"
            onClick={() => setOpen((current) => getBattleEndOverlayState(current, "results"))}
          >
            {t("game.battleEnd.results")}
          </button>
        </div>
      )}
    </>
  );
}
