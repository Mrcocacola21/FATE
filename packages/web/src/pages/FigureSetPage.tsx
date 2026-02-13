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
import { getFigureArtSrc } from "../assets/registry";
import { ThemeToggle } from "../components/ThemeToggle";
import { LECHY_ID } from "../rulesHints";

interface FigureSetPageProps {
  onBack?: () => void;
}

function formatSlotTitle(slot: BaseClass): string {
  return `${slot.toUpperCase()} SLOT`;
}

function formatClassLabel(value: string): string {
  if (!value) return value;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function FigureSetPage({ onBack }: FigureSetPageProps) {
  const [state, setState] = useState<FigureSetState>(() =>
    loadFigureSetState(HERO_CATALOG)
  );
  const [activeSlot, setActiveSlot] = useState<BaseClass | null>(null);
  const [detailsSlot, setDetailsSlot] = useState<BaseClass | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { heroes, loading: heroesLoading, error: heroesError } = useHeroes();

  const heroById = useMemo(
    () => new Map(HERO_CATALOG.map((hero) => [hero.id, hero])),
    []
  );

  const heroMetaById = useMemo(
    () => new Map(heroes.map((hero) => [hero.id, hero])),
    [heroes]
  );

  const heroesByClass = useMemo(() => {
    const map = new Map<BaseClass, HeroDefinition[]>();
    for (const slot of BASE_CLASSES) {
      map.set(
        slot,
        HERO_CATALOG.filter((hero) => hero.mainClass === slot)
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
    const confirmed = window.confirm("Reset all slots to base heroes?");
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
        setError(result.error);
        return;
      }
      setState(result.state);
      saveFigureSetState(result.state);
      setError(null);
    };
    reader.onerror = () => {
      setError("Failed to read file.");
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
      { type: "passive", label: "Passive" },
      { type: "active", label: "Active" },
      { type: "impulse", label: "Impulse" },
      { type: "phantasm", label: "Phantasm" },
    ];
    const abilities = detailsHero?.abilities ?? [];
    return groups.map((group) => ({
      ...group,
      abilities: abilities.filter((ability) => ability.type === group.type),
    }));
  }, [detailsHero]);

  const formatCharge = (ability: AbilityMeta) => {
    if (ability.chargeRequired === null) return "Charge: ∞";
    if (typeof ability.chargeRequired === "number") {
      return `Charge: ${ability.chargeRequired}`;
    }
    return "No charge";
  };

  const formatCost = (ability: AbilityMeta) => {
    if (ability.consumesAction) return "Consumes Action";
    if (ability.consumesMove) return "Consumes Movement";
    return "Free / Impulse";
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
    <div className="min-h-screen bg-app p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:shadow-black/40">
          <div>
            <div className="text-lg font-semibold text-primary">
              Figure Set
            </div>
            <div className="text-xs text-muted">
              Assign one hero per base class slot.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={() => onBack?.()}
            >
              Back to Rooms
            </button>
            <button
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
              onClick={handleExport}
            >
              Export
            </button>
            <button
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
              onClick={handleImportClick}
            >
              Import
            </button>
            <button
              className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
              onClick={resetAll}
            >
              Reset All to Base
            </button>
            <ThemeToggle />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
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

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {BASE_CLASSES.map((slot) => {
              const selectedId = state.selection[slot];
              const selected = heroById.get(selectedId) ?? heroById.get(BASE_HERO_IDS[slot]);
              const candidates = heroesByClass.get(slot) ?? [];
              return (
                <div
                  key={slot}
                  className="rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:shadow-black/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-100">
                        {formatSlotTitle(slot)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {selected?.name ?? "Unknown hero"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                        onClick={() => setDetailsSlot(slot)}
                      >
                        Details
                      </button>
                      <button
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                        onClick={() =>
                          setActiveSlot(activeSlot === slot ? null : slot)
                        }
                      >
                        {activeSlot === slot ? "Close" : "Change"}
                      </button>
                      <button
                        className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                        onClick={() => resetSlot(slot)}
                      >
                        Reset to Base
                      </button>
                    </div>
                  </div>

                  {activeSlot === slot && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {candidates.map((hero) => (
                        <button
                          key={hero.id}
                          className={`rounded-lg border px-3 py-2 text-left text-xs shadow-sm transition hover:shadow ${
                            hero.id === selected?.id
                              ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200"
                              : "border-slate-200 bg-white text-slate-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
                          }`}
                          onClick={() => {
                            updateSelection(slot, hero.id);
                            setActiveSlot(null);
                          }}
                        >
                          {hero.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:shadow-black/40">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-100">
                Selected roster
              </div>
              <div className="mt-3 space-y-2 text-xs">
                {BASE_CLASSES.map((slot) => {
                  const heroId = state.selection[slot];
                  const hero = heroById.get(heroId) ?? heroById.get(BASE_HERO_IDS[slot]);
                  const label = hero?.name ?? "Unknown hero";
                  return (
                    <div
                      key={`preview-${slot}`}
                      className="flex items-center gap-2 rounded-xl border-ui bg-surface-solid px-3 py-2 shadow-sm shadow-slate-900/5 dark:shadow-black/30"
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white shadow-sm dark:bg-slate-100 dark:text-slate-900">
                        {(hero?.name ?? slot).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] uppercase text-slate-400 dark:text-slate-500">
                          {slot}
                        </div>
                        <div className="text-xs text-slate-700 dark:text-slate-200">
                          {label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:shadow-black/40">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-100">
                Hero details
              </div>
              {heroesLoading && (
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Loading heroes...
                </div>
              )}
              {heroesError && (
                <div className="mt-3 text-xs text-rose-600 dark:text-rose-300">
                  {heroesError}
                </div>
              )}
              {!heroesLoading && detailsSlot && (
                <div className="mt-3 space-y-2 text-xs text-slate-700 dark:text-slate-200">
                  <div className="text-[10px] uppercase text-slate-400 dark:text-slate-500">
                    Full art
                  </div>
                  <div
                    className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-neutral-800 dark:bg-neutral-900"
                    style={{ aspectRatio: "2 / 3" }}
                  >
                    <img
                      src={detailsArtSrc}
                      alt={`${detailsHero?.name ?? "Selected hero"} full art`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              )}
              {!heroesLoading && !detailsSlot && (
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Select a hero to see details.
                </div>
              )}
              {!heroesLoading && detailsSlot && !detailsHero && (
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Details unavailable for this hero.
                </div>
              )}
              {!heroesLoading && detailsSlot && detailsHero && (
                <div className="mt-4 space-y-4 text-xs text-slate-700 dark:text-slate-200">
                  <div>
                    <div className="text-sm font-semibold">{detailsHero.name}</div>
                    <div className="text-[10px] uppercase text-slate-400 dark:text-slate-500">
                      Class: {formatClassLabel(detailsHero.mainClass)}
                    </div>
                    {detailsHero.description && (
                      <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                        {detailsHero.description}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] uppercase text-slate-400 dark:text-slate-500">
                      Stats
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border-ui bg-surface-solid px-2 py-1">
                        HP: {detailsHero.baseStats.hp}
                        {detailsHero.id === LECHY_ID ? " (includes Giant +3)" : ""}
                      </div>
                      <div className="rounded-lg border-ui bg-surface-solid px-2 py-1">
                        Damage: {detailsHero.baseStats.damage}
                      </div>
                      <div className="rounded-lg border-ui bg-surface-solid px-2 py-1">
                        Movement: {detailsHero.baseStats.moveType}
                      </div>
                      <div className="rounded-lg border-ui bg-surface-solid px-2 py-1">
                        Attack: {detailsHero.baseStats.attackRange}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase text-slate-400 dark:text-slate-500">
                      Abilities
                    </div>
                    {detailsHero.abilities.length === 0 && (
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        No abilities listed.
                      </div>
                    )}
                    <div className="mt-2 space-y-3">
                      {abilityGroups.map((group) =>
                        group.abilities.length === 0 ? null : (
                          <div key={group.type} className="space-y-2">
                            <div className="text-[10px] uppercase text-slate-400 dark:text-slate-500">
                              {group.label}
                            </div>
                            {group.abilities.map((ability) => (
                              <div
                                key={ability.id}
                                className="rounded-xl border-ui bg-surface px-3 py-2 shadow-sm shadow-slate-900/5 dark:shadow-black/30"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                                    {ability.name}
                                  </div>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${abilityBadgeClass(
                                      ability.type
                                    )}`}
                                  >
                                    {group.label}
                                  </span>
                                </div>
                                <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                                  {formatCharge(ability)} · {formatCost(ability)}
                                </div>
                                <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                                  {ability.description}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
