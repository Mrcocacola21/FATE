import { useMemo, useState } from "react";
import type { BoardEventBatch } from "../game/effects/types";
import { Board } from "../components/Board";
import {
  createVfxPreviewView,
  VFX_PREVIEW_SCENARIOS,
  type VfxPreviewScenario,
} from "../features/vfx/vfxPreviewScenarios";

const COPY = {
  title: "VFX Preview",
  subtitle: "Web-only",
  statusReady: "Ready",
  statusPrefix: "Active",
  triggerAll: "Play all",
};

export function VfxPreviewPage() {
  const view = useMemo(() => createVfxPreviewView(), []);
  const [batch, setBatch] = useState<BoardEventBatch | null>(null);
  const [logIndex, setLogIndex] = useState(0);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);

  const triggerScenario = (scenario: VfxPreviewScenario) => {
    setLogIndex((current) => {
      const next = current + 1;
      setBatch({ logIndex: next, events: scenario.events });
      return next;
    });
    setActiveScenarioId(scenario.id);
  };

  const triggerAll = () => {
    VFX_PREVIEW_SCENARIOS.forEach((scenario, index) => {
      window.setTimeout(() => triggerScenario(scenario), index * 260);
    });
  };

  const groups = Array.from(
    VFX_PREVIEW_SCENARIOS.reduce((map, scenario) => {
      const group = map.get(scenario.group) ?? [];
      group.push(scenario);
      map.set(scenario.group, group);
      return map;
    }, new Map<string, VfxPreviewScenario[]>()),
  );

  const activeLabel =
    VFX_PREVIEW_SCENARIOS.find((scenario) => scenario.id === activeScenarioId)?.label ??
    COPY.statusReady;

  return (
    <main className="app-shell min-h-screen overflow-auto bg-stone-100 px-4 py-5 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <section className="mx-auto grid max-w-7xl gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-[720px] rounded-lg border border-stone-300/80 bg-stone-50 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div
            data-vfx-preview-board
            className="h-[700px] min-h-0 overflow-hidden rounded-md border border-stone-300 bg-stone-100 dark:border-slate-800 dark:bg-slate-950"
          >
            <Board
              view={view}
              playerId="P1"
              selectedUnitId={null}
              highlightedCells={{}}
              visualEffectsEnabled
              eventBatch={batch}
              effectSessionKey="vfx-preview"
              zoom={0.9}
              showCoordinates
              allowUnitSelection={false}
              onSelectUnit={() => undefined}
              onCellClick={() => undefined}
            />
          </div>
        </div>

        <aside className="rounded-lg border border-stone-300/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-black">{COPY.title}</h1>
              <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {COPY.subtitle}
              </div>
            </div>
            <div
              data-vfx-preview-active={activeScenarioId ?? "ready"}
              className="rounded-md border border-cyan-400/40 bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200"
            >
              {activeScenarioId ? `${COPY.statusPrefix}: ${activeLabel}` : activeLabel}
            </div>
          </div>

          <button
            type="button"
            data-vfx-preview-trigger="all"
            className="mb-4 w-full rounded-md border border-slate-300 bg-slate-900 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 dark:border-slate-700 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            onClick={triggerAll}
          >
            {COPY.triggerAll}
          </button>

          <div className="space-y-4">
            {groups.map(([group, scenarios]) => (
              <div key={group}>
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {group}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {scenarios.map((scenario) => (
                    <button
                      key={scenario.id}
                      type="button"
                      data-vfx-preview-trigger={scenario.id}
                      className="min-h-10 rounded-md border border-stone-300 bg-stone-50 px-2 py-2 text-sm font-bold leading-tight text-slate-800 shadow-sm transition hover:border-cyan-400 hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-cyan-500 dark:hover:bg-cyan-950/40"
                      onClick={() => triggerScenario(scenario)}
                    >
                      {scenario.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
