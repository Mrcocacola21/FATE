import { PAPYRUS_LONG_BONE_ID } from "../../rulesHints";
import type { Translate } from "../../i18n";
import { buildRightPanelViewModel } from "../components/RightPanel/rightPanelViewModel";
import type { RightPanelProps } from "../components/RightPanel/types";
import { canInspectUnit } from "../unitInspection";
import type { GameShellViewModel } from "./hooks/useGameShellViewModel";

type UnitSelectionState = Pick<
  GameShellViewModel,
  | "view"
  | "playerId"
  | "canControlTestRoom"
  | "allowUnitInspection"
  | "setSelectedUnit"
  | "setActionMode"
>;

/**
 * The one way a click on the board or in the queue selects a figure. Own figures and the
 * sandbox controller select as before; another player's figure opens only for viewing.
 */
export function selectUnitFromBattle(vm: UnitSelectionState, unitId: string | null) {
  const unit = unitId ? vm.view?.units[unitId] : null;
  const foreign = !!unitId && !vm.canControlTestRoom && unit?.owner !== vm.playerId;
  if (foreign && !(vm.allowUnitInspection && canInspectUnit(unit, vm.playerId))) return;
  vm.setSelectedUnit(unitId);
  vm.setActionMode(null);
}

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
    onSelectUnit: (id) => selectUnitFromBattle(vm, id),
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
