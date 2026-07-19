import { useMemo } from "react";
import type { DraftState, HeroDraftMeta, HeroMeta, PlayerId, UnitClass } from "rules";
import { EventLog } from "../components/EventLog";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { ThemeToggle } from "../components/ThemeToggle";
import { PanelCard, SectionHeader, StatusBadge } from "../components/ui";
import { getTokenSrc } from "../catalog/tokens";
import { useHeroes } from "../figures/useHeroes";
import { useI18n } from "../i18n";
import { getGameModeName } from "./modeLabels";
import { groupDraftPoolByClass } from "./draftPool";

const DRAFT_CLASSES: UnitClass[] = [
  "knight",
  "spearman",
  "rider",
  "archer",
  "assassin",
  "trickster",
  "berserker",
];
const DRAFT_TOTAL_BANS = 4;
const DRAFT_TOTAL_PICKS = DRAFT_CLASSES.length * 2;

type DraftVm = {
  roomId: string | null;
  role: string | null;
  seat: PlayerId | null;
  isHost: boolean;
  roomMeta: {
    gameMode: "draft";
    draftState: DraftState;
    draftPool: HeroDraftMeta[];
  };
  events: any[];
  clientLog: string[];
  leavingRoom: boolean;
  handleLeave: () => void;
  draftBanHero: (heroId: string) => void;
  draftPickHero: (heroId: string) => void;
};

function classLabel(unitClass: UnitClass, t: (key: string) => string) {
  return t(`classes.${unitClass}`);
}

function getPickedHeroIds(draft: DraftState): Set<string> {
  return new Set([
    ...Object.values(draft.picks.P1).filter(Boolean),
    ...Object.values(draft.picks.P2).filter(Boolean),
  ] as string[]);
}

function getLockReason(params: {
  draft: DraftState;
  hero: HeroDraftMeta;
  seat: PlayerId | null;
}): string | null {
  const { draft, hero, seat } = params;
  if (draft.phase === "complete") return "draft_complete";
  if (!seat || seat !== draft.currentPlayer) return "not_current_player";
  if (draft.bannedHeroIds.includes(hero.heroId)) return "banned";
  if (getPickedHeroIds(draft).has(hero.heroId)) return "picked";
  if (draft.phase === "pick" && draft.picks[seat][hero.primaryClass]) {
    return "class_slot_already_filled";
  }
  if (
    draft.phase === "ban" &&
    draft.bannedHeroIds.some(
      (heroId) => heroId !== hero.heroId && heroIdForClass(draft, heroId) === hero.primaryClass
    )
  ) {
    return "max_bans_per_class_reached";
  }
  return null;
}

function heroIdForClass(draft: DraftState, heroId: string): UnitClass | null {
  const event = draft.history.find((item) => item.heroId === heroId);
  return event?.primaryClass ?? null;
}

function RosterColumn({
  player,
  draft,
  heroById,
}: {
  player: PlayerId;
  draft: DraftState;
  heroById: Map<string, HeroMeta>;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/45">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">{player}</h2>
        <StatusBadge tone={draft.currentPlayer === player ? "special" : "neutral"}>
          {draft.currentPlayer === player ? t("draft.current") : t("draft.roster")}
        </StatusBadge>
      </div>
      <div className="mt-3 grid gap-2">
        {DRAFT_CLASSES.map((unitClass) => {
          const heroId = draft.picks[player][unitClass];
          const hero = heroId ? heroById.get(heroId) : null;
          return (
            <div
              key={unitClass}
              className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/70"
            >
              <span className="w-20 shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                {classLabel(unitClass, t)}
              </span>
              {hero ? (
                <>
                  <img
                    src={getTokenSrc(hero.id)}
                    alt=""
                    className="h-8 w-8 rounded-md object-cover"
                  />
                  <span className="min-w-0 truncate font-semibold text-slate-900 dark:text-white">
                    {hero.name}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">{t("draft.emptySlot")}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DraftScreen({ vm }: { vm: DraftVm }) {
  const { t } = useI18n();
  const { heroes, loading } = useHeroes();
  const draft = vm.roomMeta.draftState;
  const heroById = useMemo(
    () => new Map(heroes.map((hero) => [hero.id, hero])),
    [heroes]
  );
  const poolByClass = useMemo(() => {
    return groupDraftPoolByClass(vm.roomMeta.draftPool);
  }, [vm.roomMeta.draftPool]);

  const banCount = draft.history.filter((event) => event.type === "ban").length;
  const pickCount = draft.history.filter((event) => event.type === "pick").length;
  const phaseCount =
    draft.phase === "ban"
      ? `${banCount}/${DRAFT_TOTAL_BANS}`
      : draft.phase === "pick"
        ? `${pickCount}/${DRAFT_TOTAL_PICKS}`
        : `${DRAFT_TOTAL_PICKS}/${DRAFT_TOTAL_PICKS}`;

  return (
    <div className="app-shell px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
      <div className="mx-auto max-w-[1720px] space-y-4">
        <PanelCard variant="hud" className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="section-kicker">{getGameModeName("draft", t)}</div>
              <h1 className="fate-brand mt-1 text-2xl">{t("draft.safeClassDraft")}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge tone="info">
                  {t(`draft.phases.${draft.phase}`)} {phaseCount}
                </StatusBadge>
                <StatusBadge tone="special">
                  {t("draft.currentPlayer", { player: draft.currentPlayer })}
                </StatusBadge>
                <StatusBadge tone={vm.seat === draft.currentPlayer ? "success" : "neutral"}>
                  {vm.seat === draft.currentPlayer ? t("draft.yourTurn") : t("draft.waitingTurn")}
                </StatusBadge>
              </div>
              <div className="mt-2 max-w-full truncate font-mono text-[11px] text-stone-500 dark:text-stone-400">
                {t("game.room")} {vm.roomId ?? "-"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={vm.handleLeave}
                disabled={vm.leavingRoom}
              >
                {vm.leavingRoom ? t("game.leaving") : t("game.leaveMatch")}
              </button>
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>
        </PanelCard>

        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
          <RosterColumn player="P1" draft={draft} heroById={heroById} />

          <PanelCard className="min-w-0 p-4 sm:p-5">
            <SectionHeader
              kicker={t("draft.catalogKicker")}
              title={t("draft.heroCatalog")}
              description={t("draft.catalogDescription")}
            />
            {loading ? (
              <div className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                {t("figureSet.loadingHeroes")}
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                {DRAFT_CLASSES.map((unitClass) => (
                  <section key={unitClass}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {classLabel(unitClass, t)}
                      </h2>
                      <StatusBadge tone="neutral">
                        {(poolByClass.get(unitClass) ?? []).length}
                      </StatusBadge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      {(poolByClass.get(unitClass) ?? []).map((hero) => {
                        const meta = heroById.get(hero.heroId);
                        const reason = getLockReason({ draft, hero, seat: vm.seat });
                        const banned = draft.bannedHeroIds.includes(hero.heroId);
                        const picked = getPickedHeroIds(draft).has(hero.heroId);
                        const disabled = !!reason;
                        const command =
                          draft.phase === "ban"
                            ? () => vm.draftBanHero(hero.heroId)
                            : () => vm.draftPickHero(hero.heroId);
                        return (
                          <button
                            key={hero.heroId}
                            type="button"
                            className={`min-h-44 rounded-xl border p-3 text-left transition ${
                              disabled
                                ? "border-slate-200 bg-slate-100 text-slate-500 opacity-80 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400"
                                : "border-amber-300 bg-white text-slate-900 hover:border-amber-500 hover:shadow-lg hover:shadow-amber-950/5 dark:border-amber-800/70 dark:bg-slate-900 dark:text-white"
                            }`}
                            disabled={disabled}
                            onClick={command}
                          >
                            <span className="flex items-start gap-3">
                              <img
                                src={getTokenSrc(hero.heroId)}
                                alt=""
                                className="h-14 w-14 rounded-lg object-cover"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-bold">
                                  {meta?.name ?? hero.heroId}
                                </span>
                                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                                  {classLabel(hero.primaryClass, t)}
                                </span>
                                <span className="mt-2 flex flex-wrap gap-1.5">
                                  <StatusBadge tone={banned ? "danger" : picked ? "warning" : "success"}>
                                    {banned
                                      ? t("draft.status.banned")
                                      : picked
                                        ? t("draft.status.picked")
                                        : disabled
                                          ? t("draft.status.locked")
                                          : t("draft.status.available")}
                                  </StatusBadge>
                                  {reason ? (
                                    <StatusBadge tone="neutral">
                                      {t(`draft.lockReasons.${reason}`)}
                                    </StatusBadge>
                                  ) : null}
                                </span>
                              </span>
                            </span>
                            <span className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">
                                {t("game.hp", { hp: meta?.baseStats.hp ?? "-" })}
                              </span>
                              <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">
                                {t("game.damage", { value: meta?.baseStats.damage ?? "-" })}
                              </span>
                            </span>
                            <span className="mt-3 block min-h-10 text-xs leading-5 text-slate-500 dark:text-slate-400">
                              {meta?.abilities?.[0]?.description ?? t("figureSet.noAbilities")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </PanelCard>

          <div className="space-y-4">
            <RosterColumn player="P2" draft={draft} heroById={heroById} />
            <PanelCard className="p-4">
              <SectionHeader
                kicker={t("draft.bans")}
                title={t("draft.history")}
                description={t("draft.historyDescription")}
              />
              <div className="mt-4 space-y-2 text-xs">
                {draft.history.length === 0 ? (
                  <div className="text-slate-500 dark:text-slate-400">
                    {t("draft.noHistory")}
                  </div>
                ) : (
                  draft.history.map((event, index) => {
                    const hero = heroById.get(event.heroId);
                    return (
                      <div
                        key={`${event.type}-${event.heroId}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-800 dark:bg-slate-950/45"
                      >
                        <span className="truncate">
                          {event.player} {t(`draft.eventTypes.${event.type}`)}{" "}
                          <strong>{hero?.name ?? event.heroId}</strong>
                        </span>
                        <StatusBadge tone={event.type === "ban" ? "danger" : "success"}>
                          {classLabel(event.primaryClass, t)}
                        </StatusBadge>
                      </div>
                    );
                  })
                )}
              </div>
            </PanelCard>
            <EventLog events={vm.events} clientLog={vm.clientLog} />
          </div>
        </div>
      </div>
    </div>
  );
}
