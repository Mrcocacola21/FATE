import { useMemo, useRef, useState } from "react";
import { HERO_CATALOG, BASE_HERO_IDS } from "../figures/catalog";
import {
  BASE_CLASSES,
  type BaseClass,
  type FigureSetState,
  type HeroDefinition,
} from "../figures/types";
import {
  exportFigureSetState,
  importFigureSetState,
  loadFigureSetState,
  resetToBaseState,
  saveFigureSetState,
} from "../figures/storage";
import { useHeroes } from "../figures/useHeroes";
import type { AbilityMeta } from "rules";
import { getFigureArtSrc, getTokenSrc } from "../assets/registry";
import { ThemeToggle } from "../components/ThemeToggle";
import { PanelCard, SectionHeader, StatusBadge } from "../components/ui";
import { LECHY_ID } from "../rulesHints";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { useI18n } from "../i18n";
import {
  getAbilityDisplay,
  getAbilityTypeLabel,
  getClassLabel,
  getHeroDisplayName,
  getStatLabel,
  localizeFigureSetError,
  localizeServerText,
} from "../i18n/displayMetadata";

interface FigureSetPageProps {
  onBack?: () => void;
}

function HeroToken({
  heroId,
  label,
  className,
}: {
  heroId: string;
  label: string;
  className: string;
}) {
  const src = getTokenSrc(heroId);
  const missing = src === getTokenSrc("_missing");
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-slate-700 ${className}`}
      aria-hidden="true"
    >
      <img src={src} alt="" className="h-full w-full object-contain" />
      {missing ? (
        <span className="absolute inset-0 flex items-center justify-center bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
          {label.charAt(0).toUpperCase()}
        </span>
      ) : null}
    </span>
  );
}

export function FigureSetPage({ onBack }: FigureSetPageProps) {
  const { language, t } = useI18n();
  const [state, setState] = useState<FigureSetState>(() => loadFigureSetState(HERO_CATALOG));
  const [activeSlot, setActiveSlot] = useState<BaseClass | null>(null);
  const [detailsSlot, setDetailsSlot] = useState<BaseClass | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { heroes, loading: heroesLoading, error: heroesError } = useHeroes();

  const heroById = useMemo(() => new Map(HERO_CATALOG.map((hero) => [hero.id, hero])), []);

  const heroMetaById = useMemo(() => new Map(heroes.map((hero) => [hero.id, hero])), [heroes]);

  const heroesByClass = useMemo(() => {
    const map = new Map<BaseClass, HeroDefinition[]>();
    for (const slot of BASE_CLASSES) {
      map.set(
        slot,
        HERO_CATALOG.filter((hero) => hero.mainClass === slot),
      );
    }
    return map;
  }, []);

  const updateSelection = (slot: BaseClass, heroId: string) => {
    const next: FigureSetState = {
      ...state,
      updatedAt: new Date().toISOString(),
      selection: {
        ...state.selection,
        [slot]: heroId,
      },
    };
    setState(next);
    saveFigureSetState(next);
    setDetailsSlot(slot);
  };

  const resetSlot = (slot: BaseClass) => {
    updateSelection(slot, BASE_HERO_IDS[slot]);
  };

  const resetAll = () => {
    const confirmed = window.confirm(t("figureSet.resetConfirm"));
    if (!confirmed) return;
    const next = resetToBaseState();
    setState(next);
    saveFigureSetState(next);
  };

  const handleExport = () => {
    const json = exportFigureSetState(state);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "figure-set.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const handleImportFile = (file: File | null | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      const result = importFigureSetState(content, HERO_CATALOG);
      if (!result.ok) {
        setError(localizeFigureSetError(result.error, t));
        return;
      }
      setState(result.state);
      saveFigureSetState(result.state);
      setError(null);
    };
    reader.onerror = () => {
      setError(t("errors.readFile"));
    };
    reader.readAsText(file);
  };

  const detailsHero = useMemo(() => {
    if (!detailsSlot) return null;
    const heroId = state.selection[detailsSlot];
    return heroMetaById.get(heroId) ?? null;
  }, [detailsSlot, heroMetaById, state.selection]);

  const detailsFigureId = detailsSlot ? state.selection[detailsSlot] : null;
  const detailsArtSrc = getFigureArtSrc(detailsFigureId ?? "");

  const abilityGroups = useMemo(() => {
    const groups: Array<{ type: AbilityMeta["type"]; label: string }> = [
      { type: "passive", label: getAbilityTypeLabel("passive", t) },
      { type: "active", label: getAbilityTypeLabel("active", t) },
      { type: "impulse", label: getAbilityTypeLabel("impulse", t) },
      { type: "phantasm", label: getAbilityTypeLabel("phantasm", t) },
    ];
    const abilities = detailsHero?.abilities ?? [];
    return groups.map((group) => ({
      ...group,
      abilities: abilities.filter((ability) => ability.type === group.type),
    }));
  }, [detailsHero, language, t]);

  const formatCharge = (ability: AbilityMeta) => {
    if (ability.chargeRequired === null) return t("figureSet.chargeUnlimited");
    if (typeof ability.chargeRequired === "number") {
      return t("figureSet.charge", { value: ability.chargeRequired });
    }
    return t("figureSet.noCharge");
  };

  const formatCost = (ability: AbilityMeta) => {
    if (ability.consumesAction) return t("figureSet.consumesAction");
    if (ability.consumesMove) return t("figureSet.consumesMove");
    return t("figureSet.freeImpulse");
  };

  const abilityBadgeClass = (type: AbilityMeta["type"]) => {
    switch (type) {
      case "active":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200";
      case "impulse":
        return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200";
      case "phantasm":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200";
      default:
        return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
    }
  };

  return (
    <div className="app-shell px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <PanelCard as="header" className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="section-kicker">{t("figureSet.kicker")}</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {t("figureSet.title")}
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {t("figureSet.subtitle")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => onBack?.()}>
                {t("common.backToRooms")}
              </button>
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <SectionHeader
            kicker={t("figureSet.manageKicker")}
            title={t("figureSet.manageTitle")}
            description={t("figureSet.manageDescription")}
          />
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <label className="field-label" htmlFor="figure-search">
                {t("figureSet.searchHeroes")}
              </label>
              <input
                id="figure-search"
                className="field-control"
                type="search"
                placeholder={t("figureSet.searchPlaceholder")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-strong" onClick={handleExport}>
                {t("figureSet.export")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleImportClick}>
                {t("figureSet.import")}
              </button>
              <button type="button" className="btn btn-warning" onClick={resetAll}>
                {t("figureSet.resetAll")}
              </button>
            </div>
          </div>
        </PanelCard>

        {error && (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
            role="alert"
          >
            {error}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            handleImportFile(file);
            event.target.value = "";
          }}
        />

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-4">
            {BASE_CLASSES.map((slot) => {
              const selectedId = state.selection[slot];
              const selected = heroById.get(selectedId) ?? heroById.get(BASE_HERO_IDS[slot]);
              const normalizedSearch = search.trim().toLowerCase();
              const candidates = (heroesByClass.get(slot) ?? []).filter((hero) => {
                const displayName = getHeroDisplayName(hero.id, hero.name, language);
                return (
                  !normalizedSearch ||
                  hero.name.toLowerCase().includes(normalizedSearch) ||
                  displayName.toLowerCase().includes(normalizedSearch) ||
                  hero.id.toLowerCase().includes(normalizedSearch)
                );
              });
              const selectedName = selected
                ? getHeroDisplayName(selected.id, selected.name, language)
                : t("figureSet.unknownHero");
              return (
                <PanelCard key={slot} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <HeroToken
                        heroId={selected?.id ?? ""}
                        label={selectedName}
                        className="h-12 w-12 rounded-xl shadow-md"
                      />
                      <div className="min-w-0">
                        <div className="section-kicker">
                          {t("figureSet.slot", { class: getClassLabel(slot, t) })}
                        </div>
                        <div className="mt-1 truncate text-base font-semibold text-slate-900 dark:text-white">
                          {selectedName}
                        </div>
                        <StatusBadge tone="success" className="mt-1.5">
                          {t("common.selected")}
                        </StatusBadge>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setDetailsSlot(slot)}
                      >
                        {t("common.details")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-strong btn-sm"
                        onClick={() => setActiveSlot(activeSlot === slot ? null : slot)}
                      >
                        {activeSlot === slot ? t("common.close") : t("common.change")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => resetSlot(slot)}
                      >
                        {t("figureSet.resetBase")}
                      </button>
                    </div>
                  </div>

                  {activeSlot === slot && (
                    <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4 sm:grid-cols-2 dark:border-slate-800">
                      {candidates.length === 0 ? (
                        <div className="col-span-full rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          {t("figureSet.noMatches", { search })}
                        </div>
                      ) : null}
                      {candidates.map((hero) => (
                        <button
                          type="button"
                          key={hero.id}
                          className={`flex items-center gap-3 rounded-xl border p-2.5 text-left text-sm shadow-sm transition focus-visible:ring-4 focus-visible:ring-teal-500/15 ${
                            hero.id === selected?.id
                              ? "border-teal-500 bg-teal-50 text-teal-800 ring-2 ring-teal-500/10 dark:bg-teal-950/40 dark:text-teal-100"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:-translate-y-px hover:border-slate-300 hover:bg-white hover:shadow-md dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                          }`}
                          onClick={() => {
                            updateSelection(slot, hero.id);
                            setActiveSlot(null);
                          }}
                        >
                          <HeroToken
                            heroId={hero.id}
                            label={getHeroDisplayName(hero.id, hero.name, language)}
                            className="h-10 w-10 rounded-lg"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">
                              {getHeroDisplayName(hero.id, hero.name, language)}
                            </span>
                            <span className="block truncate text-xs opacity-65">{hero.id}</span>
                          </span>
                          {hero.id === selected?.id ? (
                            <StatusBadge tone="success">{t("common.current")}</StatusBadge>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                </PanelCard>
              );
            })}
          </div>

          <div className="space-y-4 xl:sticky xl:top-5">
            <PanelCard className="p-4">
              <SectionHeader
                kicker={t("figureSet.currentLoadout")}
                title={t("figureSet.selectedRoster")}
              />
              <div className="mt-3 space-y-2 text-xs">
                {BASE_CLASSES.map((slot) => {
                  const heroId = state.selection[slot];
                  const hero = heroById.get(heroId) ?? heroById.get(BASE_HERO_IDS[slot]);
                  const label = hero
                    ? getHeroDisplayName(hero.id, hero.name, language)
                    : t("figureSet.unknownHero");
                  return (
                    <div
                      key={`preview-${slot}`}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/45"
                    >
                      <HeroToken heroId={heroId} label={label} className="h-9 w-9 rounded-lg" />
                      <div className="flex-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          {getClassLabel(slot, t)}
                        </div>
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PanelCard>

            <PanelCard className="p-4">
              <SectionHeader kicker={t("figureSet.reference")} title={t("figureSet.heroDetails")} />
              {heroesLoading && (
                <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {t("figureSet.loadingHeroes")}
                </div>
              )}
              {heroesError && (
                <div className="mt-3 text-sm text-rose-600 dark:text-rose-300">
                  {localizeServerText(heroesError, t)}
                </div>
              )}
              {!heroesLoading && detailsSlot && (
                <div className="mt-3 space-y-2 text-xs text-slate-700 dark:text-slate-200">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {t("figureSet.fullArt")}
                  </div>
                  <div
                    className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950"
                    style={{ aspectRatio: "2 / 3" }}
                  >
                    <img
                      src={detailsArtSrc}
                      alt={t("figureSet.artAlt", {
                        hero: detailsHero
                          ? getHeroDisplayName(detailsHero.id, detailsHero.name, language)
                          : t("common.selected"),
                      })}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              )}
              {!heroesLoading && !detailsSlot && (
                <div className="panel-card-muted mt-3 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  {t("figureSet.selectDetails")}
                </div>
              )}
              {!heroesLoading && detailsSlot && !detailsHero && (
                <div className="panel-card-muted mt-3 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  {t("figureSet.unavailableDetails")}
                </div>
              )}
              {!heroesLoading && detailsSlot && detailsHero && (
                <div className="mt-4 space-y-4 text-sm text-slate-700 dark:text-slate-200">
                  <div>
                    <div className="text-lg font-semibold">
                      {getHeroDisplayName(detailsHero.id, detailsHero.name, language)}
                    </div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {t("figureSet.class", { class: getClassLabel(detailsHero.mainClass, t) })}
                    </div>
                    {detailsHero.description && (
                      <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {detailsHero.description === "Base unit."
                          ? t("figureSet.subtitle")
                          : detailsHero.description}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {t("figureSet.stats")}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="panel-card-muted px-2.5 py-2">
                        {t("game.hp", { hp: detailsHero.baseStats.hp })}
                        {detailsHero.id === LECHY_ID ? ` (${t("figureSet.giantBonus")})` : ""}
                      </div>
                      <div className="panel-card-muted px-2.5 py-2">
                        {t("figureSet.damage", { value: detailsHero.baseStats.damage })}
                      </div>
                      <div className="panel-card-muted px-2.5 py-2">
                        {t("figureSet.movement", {
                          value: getClassLabel(detailsHero.baseStats.moveType, t),
                        })}
                      </div>
                      <div className="panel-card-muted px-2.5 py-2">
                        {t("figureSet.attack", {
                          value: getStatLabel(detailsHero.baseStats.attackRange, t),
                        })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {t("game.abilities")}
                    </div>
                    {detailsHero.abilities.length === 0 && (
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {t("figureSet.noAbilities")}
                      </div>
                    )}
                    <div className="mt-2 space-y-3">
                      {abilityGroups.map((group) =>
                        group.abilities.length === 0 ? null : (
                          <div key={group.type} className="space-y-2">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              {group.label}
                            </div>
                            {group.abilities.map((ability) => {
                              const display = getAbilityDisplay(
                                ability.id,
                                ability.name,
                                ability.description,
                                language,
                              );
                              return (
                                <div
                                key={ability.id}
                                className={`rounded-xl border px-3 py-3 shadow-sm ${
                                  ability.type === "passive"
                                    ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/25"
                                    : ability.type === "phantasm"
                                      ? "border-violet-300 bg-gradient-to-br from-violet-50 to-fuchsia-50/60 dark:border-violet-800 dark:from-violet-950/40 dark:to-fuchsia-950/20"
                                      : ability.type === "impulse"
                                        ? "border-amber-200 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/25"
                                        : "border-sky-200 bg-sky-50/70 dark:border-sky-900/70 dark:bg-sky-950/25"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                    {display.name}
                                  </div>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${abilityBadgeClass(
                                      ability.type,
                                    )}`}
                                  >
                                    {group.label}
                                  </span>
                                </div>
                                <div className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                                  {formatCharge(ability)} / {formatCost(ability)}
                                </div>
                                <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                                  {display.description}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              )}
            </PanelCard>
          </div>
        </div>
      </div>
    </div>
  );
}
