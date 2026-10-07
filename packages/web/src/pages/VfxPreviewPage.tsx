import { useEffect, useMemo, useRef, useState } from "react";
import { vfxRegistry } from "../features/vfx/vfxRegistry";
import { mapEventBatchToVfx } from "../features/vfx/vfxEventMapper";
import { visibleUnitPositions } from "../features/vfx/vfxGeometry";
import { enqueueBoardVfx, pruneExpiredBoardVfx } from "../features/vfx/vfxQueue";
import { usePrefersReducedMotion } from "../features/vfx/vfxPreferences";
import type { QueuedBoardVfxRequest, VfxEffectId } from "../features/vfx/vfxTypes";
import { Board } from "../components/Board";
import {
  createVfxPreviewView,
  createRuntimePreviewRequest,
  VFX_PREVIEW_ANCHORS,
  type VfxPreviewAnchor,
  type VfxPreviewRay,
  VFX_PREVIEW_SCENARIOS,
  type VfxPreviewScenario,
} from "../features/vfx/vfxPreviewScenarios";

const COPY = {
  title: "VFX Preview",
  subtitle: "Web-only",
  statusReady: "Ready",
  statusPrefix: "Active",
  triggerAll: "Play all",
  runtimeEffect: "Runtime effect",
  orientation: "Orientation",
  anchor: "Anchor",
  ray: "Ray direction",
  composition: "Composition",
  composite: "composite",
  primary: "primary",
  accent: "accent",
  boardWidth: "Board width",
  reducedMotion: "Reduced motion",
  replay: "Play / Replay",
  lastClick: "Last cell click",
  identity: "ID / placement / layer",
  artwork: "Artwork",
  timing: "Timing",
  geometry: "Geometry",
};

export function VfxPreviewPage() {
  const view = useMemo(() => createVfxPreviewView(), []);
  const [effects, setEffects] = useState<QueuedBoardVfxRequest[]>([]);
  const [effectId, setEffectId] = useState<VfxEffectId>("doraImpact");
  const [orientation, setOrientation] = useState<"P1" | "P2">("P1");
  const [anchor, setAnchor] = useState<VfxPreviewAnchor>("center");
  const [ray, setRay] = useState<VfxPreviewRay>("horizontal");
  const [composition, setComposition] = useState<"composite" | "primary" | "accent">("composite");
  const [boardWidth, setBoardWidth] = useState(680);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [reduceMotion, setReduceMotion] = useState(false);
  const reducedMotion = prefersReducedMotion || reduceMotion;
  const [clickedCell, setClickedCell] = useState("none");
  const sequence = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  useEffect(() => {
    if (!effects.length) return;
    const timer = window.setTimeout(
      () => setEffects((current) => pruneExpiredBoardVfx(current, Date.now())),
      Math.max(0, Math.min(...effects.map((effect) => effect.expiresAt)) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [effects]);
  const replay = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    const incoming = [
      createRuntimePreviewRequest({
        id: `debug:runtime:${++sequence.current}`,
        effectId,
        anchor,
        ray,
        composition: composition === "composite" ? undefined : composition,
      }),
    ];
    setEffects(enqueueBoardVfx({ current: [], incoming, now: Date.now() }));
    setActiveScenarioId(effectId);
  };
  const definition = vfxRegistry[effectId];
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);

  const triggerScenario = (scenario: VfxPreviewScenario) => {
    const incoming = mapEventBatchToVfx({
      events: scenario.events,
      view,
      previousPositions: visibleUnitPositions(view),
      revision: 0,
      presentationId: `debug:legacy:${++sequence.current}`,
    });
    setEffects(enqueueBoardVfx({ current: [], incoming, now: Date.now() }));
    setActiveScenarioId(scenario.id);
  };

  const triggerAll = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    VFX_PREVIEW_SCENARIOS.forEach((scenario, index) => {
      timers.current.push(window.setTimeout(() => triggerScenario(scenario), index * 900));
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
    (activeScenarioId && activeScenarioId in vfxRegistry ? activeScenarioId : undefined) ??
    VFX_PREVIEW_SCENARIOS.find((scenario) => scenario.id === activeScenarioId)?.label ??
    COPY.statusReady;

  return (
    <main className="app-shell min-h-screen overflow-auto bg-stone-100 px-4 py-5 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <section className="mx-auto grid max-w-7xl gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-[720px] rounded-lg border border-stone-300/80 bg-stone-50 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div
            data-vfx-preview-board
            style={{ width: boardWidth, maxWidth: "100%", height: boardWidth + 20 }}
            className="min-h-0 overflow-hidden rounded-md border border-stone-300 bg-stone-100 dark:border-slate-800 dark:bg-slate-950"
          >
            <Board
              view={view}
              playerId={orientation}
              selectedUnitId="preview-asgore"
              highlightedCells={{ "4,4": "attack", "0,0": "move" }}
              previewVfx={effects}
              previewReducedMotion={reducedMotion}
              zoom={0.9}
              showCoordinates
              allowUnitSelection={false}
              onSelectUnit={() => undefined}
              onCellClick={(col, row) => setClickedCell(`${col},${row}`)}
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

          <div className="mb-4 grid gap-3 text-sm">
            <label>
              {COPY.runtimeEffect}
              <select
                aria-label={COPY.runtimeEffect}
                className="block w-full bg-slate-100 text-slate-950"
                value={effectId}
                onChange={(event) => setEffectId(event.target.value as VfxEffectId)}
              >
                {Object.keys(vfxRegistry).map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>
            </label>
            <label>
              {COPY.orientation}
              <select
                aria-label={COPY.orientation}
                className="block w-full bg-slate-100 text-slate-950"
                value={orientation}
                onChange={(event) => setOrientation(event.target.value as "P1" | "P2")}
              >
                <option>P1</option>
                <option>P2</option>
              </select>
            </label>
            <label>
              {COPY.anchor}
              <select
                aria-label={COPY.anchor}
                className="block w-full bg-slate-100 text-slate-950"
                value={anchor}
                onChange={(event) => setAnchor(event.target.value as VfxPreviewAnchor)}
              >
                {Object.keys(VFX_PREVIEW_ANCHORS).map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>
            </label>
            <label>
              {COPY.ray}
              <select
                aria-label={COPY.ray}
                className="block w-full bg-slate-100 text-slate-950"
                value={ray}
                onChange={(event) => setRay(event.target.value as VfxPreviewRay)}
              >
                {["horizontal", "vertical", "diagonal", "board-edge", "target"].map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>
            </label>
            <label>
              {COPY.composition}
              <select
                aria-label={COPY.composition}
                className="block w-full bg-slate-100 text-slate-950"
                value={composition}
                onChange={(event) => setComposition(event.target.value as typeof composition)}
              >
                <option value="composite">{COPY.composite}</option>
                <option value="primary">{COPY.primary}</option>
                <option value="accent">{COPY.accent}</option>
              </select>
            </label>
            <label>
              {`${COPY.boardWidth}: ${boardWidth}px`}
              <input
                aria-label={COPY.boardWidth}
                type="range"
                min="360"
                max="820"
                value={boardWidth}
                onChange={(event) => setBoardWidth(Number(event.target.value))}
                className="block w-full"
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={reduceMotion}
                onChange={(event) => setReduceMotion(event.target.checked)}
              />{" "}
              {COPY.reducedMotion}
            </label>
            <button
              className="rounded bg-cyan-700 px-3 py-2 font-bold text-white"
              onClick={replay}
              data-vfx-replay
            >
              {COPY.replay}
            </button>
            <output data-vfx-pointer-check>{`${COPY.lastClick}: ${clickedCell}`}</output>
            <dl className="break-all text-xs" data-vfx-metadata>
              <dt>{COPY.identity}</dt>
              <dd>
                {effectId} / {definition.defaultPlacement} / {definition.layer ?? "legacy"}
              </dd>
              <dt>{COPY.artwork}</dt>
              <dd>
                {(definition.layers ?? [definition])
                  .map(
                    (art) =>
                      `${art.asset ?? definition.sourceFile} (${art.assetType}, ${art.frames ?? 1} frames)`,
                  )
                  .join(" + ")}
              </dd>
              <dt>{COPY.timing}</dt>
              <dd>{`${definition.durationMs}ms / ${(((definition.frames ?? 1) * 1000) / definition.durationMs).toFixed(2)} fps (derived)`}</dd>
              <dt>{COPY.geometry}</dt>
              <dd>{`${definition.widthCells ?? definition.defaultScaleCells} ? ${definition.heightCells ?? definition.widthCells ?? definition.defaultScaleCells} cells; beam ${definition.beamThicknessCells ?? 0.18} cells`}</dd>
              <dt>{COPY.reducedMotion}</dt>
              <dd>
                {definition.reducedMotion}; {reducedMotion ? "active" : "off"}
              </dd>
            </dl>
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
