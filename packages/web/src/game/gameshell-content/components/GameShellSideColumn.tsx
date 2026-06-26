import type { FC } from "react";
import { EventLog } from "../../../components/EventLog";
import { TurnQueueTracker } from "../../../components/TurnQueueTracker";
import { PanelCard, SectionHeader, StatusBadge } from "../../../components/ui";
import { PAPYRUS_LONG_BONE_ID, PAPYRUS_ORANGE_BONE_ID } from "../../../rulesHints";
import { RightPanel } from "../../components/RightPanel/RightPanel";
import { useI18n } from "../../../i18n";
import { TestRoomPanel } from "../../../testRoom/TestRoomPanel";
import { shouldShowTestRoomPanel } from "../../../testRoom/testRoomApi";
import { GameModeSelector } from "../../../modes/GameModeSelector";
import { getGameModeDescription, getGameModeName } from "../../../modes/modeLabels";

interface GameShellSideColumnProps {
  vm: any;
}

function ruleDeclarationKey(ruleId: string | null | undefined) {
  switch (ruleId) {
    case "court":
      return "court";
    case "chess_party":
      return "chessParty";
    case "moon_game":
      return "moonGame";
    case "advantage_game":
      return "advantageGame";
    default:
      return null;
  }
}

function RuleDeclarationStatus({ vm }: { vm: any }) {
  const { t } = useI18n();
  const rule = vm.view?.ruleDeclaration;
  const selectedRuleId = rule?.selectedRuleId ?? null;
  const selectedKey = ruleDeclarationKey(selectedRuleId);
  const pendingMeta = vm.pendingMeta;
  const isRuleChoicePending = pendingMeta?.kind === "ruleDeclarationChoice";

  if (!selectedKey && !isRuleChoicePending) {
    return null;
  }

  const court = rule?.ruleData?.court;
  const chess = rule?.ruleData?.chessParty;
  const moon = rule?.ruleData?.moonGame;
  const advantage = rule?.ruleData?.advantageGame;

  return (
    <PanelCard variant="parchment" className="p-4">
      <SectionHeader
        kicker={t("ruleDeclarations.title")}
        title={
          selectedKey
            ? t(`ruleDeclarations.${selectedKey}.name`)
            : t("ruleDeclarations.notSelected")
        }
        description={
          selectedKey
            ? t(`ruleDeclarations.${selectedKey}.summary`)
            : t("ruleDeclarations.chooseDescription")
        }
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {selectedKey ? (
          <StatusBadge tone="special">{t("ruleDeclarations.selected")}</StatusBadge>
        ) : null}
        {rule?.chooserPlayer ? (
          <StatusBadge tone="info">
            {t("ruleDeclarations.chooser", { player: rule.chooserPlayer })}
          </StatusBadge>
        ) : null}
        {isRuleChoicePending ? (
          <StatusBadge tone={pendingMeta.player === vm.playerId ? "warning" : "neutral"}>
            {pendingMeta.player === vm.playerId
              ? t("game.choicePending")
              : t("ruleDeclarations.waiting")}
          </StatusBadge>
        ) : null}
      </div>
      {court ? (
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-300">
          {t("ruleDeclarations.courtRoles", {
            attacker: court.attackerPlayer ?? "-",
            defender: court.defenderPlayer ?? "-",
          })}
        </p>
      ) : null}
      {chess ? (
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-300">
          {t("ruleDeclarations.chessKings", {
            p1: chess.kings?.P1 ?? "-",
            p2: chess.kings?.P2 ?? "-",
          })}
        </p>
      ) : null}
      {moon?.crater ? (
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-300">
          {t("ruleDeclarations.moonCrater", {
            col: moon.crater.center?.col ?? "-",
            row: moon.crater.center?.row ?? "-",
          })}
        </p>
      ) : null}
      {moon?.noStealthUntilRoundEnd ? (
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-300">
          {t("ruleDeclarations.moonNoStealth")}
        </p>
      ) : null}
      {moon?.reverseTurnOrderUntilRoundEnd ? (
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-300">
          {t("ruleDeclarations.moonReverse")}
        </p>
      ) : null}
      {advantage?.threshold ? (
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-300">
          {t("ruleDeclarations.advantageThreshold", {
            threshold: advantage.threshold,
          })}
        </p>
      ) : null}
    </PanelCard>
  );
}

export const GameShellSideColumn: FC<GameShellSideColumnProps> = ({ vm }) => {
  const { t } = useI18n();
  return (
    <aside className="scroll-panel min-w-0 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
      {shouldShowTestRoomPanel(vm.roomMeta?.roomMode, vm.canControlTestRoom) ? (
        <TestRoomPanel vm={vm} />
      ) : null}
      <RuleDeclarationStatus vm={vm} />
      {vm.view.phase === "lobby" ? (
        <PanelCard variant="parchment" className="p-5">
          <SectionHeader
            kicker={t("game.stagingRoom")}
            title={t("game.matchLobby")}
            description={t("game.matchLobbyDescription")}
          />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(["P1", "P2"] as const).map((seat) => (
              <div key={seat} className="panel-card-muted p-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {seat}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge tone={vm.roomMeta?.players[seat] ? "success" : "neutral"}>
                    {vm.roomMeta?.players[seat] ? t("common.occupied") : t("common.open")}
                  </StatusBadge>
                  <StatusBadge tone={vm.readyStatus[seat] ? "success" : "warning"}>
                    {vm.readyStatus[seat] ? t("common.ready") : t("common.waiting")}
                  </StatusBadge>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge tone="info">
              {t("lobby.spectators", { count: vm.roomMeta?.spectators ?? 0 })}
            </StatusBadge>
            <StatusBadge tone={vm.isHost ? "special" : "neutral"}>
              {t("game.you", { role: vm.role ? t(`roles.${vm.role}`) : "-" })}
              {vm.isHost ? ` / ${t("roles.host")}` : ""}
            </StatusBadge>
            <StatusBadge tone="info">
              {getGameModeName(vm.roomMeta?.gameMode ?? "standard", t)}
            </StatusBadge>
          </div>
          {vm.roomMeta?.roomMode === "normal" ? (
            <GameModeSelector
              value={vm.roomMeta?.gameMode ?? "standard"}
              isHost={vm.isHost}
              disabled={!!vm.pendingMeta || !!vm.roomMeta?.draftState || vm.view.phase !== "lobby"}
              onChange={vm.setGameMode}
            />
          ) : null}
          {vm.roomMeta?.gameMode === "classic" ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-200">
              {t("modes.classic.figureSetWarning")}
            </div>
          ) : null}
          {vm.roomMeta?.gameMode ? (
            <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {getGameModeDescription(vm.roomMeta.gameMode, t)}
            </p>
          ) : null}
          {vm.seat ? (
            <button
              type="button"
              className={`btn mt-4 w-full ${vm.playerReady ? "btn-warning" : "btn-primary"}`}
              onClick={() => vm.setReady(!vm.playerReady)}
              disabled={!vm.joined || !!vm.pendingMeta}
            >
              {vm.playerReady ? t("game.markNotReady") : t("game.readyUp")}
            </button>
          ) : null}
          {vm.seat ? (
            <button
              type="button"
              className="btn btn-secondary mt-2 w-full"
              onClick={() => vm.switchRole("spectator")}
              disabled={!vm.joined || !!vm.pendingMeta}
            >
              {t("game.switchSpectator")}
            </button>
          ) : null}
          {vm.isHost ? (
            <button
              type="button"
              className="btn btn-strong mt-3 w-full"
              onClick={() => vm.startGame()}
              disabled={!vm.canStartGame}
              title={vm.canStartGame ? t("game.startMatch") : t("game.startBlocked")}
            >
              {vm.roomMeta?.gameMode === "draft" ? t("draft.startDraft") : t("game.startGame")}
            </button>
          ) : null}
        </PanelCard>
      ) : null}

      {vm.view.phase !== "lobby" ? (
        <>
          <TurnQueueTracker view={vm.view} playerId={vm.playerId} />
          <RightPanel
            view={vm.view}
            role={vm.canControlTestRoom && vm.selectedUnit ? vm.selectedUnit.owner : vm.role}
            selectedUnitId={vm.selectedUnitId}
            actionMode={vm.actionMode}
            placeUnitId={vm.placeUnitId}
            moveOptions={vm.moveOptions}
            joined={vm.joined}
            pendingRoll={vm.hasBlockingRoll}
            onHoverAbility={vm.setHoveredAbilityId}
            onHoverActionMode={(mode) =>
              vm.setHoverPreview(mode ? { type: "actionMode", mode } : null)
            }
            onSelectUnit={(id) => {
              vm.setSelectedUnit(id);
              vm.setActionMode(null);
            }}
            onSetActionMode={vm.setActionMode}
            onSetPlaceUnit={vm.setPlaceUnitId}
            onMoveRequest={(unitId, mode) => {
              vm.requestMove(unitId, mode);
              if (mode) {
                vm.setMoveOptions(null);
              }
              vm.setActionMode("move");
            }}
            onSendAction={(action) => {
              vm.sendGameAction(action);
              const preserveMode =
                action.type === "useAbility" &&
                (action.abilityId === PAPYRUS_ORANGE_BONE_ID ||
                  action.abilityId === PAPYRUS_LONG_BONE_ID);
              if (action.type !== "requestMoveOptions" && !preserveMode) {
                vm.setActionMode(null);
              }
            }}
            papyrusLineAxis={vm.papyrusLineAxis}
            onSetPapyrusLineAxis={vm.setPapyrusLineAxis}
          />
        </>
      ) : null}
      <EventLog events={vm.events} clientLog={vm.clientLog} />
    </aside>
  );
};
