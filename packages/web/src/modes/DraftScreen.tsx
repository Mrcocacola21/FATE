import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DraftLockReason,
  DraftOrderStep,
  DraftState,
  HeroDraftMeta,
  HeroMeta,
  PlayerId,
  UnitClass,
} from "rules";
import { EventLog } from "../components/EventLog";
import { PanelCard, SectionHeader, StatusBadge } from "../components/ui";
import { getTokenSrc } from "../catalog/tokens";
import { useHeroes } from "../figures/useHeroes";
import { useI18n, type Translate } from "../i18n";
import { getHeroDisplayName } from "../i18n/displayMetadata";
import { DraftConfirmBar, DraftHeroCardView, DraftHeroDetailsView } from "./DraftHeroPreview";
import { getGameModeName } from "./modeLabels";
import { useIsMobile } from "../layout/useIsMobile";
import { Tabs } from "../ui";
import { SettingsDrawer } from "../ui/SettingsDrawer";
import { TacticalIcon } from "../ui/TacticalIcon";
import type { DraftClientChoice } from "../ws";
import { DraftPrivileges } from "./DraftPrivileges";
import { ruleDeclarationKey } from "../game/gameshell-content/components/RuleDeclarationChoicePanel";
import {
  createDraftSubmissionGate,
  getDraftHeroCardState,
  getDraftHeroLockReason,
  getPickedHeroOwner,
  groupDraftPoolByClass,
  isDraftHeroEvent,
  sendDraftCandidateCommand,
} from "./draftPool";

// The web bundle imports only types from "rules"; runtime values are mirrored here.
const DRAFT_CLASSES: UnitClass[] = [
  "knight",
  "spearman",
  "rider",
  "archer",
  "assassin",
  "trickster",
  "berserker",
];

const PRIVILEGE_PHASES = new Set<DraftState["phase"]>([
  "initiative",
  "right",
  "draftSide",
  "fieldSide",
  "rule",
]);

type DraftVm = {
  roomId: string | null;
  role: string | null;
  seat: PlayerId | null;
  isHost: boolean;
  roomMeta: {
    gameMode: "draft";
    draftState: DraftState;
    draftPool: HeroDraftMeta[];
    playerNames?: { P1: string | null; P2: string | null };
    draftOrder?: DraftOrderStep[];
    draftOrderIndex?: number;
    draftBanLocks?: Record<string, DraftLockReason | null>;
  };
  events: import("rules").ProjectedGameEvent[];
  clientLog: string[];
  leavingRoom: boolean;
  handleLeave: () => void;
  draftBanHero: (heroId: string) => void;
  draftPickHero: (heroId: string) => void;
  draftChoice: (choice: DraftClientChoice) => void;
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
  isSelf,
  draft,
  heroById,
  candidate,
}: {
  player: PlayerId;
  isSelf: boolean;
  draft: DraftState;
  heroById: Map<string, HeroMeta>;
  candidate: HeroDraftMeta | null;
}) {
  const { language, t } = useI18n();
  const filled = DRAFT_CLASSES.filter((unitClass) => draft.picks[player][unitClass]).length;
  return (
    <div
      className="draft-roster panel-card-muted p-3"
      data-player={player}
      data-current={
        draft.currentPlayer === player && draft.phase !== "complete" ? "true" : undefined
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="draft-roster__title text-sm font-bold">
          {isSelf ? t("draft.yourPicks") : t("draft.opponentPicks")} · {filled}/
          {DRAFT_CLASSES.length}
        </h2>
        <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400">{player}</span>
      </div>
      <div className="mt-2 grid gap-1.5">
        {DRAFT_CLASSES.map((unitClass) => {
          const heroId = draft.picks[player][unitClass];
          const hero = heroId ? heroById.get(heroId) : null;
          const pending =
            !heroId && candidate?.primaryClass === unitClass
              ? heroById.get(candidate.heroId)
              : null;
          const shown = hero ?? pending;
          return (
            <div
              key={unitClass}
              className="draft-roster-slot"
              data-filled={hero ? "true" : undefined}
              data-pending={pending ? "true" : undefined}
            >
              {shown ? (
                <img
                  src={getTokenSrc(shown.id)}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="h-7 w-7 shrink-0 rounded-md bg-stone-200/70 dark:bg-stone-800/70" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[10px] text-stone-500 dark:text-stone-400">
                  {classLabel(unitClass, t)}
                </span>
                <span className="truncate text-xs font-semibold">
                  {shown
                    ? getHeroDisplayName(shown.id, shown.name, language)
                    : t("draft.emptySlot")}
                </span>
              </span>
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const submissionGate = useRef(createDraftSubmissionGate());

  const heroById = useMemo(() => new Map(heroes.map((hero) => [hero.id, hero])), [heroes]);
  const poolByClass = useMemo(
    () => groupDraftPoolByClass(vm.roomMeta.draftPool),
    [vm.roomMeta.draftPool],
  );
  const selectedDraftMeta = useMemo(
    () => vm.roomMeta.draftPool.find((hero) => hero.heroId === selectedDraftHeroId) ?? null,
    [selectedDraftHeroId, vm.roomMeta.draftPool],
  );
  const selectedHero = selectedDraftHeroId ? (heroById.get(selectedDraftHeroId) ?? null) : null;
  const selectedLockReason = selectedDraftMeta
    ? getDraftHeroLockReason({
        draft,
        draftPool: vm.roomMeta.draftPool,
        hero: selectedDraftMeta,
        seat: vm.seat,
        banLocks: vm.roomMeta.draftBanLocks,
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
      .some(
        (event) =>
          isDraftHeroEvent(event) && event.heroId === submission.heroId && event.player === vm.seat,
      );
    if (accepted) {
      submissionGate.current.release();
      setSubmission(null);
      setSubmissionError(null);
      setSelectedDraftHeroId((current) => (current === submission.heroId ? null : current));
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

  const rosterOrder: PlayerId[] = vm.seat === "P2" ? ["P2", "P1"] : ["P1", "P2"];
  const preparing = PRIVILEGE_PHASES.has(draft.phase);
  const order = vm.roomMeta.draftOrder ?? [];
  const orderIndex = vm.roomMeta.draftOrderIndex ?? -1;
  const banLocks = vm.roomMeta.draftBanLocks;
  const totalBans = order.filter((step) => step.kind === "ban").length;
  const totalPicks = order.filter((step) => step.kind === "pick").length;
  const banCount = draft.history.filter(
    (event) => event.type === "ban" || event.type === "banSkipped",
  ).length;
  const pickCount = draft.history.filter((event) => event.type === "pick").length;
  const phaseCount =
    draft.phase === "ban"
      ? `${banCount}/${totalBans}`
      : draft.phase === "pick"
        ? `${pickCount}/${totalPicks}`
        : draft.phase === "complete"
          ? `${totalPicks}/${totalPicks}`
          : "";
  const banRound = draft.phase === "ban" ? (order[orderIndex]?.round ?? 1) : null;
  const phaseLabel =
    draft.phase === "ban" && banRound === 2 ? t("draft.phases.ban2") : t(`draft.phases.${draft.phase}`);
  const names = {
    P1: vm.roomMeta.playerNames?.P1 || "P1",
    P2: vm.roomMeta.playerNames?.P2 || "P2",
  };
  const privileges = draft.privileges;
  const historyEvents = draft.history.filter(isDraftHeroEvent);

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
                  <StatusBadge
                    tone={
                      draft.phase === "ban" ? "danger" : draft.phase === "pick" ? "info" : "success"
                    }
                  >
                    {phaseLabel} {phaseCount}
                  </StatusBadge>
                  <StatusBadge tone="special">
                    {t("draft.currentPlayer", { player: names[draft.currentPlayer] })}
                  </StatusBadge>
                  <StatusBadge tone={isLocalTurn ? "success" : "neutral"}>
                    {isLocalTurn ? t("draft.yourTurn") : t("draft.waitingTurn")}
                  </StatusBadge>
                </div>
                {privileges?.ruleId && privileges.placementFirst ? (
                  <p className="draft-settled mt-2" data-testid="draft-settled">
                    <span>
                      {t("draftPrep.settledRule", {
                        rule: t(`ruleDeclarations.${ruleDeclarationKey(privileges.ruleId)}.name`),
                      })}
                    </span>
                    <span>{t("draftPrep.settledPlacement", { player: names[privileges.placementFirst] })}</span>
                  </p>
                ) : null}
                {!preparing && draft.phase !== "complete" ? (
                  <ol className="draft-order mt-2" aria-label={t("draft.draftOrder")}>
                    {order.map((orderStep, index) => (
                      <li
                        key={index}
                        data-kind={orderStep.kind}
                        data-round={orderStep.round}
                        data-state={index === orderIndex ? "current" : index < orderIndex ? "done" : "next"}
                        data-mine={orderStep.player === vm.seat || undefined}
                        data-break={(index > 0 && order[index - 1].kind !== orderStep.kind) || undefined}
                        aria-current={index === orderIndex ? "step" : undefined}
                        title={`${t(`draft.phases.${orderStep.kind}`)} · ${names[orderStep.player]}`}
                      >
                        <span className="sr-only">
                          {t(`draft.phases.${orderStep.kind}`)} {names[orderStep.player]}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <div className="mt-1 max-w-full truncate font-mono text-[11px] text-stone-500 dark:text-stone-400">
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
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  aria-label={t("mobile.settings")}
                  data-testid="draft-settings"
                  onClick={() => setSettingsOpen(true)}
                >
                  <TacticalIcon name="settings" />
                </button>
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

        {preparing ? (
          <DraftPrivileges
            draft={draft}
            seat={vm.seat}
            names={names}
            clientLog={vm.clientLog}
            onChoice={vm.draftChoice}
          />
        ) : (
        <>
        <div
          className={`grid items-start gap-4 lg:grid-cols-[200px_minmax(0,1fr)_320px] xl:grid-cols-[220px_minmax(0,1fr)_360px] ${isMobile ? "block" : ""}`}
        >
          <div
            className={`space-y-3 ${isMobile && mobileTab !== "rosters" ? "hidden" : ""}`}
            data-testid="draft-mobile-rosters"
          >
            {rosterOrder.map((player) => (
              <RosterColumn
                key={player}
                player={player}
                isSelf={player === vm.seat}
                draft={draft}
                heroById={heroById}
                candidate={
                  player === vm.seat && draft.phase === "pick" && !selectedLockReason
                    ? selectedDraftMeta
                    : null
                }
              />
            ))}
          </div>

          <PanelCard
            className={`min-w-0 p-3 sm:p-5 ${isMobile && mobileTab !== "catalog" ? "hidden" : ""}`}
            data-testid="draft-mobile-catalog"
          >
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
              <div className="draft-class-grid mt-4">
                {DRAFT_CLASSES.map((unitClass) => {
                  const pool = poolByClass.get(unitClass) ?? [];
                  return (
                    <section
                      key={unitClass}
                      className="draft-class-column"
                      data-current={
                        selectedDraftMeta?.primaryClass === unitClass ? "true" : undefined
                      }
                      aria-label={classLabel(unitClass, t)}
                    >
                      <h2 className="draft-class-column__title">
                        <span>{classLabel(unitClass, t)}</span>
                        <span className="font-medium text-stone-500 dark:text-stone-400">
                          {pool.length}
                        </span>
                      </h2>
                      <div className="draft-class-column__heroes">
                        {pool.map((hero) => (
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
                              banLocks,
                            })}
                            lockReason={getDraftHeroLockReason({
                              draft,
                              draftPool: vm.roomMeta.draftPool,
                              hero,
                              seat: vm.seat,
                              banLocks,
                            })}
                            pickedBy={getPickedHeroOwner(draft, hero.heroId)}
                            language={language}
                            t={t}
                            onSelect={handleSelectHero}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </PanelCard>

          <aside
            className={`min-h-0 ${isMobile && mobileTab !== "selected" ? "hidden" : ""} md:sticky md:top-3 md:h-[calc(100dvh-12rem)] xl:pr-1`}
            data-testid="draft-mobile-selected"
          >
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

        <div
          className={`grid gap-4 lg:grid-cols-2 ${isMobile && mobileTab !== "history" ? "hidden" : ""}`}
          data-testid="draft-mobile-history"
        >
          <PanelCard className="p-4">
            <SectionHeader
              kicker={t("draft.bans")}
              title={t("draft.history")}
              description={t("draft.historyDescription")}
            />
            <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto text-xs sm:grid-cols-2">
              {historyEvents.length === 0 ? (
                <div className="text-slate-500 dark:text-slate-400">{t("draft.noHistory")}</div>
              ) : (
                historyEvents.map((event, index) => {
                  const hero = heroById.get(event.heroId);
                  const name = hero
                    ? getHeroDisplayName(hero.id, hero.name, language)
                    : event.heroId;
                  return (
                    <div
                      key={`${event.type}-${event.heroId}-${index}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-800 dark:bg-slate-950/45"
                    >
                      <span className="truncate">
                        {names[event.player]} {t(`draft.eventTypes.${event.type}`)} <strong>{name}</strong>
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
        </>
        )}
      </div>
      {isMobile && !preparing ? (
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
      {settingsOpen ? <SettingsDrawer onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
