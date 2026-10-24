import type { FC } from "react";
import type { GameShellViewModel } from "../hooks/useGameShellViewModel";
import type { MatchPanelModel } from "../matchPanelModel";
import { ActiveFieldInfo } from "../../components/ActiveFieldInfo";
import { InitiativeColumn } from "../../components/InitiativeColumn";
import { StatusSection } from "../../components/RightPanel/sections/StatusSection";
import { RuleDeclarationStatus } from "./RuleDeclarationStatus";

/**
 * Match-wide information that used to live in the Rules tab: turn queue, active field,
 * rule declaration and the match state card (which also hosts "start turn").
 */
export const MatchInfoPanel: FC<{ vm: GameShellViewModel; model: MatchPanelModel }> = ({
  vm,
  model,
}) => {
  const { panelVm, rightPanelProps } = model;
  return (
    <div className="space-y-3" data-testid="match-info-panel">
      <InitiativeColumn
        view={vm.view!}
        playerId={vm.playerId}
        selectedUnitId={vm.selectedUnitId}
        onSelectUnit={rightPanelProps.onSelectUnit}
      />
      <ActiveFieldInfo view={vm.view!} />
      <RuleDeclarationStatus vm={vm} />
      <StatusSection
        view={vm.view!}
        selectedUnit={panelVm.selectedVisibleUnit}
        stormActive={panelVm.stormActive}
        forestMarkers={panelVm.forestMarkers}
        isSpectator={panelVm.isSpectator}
        canStartTurn={panelVm.canStartTurn}
        expectedUnitId={panelVm.expectedUnitId}
        legalIntents={panelVm.legalIntents}
        pendingRoll={rightPanelProps.pendingRoll}
        onStartTurn={panelVm.onStartTurn}
      />
    </div>
  );
};
