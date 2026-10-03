import { useEffect, useMemo, useRef, useState } from "react";
import { HERO_CATALOG, BASE_HERO_IDS } from "../figures/catalog";
import { BASE_CLASSES, type BaseClass, type FigureSetState } from "../figures/types";
import {
  exportFigureSetState,
  importFigureSetState,
  loadFigureSetState,
  resetToBaseState,
  saveFigureSetState,
} from "../figures/storage";
import { useHeroes } from "../figures/useHeroes";
import { HeroPortrait, HeroDetails } from "../figures/HeroDetails";
import { useI18n } from "../i18n";
import { getClassLabel, getHeroDisplayName, localizeFigureSetError } from "../i18n/displayMetadata";
import { Dialog } from "../ui/Dialog";
import { TacticalIcon } from "../ui/TacticalIcon";

export function FigureSetPage() {
  const { language, t } = useI18n();
  const [state, setState] = useState<FigureSetState>(() => loadFigureSetState(HERO_CATALOG));
  const [activeClass, setActiveClass] = useState<BaseClass>(BASE_CLASSES[0]);
  const [inspectedId, setInspectedId] = useState(() => state.selection[BASE_CLASSES[0]]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 1100px)").matches
      : false,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const browserScrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const menuTriggerRef = useRef<HTMLElement>(null);
  const { heroes, loading, error: heroesError, retry } = useHeroes();
  const heroById = useMemo(() => new Map(HERO_CATALOG.map((hero) => [hero.id, hero])), []);
  const heroMetaById = useMemo(() => new Map(heroes.map((hero) => [hero.id, hero])), [heroes]);
  const inspected = heroById.get(inspectedId);
  const query = search.trim().toLocaleLowerCase();
  const candidates = HERO_CATALOG.filter((hero) =>
    !query
      ? hero.mainClass === activeClass
      : [
          hero.name,
          hero.id,
          getHeroDisplayName(hero.id, hero.name, language),
          getClassLabel(hero.mainClass, t),
        ].some((field) => field.toLocaleLowerCase().includes(query)),
  );
  useEffect(() => {
    if (browserScrollRef.current) browserScrollRef.current.scrollTop = 0;
  }, [activeClass, query]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 1100px)");
    const update = () => {
      setCompact(media.matches);
      setDetailsOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target))
        menuRef.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const name = (heroId: string) => {
    const hero = heroById.get(heroId);
    return hero ? getHeroDisplayName(hero.id, hero.name, language) : t("figureSet.unknownHero");
  };
  const browseClass = (slot: BaseClass, openDetails = false) => {
    setActiveClass(slot);
    setSearch("");
    setInspectedId(state.selection[slot]);
    setDetailsOpen(openDetails && compact);
  };
  const persist = (next: FigureSetState) => {
    setState(next);
    saveFigureSetState(next);
    setError(null);
  };
  const updateSelection = (heroId: string) => {
    const hero = heroById.get(heroId);
    if (!hero) return;
    persist({
      ...state,
      updatedAt: new Date().toISOString(),
      selection: { ...state.selection, [hero.mainClass]: hero.id },
    });
    setNotice(t("figureSet.saved", { hero: name(hero.id) }));
  };
  const resetSlot = () => {
    if (!inspected) return;
    const baseId = BASE_HERO_IDS[inspected.mainClass];
    updateSelection(baseId);
    setInspectedId(baseId);
  };
  const resetAll = () => {
    const next = resetToBaseState();
    persist(next);
    setInspectedId(next.selection[activeClass]);
    setResetOpen(false);
    setNotice(t("figureSet.resetDone"));
  };
  const closeMenu = () => {
    menuRef.current?.removeAttribute("open");
    menuTriggerRef.current?.focus();
  };
  const handleExport = () => {
    closeMenu();
    const url = URL.createObjectURL(
      new Blob([exportFigureSetState(state)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "figure-set.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const handleImportFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importFigureSetState(
        typeof reader.result === "string" ? reader.result : "",
        HERO_CATALOG,
      );
      if (!result.ok) {
        setError(localizeFigureSetError(result.error, t));
        return;
      }
      persist(result.state);
      if (!heroById.has(inspectedId)) setInspectedId(result.state.selection[activeClass]);
      setNotice(t("figureSet.importDone"));
    };
    reader.onerror = () => setError(t("errors.readFile"));
    reader.readAsText(file);
  };
  const details = inspected ? (
    <HeroDetails
      hero={inspected}
      metadata={heroMetaById.get(inspected.id)}
      loading={loading}
      failed={Boolean(heroesError)}
      onRetry={retry}
      selected={state.selection[inspected.mainClass] === inspected.id}
      canReset={state.selection[inspected.mainClass] !== BASE_HERO_IDS[inspected.mainClass]}
      onSelect={() => updateSelection(inspected.id)}
      onReset={resetSlot}
    />
  ) : (
    <p className="figure-empty">{t("figureSet.unavailableDetails")}</p>
  );

  return (
    <div className="figure-set-page">
      <header className="figure-header">
        <div>
          <h1 className="fate-brand text-2xl">{t("figureSet.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("figureSet.builderSubtitle")}</p>
        </div>
        <div className="figure-tools">
          <label className="sr-only" htmlFor="figure-search">
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
          <details
            ref={menuRef}
            className="figure-utilities"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeMenu();
              }
            }}
          >
            <summary
              ref={menuTriggerRef}
              className="btn btn-ghost"
              aria-label={t("figureSet.utilities")}
            >
              <TacticalIcon name="more" />
            </summary>
            <div
              className="figure-utility-actions panel-card"
              aria-label={t("figureSet.utilities")}
            >
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  setError(null);
                  fileInputRef.current?.click();
                }}
              >
                {t("figureSet.importLoadout")}
              </button>
              <button type="button" onClick={handleExport}>
                {t("figureSet.exportLoadout")}
              </button>
              <hr />
              <button
                type="button"
                className="text-danger"
                onClick={() => {
                  closeMenu();
                  setResetOpen(true);
                }}
              >
                {t("figureSet.resetAll")}
              </button>
            </div>
          </details>
        </div>
      </header>
      {error && (
        <div className="figure-import-error" role="alert">
          {error}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        aria-label={t("figureSet.importLoadout")}
        onChange={(event) => {
          handleImportFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div className="figure-workspace">
        <section className="figure-loadout panel-card" aria-labelledby="figure-loadout-title">
          <div className="figure-loadout-heading">
            <h2 id="figure-loadout-title" className="section-kicker">
              {t("figureSet.currentLoadout")}
            </h2>
            <span className="figure-save-notice" role="status">
              {notice}
            </span>
          </div>
          <div className="figure-loadout-slots">
            {BASE_CLASSES.map((slot) => (
              <button
                type="button"
                key={slot}
                className="figure-loadout-slot"
                data-testid={`loadout-${slot}`}
                aria-pressed={activeClass === slot}
                aria-label={t("figureSet.loadoutSlot", {
                  class: getClassLabel(slot, t),
                  hero: name(state.selection[slot]),
                })}
                onClick={() => browseClass(slot, true)}
              >
                <HeroPortrait
                  heroId={state.selection[slot]}
                  label={name(state.selection[slot])}
                  token
                />
                <span className="min-w-0">
                  <span className="figure-slot-class">{getClassLabel(slot, t)}</span>
                  <span className="figure-slot-name" title={name(state.selection[slot])}>
                    {name(state.selection[slot])}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
        <nav className="figure-classes panel-card" aria-labelledby="figure-classes-title">
          <h2 id="figure-classes-title" className="section-kicker">
            {t("figureSet.classes")}
          </h2>
          <div className="figure-class-list">
            {BASE_CLASSES.map((slot) => (
              <button
                type="button"
                key={slot}
                data-testid={`class-${slot}`}
                aria-pressed={activeClass === slot}
                onClick={() => browseClass(slot)}
              >
                <span>{getClassLabel(slot, t)}</span>
                <span className="figure-class-count">
                  {HERO_CATALOG.filter((hero) => hero.mainClass === slot).length}
                </span>
              </button>
            ))}
          </div>
        </nav>
        <section className="figure-browser panel-card" aria-labelledby="figure-browser-title">
          <header className="figure-pane-heading">
            <div>
              <div className="section-kicker">{t("figureSet.heroes")}</div>
              <h2 id="figure-browser-title" className="font-display text-lg font-semibold">
                {query ? t("figureSet.searchResults") : getClassLabel(activeClass, t)}
              </h2>
            </div>
            <span className="figure-class-count">{candidates.length}</span>
          </header>
          <div className="figure-browser-scroll" ref={browserScrollRef}>
            {candidates.length === 0 && (
              <p className="figure-empty">
                {query ? t("figureSet.noSearchResults", { search }) : t("figureSet.emptyClass")}
              </p>
            )}
            <div className="figure-hero-grid">
              {candidates.map((hero) => {
                const selected = state.selection[hero.mainClass] === hero.id;
                return (
                  <button
                    type="button"
                    key={hero.id}
                    className="figure-hero-card"
                    data-testid={`hero-${hero.id}`}
                    aria-pressed={inspectedId === hero.id}
                    onClick={() => {
                      setInspectedId(hero.id);
                      setDetailsOpen(compact);
                    }}
                  >
                    <HeroPortrait heroId={hero.id} label={name(hero.id)} />
                    <span className="figure-hero-caption">
                      <span className="figure-hero-name">{name(hero.id)}</span>
                      {query && (
                        <span className="figure-slot-class">
                          {getClassLabel(hero.mainClass, t)}
                        </span>
                      )}
                      <span className="figure-card-state">
                        {selected ? (
                          <span className="figure-selected">
                            <span aria-hidden="true">✓ </span>
                            {t("common.selected")}
                          </span>
                        ) : inspectedId === hero.id ? (
                          t("figureSet.inspecting")
                        ) : (
                          "\u00a0"
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
        {!compact && (
          <aside
            className="figure-details-panel panel-card"
            aria-label={t("figureSet.heroDetails")}
          >
            <h2 className="section-kicker figure-details-title">{t("figureSet.heroDetails")}</h2>
            {details}
          </aside>
        )}
      </div>
      {compact && detailsOpen && (
        <div className="figure-details-dialog">
          <Dialog
            title={t("figureSet.heroDetails")}
            id="figure-details-title"
            onClose={() => setDetailsOpen(false)}
          >
            {details}
          </Dialog>
        </div>
      )}
      {resetOpen && (
        <Dialog
          title={t("figureSet.resetAll")}
          id="figure-reset-title"
          onClose={() => setResetOpen(false)}
        >
          <p className="text-sm text-muted">{t("figureSet.resetConfirm")}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setResetOpen(false)}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-warning"
              data-testid="confirm-reset"
              onClick={resetAll}
            >
              {t("figureSet.resetAll")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
