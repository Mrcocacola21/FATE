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

interface FigureSetPageProps {
  onBack?: () => void;
}

function formatSlotTitle(slot: BaseClass): string {
  return `${slot.toUpperCase()} SLOT`;
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
        return "bg-blue-100 text-blue-700";
      case "impulse":
        return "bg-orange-100 text-orange-700";
      case "phantasm":
        return "bg-purple-100 text-purple-700";
      default:
        return "bg-slate-200 text-slate-700";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-sky-50 to-emerald-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white/80 p-4 shadow-sm">
          <div>
            <div className="text-lg font-semibold text-slate-800">Figure Set</div>
            <div className="text-xs text-slate-500">
              Assign one hero per base class slot.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
              onClick={() => onBack?.()}
            >
              Back to Rooms
            </button>
            <button
              className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
              onClick={handleExport}
            >
              Export
            </button>
            <button
              className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
              onClick={handleImportClick}
            >
              Import
            </button>
            <button
              className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-white"
              onClick={resetAll}
            >
              Reset All to Base
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
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
                  className="rounded border border-slate-200 bg-white/80 p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-700">
                        {formatSlotTitle(slot)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {selected?.name ?? "Unknown hero"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                        onClick={() => setDetailsSlot(slot)}
                      >
                        Details
                      </button>
                      <button
                        className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                        onClick={() =>
                          setActiveSlot(activeSlot === slot ? null : slot)
                        }
                      >
                        {activeSlot === slot ? "Close" : "Change"}
                      </button>
                      <button
                        className="rounded bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
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
                          className={`rounded border px-3 py-2 text-left text-xs ${
                            hero.id === selected?.id
                              ? "border-teal-500 bg-teal-50 text-teal-700"
                              : "border-slate-200 bg-white text-slate-700"
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
            <div className="rounded border border-slate-200 bg-white/80 p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-700">
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
                      className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                        {(hero?.name ?? slot).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] uppercase text-slate-400">
                          {slot}
                        </div>
                        <div className="text-xs text-slate-700">{label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded border border-slate-200 bg-white/80 p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-700">
                Hero details
              </div>
              {heroesLoading && (
                <div className="mt-3 text-xs text-slate-500">Loading heroes...</div>
              )}
              {heroesError && (
                <div className="mt-3 text-xs text-rose-600">{heroesError}</div>
              )}
              {!heroesLoading && detailsSlot && (
                <div className="mt-3 space-y-2 text-xs text-slate-700">
                  <div className="text-[10px] uppercase text-slate-400">
                    Full art
                  </div>
                  <div
                    className="overflow-hidden rounded border border-slate-200 bg-slate-100"
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
                <div className="mt-3 text-xs text-slate-500">
                  Select a hero to see details.
                </div>
              )}
              {!heroesLoading && detailsSlot && !detailsHero && (
                <div className="mt-3 text-xs text-slate-500">
                  Details unavailable for this hero.
                </div>
              )}
              {!heroesLoading && detailsSlot && detailsHero && (
                <div className="mt-4 space-y-4 text-xs text-slate-700">
                  <div>
                    <div className="text-sm font-semibold">{detailsHero.name}</div>
                    <div className="text-[10px] uppercase text-slate-400">
                      Class: {detailsHero.mainClass}
                    </div>
                    {detailsHero.description && (
                      <div className="mt-2 text-xs text-slate-600">
                        {detailsHero.description}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] uppercase text-slate-400">
                      Stats
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded border border-slate-200 bg-white px-2 py-1">
                        HP: {detailsHero.baseStats.hp}
                      </div>
                      <div className="rounded border border-slate-200 bg-white px-2 py-1">
                        Damage: {detailsHero.baseStats.damage}
                      </div>
                      <div className="rounded border border-slate-200 bg-white px-2 py-1">
                        Movement: {detailsHero.baseStats.moveType}
                      </div>
                      <div className="rounded border border-slate-200 bg-white px-2 py-1">
                        Attack: {detailsHero.baseStats.attackRange}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase text-slate-400">
                      Abilities
                    </div>
                    {detailsHero.abilities.length === 0 && (
                      <div className="mt-2 text-xs text-slate-500">
                        No abilities listed.
                      </div>
                    )}
                    <div className="mt-2 space-y-3">
                      {abilityGroups.map((group) =>
                        group.abilities.length === 0 ? null : (
                          <div key={group.type} className="space-y-2">
                            <div className="text-[10px] uppercase text-slate-400">
                              {group.label}
                            </div>
                            {group.abilities.map((ability) => (
                              <div
                                key={ability.id}
                                className="rounded border border-slate-200 bg-white px-3 py-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="text-xs font-semibold text-slate-800">
                                    {ability.name}
                                  </div>
                                  <span
                                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${abilityBadgeClass(
                                      ability.type
                                    )}`}
                                  >
                                    {group.label}
                                  </span>
                                </div>
                                <div className="mt-1 text-[10px] text-slate-500">
                                  {formatCharge(ability)} · {formatCost(ability)}
                                </div>
                                <div className="mt-2 text-xs text-slate-600">
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
