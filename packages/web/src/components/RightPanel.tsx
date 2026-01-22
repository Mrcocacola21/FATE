import type { FC } from "react";
import type { GameAction, GameState, PlayerId } from "rules";
import type { ActionMode } from "../store";

interface RightPanelProps {
  view: GameState;
  playerId: PlayerId;
  selectedUnitId: string | null;
  actionMode: ActionMode;
  placeUnitId: string | null;
  onSelectUnit: (unitId: string | null) => void;
  onSetActionMode: (mode: ActionMode) => void;
  onSetPlaceUnit: (unitId: string | null) => void;
  onSendAction: (action: GameAction) => void;
}

export const RightPanel: FC<RightPanelProps> = ({
  view,
  playerId,
  selectedUnitId,
  actionMode,
  placeUnitId,
  onSelectUnit,
  onSetActionMode,
  onSetPlaceUnit,
  onSendAction,
}) => {
  const friendlyUnits = Object.values(view.units).filter(
    (u) => u.owner === playerId
  );
  const unplacedUnits = friendlyUnits.filter((u) => !u.position);
  const selectedUnit = friendlyUnits.find((u) => u.id === selectedUnitId) ?? null;

  const queue = view.turnQueue?.length ? view.turnQueue : view.turnOrder;
  const expectedUnitId = queue?.[
    view.turnQueue?.length ? view.turnQueueIndex : view.turnOrderIndex
  ];
  const canStartTurn =
    view.phase === "battle" &&
    !view.activeUnitId &&
    expectedUnitId &&
    friendlyUnits.some((u) => u.id === expectedUnitId);

  return (
    <div className="space-y-6">
      <div className="rounded border border-slate-200 bg-white/80 p-4">
        <div className="text-sm text-slate-500">Status</div>
        <div className="mt-2 space-y-1 text-sm">
          <div>Phase: {view.phase}</div>
          <div>Current Player: {view.currentPlayer}</div>
          <div>Round: {view.roundNumber}</div>
          <div>Turn: {view.turnNumber}</div>
          <div>Active Unit: {view.activeUnitId ?? "-"}</div>
        </div>
        {canStartTurn && expectedUnitId && (
          <button
            className="mt-3 w-full rounded bg-teal-500 px-3 py-2 text-sm font-semibold text-white"
            onClick={() =>
              onSendAction({ type: "unitStartTurn", unitId: expectedUnitId })
            }
          >
            Start Turn: {expectedUnitId}
          </button>
        )}
      </div>

      {view.phase === "placement" && (
        <div className="rounded border border-slate-200 bg-white/80 p-4">
          <div className="text-sm text-slate-500">Placement</div>
          <div className="mt-3 space-y-2">
            {unplacedUnits.length === 0 && (
              <div className="text-xs text-slate-400">No unplaced units.</div>
            )}
            {unplacedUnits.map((unit) => (
              <button
                key={unit.id}
                className={`w-full rounded px-3 py-2 text-left text-xs ${
                  placeUnitId === unit.id
                    ? "bg-teal-500 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
                onClick={() => {
                  onSetPlaceUnit(unit.id);
                  onSetActionMode("place");
                }}
              >
                {unit.id}
              </button>
            ))}
          </div>
          {actionMode === "place" && placeUnitId && (
            <div className="mt-3 text-xs text-slate-400">
              Click a valid cell to place {placeUnitId}.
            </div>
          )}
        </div>
      )}

      {view.phase === "battle" && (
        <div className="rounded border border-slate-200 bg-white/80 p-4">
          <div className="text-sm text-slate-500">Selected Unit</div>
          {selectedUnit ? (
            <div className="mt-2 space-y-2 text-xs">
              <div>ID: {selectedUnit.id}</div>
              <div>Class: {selectedUnit.class}</div>
              <div>HP: {selectedUnit.hp}</div>
              <div>
                Position:{" "}
                {selectedUnit.position
                  ? `${selectedUnit.position.col},${selectedUnit.position.row}`
                  : "-"}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-slate-400">Select a unit.</div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <button
              className="rounded bg-slate-100 px-2 py-2"
              onClick={() => onSetActionMode("move")}
              disabled={!selectedUnit}
            >
              Move
            </button>
            <button
              className="rounded bg-slate-100 px-2 py-2"
              onClick={() => onSetActionMode("attack")}
              disabled={!selectedUnit}
            >
              Attack
            </button>
            <button
              className="rounded bg-slate-100 px-2 py-2"
              onClick={() =>
                selectedUnit &&
                onSendAction({ type: "enterStealth", unitId: selectedUnit.id })
              }
              disabled={!selectedUnit}
            >
              Enter Stealth
            </button>
            <button
              className="rounded bg-slate-100 px-2 py-2"
              onClick={() =>
                selectedUnit &&
                onSendAction({
                  type: "searchStealth",
                  unitId: selectedUnit.id,
                  mode: "move",
                })
              }
              disabled={!selectedUnit}
            >
              Search (Move)
            </button>
            <button
              className="rounded bg-slate-100 px-2 py-2"
              onClick={() =>
                selectedUnit &&
                onSendAction({
                  type: "searchStealth",
                  unitId: selectedUnit.id,
                  mode: "action",
                })
              }
              disabled={!selectedUnit}
            >
              Search (Action)
            </button>
            <button
              className="rounded bg-slate-100 px-2 py-2"
              onClick={() => {
                if (!selectedUnit) return;
                if (selectedUnit.class === "trickster") {
                  onSetActionMode("aoe");
                }
              }}
              disabled={!selectedUnit || selectedUnit.class !== "trickster"}
            >
              Trickster AoE
            </button>
            <button
              className="rounded bg-slate-100 px-2 py-2"
              onClick={() => onSendAction({ type: "endTurn" })}
            >
              End Turn
            </button>
            <button
              className="rounded bg-slate-200 px-2 py-2"
              onClick={() => {
                onSetActionMode(null);
                onSelectUnit(null);
              }}
            >
              Clear
            </button>
          </div>

          {actionMode && (
            <div className="mt-3 text-xs text-slate-400">
              Mode: {actionMode}. Click a board cell to apply.
            </div>
          )}
        </div>
      )}

      <div className="rounded border border-slate-200 bg-white/80 p-4">
        <div className="text-sm text-slate-500">Units</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          {friendlyUnits.map((unit) => (
            <button
              key={unit.id}
              className={`rounded px-2 py-2 text-left ${
                selectedUnitId === unit.id
                  ? "bg-teal-500 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
              onClick={() => onSelectUnit(unit.id)}
            >
              {unit.class} {unit.position ? "@" : ""}{" "}
              {unit.position
                ? `${unit.position.col},${unit.position.row}`
                : "-"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
