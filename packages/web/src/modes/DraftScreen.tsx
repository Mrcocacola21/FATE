import { useEffect, useMemo, useRef, useState } from "react";
import {
  type DraftState,
  type HeroDraftMeta,
  type HeroMeta,
  type PlayerId,
  type UnitClass,
} from "rules";
import { EventLog } from "../components/EventLog";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { ThemeToggle } from "../components/ThemeToggle";
import { PanelCard, SectionHeader, StatusBadge } from "../components/ui";
import { getTokenSrc } from "../catalog/tokens";
import { useHeroes } from "../figures/useHeroes";
import { useI18n, type Translate } from "../i18n";
import { getHeroDisplayName } from "../i18n/displayMetadata";
import { DraftConfirmBar, DraftHeroCardView, DraftHeroDetailsView } from "./DraftHeroPreview";
import { getGameModeName } from "./modeLabels";
import { useIsMobile } from "../layout/useIsMobile";
import { Tabs } from "../ui";
import {
  createDraftSubmissionGate,
  getDraftHeroCardState,
  getDraftHeroLockReason,
  getPickedHeroOwner,
  groupDraftPoolByClass,
  sendDraftCandidateCommand,
} from "./draftPool";

const DRAFT_CLASSES: UnitClass[] = [
  "knight",
  "spearman",
  "rider",
  "archer",
  "assassin",
  "trickster",
  "berserker",
];
const DRAFT_BAN_ORDER: PlayerId[] = ["P1", "P2", "P2", "P1"];
const DRAFT_TOTAL_BANS = DRAFT_BAN_ORDER.length;
const DRAFT_TOTAL_PICKS = DRAFT_CLASSES.length * 2;

function getDraftPickOrder(): PlayerId[] {
  return Array.from({ length: DRAFT_TOTAL_PICKS }, (_, index) => {
    if (index === 0) return "P1";
    return Math.floor((index - 1) / 2) % 2 === 0 ? "P2" : "P1";
  });
}

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

type PendingDraftSubmission = {
  heroId: string;
  historyLength: number;
  clientLogLength: number;
};

type MobileDraftTab = "catalog" | "selected" | "rosters" | "history";

function classLabel(unitClass: UnitClass, t: Translate) {
  return t(`classes.${unitClass}`);
}

function localizeDraftRejection(value: string, phase: DraftState["phase"], t: Translate) {
  const key = `draft.lockReasons.${value}`;
  const localized = t(key);
  const reason = localized === key ? value : localized;
  return `${phase === "ban" ? t("draft.cannotBanHero") : t("draft.cannotPickHero")}: ${reason}`;
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
  const { language, t } = useI18n();
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/45">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">{player}</h2>
        <StatusBadge tone={draft.currentPlayer === player ? "special" : "neutral"}>
          {draft.currentPlayer === player ? t("draft.current") : t("draft.roster")}
        </StatusBadge>
      </div>
      <div className="mt-2 grid gap-1.5">
        {DRAFT_CLASSES.map((unitClass) => {
          const heroId = draft.picks[player][unitClass];
          const hero = heroId ? heroById.get(heroId) : null;
          return (
            <div
              key={unitClass}
              className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900/70"
            >
              <span className="w-16 shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                {classLabel(unitClass, t)}
              </span>
              {hero ? (
                <>
                  <img src={getTokenSrc(hero.id)} alt="" className="h-7 w-7 rounded-md object-cover" />
                  <span className="min-w-0 truncate font-semibold text-slate-900 dark:text-white">
                    {getHeroDisplayName(hero.id, hero.name, language)}
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
  const { language, t } = useI18n();
  const isMobile = useIsMobile();
  const { heroes, loading } = useHeroes();
  const draft = vm.roomMeta.draftState;
  const [selectedDraftHeroId, setSelectedDraftHeroId] = useState<string | null>(null);
  const [submission, setSubmission] = useState<PendingDraftSubmission | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileDraftTab>("catalog");
  const submissionGate = useRef(createDraftSubmissionGate());

  const heroById = useMemo(() => new Map(heroes.map((hero) => [hero.id, hero])), [heroes]);
  const poolByClass = useMemo(
    () => groupDraftPoolByClass(vm.roomMeta.draftPool),
    [vm.roomMeta.draftPool]
  );
  const selectedDraftMeta = useMemo(
    () => vm.roomMeta.draftPool.find((hero) => hero.heroId === selectedDraftHeroId) ?? null,
    [selectedDraftHeroId, vm.roomMeta.draftPool]
  );
  const selectedHero = selectedDraftHeroId ? heroById.get(selectedDraftHeroId) ?? null : null;
  const selectedLockReason = selectedDraftMeta
    ? getDraftHeroLockReason({
        draft,
        draftPool: vm.roomMeta.draftPool,
        hero: selectedDraftMeta,
        seat: vm.seat,
      })
    : null;
  const selectedPickedBy = selectedDraftHeroId
    ? getPickedHeroOwner(draft, selectedDraftHeroId)
    : null;
  const isLocalTurn = !!vm.seat && vm.seat === draft.currentPlayer && draft.phase !== "complete";
  const canConfirm = !!selectedDraftMeta && isLocalTurn && !selectedLockReason && !submission;

  useEffect(() => {
    if (!submission) return;
    const accepted = draft.history
      .slice(submission.historyLength)
      .some((event) => event.heroId === submission.heroId && event.player === vm.seat);
    if (accepted) {
      submissionGate.current.release();
      setSubmission(null);
      setSubmissionError(null);
      setSelectedDraftHeroId((current) =>
        current === submission.heroId ? null : current
      );
      return;
    }

    const newClientLog = vm.clientLog.slice(submission.clientLogLength);
    const rejection = newClientLog[newClientLog.length - 1];
    if (rejection) {
      submissionGate.current.release();
      setSubmission(null);
      setSubmissionError(localizeDraftRejection(rejection, draft.phase, t));
    }
  }, [draft.history, draft.phase, submission, t, vm.clientLog, vm.seat]);

  const handleSelectHero = (heroId: string) => {
    setSelectedDraftHeroId(heroId);
    setSubmissionError(null);
    if (isMobile) setMobileTab("selected");
  };

  const handleClearSelection = () => {
    if (submission) return;
    setSelectedDraftHeroId(null);
    setSubmissionError(null);
    if (isMobile) setMobileTab("catalog");
  };

  const handleConfirm = () => {
    const heroId = submissionGate.current.tryStart(selectedDraftHeroId, canConfirm);
    if (!heroId) return;
    setSubmissionError(null);
    setSubmission({
      heroId,
      historyLength: draft.history.length,
      clientLogLength: vm.clientLog.length,
    });
    sendDraftCandidateCommand({
      phase: draft.phase,
      heroId,
      ban: vm.draftBanHero,
      pick: vm.draftPickHero,
    });
  };

  const banCount = draft.history.filter((event) => event.type === "ban").length;
  const pickCount = draft.history.filter((event) => event.type === "pick").length;
  const phaseCount =
    draft.phase === "ban"
      ? `${banCount}/${DRAFT_TOTAL_BANS}`
      : draft.phase === "pick"
        ? `${pickCount}/${DRAFT_TOTAL_PICKS}`
        : `${DRAFT_TOTAL_PICKS}/${DRAFT_TOTAL_PICKS}`;
  const activeOrder =
    draft.phase === "ban"
      ? DRAFT_BAN_ORDER
      : draft.phase === "pick"
        ? getDraftPickOrder()
        : [];

  const mobileTabs = [
    { value: "catalog" as const, label: t("draft.tabsCatalog") },
    { value: "selected" as const, label: t("draft.tabsSelected") },
    { value: "rosters" as const, label: t("draft.tabsRosters") },
    { value: "history" as const, label: t("draft.tabsHistory") },
  ];
  const selectedHeroName = selectedHero
    ? getHeroDisplayName(selectedHero.id, selectedHero.name, language)
    : selectedDraftHeroId;

  return (
    <div className={`app-shell px-2 py-2 sm:px-4 sm:py-4 lg:px-5 ${isMobile ? "pb-44" : ""}`}>
      <div className="mx-auto max-w-[1720px] space-y-4">
        <div className={isMobile ? "sticky top-0 z-30 space-y-2" : ""}>
        <PanelCard variant="hud" className="p-3 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="section-kicker">{getGameModeName("draft", t)}</div>
              <h1 className="fate-brand mt-1 text-2xl">{t("draft.safeClassDraft")}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge tone={draft.phase === "ban" ? "danger" : draft.phase === "pick" ? "info" : "success"}>
                  {t(`draft.phases.${draft.phase}`)} {phaseCount}
                </StatusBadge>
                <StatusBadge tone="special">{t("draft.currentPlayer", { player: draft.currentPlayer })}</StatusBadge>
                <StatusBadge tone={isLocalTurn ? "success" : "neutral"}>
                  {isLocalTurn ? t("draft.yourTurn") : t("draft.waitingTurn")}
                </StatusBadge>
              </div>
              {activeOrder.length > 0 ? (
                <div className="mt-2 hidden max-w-full items-center gap-1 overflow-x-auto pb-1 sm:flex" aria-label={t("draft.draftOrder")}>
                  <span className="mr-1 shrink-0 text-[10px] font-black uppercase tracking-wider text-stone-500">
                    {t("draft.draftOrder")}
                  </span>
                  {activeOrder.map((player, index) => (
                    <span
                      key={`${draft.phase}-${index}`}
                      className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
                        index === draft.stepIndex
                          ? "border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                          : index < draft.stepIndex
                            ? "border-stone-300 text-stone-400 line-through dark:border-stone-700"
                            : "border-stone-300 text-stone-600 dark:border-stone-700 dark:text-stone-300"
                      }`}
                    >
                      {index + 1}. {player}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-1 max-w-full truncate font-mono text-[11px] text-stone-500 dark:text-stone-400">
                {t("game.room")} {vm.roomId ?? "-"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={vm.handleLeave} disabled={vm.leavingRoom}>
                {vm.leavingRoom ? t("game.leaving") : t("game.leaveMatch")}
              </button>
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>
        </PanelCard>
        {isMobile ? (
          <Tabs
            value={mobileTab}
            items={mobileTabs}
            onChange={setMobileTab}
            ariaLabel={t("draft.mobileTabs")}
            className="draft-mobile-tabs bg-stone-100/95 p-1 shadow-lg backdrop-blur dark:bg-stone-950/95"
          />
        ) : null}
        </div>

        <div className={`grid items-start gap-4 xl:grid-cols-[230px_minmax(0,1fr)_380px] ${isMobile ? "block" : ""}`}>
          <div className={`space-y-3 ${isMobile && mobileTab !== "rosters" ? "hidden" : ""}`} data-testid="draft-mobile-rosters">
            <RosterColumn player="P1" draft={draft} heroById={heroById} />
            <RosterColumn player="P2" draft={draft} heroById={heroById} />
          </div>

          <PanelCard className={`min-w-0 p-3 sm:p-5 ${isMobile && mobileTab !== "catalog" ? "hidden" : ""}`} data-testid="draft-mobile-catalog">
            <SectionHeader
              kicker={t("draft.catalogKicker")}
              title={t("draft.heroCatalog")}
              description={t("draft.catalogDescription")}
            />
            {loading ? (
              <div className="mt-5 text-sm text-slate-500 dark:text-slate-400">{t("figureSet.loadingHeroes")}</div>
            ) : (
              <div className="mt-5 space-y-5">
                {DRAFT_CLASSES.map((unitClass) => (
                  <section key={unitClass}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {classLabel(unitClass, t)}
                      </h2>
                      <StatusBadge tone="neutral">{(poolByClass.get(unitClass) ?? []).length}</StatusBadge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      {(poolByClass.get(unitClass) ?? []).map((hero) => {
                        const lockReason = getDraftHeroLockReason({
                          draft,
                          draftPool: vm.roomMeta.draftPool,
                          hero,
                          seat: vm.seat,
                        });
                        return (
                          <DraftHeroCardView
                            key={hero.heroId}
                            hero={hero}
                            meta={heroById.get(hero.heroId) ?? null}
                            state={getDraftHeroCardState({
                              draft,
                              draftPool: vm.roomMeta.draftPool,
                              hero,
                              seat: vm.seat,
                              selectedHeroId: selectedDraftHeroId,
                            })}
                            lockReason={lockReason}
                            pickedBy={getPickedHeroOwner(draft, hero.heroId)}
                            language={language}
                            t={t}
                            onSelect={handleSelectHero}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </PanelCard>

          <aside className={`min-h-0 ${isMobile && mobileTab !== "selected" ? "hidden" : ""} md:sticky md:top-3 md:h-[calc(100dvh-12rem)] xl:pr-1`} data-testid="draft-mobile-selected">
            <DraftHeroDetailsView
              hero={selectedHero}
              draftMeta={selectedDraftMeta}
              phase={draft.phase}
              lockReason={selectedLockReason}
              pickedBy={selectedPickedBy}
              language={language}
              t={t}
              canConfirm={canConfirm}
              isLocalTurn={isLocalTurn}
              isConfirming={!!submission}
              error={submissionError}
              onConfirm={handleConfirm}
              onClear={handleClearSelection}
              currentPlayer={draft.currentPlayer}
              showConfirmArea={!isMobile}
              collapsibleAbilities={isMobile}
            />
          </aside>
        </div>

        <div className={`grid gap-4 lg:grid-cols-2 ${isMobile && mobileTab !== "history" ? "hidden" : ""}`} data-testid="draft-mobile-history">
          <PanelCard className="p-4">
            <SectionHeader kicker={t("draft.bans")} title={t("draft.history")} description={t("draft.historyDescription")} />
            <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto text-xs sm:grid-cols-2">
              {draft.history.length === 0 ? (
                <div className="text-slate-500 dark:text-slate-400">{t("draft.noHistory")}</div>
              ) : (
                draft.history.map((event, index) => {
                  const hero = heroById.get(event.heroId);
                  const name = hero ? getHeroDisplayName(hero.id, hero.name, language) : event.heroId;
                  return (
                    <div key={`${event.type}-${event.heroId}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-800 dark:bg-slate-950/45">
                      <span className="truncate">{event.player} {t(`draft.eventTypes.${event.type}`)} <strong>{name}</strong></span>
                      <StatusBadge tone={event.type === "ban" ? "danger" : "success"}>{classLabel(event.primaryClass, t)}</StatusBadge>
                    </div>
                  );
                })
              )}
            </div>
          </PanelCard>
          <EventLog events={vm.events} clientLog={vm.clientLog} />
        </div>
      </div>
      {isMobile ? (
        <DraftConfirmBar
          heroName={selectedHeroName}
          heroClass={selectedDraftMeta?.primaryClass ?? null}
          phase={draft.phase}
          lockReason={selectedLockReason}
          t={t}
          canConfirm={canConfirm}
          isLocalTurn={isLocalTurn}
          isConfirming={!!submission}
          error={submissionError}
          onConfirm={handleConfirm}
          onClear={handleClearSelection}
          currentPlayer={draft.currentPlayer}
          mobile
          testId="draft-mobile-confirm"
          confirmTestId="confirm-draft-hero-mobile"
        />
      ) : null}
    </div>
  );
}
