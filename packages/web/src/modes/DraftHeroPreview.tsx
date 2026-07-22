import type { DraftPhase, HeroDraftMeta, HeroMeta, PlayerId, UnitClass } from "rules";
import { getFigureArtSrc, getHeroVisualVariants, getTokenSrc } from "../assets/registry";
import { FigureSetAbilityCard } from "../components/abilities/FigureSetAbilityCard";
import { PanelCard, SectionHeader, StatusBadge } from "../components/ui";
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

const CARD_STYLES: Record<DraftHeroCardState, string> = {
  available:
    "border-amber-300/80 bg-white text-slate-900 hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-lg hover:shadow-amber-950/10 dark:border-amber-800/70 dark:bg-slate-900 dark:text-white",
  selected:
    "border-cyan-400 bg-cyan-50/90 text-slate-950 ring-2 ring-cyan-400/60 shadow-lg shadow-cyan-950/15 dark:border-cyan-400 dark:bg-cyan-950/30 dark:text-white",
  picked:
    "border-emerald-300 bg-emerald-50/45 text-slate-600 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-slate-300",
  banned:
    "border-rose-300 bg-rose-50/45 text-slate-500 dark:border-rose-900 dark:bg-rose-950/20 dark:text-slate-400",
  locked:
    "border-slate-300 bg-slate-100/80 text-slate-500 dark:border-slate-800 dark:bg-slate-950/55 dark:text-slate-400",
  not_draftable:
    "border-slate-300 bg-slate-100/80 text-slate-500 dark:border-slate-800 dark:bg-slate-950/55 dark:text-slate-400",
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
  const name = meta
    ? getHeroDisplayName(meta.id, meta.name, language)
    : hero.heroId;
  const banned = lockReason === "banned";
  const picked = lockReason === "picked" || !!pickedBy;
  const firstAbility = meta?.abilities[0];
  const firstAbilityDescription = firstAbility
    ? getAbilityDisplay(
        firstAbility.id,
        firstAbility.name,
        firstAbility.description,
        language
      ).description
    : null;
  const statusKey = banned
    ? "banned"
    : picked
      ? "picked"
      : state === "available" || state === "selected"
        ? "available"
        : "locked";
  const tone = banned ? "danger" : picked ? "warning" : statusKey === "available" ? "success" : "neutral";

  return (
    <button
      type="button"
      data-testid={`draft-hero-${hero.heroId}`}
      aria-pressed={state === "selected"}
      className={`relative min-h-40 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/30 ${CARD_STYLES[state]}`}
      onClick={() => onSelect(hero.heroId)}
    >
      {state === "selected" ? (
        <span className="absolute right-2 top-2 rounded-full bg-cyan-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
          ✓ {t("draft.selected")}
        </span>
      ) : null}
      <span className="flex items-start gap-3 pr-12">
        <img
          src={getTokenSrc(hero.heroId)}
          alt=""
          className={`h-14 w-14 rounded-lg object-cover ring-1 ${banned ? "grayscale" : ""}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{name}</span>
          <span className="mt-1 block text-xs opacity-65">
            {getClassLabel(hero.primaryClass, t)}
          </span>
          <span className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge tone={tone}>{t(`draft.status.${statusKey}`)}</StatusBadge>
            {pickedBy ? (
              <StatusBadge tone="special">{t("draft.pickedBy", { player: pickedBy })}</StatusBadge>
            ) : null}
          </span>
        </span>
      </span>
      <span className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <span className="rounded-lg bg-black/5 px-2 py-1 dark:bg-white/5">
          {t("game.hp", { hp: meta?.baseStats.hp ?? "-" })}
        </span>
        <span className="rounded-lg bg-black/5 px-2 py-1 dark:bg-white/5">
          {t("game.damage", { value: meta?.baseStats.damage ?? "-" })}
        </span>
      </span>
      <span className="mt-3 block min-h-9 text-xs leading-5 opacity-70">
        {lockReason
          ? t(`draft.lockReasons.${lockReason}`)
          : firstAbilityDescription ?? t("figureSet.noAbilities")}
      </span>
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
        <div role="alert" className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
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
    : draftMeta?.heroId ?? null;
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6" data-testid="draft-hero-details-scroll">
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
          <div className="relative h-40 shrink-0 overflow-hidden border-y border-amber-900/15 bg-stone-900">
            <img
              src={getFigureArtSrc(draftMeta.heroId)}
              alt={heroName ?? draftMeta.heroId}
              className="h-full w-full object-cover object-top opacity-85"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-transparent to-transparent" />
            <div className="absolute inset-x-3 bottom-3 flex items-end gap-3">
              <img
                src={getTokenSrc(draftMeta.heroId)}
                alt=""
                className="h-16 w-16 rounded-xl bg-stone-950/80 object-contain ring-2 ring-amber-400/70"
              />
              <div className="min-w-0 pb-1 text-white">
                <div className="truncate text-xl font-black">{heroName}</div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-200">
                  {getClassLabel(draftMeta.primaryClass, t)}
                </div>
              </div>
            </div>
          </div>

          <div
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-6"
            data-testid="draft-hero-details-scroll"
          >
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={lockReason === "banned" ? "danger" : pickedBy ? "warning" : lockReason ? "neutral" : "success"}>
                {lockReason ? t(`draft.lockReasons.${lockReason}`) : t("draft.status.available")}
              </StatusBadge>
              {pickedBy ? <StatusBadge tone="special">{t("draft.pickedBy", { player: pickedBy })}</StatusBadge> : null}
            </div>

            {hero ? (
              <>
                {hero.description ? (
                  <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">
                    {hero.description === "Base unit." ? t("figureSet.subtitle") : hero.description}
                  </p>
                ) : null}
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wider text-stone-500">
                    {t("figureSet.stats")}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="panel-card-muted px-2.5 py-2">{t("game.hp", { hp: hero.baseStats.hp })}</div>
                    <div className="panel-card-muted px-2.5 py-2">{t("figureSet.damage", { value: hero.baseStats.damage })}</div>
                    <div className="panel-card-muted px-2.5 py-2">{t("figureSet.movement", { value: getStatLabel(hero.baseStats.moveType, t) })}</div>
                    <div className="panel-card-muted px-2.5 py-2">{t("figureSet.attack", { value: getStatLabel(hero.baseStats.attackRange, t) })}</div>
                  </div>
                </div>
              </>
            ) : null}

            {variants.length > 0 ? (
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-stone-500">
                  {t("figureSet.availableForms")}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {variants.map((variant) => (
                    <div key={variant.id} className="flex items-center gap-2 rounded-lg border border-violet-300/50 bg-violet-50/70 p-2 dark:border-violet-800 dark:bg-violet-950/30">
                      <img src={variant.token} alt="" className="h-9 w-9 rounded-md object-contain" />
                      <span className="text-xs font-semibold">{t(variant.labelKey)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div data-testid="draft-ability-details" onClick={(event) => event.stopPropagation()}>
              <div className="text-[11px] font-black uppercase tracking-wider text-stone-500">
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
