import type { FC } from "react";
import type { GameAction, PlayerId, PlayerView, MoveMode } from "rules";
import { HERO_CATALOG } from "../figures/catalog";
import { KAISER_DORA_ID, TRICKSTER_AOE_ID } from "../rulesHints";
import type { ActionMode } from "../store";
import type { PlayerRole } from "../ws";

interface RightPanelProps {
  view: PlayerView;
  role: PlayerRole | null;
  selectedUnitId: string | null;
  actionMode: ActionMode;
  placeUnitId: string | null;
  moveOptions:
    | {
        unitId: string;
        roll?: number | null;
        legalTo: { col: number; row: number }[];
        mode?: MoveMode;
        modes?: MoveMode[];
      }
    | null;
  joined: boolean;
  pendingRoll: boolean;
  onSelectUnit: (unitId: string | null) => void;
  onSetActionMode: (mode: ActionMode) => void;
  onSetPlaceUnit: (unitId: string | null) => void;
  onMoveRequest: (unitId: string, mode?: MoveMode) => void;
  onSendAction: (action: GameAction) => void;
  onHoverAbility: (abilityId: string | null) => void;
}

function classBadge(unitClass: string): { label: string; marker?: string } {
  switch (unitClass) {
    case "spearman":
      return { label: "Sp" };
    case "rider":
      return { label: "Rd" };
    case "trickster":
      return { label: "Tr" };
    case "assassin":
      return { label: "As", marker: "D" };
    case "berserker":
      return { label: "Be" };
    case "archer":
      return { label: "Ar", marker: "B" };
    case "knight":
      return { label: "Kn" };
    default:
      return { label: unitClass.slice(0, 2) };
  }
}

function formatMoveMode(mode: MoveMode): string {
  switch (mode) {
    case "normal":
      return "Normal";
    case "rider":
      return "Rider";
    case "berserker":
      return "Berserker";
    case "archer":
      return "Archer";
    case "trickster":
      return "Trickster";
    case "assassin":
      return "Assassin";
    case "spearman":
      return "Spearman";
    case "knight":
      return "Knight";
    default:
      return mode;
  }
}

export const RightPanel: FC<RightPanelProps> = ({
  view,
  role,
  selectedUnitId,
  actionMode,
  placeUnitId,
  moveOptions,
  joined,
  pendingRoll,
  onSelectUnit,
  onSetActionMode,
  onSetPlaceUnit,
  onMoveRequest,
  onSendAction,
  onHoverAbility,
}) => {
  const playerId: PlayerId | null = role === "P1" || role === "P2" ? role : null;
  const isSpectator = role === "spectator";
  const friendlyUnits = Object.values(view.units).filter(
    (u) => (playerId ? u.owner === playerId : false)
  );
  const unplacedUnits = friendlyUnits.filter((u) => !u.position);
  const selectedUnit = friendlyUnits.find((u) => u.id === selectedUnitId) ?? null;
  const heroDefinition = selectedUnit?.heroId
    ? HERO_CATALOG.find((hero) => hero.id === selectedUnit.heroId)
    : undefined;
  const abilityViews = selectedUnit
    ? view.abilitiesByUnitId?.[selectedUnit.id] ?? []
    : [];

  const doraAbility = abilityViews.find((ability) => ability.id === KAISER_DORA_ID);
  const doraDisabledReason = doraAbility?.disabledReason;
  const doraDisabled = !doraAbility || !doraAbility.isAvailable;
  const hideDoraCharges = !!selectedUnit?.transformed;
  const doraChargeLabel = doraAbility && !hideDoraCharges
    ? doraAbility.chargeUnlimited
      ? `${doraAbility.currentCharges ?? 0}`
      : doraAbility.chargeRequired !== undefined
      ? `${doraAbility.currentCharges ?? 0}/${doraAbility.chargeRequired}`
      : null
    : null;
  const moveModeOptions =
    !pendingRoll && moveOptions && selectedUnit && moveOptions.unitId === selectedUnit.id
      ? moveOptions.modes ?? null
      : null;

  const queue = view.turnQueue?.length ? view.turnQueue : view.turnOrder;
  const queueIndex = view.turnQueue?.length
    ? view.turnQueueIndex
    : view.turnOrderIndex;
  const expectedUnitId = queue?.[queueIndex];
  const canStartTurn =
    joined &&
    !pendingRoll &&
    !isSpectator &&
    view.phase === "battle" &&
    !view.activeUnitId &&
    expectedUnitId &&
    friendlyUnits.some((u) => u.id === expectedUnitId);

  const isMyTurn = playerId ? view.currentPlayer === playerId : false;
  const isActive = selectedUnit && view.activeUnitId === selectedUnit.id;
  const canAct =
    joined && !pendingRoll && !isSpectator && isMyTurn && !!selectedUnit && isActive;

  const economy = selectedUnit?.turn ?? {
    moveUsed: false,
    attackUsed: false,
    actionUsed: false,
    stealthUsed: false,
  };

  const legalIntents = view.legalIntents;

  const canStealth =
    selectedUnit?.class === "assassin" || selectedUnit?.class === "archer";

  const moveDisabled = !canAct || economy.moveUsed;
  const attackDisabled = !canAct || economy.attackUsed || economy.actionUsed;
  const stealthDisabled = !canAct || economy.stealthUsed || !canStealth;
  const searchMoveDisabled = !canAct || !legalIntents?.canSearchMove;
  const searchActionDisabled = !canAct || !legalIntents?.canSearchAction;

  const abilityAvailable = selectedUnit?.class === "trickster";
  const abilityDisabled =
    !canAct || economy.attackUsed || economy.actionUsed || !abilityAvailable;

  const moveRoll =
    (view.pendingMove && view.pendingMove.unitId === selectedUnit?.id
      ? view.pendingMove.roll
      : null) ??
    (moveOptions && moveOptions.unitId === selectedUnit?.id
      ? moveOptions.roll
      : null);

  const placementEnabled =
    joined && !pendingRoll && !isSpectator && isMyTurn && view.phase === "placement";

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
          {isSpectator && (
            <div className="text-xs text-amber-600">Spectating</div>
          )}
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
        {legalIntents && (
          <div className="mt-3 space-y-1 text-[10px] text-slate-500">
            <div>
              Legal: SM={legalIntents.canSearchMove ? "true" : "false"} SA=
              {legalIntents.canSearchAction ? "true" : "false"} (reasons:{" "}
              {legalIntents.searchMoveReason ?? "-"} /{" "}
              {legalIntents.searchActionReason ?? "-"})
            </div>
            <div>
              Economy: moveUsed={economy.moveUsed ? "true" : "false"} actionUsed=
              {economy.actionUsed ? "true" : "false"} attackUsed=
              {economy.attackUsed ? "true" : "false"} stealthUsed=
              {economy.stealthUsed ? "true" : "false"}
            </div>
            <div>pendingRoll: {pendingRoll ? "true" : "false"}</div>
          </div>
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
                disabled={!placementEnabled}
              >
                {unit.id}
              </button>
            ))}
          </div>
          {actionMode === "place" && placeUnitId && (
            <div className="mt-3 text-xs text-slate-400">
              Click a highlighted cell to place {placeUnitId}.
            </div>
          )}
          {!joined && (
            <div className="mt-2 text-xs text-amber-600">
              Waiting for room join to place units.
            </div>
          )}
          {!pendingRoll && joined && !isSpectator && !isMyTurn && (
            <div className="mt-2 text-xs text-amber-600">
              Waiting for the other player to place.
            </div>
          )}
          {isSpectator && (
            <div className="mt-2 text-xs text-amber-600">
              Spectators cannot place units.
            </div>
          )}
          {pendingRoll && (
            <div className="mt-2 text-xs text-amber-600">
              Resolve the pending roll before placing units.
            </div>
          )}
        </div>
      )}

      {view.phase === "battle" && (
        <div className="rounded border border-slate-200 bg-white/80 p-4">
          <div className="text-sm text-slate-500">Active Unit Panel</div>
          {selectedUnit ? (
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                  {classBadge(selectedUnit.class).label}
                  {classBadge(selectedUnit.class).marker && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-[9px] font-bold text-slate-700 shadow">
                      {classBadge(selectedUnit.class).marker}
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-semibold">
                    {heroDefinition?.name ?? selectedUnit.id}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Class {selectedUnit.class}
                    {heroDefinition ? ` (${selectedUnit.id})` : ""}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    HP {selectedUnit.hp}
                  </div>
                </div>
              </div>
              <div>
                Position:{" "}
                {selectedUnit.position
                  ? `${selectedUnit.position.col},${selectedUnit.position.row}`
                  : "-"}
              </div>
              {moveRoll !== null && moveRoll !== undefined && (
                <div className="text-[10px] text-slate-500">
                  Move roll: {moveRoll}
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-[10px] text-slate-600">
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    economy.moveUsed ? "bg-slate-200" : "bg-emerald-100"
                  }`}
                >
                  Move {economy.moveUsed ? "X" : "-"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    economy.attackUsed ? "bg-slate-200" : "bg-emerald-100"
                  }`}
                >
                  Attack {economy.attackUsed ? "X" : "-"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    economy.actionUsed ? "bg-slate-200" : "bg-emerald-100"
                  }`}
                >
                  Action {economy.actionUsed ? "X" : "-"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    economy.stealthUsed ? "bg-slate-200" : "bg-emerald-100"
                  }`}
                >
                  Stealth {economy.stealthUsed ? "X" : "-"}
                </span>
              </div>
              <div className="mt-4">
                <div className="text-[11px] font-semibold text-slate-600">
                  Abilities
                </div>
                {abilityViews.length === 0 && (
                  <div className="mt-2 text-[10px] text-slate-400">
                    No abilities available.
                  </div>
                )}
                <div className="mt-2 space-y-2">
                  {abilityViews.map((ability) => {
                    const hideCharges =
                      ability.id === KAISER_DORA_ID && selectedUnit?.transformed;
                    const chargeLabel = hideCharges
                      ? null
                      : ability.chargeUnlimited
                      ? ability.currentCharges ?? 0
                      : ability.chargeRequired !== undefined
                      ? `${ability.currentCharges ?? 0}/${ability.chargeRequired}`
                      : null;
                    const slotLabel =
                      ability.slot === "none"
                        ? "None"
                        : ability.slot === "action"
                        ? "Action"
                        : ability.slot === "move"
                        ? "Move"
                        : ability.slot === "attack"
                        ? "Attack"
                        : "Stealth";
                    const kindLabel =
                      ability.kind === "passive"
                        ? "Passive"
                        : ability.kind === "active"
                        ? "Active"
                        : ability.kind === "impulse"
                        ? "Impulse"
                        : "Phantasm";
                    return (
                      <div
                        key={ability.id}
                        className={`rounded border border-slate-200 p-2 text-[10px] ${
                          ability.isAvailable ? "bg-white" : "bg-slate-100 text-slate-400"
                        }`}
                        title={ability.disabledReason ?? ""}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold">{ability.name}</div>
                          <span className="rounded bg-slate-200 px-2 py-0.5 text-[9px] text-slate-700">
                            {kindLabel}
                          </span>
                        </div>
                        <div className="mt-1 text-slate-500">
                          {ability.description}
                        </div>
                        <div className="mt-1 text-slate-500">
                          Slot: {slotLabel}
                          {chargeLabel !== null ? ` | Charges: ${chargeLabel}` : ""}
                        </div>
                        {ability.disabledReason && (
                          <div className="mt-1 text-amber-700">
                            {ability.disabledReason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-slate-400">Select a unit.</div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <button
              className={`rounded px-2 py-2 ${
                moveDisabled ? "bg-slate-100 text-slate-400" : "bg-slate-200"
              }`}
              onClick={() => {
                if (!selectedUnit) return;
                if (
                  selectedUnit.class === "trickster" ||
                  selectedUnit.class === "berserker" ||
                  selectedUnit.transformed
                ) {
                  onMoveRequest(selectedUnit.id);
                  return;
                }
                onSetActionMode("move");
              }}
              disabled={moveDisabled}
            >
              Move
            </button>
            <button
              className={`rounded px-2 py-2 ${
                attackDisabled ? "bg-slate-100 text-slate-400" : "bg-slate-200"
              }`}
              onClick={() => onSetActionMode("attack")}
              disabled={attackDisabled}
            >
              Attack
            </button>
            {doraAbility && (
              <button
                className={`rounded px-2 py-2 ${
                  doraDisabled ? "bg-slate-100 text-slate-400" : "bg-slate-200"
                }`}
                onClick={() => {
                  if (!selectedUnit) return;
                  onSetActionMode("dora");
                }}
                disabled={doraDisabled}
                title={doraDisabledReason ?? ""}
              >
                {hideDoraCharges ? "DORA" : "Dora"}
                {doraChargeLabel ? ` (${doraChargeLabel})` : ""}
              </button>
            )}
            {doraAbility && doraDisabledReason && (
              <div className="col-span-2 text-[10px] text-slate-400">
                Dora disabled: {doraDisabledReason}
              </div>
            )}
            <button
              className={`rounded px-2 py-2 ${
                searchMoveDisabled ? "bg-slate-100 text-slate-400" : "bg-slate-200"
              }`}
              onClick={() =>
                selectedUnit &&
                onSendAction({
                  type: "searchStealth",
                  unitId: selectedUnit.id,
                  mode: "move",
                })
              }
              disabled={searchMoveDisabled}
            >
              Search (Move)
            </button>
            <button
              className={`rounded px-2 py-2 ${
                searchActionDisabled
                  ? "bg-slate-100 text-slate-400"
                  : "bg-slate-200"
              }`}
              onClick={() =>
                selectedUnit &&
                onSendAction({
                  type: "searchStealth",
                  unitId: selectedUnit.id,
                  mode: "action",
                })
              }
              disabled={searchActionDisabled}
            >
              Search (Action)
            </button>
            {searchMoveDisabled && legalIntents?.searchMoveReason && (
              <div className="col-span-2 text-[10px] text-slate-400">
                Search (Move) disabled: {legalIntents.searchMoveReason}
              </div>
            )}
            {searchActionDisabled && legalIntents?.searchActionReason && (
              <div className="col-span-2 text-[10px] text-slate-400">
                Search (Action) disabled: {legalIntents.searchActionReason}
              </div>
            )}
            <button
              className={`rounded px-2 py-2 ${
                stealthDisabled ? "bg-slate-100 text-slate-400" : "bg-slate-200"
              }`}
              onClick={() =>
                selectedUnit &&
                onSendAction({ type: "enterStealth", unitId: selectedUnit.id })
              }
              disabled={stealthDisabled}
            >
              Enter Stealth
            </button>
            <button
              className={`rounded px-2 py-2 ${
                abilityDisabled ? "bg-slate-100 text-slate-400" : "bg-slate-200"
              }`}
              onClick={() =>
                selectedUnit &&
                onSendAction({
                  type: "useAbility",
                  unitId: selectedUnit.id,
                  abilityId: TRICKSTER_AOE_ID,
                })
              }
              onMouseEnter={() => onHoverAbility(TRICKSTER_AOE_ID)}
              onMouseLeave={() => onHoverAbility(null)}
              onFocus={() => onHoverAbility(TRICKSTER_AOE_ID)}
              onBlur={() => onHoverAbility(null)}
              disabled={abilityDisabled}
            >
              {abilityAvailable ? "Trickster AoE" : "Use Ability"}
            </button>
            {abilityAvailable && (
              <div className="text-[10px] text-slate-500">
                AoE: 5x5, hits allies (not self).
              </div>
            )}
            <button
              className={`rounded px-2 py-2 ${
                isMyTurn && joined && !isSpectator
                  ? "bg-slate-200"
                  : "bg-slate-100 text-slate-400"
              }`}
              onClick={() => onSendAction({ type: "endTurn" })}
              disabled={!isMyTurn || !joined || isSpectator || pendingRoll}
            >
              End Turn
            </button>
            <button
              className="rounded bg-slate-100 px-2 py-2"
              onClick={() => {
                onSetActionMode(null);
                onSelectUnit(null);
              }}
            >
              Clear
            </button>
          </div>

          {moveModeOptions && selectedUnit && (
            <div className="mt-3 text-xs">
              <div className="text-[11px] text-slate-500">Choose move mode:</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {moveModeOptions.map((mode) => (
                  <button
                    key={mode}
                    className={`rounded px-2 py-1 text-[10px] ${
                      moveDisabled ? "bg-slate-100 text-slate-400" : "bg-slate-200"
                    }`}
                    onClick={() => onMoveRequest(selectedUnit.id, mode)}
                    disabled={moveDisabled}
                  >
                    {formatMoveMode(mode)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {actionMode && (
            <div className="mt-3 text-xs text-slate-400">
              {actionMode === "dora"
                ? "Dora: select a center cell on the archer line."
                : `Mode: ${actionMode}. Click a highlighted cell to apply.`}
            </div>
          )}
        </div>
      )}

      <div className="rounded border border-slate-200 bg-white/80 p-4">
        <div className="text-sm text-slate-500">Units</div>
        <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
          {friendlyUnits.map((unit) => {
            const badge = classBadge(unit.class);
            const berserkCharges = unit.charges?.berserkAutoDefense;
            return (
              <button
                key={unit.id}
                className={`flex items-center gap-3 rounded px-2 py-2 text-left ${
                  selectedUnitId === unit.id
                    ? "bg-teal-500 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
                onClick={() => onSelectUnit(unit.id)}
              >
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                  {badge.label}
                  {badge.marker && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-[9px] font-bold text-slate-700 shadow">
                      {badge.marker}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-[11px] font-semibold">{unit.id}</div>
                  <div className="text-[10px] opacity-70">
                    HP {unit.hp}
                    {unit.position
                      ? ` - ${unit.position.col},${unit.position.row}`
                      : " - unplaced"}
                  </div>
                </div>
                {(unit.class === "berserker" || unit.transformed) && (
                  <span className="rounded-full bg-amber-200 px-2 py-1 text-[10px] font-semibold text-amber-900">
                    BD {berserkCharges ?? 0}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

