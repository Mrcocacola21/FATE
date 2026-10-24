import type { DraftPhase, HeroDraftMeta, HeroMeta, PlayerId, UnitClass } from "rules";
import { getHeroVisualVariants, getTokenSrc } from "../assets/registry";
import { classBadge } from "../game/components/RightPanel/rightPanelHelpers";
import { Badge } from "../ui";
import { FigureSetAbilityCard } from "../components/abilities/FigureSetAbilityCard";
import { PanelCard, SectionHeader } from "../components/ui";
import type { Language, Translate } from "../i18n";
import {
  getAbilityDisplay,
  getAbilityTypeLabel,
  getClassLabel,
  getHeroDisplayName,
  getStatLabel,
} from "../i18n/displayMetadata";
import type { DraftHeroCardState, DraftHeroLockReason } from "./draftPool";

type DraftHeroCardViewProps = {
  hero: HeroDraftMeta;
  meta: HeroMeta | null;
  state: DraftHeroCardState;
  lockReason: DraftHeroLockReason | null;
  pickedBy: PlayerId | null;
  language: Language;
  t: Translate;
  onSelect: (heroId: string) => void;
};

export function DraftHeroCardView({
  hero,
  meta,
  state,
  lockReason,
  pickedBy,
  language,
  t,
  onSelect,
}: DraftHeroCardViewProps) {
  const name = meta ? getHeroDisplayName(meta.id, meta.name, language) : hero.heroId;
  const banned = lockReason === "banned";
  const picked = lockReason === "picked" || !!pickedBy;
  const statusKey = banned
    ? "banned"
    : picked
      ? "picked"
      : state === "available" || state === "selected"
        ? "available"
        : "locked";
  const status = pickedBy
    ? t("draft.pickedBy", { player: pickedBy })
    : lockReason
      ? t(`draft.lockReasons.${lockReason}`)
      : t(`draft.status.${statusKey}`);

  return (
    <button
      type="button"
      data-testid={`draft-hero-${hero.heroId}`}
      aria-pressed={state === "selected"}
      aria-label={`${name} · ${status}`}
      title={`${name} · ${status}`}
      data-state={state}
      data-owner={pickedBy ?? undefined}
      className="draft-hero-card draft-hero-tile"
      onClick={() => onSelect(hero.heroId)}
    >
      <img
        src={getTokenSrc(hero.heroId)}
        alt=""
        className={`draft-hero-tile__token ${banned ? "grayscale" : ""}`}
      />
      <span className="draft-hero-tile__name">{name}</span>
    </button>
  );
}

type DraftHeroDetailsViewProps = {
  hero: HeroMeta | null;
  draftMeta: HeroDraftMeta | null;
  phase: DraftPhase;
  lockReason: DraftHeroLockReason | null;
  pickedBy: PlayerId | null;
  language: Language;
  t: Translate;
  canConfirm: boolean;
  isLocalTurn: boolean;
  isConfirming: boolean;
  error: string | null;
  onConfirm: () => void;
  onClear?: () => void;
  currentPlayer?: PlayerId;
  showConfirmArea?: boolean;
  collapsibleAbilities?: boolean;
};

type DraftConfirmBarProps = {
  heroName: string | null;
  heroClass: UnitClass | null;
  phase: DraftPhase;
  lockReason: DraftHeroLockReason | null;
  t: Translate;
  canConfirm: boolean;
  isLocalTurn: boolean;
  isConfirming: boolean;
  error: string | null;
  onConfirm: () => void;
  onClear?: () => void;
  currentPlayer?: PlayerId;
  mobile?: boolean;
  testId?: string;
  confirmTestId?: string;
};

export function DraftConfirmBar({
  heroName,
  heroClass,
  phase,
  lockReason,
  t,
  canConfirm,
  isLocalTurn,
  isConfirming,
  error,
  onConfirm,
  onClear,
  currentPlayer,
  mobile = false,
  testId = "draft-confirm-bar",
  confirmTestId = "confirm-draft-hero",
}: DraftConfirmBarProps) {
  const actionLabel =
    phase === "ban"
      ? t("draft.confirmBan")
      : phase === "pick"
        ? t("draft.confirmPick")
        : t("draft.phases.complete");
  const cannotLabel = phase === "ban" ? t("draft.cannotBanHero") : t("draft.cannotPickHero");
  const heroClassLabel = heroClass ? getClassLabel(heroClass, t) : null;
  const disabledReason = isConfirming
    ? null
    : !heroName
      ? t("draft.selectHeroFirst")
      : phase === "complete"
        ? t("draft.lockReasons.draft_complete")
        : lockReason === "not_current_player" || !isLocalTurn
          ? t("draft.notYourTurn")
          : lockReason
            ? `${cannotLabel}: ${t(`draft.lockReasons.${lockReason}`)}`
            : !canConfirm
              ? t("draft.cannotConfirmHero")
              : null;
  const actionDescription = disabledReason
    ? disabledReason
    : phase === "ban"
      ? t("draft.willBanHero", { hero: heroName ?? "" })
      : phase === "pick"
        ? t("draft.willAddHeroToSlot", {
            hero: heroName ?? "",
            class: heroClassLabel ?? "",
          })
        : t("draft.lockReasons.draft_complete");

  return (
    <div
      className={
        mobile
          ? "draft-mobile-confirm"
          : "draft-confirm-bar shrink-0 border-t border-amber-900/20 bg-stone-100/90 p-4 backdrop-blur dark:border-amber-400/20 dark:bg-stone-950/85"
      }
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-wider text-stone-500">
            {t("draft.currentAction")}: {t(`draft.phases.${phase}`)}
            {currentPlayer ? ` · ${t("draft.currentPlayer", { player: currentPlayer })}` : null}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-stone-800 dark:text-stone-100">
            {heroName
              ? `${t("draft.selected")}: ${heroName}${heroClassLabel ? ` (${heroClassLabel})` : ""}`
              : t("draft.noHeroSelected")}
          </div>
        </div>
      </div>

      <div
        className={`mt-1 text-xs leading-5 ${
          disabledReason
            ? "font-semibold text-rose-700 dark:text-rose-300"
            : "text-stone-600 dark:text-stone-300"
        }`}
        data-testid={disabledReason ? "draft-confirm-disabled-reason" : undefined}
        aria-live="polite"
      >
        {actionDescription}
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        {heroName && onClear ? (
          <button
            type="button"
            className="btn btn-secondary min-h-11 shrink-0"
            disabled={isConfirming}
            onClick={onClear}
          >
            {t("draft.clearSelection")}
          </button>
        ) : null}
        <button
          type="button"
          data-testid={confirmTestId}
          className={`btn min-h-11 flex-1 ${phase === "ban" ? "btn-danger" : "btn-strong"}`}
          disabled={!canConfirm || isConfirming}
          onClick={onConfirm}
        >
          {isConfirming ? t("draft.confirming") : actionLabel}
        </button>
      </div>
    </div>
  );
}

export function DraftHeroDetailsView({
  hero,
  draftMeta,
  phase,
  lockReason,
  pickedBy,
  language,
  t,
  canConfirm,
  isLocalTurn,
  isConfirming,
  error,
  onConfirm,
  onClear,
  currentPlayer,
  showConfirmArea = true,
  collapsibleAbilities = false,
}: DraftHeroDetailsViewProps) {
  const heroName = hero
    ? getHeroDisplayName(hero.id, hero.name, language)
    : (draftMeta?.heroId ?? null);
  const variants = getHeroVisualVariants(draftMeta?.heroId ?? "");
  const abilities = hero?.abilities ?? [];
  const abilityGroups = (["passive", "active", "impulse", "phantasm"] as const)
    .map((type) => ({
      type,
      label: getAbilityTypeLabel(type, t),
      abilities: abilities.filter((ability) => ability.type === type),
    }))
    .filter((group) => group.abilities.length > 0);

  return (
    <PanelCard
      className="flex h-full min-h-0 flex-col overflow-hidden p-0"
      variant="parchment"
      data-testid="selected-draft-hero-panel"
    >
      <div className="shrink-0 p-4">
        <SectionHeader kicker={t("draft.heroPreview")} title={t("draft.heroDetails")} />
      </div>

      {!draftMeta ? (
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6"
          data-testid="draft-hero-details-scroll"
        >
          <div className="mx-4 mb-4 rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center dark:border-stone-700">
            <div className="font-semibold text-stone-700 dark:text-stone-200">
              {t("draft.noHeroSelected")}
            </div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              {t("draft.selectHeroFirst")}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-6 text-sm text-slate-700 dark:text-slate-200"
            data-testid="draft-hero-details-scroll"
          >
            <div className="panel-card-muted relative overflow-hidden p-3">
              <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-amber-500/70" />
              <div className="flex items-center gap-3">
                <div className="relative h-20 w-20 shrink-0">
                  <img
                    src={getTokenSrc(draftMeta.heroId)}
                    alt=""
                    className="h-full w-full rounded-xl border border-amber-500/25 bg-white object-contain shadow-xl shadow-black/15 ring-2 ring-amber-500/55 dark:bg-slate-900"
                  />
                  <span className="absolute -bottom-1 -right-1 rounded-lg border border-white/20 bg-stone-950 px-1.5 py-0.5 text-[10px] font-bold text-white shadow dark:bg-amber-400 dark:text-stone-950">
                    {classBadge(draftMeta.primaryClass).label}
                    {classBadge(draftMeta.primaryClass).marker ?? ""}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="fate-brand truncate text-lg">{heroName}</div>
                    {pickedBy ? (
                      <Badge variant={pickedBy === "P1" ? "ownerP1" : "ownerP2"}>{pickedBy}</Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {t("game.class", { class: getClassLabel(draftMeta.primaryClass, t) })}
                  </div>
                  {hero ? (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-3 flex-1 overflow-hidden rounded-full border border-black/10 bg-stone-200 shadow-inner dark:border-white/10 dark:bg-stone-900">
                        <div className="h-full w-full rounded-full bg-emerald-500" />
                      </div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {hero.baseStats.hp}/{hero.baseStats.hp} {t("game.healthShort")}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className={`status-pill ${
                  lockReason === "banned"
                    ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-200"
                    : lockReason
                      ? "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-200"
                }`}
              >
                {lockReason ? t(`draft.lockReasons.${lockReason}`) : t("draft.status.available")}
              </span>
              {hero ? (
                <>
                  <span className="status-pill border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-200">
                    {t("game.damage", { value: hero.baseStats.damage })}
                  </span>
                  <span className="status-pill border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {t("figureSet.movement", { value: getStatLabel(hero.baseStats.moveType, t) })}
                  </span>
                  <span className="status-pill border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {t("figureSet.attack", { value: getStatLabel(hero.baseStats.attackRange, t) })}
                  </span>
                </>
              ) : null}
            </div>

            {hero?.description ? (
              <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">
                {hero.description === "Base unit." ? t("figureSet.subtitle") : hero.description}
              </p>
            ) : null}

            {variants.length > 0 ? (
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-stone-500">
                  {t("figureSet.availableForms")}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {variants.map((variant) => (
                    <div
                      key={variant.id}
                      className="flex items-center gap-2 rounded-lg border border-violet-300/50 bg-violet-50/70 p-2 dark:border-violet-800 dark:bg-violet-950/30"
                    >
                      <img
                        src={variant.token}
                        alt=""
                        className="h-9 w-9 rounded-md object-contain"
                      />
                      <span className="text-xs font-semibold">{t(variant.labelKey)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div
              data-testid="draft-ability-details"
              className="border-t border-amber-900/10 pt-4 dark:border-amber-500/15"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
                {t("game.abilities")}
              </div>
              <div className="mt-2 space-y-3">
                {abilityGroups.length === 0 ? (
                  <div className="text-xs text-stone-500">{t("figureSet.noAbilities")}</div>
                ) : (
                  abilityGroups.map((group) => (
                    <div key={group.type} className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-wider text-stone-400">
                        {group.label}
                      </div>
                      {group.abilities.map((ability) => {
                        if (!collapsibleAbilities) {
                          return <FigureSetAbilityCard key={ability.id} ability={ability} />;
                        }
                        const abilityName = getAbilityDisplay(
                          ability.id,
                          ability.name,
                          ability.description,
                          language,
                        ).name;
                        return (
                          <details
                            key={ability.id}
                            className="rounded-xl border border-stone-300 bg-white/70 dark:border-stone-700 dark:bg-stone-950/40"
                          >
                            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-bold">
                              <span>{abilityName}</span>
                              <span aria-hidden="true">⌄</span>
                              <span className="sr-only">
                                {t("draft.showAbility", { ability: abilityName })}
                              </span>
                            </summary>
                            <div className="border-t border-stone-200 p-2 dark:border-stone-800">
                              <FigureSetAbilityCard ability={ability} />
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {showConfirmArea ? (
        <DraftConfirmBar
          heroName={heroName}
          heroClass={draftMeta?.primaryClass ?? null}
          phase={phase}
          lockReason={lockReason}
          t={t}
          canConfirm={canConfirm}
          isLocalTurn={isLocalTurn}
          isConfirming={isConfirming}
          error={error}
          onConfirm={onConfirm}
          onClear={onClear}
          currentPlayer={currentPlayer}
        />
      ) : null}
    </PanelCard>
  );
}
