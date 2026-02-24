import type { FC } from "react";
import type { AbilityView, UnitState } from "rules";
import { EL_CID_KOLADA_ID, KAISER_DORA_ID } from "../../../../rulesHints";
import {
  classBadge,
  formatChargeLabel,
  getAbilityChargeState,
} from "../rightPanelHelpers";
import type { ForestMarkerView, TurnEconomyState } from "../types";

interface BattleUnitSummaryProps {
  selectedUnit: UnitState | null;
  selectedHeroName: string | null;
  showUnitIdInClassLabel: boolean;
  selectedMettatonRating: number | null;
  forestMarkers: ForestMarkerView[];
  selectedInsideForest: boolean;
  stormActive: boolean;
  selectedStormExempt: boolean;
  moveRoll: number | null | undefined;
  economy: TurnEconomyState;
  abilityViews: AbilityView[];
  onHoverAbility: (abilityId: string | null) => void;
}

export const BattleUnitSummary: FC<BattleUnitSummaryProps> = ({
  selectedUnit,
  selectedHeroName,
  showUnitIdInClassLabel,
  selectedMettatonRating,
  forestMarkers,
  selectedInsideForest,
  stormActive,
  selectedStormExempt,
  moveRoll,
  economy,
  abilityViews,
  onHoverAbility,
}) => {
  if (!selectedUnit) {
    return (
      <div className="mt-2 text-xs text-slate-400 dark:text-slate-400">
        Select a unit.
      </div>
    );
  }

  const badge = classBadge(selectedUnit.class);

  return (
    <div className="mt-3 space-y-2 text-xs text-slate-700 dark:text-slate-200">
      <div className="flex items-center gap-2">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white shadow-sm dark:bg-slate-100 dark:text-slate-900">
          {badge.label}
          {badge.marker && (
            <span className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-[9px] font-bold text-slate-700 shadow dark:bg-slate-200 dark:text-slate-900">
              {badge.marker}
            </span>
          )}
        </div>
        <div>
          <div className="text-[11px] font-semibold dark:text-slate-100">
            {selectedHeroName}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-300">
            Class {selectedUnit.class}
            {showUnitIdInClassLabel ? ` (${selectedUnit.id})` : ""}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-300">
            HP {selectedUnit.hp}
          </div>
          {selectedUnit.sansMoveLockArmed && (
            <div className="text-[10px] font-semibold text-rose-700 dark:text-rose-300">
              Movement action locked on next turn
            </div>
          )}
          {selectedUnit.sansLastAttackCurseSourceId && (
            <div className="text-[10px] font-semibold text-fuchsia-700 dark:text-fuchsia-300">
              Cursed: takes 1 damage at turn start (min HP 1)
            </div>
          )}
          {selectedUnit.sansBoneFieldStatus && (
            <div className="text-[10px] font-semibold text-cyan-700 dark:text-cyan-300">
              Bone Field: {selectedUnit.sansBoneFieldStatus.kind} bone
            </div>
          )}
          {selectedMettatonRating !== null && (
            <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              Rating {selectedMettatonRating}
            </div>
          )}
          {selectedUnit.undyneImmortalActive && (
            <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
              Immortal form active
            </div>
          )}
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
              ability.id === KAISER_DORA_ID && selectedUnit.transformed;
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
                  <span className={kindBadgeClass}>{kindLabel}</span>
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
  );
};
