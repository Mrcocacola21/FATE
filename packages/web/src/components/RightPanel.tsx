import type { FC } from "react";
import type { AbilityView, GameAction, PlayerId, PlayerView, MoveMode, UnitState } from "rules";
import { HERO_CATALOG } from "../figures/catalog";
import {
  EL_CID_DEMON_DUELIST_ID,
  EL_CID_KOLADA_ID,
  EL_CID_TISONA_ID,
  KAISER_DORA_ID,
  CHIKATILO_ASSASSIN_MARK_ID,
  CHIKATILO_ID,
  FALSE_TRAIL_TOKEN_ID,
  FOREST_AURA_RADIUS,
  LECHY_GUIDE_TRAVELER_ID,
  LECHY_CONFUSE_TERRAIN_ID,
  LECHY_ID,
  ARENA_STORM_ID,
  GROZNY_INVADE_TIME_ID,
  GROZNY_TYRANT_ID,
  TRICKSTER_AOE_ID,
} from "../rulesHints";
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
  onHoverAttackRange: (unitId: string | null, hovering: boolean) => void;
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

function isRangedSingleTargetClass(unitClass: UnitState["class"]): boolean {
  return (
    unitClass === "archer" ||
    unitClass === "spearman" ||
    unitClass === "trickster"
  );
}

type AbilityChargeState = {
  current: number;
  max: number | null;
  enabled: boolean;
  reason?: string;
};

function getAbilityChargeState(
  abilityId: string,
  unitState: UnitState | null,
  abilityMeta?: AbilityView | null
): AbilityChargeState {
  const current =
    abilityMeta?.currentCharges ?? unitState?.charges?.[abilityId] ?? 0;
  if (abilityMeta?.chargeUnlimited) {
    return { current, max: null, enabled: true };
  }

  const required =
    typeof abilityMeta?.chargeRequired === "number"
      ? abilityMeta.chargeRequired
      : null;
  if (required === null) {
    return { current, max: null, enabled: true };
  }

  const max =
    typeof abilityMeta?.maxCharges === "number"
      ? abilityMeta.maxCharges
      : required;
  const enabled = current >= required;
  return {
    current,
    max,
    enabled,
    reason: enabled ? undefined : "Not enough charges",
  };
}

function formatChargeLabel(
  abilityMeta: AbilityView | null | undefined,
  chargeState: AbilityChargeState,
  hideCharges: boolean
): string | null {
  if (!abilityMeta || hideCharges) return null;
  if (abilityMeta.chargeUnlimited) {
    return `${chargeState.current}`;
  }
  if (chargeState.max !== null) {
    return `${chargeState.current}/${chargeState.max}`;
  }
  return null;
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
  onHoverAttackRange,
}) => {
  const playerId: PlayerId | null = role === "P1" || role === "P2" ? role : null;
  const isSpectator = role === "spectator";
  const friendlyUnits = Object.values(view.units).filter(
    (u) => (playerId ? u.owner === playerId : false)
  );
  const hasFalseTrailToken = friendlyUnits.some(
    (u) => u.heroId === FALSE_TRAIL_TOKEN_ID
  );
  const unplacedUnits = friendlyUnits.filter((u) => {
    if (u.position) return false;
    if (hasFalseTrailToken && u.heroId === CHIKATILO_ID) return false;
    return true;
  });
  const selectedUnit = friendlyUnits.find((u) => u.id === selectedUnitId) ?? null;
  const heroDefinition = selectedUnit?.heroId
    ? HERO_CATALOG.find((hero) => hero.id === selectedUnit.heroId)
    : undefined;
  const forestMarkers =
    Array.isArray(view.forestMarkers) && view.forestMarkers.length > 0
      ? view.forestMarkers
      : view.forestMarker
      ? [view.forestMarker]
      : [];
  const stormActive = view.arenaId === ARENA_STORM_ID;
  const selectedInsideForest =
    !!selectedUnit?.position &&
    forestMarkers.some(
      (marker) =>
        Math.max(
          Math.abs(selectedUnit.position!.col - marker.position.col),
          Math.abs(selectedUnit.position!.row - marker.position.row)
        ) <= FOREST_AURA_RADIUS
    );
  const selectedStormExempt =
    stormActive &&
    !!selectedUnit &&
    (selectedUnit.heroId === LECHY_ID || selectedInsideForest);
  const selectedLegalAttackTargets = selectedUnit
    ? view.legal?.attackTargetsByUnitId[selectedUnit.id] ?? []
    : [];
  const abilityViews = selectedUnit
    ? view.abilitiesByUnitId?.[selectedUnit.id] ?? []
    : [];
  const actionableAbilities = abilityViews.filter(
    (ability) =>
      ability.kind !== "passive" &&
      ability.id !== GROZNY_TYRANT_ID &&
      ability.id !== LECHY_CONFUSE_TERRAIN_ID
  );
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
    selectedUnit?.class === "assassin" ||
    selectedUnit?.class === "archer" ||
    selectedUnit?.heroId === LECHY_ID;
  const stormRangedAttackBlocked =
    canAct &&
    !!selectedUnit?.position &&
    stormActive &&
    !selectedStormExempt &&
    isRangedSingleTargetClass(selectedUnit.class) &&
    selectedLegalAttackTargets.length === 0;
  const attackDisabledReason = stormRangedAttackBlocked
    ? "Storm restricts this unit to adjacent attacks."
    : undefined;

  const moveDisabled = !canAct || economy.moveUsed;
  const attackDisabled =
    !canAct || economy.attackUsed || economy.actionUsed || stormRangedAttackBlocked;
  const stealthDisabled = !canAct || economy.stealthUsed || !canStealth;
  const searchMoveDisabled = !canAct || !legalIntents?.canSearchMove;
  const searchActionDisabled = !canAct || !legalIntents?.canSearchAction;

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
      <div className="rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:border-slate-700/60 dark:bg-slate-900/60 dark:shadow-black/40">
        <div className="text-sm text-slate-600 dark:text-slate-100">Status</div>
        <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
          <div>Phase: {view.phase}</div>
          <div>Current Player: {view.currentPlayer}</div>
          <div>Round: {view.roundNumber}</div>
          <div>Turn: {view.turnNumber}</div>
          <div>Active Unit: {view.activeUnitId ?? "-"}</div>
          <div>Arena: {view.arenaId ?? "-"}</div>
          {stormActive && (
            <div className="text-[11px] text-amber-700 dark:text-amber-300">
              Storm active: non-exempt units can only attack adjacent targets.
            </div>
          )}
          {forestMarkers.length > 0 && (
            <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
              Forest markers:{" "}
              {forestMarkers
                .map(
                  (marker) =>
                    `${marker.owner}:${marker.position.col},${marker.position.row}`
                )
                .join(" | ")}
            </div>
          )}
          {isSpectator && (
            <div className="text-xs text-amber-600 dark:text-amber-300">
              Spectating
            </div>
          )}
        </div>
        {canStartTurn && expectedUnitId && (
          <button
            className="mt-3 w-full rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow dark:bg-teal-800/50 dark:text-slate-100 dark:hover:bg-teal-700/60"
            onClick={() =>
              onSendAction({ type: "unitStartTurn", unitId: expectedUnitId })
            }
          >
            Start Turn: {expectedUnitId}
          </button>
        )}
        {legalIntents && (
          <div className="mt-3 space-y-1 text-[10px] text-slate-500 dark:text-slate-400">
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
        <div className="rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:border-slate-700/60 dark:bg-slate-900/60 dark:shadow-black/40">
          <div className="text-sm text-slate-600 dark:text-slate-100">
            Placement
          </div>
          <div className="mt-3 space-y-2">
            {unplacedUnits.length === 0 && (
              <div className="text-xs text-slate-400 dark:text-slate-400">
                No unplaced units.
              </div>
            )}
            {unplacedUnits.map((unit) => (
              <button
                key={unit.id}
                className={`w-full rounded-lg px-3 py-2 text-left text-xs shadow-sm transition hover:shadow ${
                  placeUnitId === unit.id
                    ? "bg-teal-500 text-white dark:bg-teal-800/50 dark:text-slate-100 dark:hover:bg-teal-700/60"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700/60"
                }`}
                onClick={() => {
                  onSetPlaceUnit(unit.id);
                  onSetActionMode("place");
                }}
                disabled={!placementEnabled}
              >
                {unit.heroId === FALSE_TRAIL_TOKEN_ID ? "False Trail token" : unit.id}
              </button>
            ))}
          </div>
          {actionMode === "place" && placeUnitId && (
            <div className="mt-3 text-xs text-slate-400 dark:text-slate-400">
              {(() => {
                const selected = friendlyUnits.find((u) => u.id === placeUnitId);
                const label =
                  selected?.heroId === FALSE_TRAIL_TOKEN_ID
                    ? "the False Trail token"
                    : placeUnitId;
                return `Click a highlighted cell to place ${label}.`;
              })()}
            </div>
          )}
          {!joined && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
              Waiting for room join to place units.
            </div>
          )}
          {!pendingRoll && joined && !isSpectator && !isMyTurn && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
              Waiting for the other player to place.
            </div>
          )}
          {isSpectator && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
              Spectators cannot place units.
            </div>
          )}
          {pendingRoll && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
              Resolve the pending roll before placing units.
            </div>
          )}
        </div>
      )}

      {view.phase === "battle" && (
        <div className="rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:border-slate-700/60 dark:bg-slate-900/60 dark:shadow-black/40">
          <div className="text-sm text-slate-600 dark:text-slate-100">
            Active Unit Panel
          </div>
          {selectedUnit ? (
            <div className="mt-3 space-y-2 text-xs text-slate-700 dark:text-slate-200">
              <div className="flex items-center gap-2">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white shadow-sm dark:bg-slate-100 dark:text-slate-900">
                  {classBadge(selectedUnit.class).label}
                  {classBadge(selectedUnit.class).marker && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-[9px] font-bold text-slate-700 shadow dark:bg-slate-200 dark:text-slate-900">
                      {classBadge(selectedUnit.class).marker}
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-semibold dark:text-slate-100">
                    {heroDefinition?.name ?? selectedUnit.id}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-300">
                    Class {selectedUnit.class}
                    {heroDefinition ? ` (${selectedUnit.id})` : ""}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-300">
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
              {forestMarkers.length > 0 && selectedUnit.position && (
                <div className="text-[10px] text-emerald-700 dark:text-emerald-300">
                  Forest aura: {selectedInsideForest ? "inside" : "outside"}
                </div>
              )}
              {stormActive && selectedUnit.position && (
                <div
                  className={`text-[10px] ${
                    selectedStormExempt
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-amber-700 dark:text-amber-300"
                  }`}
                >
                  Storm: {selectedStormExempt ? "exempt" : "restricted"}
                </div>
              )}
              {moveRoll !== null && moveRoll !== undefined && (
                <div className="text-[10px] text-slate-500 dark:text-slate-300">
                  Move roll: {moveRoll}
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-[10px] text-slate-600 dark:text-slate-200">
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    economy.moveUsed
                      ? "bg-slate-200 dark:bg-slate-800"
                      : "bg-emerald-100 dark:bg-emerald-900/40"
                  }`}
                >
                  Move {economy.moveUsed ? "X" : "-"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    economy.attackUsed
                      ? "bg-slate-200 dark:bg-slate-800"
                      : "bg-emerald-100 dark:bg-emerald-900/40"
                  }`}
                >
                  Attack {economy.attackUsed ? "X" : "-"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    economy.actionUsed
                      ? "bg-slate-200 dark:bg-slate-800"
                      : "bg-emerald-100 dark:bg-emerald-900/40"
                  }`}
                >
                  Action {economy.actionUsed ? "X" : "-"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    economy.stealthUsed
                      ? "bg-slate-200 dark:bg-slate-800"
                      : "bg-emerald-100 dark:bg-emerald-900/40"
                  }`}
                >
                  Stealth {economy.stealthUsed ? "X" : "-"}
                </span>
              </div>
              <div className="mt-4">
                <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-100">
                  Abilities
                </div>
                {abilityViews.length === 0 && (
                  <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-400">
                    No abilities available.
                  </div>
                )}
                <div className="mt-2 space-y-2">
                  {abilityViews.map((ability) => {
                    const hideCharges =
                      ability.id === KAISER_DORA_ID && selectedUnit?.transformed;
                    const chargeState = getAbilityChargeState(
                      ability.id,
                      selectedUnit,
                      ability
                    );
                    const chargeLabel = formatChargeLabel(
                      ability,
                      chargeState,
                      hideCharges
                    );
                    const isChargeBlocked =
                      ability.kind !== "passive" && !chargeState.enabled;
                    const showChargeWarning =
                      !!chargeState.reason &&
                      chargeState.reason !== ability.disabledReason;
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
                    const kindBadgeClass = isChargeBlocked
                      ? "rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-[9px] text-slate-500 dark:border-slate-700/60 dark:bg-slate-700/60 dark:text-slate-400"
                      : "rounded-full bg-slate-200 px-2 py-0.5 text-[9px] text-slate-700 dark:bg-slate-700/60 dark:text-slate-100";
                    return (
                      <div
                        key={ability.id}
                        className={`rounded-xl border border-slate-200 p-2 text-[10px] shadow-sm ${
                          ability.isAvailable
                            ? "bg-white dark:bg-slate-800/50"
                            : "bg-slate-100 text-slate-400 dark:bg-slate-800/40 dark:text-slate-400"
                        } dark:border-slate-700/60`}
                        title={ability.disabledReason ?? ""}
                        onMouseEnter={() => {
                          if (ability.id === EL_CID_KOLADA_ID) {
                            onHoverAbility(ability.id);
                          }
                        }}
                        onMouseLeave={() => {
                          if (ability.id === EL_CID_KOLADA_ID) {
                            onHoverAbility(null);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold dark:text-slate-100">
                            {ability.name}
                          </div>
                          <span className={kindBadgeClass}>
                            {kindLabel}
                          </span>
                        </div>
                        <div className="mt-1 text-slate-500 dark:text-slate-300">
                          {ability.description}
                        </div>
                        <div className="mt-1 text-slate-500 dark:text-slate-400">
                          Slot: {slotLabel}
                          {chargeLabel !== null ? ` | Charges: ${chargeLabel}` : ""}
                        </div>
                        {ability.disabledReason && (
                          <div className="mt-1 text-amber-700 dark:text-amber-300">
                            {ability.disabledReason}
                          </div>
                        )}
                        {showChargeWarning && (
                          <div className="mt-1 text-amber-700 dark:text-amber-300">
                            {chargeState.reason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-slate-400 dark:text-slate-400">
              Select a unit.
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <button
              className={`rounded-lg px-2 py-2 shadow-sm transition hover:shadow ${
                moveDisabled
                  ? "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
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
              className={`rounded-lg px-2 py-2 shadow-sm transition hover:shadow ${
                attackDisabled
                  ? "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
              }`}
              onClick={() => onSetActionMode("attack")}
              onMouseEnter={() => onHoverAttackRange(selectedUnit?.id ?? null, true)}
              onMouseLeave={() => onHoverAttackRange(selectedUnit?.id ?? null, false)}
              onFocus={() => onHoverAttackRange(selectedUnit?.id ?? null, true)}
              onBlur={() => onHoverAttackRange(selectedUnit?.id ?? null, false)}
              disabled={attackDisabled}
              title={attackDisabledReason ?? ""}
            >
              Attack
            </button>
            {attackDisabledReason && (
              <div className="col-span-2 text-[10px] text-amber-700 dark:text-amber-300">
                {attackDisabledReason}
              </div>
            )}
            <button
              className={`rounded-lg px-2 py-2 shadow-sm transition hover:shadow ${
                searchMoveDisabled
                  ? "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
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
              className={`rounded-lg px-2 py-2 shadow-sm transition hover:shadow ${
                searchActionDisabled
                  ? "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
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
              <div className="col-span-2 text-[10px] text-slate-400 dark:text-slate-400">
                Search (Move) disabled: {legalIntents.searchMoveReason}
              </div>
            )}
            {searchActionDisabled && legalIntents?.searchActionReason && (
              <div className="col-span-2 text-[10px] text-slate-400 dark:text-slate-400">
                Search (Action) disabled: {legalIntents.searchActionReason}
              </div>
            )}
            <button
              className={`rounded-lg px-2 py-2 shadow-sm transition hover:shadow ${
                stealthDisabled
                  ? "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
              }`}
              onClick={() =>
                selectedUnit &&
                onSendAction({ type: "enterStealth", unitId: selectedUnit.id })
              }
              disabled={stealthDisabled}
            >
              Enter Stealth
            </button>
            {actionableAbilities.length > 0 && (
              <div className="col-span-2 text-[11px] text-slate-500 dark:text-slate-400">
                Ability Actions
              </div>
            )}
            {actionableAbilities.map((ability) => {
              const hideCharges =
                ability.id === KAISER_DORA_ID && selectedUnit?.transformed;
              const chargeState = getAbilityChargeState(
                ability.id,
                selectedUnit,
                ability
              );
              const chargeLabel = formatChargeLabel(
                ability,
                chargeState,
                hideCharges
              );
              const notEnoughCharges = !chargeState.enabled;
              const slotDisabled =
                ability.slot === "action"
                  ? economy.actionUsed
                  : ability.slot === "move"
                  ? economy.moveUsed
                  : ability.slot === "attack"
                  ? economy.attackUsed
                  : ability.slot === "stealth"
                  ? economy.stealthUsed
                  : false;
              const slotReason =
                ability.slot === "action"
                  ? "Action slot already used"
                  : ability.slot === "move"
                  ? "Move slot already used"
                  : ability.slot === "attack"
                  ? "Attack slot already used"
                  : ability.slot === "stealth"
                  ? "Stealth slot already used"
                  : undefined;
              const disabledByActive =
                ability.kind === "active" ? !ability.isAvailable : false;
              const disabled =
                !canAct || notEnoughCharges || slotDisabled || disabledByActive;
              const chargeWarning = notEnoughCharges
                ? "Not enough charges"
                : undefined;
              const tooltip =
                ability.disabledReason ?? slotReason ?? chargeWarning ?? "";
              const label = `${ability.name}${
                chargeLabel ? ` (${chargeLabel})` : ""
              }`;
              const onClick = () => {
                if (!selectedUnit || disabled) return;
                if (ability.id === KAISER_DORA_ID) {
                  onSetActionMode("dora");
                  return;
                }
                if (ability.id === GROZNY_INVADE_TIME_ID) {
                  onSetActionMode("invadeTime");
                  return;
                }
                if (ability.id === CHIKATILO_ASSASSIN_MARK_ID) {
                  onSetActionMode("assassinMark");
                  return;
                }
                if (ability.id === LECHY_GUIDE_TRAVELER_ID) {
                  onSetActionMode("guideTraveler");
                  return;
                }
                if (ability.id === EL_CID_TISONA_ID) {
                  onSetActionMode("tisona");
                  return;
                }
                if (ability.id === EL_CID_DEMON_DUELIST_ID) {
                  onSetActionMode("demonDuelist");
                  return;
                }
                onSendAction({
                  type: "useAbility",
                  unitId: selectedUnit.id,
                  abilityId: ability.id,
                });
              };
              const hoverable = ability.id === TRICKSTER_AOE_ID;
              return (
                <div key={ability.id} className="space-y-1">
                  <button
                    className={`w-full rounded-lg px-2 py-2 text-left shadow-sm transition hover:shadow ${
                      disabled
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed opacity-60 dark:bg-slate-900/50 dark:text-slate-500"
                        : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
                    }`}
                    onClick={onClick}
                    onMouseEnter={() => hoverable && onHoverAbility(ability.id)}
                    onMouseLeave={() => hoverable && onHoverAbility(null)}
                    onFocus={() => hoverable && onHoverAbility(ability.id)}
                    onBlur={() => hoverable && onHoverAbility(null)}
                    disabled={disabled}
                    title={tooltip}
                  >
                    {label}
                  </button>
                  {chargeWarning && (
                    <div className="text-[10px] text-amber-700 dark:text-amber-300">
                      {chargeWarning}
                    </div>
                  )}
                </div>
              );
            })}
            <button
              className={`rounded-lg px-2 py-2 shadow-sm transition hover:shadow ${
                isMyTurn && joined && !isSpectator
                  ? "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
                  : "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
              }`}
              onClick={() => onSendAction({ type: "endTurn" })}
              disabled={!isMyTurn || !joined || isSpectator || pendingRoll}
            >
              End Turn
            </button>
            <button
              className="rounded-lg bg-slate-100 px-2 py-2 text-slate-600 shadow-sm transition hover:shadow dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700/60"
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
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Choose move mode:
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {moveModeOptions.map((mode) => (
                  <button
                    key={mode}
                    className={`rounded-lg px-2 py-1 text-[10px] shadow-sm transition hover:shadow ${
                      moveDisabled
                        ? "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
                        : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
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
            <div className="mt-3 text-xs text-slate-400 dark:text-slate-400">
              {actionMode === "dora"
                ? "Dora: select a center cell on the archer line."
                : actionMode === "invadeTime"
                ? "Invade Time: select any open cell on the board."
                : actionMode === "assassinMark"
                ? "Assassin Mark: select a unit within 2 squares."
                : actionMode === "guideTraveler"
                ? "Guide Traveler: select an ally within trickster range."
                : actionMode === "tisona"
                ? "Tisona: select a cell on the same row or column."
                : actionMode === "demonDuelist"
                ? "Demon Duelist: select an enemy in attack range."
                : `Mode: ${actionMode}. Click a highlighted cell to apply.`}
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:border-slate-700/60 dark:bg-slate-900/60 dark:shadow-black/40">
        <div className="text-sm text-slate-500 dark:text-slate-400">Units</div>
        <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
          {friendlyUnits.map((unit) => {
            const badge = classBadge(unit.class);
            const berserkCharges = unit.charges?.berserkAutoDefense;
            return (
              <button
                key={unit.id}
                className={`flex items-center gap-3 rounded-lg px-2 py-2 text-left shadow-sm transition hover:shadow ${
                  selectedUnitId === unit.id
                    ? "bg-teal-500 text-white dark:bg-teal-800/50 dark:text-slate-100 dark:hover:bg-teal-700/60"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700/60"
                }`}
                onClick={() => onSelectUnit(unit.id)}
              >
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white shadow-sm dark:bg-slate-100 dark:text-slate-900">
                  {badge.label}
                  {badge.marker && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-[9px] font-bold text-slate-700 shadow dark:bg-slate-200 dark:text-slate-900">
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
                  <span className="rounded-full bg-amber-200 px-2 py-1 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
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

