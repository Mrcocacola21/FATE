import {
  BASE_CLASSES,
  type BaseClass,
  type FigureSetSelection,
  type FigureSetState,
  type HeroCatalog,
} from "./types";
import { BASE_HERO_IDS } from "./catalog";

const STORAGE_KEY = "FATE_FIGURE_SET_SELECTION_V1";

function buildDefaultSelection(): FigureSetSelection {
  return { ...BASE_HERO_IDS };
}

function buildState(selection: FigureSetSelection): FigureSetState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    selection,
  };
}

function indexCatalog(catalog: HeroCatalog): Map<string, { id: string; mainClass: BaseClass }> {
  return new Map(catalog.map((hero) => [hero.id, hero]));
}

function sanitizeSelection(
  selection: Partial<FigureSetSelection> | null,
  catalog: HeroCatalog
): FigureSetSelection {
  const defaults = buildDefaultSelection();
  const byId = indexCatalog(catalog);
  const result: FigureSetSelection = { ...defaults };

  for (const slot of BASE_CLASSES) {
    const heroId = selection?.[slot];
    const hero = heroId ? byId.get(heroId) : undefined;
    result[slot] = hero && hero.mainClass === slot ? hero.id : defaults[slot];
  }

  return result;
}

export function loadFigureSetState(catalog: HeroCatalog): FigureSetState {
  if (typeof localStorage === "undefined") {
    return buildState(buildDefaultSelection());
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return buildState(buildDefaultSelection());
  }

  try {
    const parsed = JSON.parse(raw) as Partial<FigureSetState> | null;
    const selection = sanitizeSelection(parsed?.selection ?? null, catalog);
    return {
      version: 1,
      updatedAt:
        typeof parsed?.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
      selection,
    };
  } catch {
    return buildState(buildDefaultSelection());
  }
}

export function saveFigureSetState(state: FigureSetState) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportFigureSetState(state: FigureSetState): string {
  return JSON.stringify(state, null, 2);
}

export type ImportResult =
  | { ok: true; state: FigureSetState }
  | { ok: false; error: string };

export function importFigureSetState(
  raw: string,
  catalog: HeroCatalog
): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON file." };
  }

  const selectionCandidate =
    (parsed as { selection?: unknown } | null)?.selection ?? parsed;
  if (!selectionCandidate || typeof selectionCandidate !== "object") {
    return { ok: false, error: "Invalid selection payload." };
  }

  const selection = selectionCandidate as Record<string, unknown>;
  const byId = indexCatalog(catalog);
  const normalized = {} as FigureSetSelection;

  for (const slot of BASE_CLASSES) {
    const heroId = selection[slot];
    if (typeof heroId !== "string") {
      return { ok: false, error: `Missing hero for slot: ${slot}` };
    }
    const hero = byId.get(heroId);
    if (!hero) {
      return { ok: false, error: `Unknown hero id: ${heroId}` };
    }
    if (hero.mainClass !== slot) {
      return {
        ok: false,
        error: `Hero ${heroId} does not match slot ${slot}`,
      };
    }
    normalized[slot] = hero.id;
  }

  return { ok: true, state: buildState(normalized) };
}

export function resetToBaseState(): FigureSetState {
  return buildState(buildDefaultSelection());
}
