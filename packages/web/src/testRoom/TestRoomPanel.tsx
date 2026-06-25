import { useState } from "react";
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
import { Tabs } from "../ui";

type SandboxTab = "presets" | "spawn" | "unit" | "charges" | "combat" | "snapshot" | "state";

export function TestRoomPanel({ vm }: { vm: any }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<SandboxTab>("presets");
  const { heroes, loading, error } = useHeroes();
  const view = vm.view;
  const selectedUnit: UnitState | null =
    view && vm.selectedUnitId ? (view.units[vm.selectedUnitId] ?? null) : null;
  const units = Object.values(view?.units ?? {}) as UnitState[];
  const abilities = selectedUnit ? (view.abilitiesByUnitId?.[selectedUnit.id] ?? []) : [];
  const legalTargets = selectedUnit
    ? (view.legal?.attackTargetsByUnitId?.[selectedUnit.id] ?? [])
    : [];
  const send = (command: TestRoomCommand) => vm.sendTestRoomCommand(command);
  const sendAction = (action: GameAction) => vm.sendAction(action);

  return (
    <PanelCard variant="arcane" className="p-4">
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
        <div className="mt-4 space-y-3">
          <Tabs
            value={activeTab}
            ariaLabel={t("testRoom.badgeSandbox")}
            onChange={setActiveTab}
            items={[
              { value: "presets", label: t("testRoom.presets") },
              { value: "spawn", label: t("testRoom.unitSpawner") },
              { value: "unit", label: t("testRoom.selectedUnitEditor") },
              { value: "charges", label: t("testRoom.chargesAbilities") },
              { value: "combat", label: t("testRoom.combatDice") },
              { value: "snapshot", label: t("testRoom.snapshotReproduction") },
              { value: "state", label: t("testRoom.stateInspector") },
            ]}
          />
          <div className="panel-card-muted p-3">
            {activeTab === "presets" ? <TestRoomPresets send={send} /> : null}
            {activeTab === "spawn" ? (
              <>
                {loading ? <div className="text-sm">{t("testRoom.loadingCatalog")}</div> : null}
                {error ? <div className="text-sm text-rose-600">{error}</div> : null}
                {!loading ? <UnitSpawner heroes={heroes} send={send} /> : null}
              </>
            ) : null}
            {activeTab === "unit" ? (
              <div className="space-y-4">
                <UnitDebugEditor unit={selectedUnit} send={send} />
                <div className="border-t border-violet-300/30 pt-4 dark:border-violet-800/40">
                  <div className="section-kicker mb-2">{t("testRoom.turnPhase")}</div>
                  <TurnDebugControls
                    selectedUnit={selectedUnit}
                    send={send}
                    sendAction={sendAction}
                  />
                </div>
              </div>
            ) : null}
            {activeTab === "charges" ? (
              <ChargeDebugControls
                unit={selectedUnit}
                abilities={abilities}
                send={send}
                sendAction={sendAction}
              />
            ) : null}
            {activeTab === "combat" ? (
              <div className="space-y-4">
                <CombatDebugControls
                  units={units}
                  selectedUnit={selectedUnit}
                  legalTargets={legalTargets}
                  diceQueue={vm.roomMeta?.diceQueue ?? []}
                  send={send}
                  sendAction={sendAction}
                />
                <div className="grid gap-4 border-t border-violet-300/30 pt-4 dark:border-violet-800/40 sm:grid-cols-2">
                  <div>
                    <div className="section-kicker mb-2">{t("testRoom.terrainMarkers")}</div>
                    <MarkerDebugControls send={send} />
                  </div>
                  <div>
                    <div className="section-kicker mb-2">{t("testRoom.pendingRoll")}</div>
                    <PendingRollDebugPanel
                      pendingRoll={view.pendingRoll}
                      send={send}
                      sendAction={sendAction}
                    />
                  </div>
                </div>
              </div>
            ) : null}
            {activeTab === "snapshot" ? (
              <SnapshotDebugPanel snapshot={vm.testRoomSnapshot} roomId={vm.roomId} send={send} />
            ) : null}
            {activeTab === "state" ? (
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
            ) : null}
          </div>
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
            className="btn btn-danger w-full"
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
            className="btn btn-danger w-full"
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
