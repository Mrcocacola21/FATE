import { useState, type ReactNode } from "react";
import type { GameAction, UnitState } from "rules";
import { useHeroes } from "../figures/useHeroes";
import { PanelCard, StatusBadge } from "../components/ui";
import { ChargeDebugControls } from "./ChargeDebugControls";
import { CombatDebugControls } from "./CombatDebugControls";
import { MarkerDebugControls } from "./MarkerDebugControls";
import { PendingRollDebugPanel } from "./PendingRollDebugPanel";
import { SnapshotDebugPanel } from "./SnapshotDebugPanel";
import { TestRoomPresets } from "./TestRoomPresets";
import { TurnDebugControls } from "./TurnDebugControls";
import { UnitDebugEditor } from "./UnitDebugEditor";
import { UnitSpawner } from "./UnitSpawner";
import type { TestRoomCommand } from "./types";
import { useI18n } from "../i18n";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="rounded-xl border border-violet-200 bg-white/70 dark:border-violet-900 dark:bg-slate-950/40">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
        {title}
      </summary>
      <div className="border-t border-violet-100 p-3 dark:border-violet-950">
        {children}
      </div>
    </details>
  );
}

export function TestRoomPanel({ vm }: { vm: any }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const { heroes, loading, error } = useHeroes();
  const view = vm.view;
  const selectedUnit: UnitState | null =
    view && vm.selectedUnitId ? view.units[vm.selectedUnitId] ?? null : null;
  const units = Object.values(view?.units ?? {}) as UnitState[];
  const abilities = selectedUnit
    ? view.abilitiesByUnitId?.[selectedUnit.id] ?? []
    : [];
  const legalTargets = selectedUnit
    ? view.legal?.attackTargetsByUnitId?.[selectedUnit.id] ?? []
    : [];
  const send = (command: TestRoomCommand) => vm.sendTestRoomCommand(command);
  const sendAction = (action: GameAction) => vm.sendAction(action);

  return (
    <PanelCard className="border-violet-300 p-4 dark:border-violet-800">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusBadge tone="special">{t("testRoom.badgeSandbox")}</StatusBadge>
          <span className="text-xs text-slate-500">
            {t("testRoom.revision", { revision: vm.roomMeta?.revision ?? 0 })}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? t("testRoom.openSandbox") : t("testRoom.collapse")}
        </button>
      </div>
      {!collapsed ? (
        <div className="mt-3 space-y-2">
          <Section title={t("testRoom.presets")}>
            <TestRoomPresets send={send} />
          </Section>
          <Section title={t("testRoom.unitSpawner")}>
            {loading ? <div className="text-sm">{t("testRoom.loadingCatalog")}</div> : null}
            {error ? <div className="text-sm text-rose-600">{error}</div> : null}
            {!loading ? <UnitSpawner heroes={heroes} send={send} /> : null}
          </Section>
          <Section title={t("testRoom.selectedUnitEditor")}>
            <UnitDebugEditor unit={selectedUnit} send={send} />
          </Section>
          <Section title={t("testRoom.turnPhase")}>
            <TurnDebugControls
              selectedUnit={selectedUnit}
              send={send}
              sendAction={sendAction}
            />
          </Section>
          <Section title={t("testRoom.chargesAbilities")}>
            <ChargeDebugControls
              unit={selectedUnit}
              abilities={abilities}
              send={send}
              sendAction={sendAction}
            />
          </Section>
          <Section title={t("testRoom.combatDice")}>
            <CombatDebugControls
              units={units}
              selectedUnit={selectedUnit}
              legalTargets={legalTargets}
              diceQueue={vm.roomMeta?.diceQueue ?? []}
              send={send}
              sendAction={sendAction}
            />
          </Section>
          <Section title={t("testRoom.terrainMarkers")}>
            <MarkerDebugControls send={send} />
          </Section>
          <Section title={t("testRoom.pendingRoll")}>
            <PendingRollDebugPanel
              pendingRoll={view.pendingRoll}
              send={send}
              sendAction={sendAction}
            />
          </Section>
          <Section title={t("testRoom.snapshotReproduction")}>
            <SnapshotDebugPanel
              snapshot={vm.testRoomSnapshot}
              roomId={vm.roomId}
              send={send}
            />
          </Section>
          <Section title={t("testRoom.stateInspector")}>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">
              {JSON.stringify(
                {
                  selectedUnit,
                  pendingRoll: view.pendingRoll,
                  currentPlayer: view.currentPlayer,
                  activeUnitId: view.activeUnitId,
                  turnNumber: view.turnNumber,
                  roundNumber: view.roundNumber,
                  recentCommands: vm.roomMeta?.debugLog ?? [],
                },
                null,
                2,
              )}
            </pre>
          </Section>
          <button
            type="button"
            className="btn btn-secondary w-full"
            disabled={!vm.latestEventBatch?.events?.length}
            onClick={() => vm.replayLastEffects()}
          >
            {t("testRoom.replayEffects")}
          </button>
          <button
            type="button"
            className="btn btn-warning w-full"
            onClick={() => {
              if (window.confirm(t("testRoom.resetEmptyConfirm"))) {
                send({ type: "debugClearBoard" });
              }
            }}
          >
            {t("testRoom.resetEmpty")}
          </button>
          <button
            type="button"
            className="btn btn-warning w-full"
            onClick={() => {
              if (window.confirm(t("testRoom.deleteRoomConfirm"))) {
                send({ type: "debugDeleteRoom" });
              }
            }}
          >
            {t("testRoom.deleteRoom")}
          </button>
        </div>
      ) : null}
    </PanelCard>
  );
}
