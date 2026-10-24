import { PAPYRUS_LONG_BONE_ID } from "../../rulesHints";
import type { Translate } from "../../i18n";
import { buildRightPanelViewModel } from "../components/RightPanel/rightPanelViewModel";
import type { RightPanelProps } from "../components/RightPanel/types";
import type { GameShellViewModel } from "./hooks/useGameShellViewModel";

/** One wiring of shell state into panel props, shared by the side tabs and the match info column. */
export function buildMatchPanelModel(vm: GameShellViewModel, t: Translate) {
  const effectiveRole = vm.canControlTestRoom && vm.selectedUnit ? vm.selectedUnit.owner : vm.role;
  const rightPanelProps: RightPanelProps = {
    view: vm.view!,
    role: effectiveRole,
    selectedUnitId: vm.selectedUnitId,
    actionMode: vm.actionMode,
    targetingMode: vm.targetingMode,
    placeUnitId: vm.placeUnitId,
    moveOptions: vm.moveOptions,
    joined: vm.joined,
    pendingRoll: vm.hasBlockingRoll,
    onHoverAbility: vm.setHoveredAbilityId,
    onHoverActionMode: (mode) => vm.setHoverPreview(mode ? { type: "actionMode", mode } : null),
    onSelectUnit: (id) => {
      vm.setSelectedUnit(id);
      vm.setActionMode(null);
    },
    onSetActionMode: vm.setActionMode,
    onSetPlaceUnit: vm.setPlaceUnitId,
    onMoveRequest: (unitId, mode) => {
      vm.requestMove(unitId, mode);
      if (mode) {
        vm.setMoveOptions(null);
        vm.setActionMode("move");
      }
    },
    pendingLokiLaughtOption: vm.pendingLokiLaughtOption,
    onQueueLokiLaughtOption: vm.queueLokiLaughtOption,
    onSendAction: (action) => {
      vm.sendGameAction(action);
      const preserveMode =
        action.type === "useAbility" && action.abilityId === PAPYRUS_LONG_BONE_ID;
      if (action.type !== "requestMoveOptions" && !preserveMode) {
        vm.setActionMode(null);
      }
    },
    papyrusLineAxis: vm.papyrusLineAxis,
    onSetPapyrusLineAxis: vm.setPapyrusLineAxis,
  };
  return { rightPanelProps, panelVm: buildRightPanelViewModel(rightPanelProps, t) };
}

export type MatchPanelModel = ReturnType<typeof buildMatchPanelModel>;
