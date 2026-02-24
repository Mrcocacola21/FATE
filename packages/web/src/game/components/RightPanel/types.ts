import type {
  GameAction,
  MoveMode,
  PapyrusLineAxis,
  PlayerView,
} from "rules";
import type { ActionMode, ActionPreviewMode } from "../../../store";
import type { PlayerRole } from "../../../ws";

export type RightPanelMoveOptions =
  | {
      unitId: string;
      roll?: number | null;
      legalTo: { col: number; row: number }[];
      mode?: MoveMode;
      modes?: MoveMode[];
    }
  | null;

export interface RightPanelProps {
  view: PlayerView;
  role: PlayerRole | null;
  selectedUnitId: string | null;
  actionMode: ActionMode;
  placeUnitId: string | null;
  moveOptions: RightPanelMoveOptions;
  joined: boolean;
  pendingRoll: boolean;
  onSelectUnit: (unitId: string | null) => void;
  onSetActionMode: (mode: ActionMode) => void;
  onSetPlaceUnit: (unitId: string | null) => void;
  onMoveRequest: (unitId: string, mode?: MoveMode) => void;
  onSendAction: (action: GameAction) => void;
  onHoverAbility: (abilityId: string | null) => void;
  onHoverActionMode: (mode: ActionPreviewMode | null) => void;
  papyrusLineAxis: PapyrusLineAxis;
  onSetPapyrusLineAxis: (axis: PapyrusLineAxis) => void;
}

export interface TurnEconomyState {
  moveUsed: boolean;
  attackUsed: boolean;
  actionUsed: boolean;
  stealthUsed: boolean;
}

export interface ForestMarkerView {
  owner: string;
  position: { col: number; row: number };
}
