import type { FC } from "react";
import type { AbilityView, MoveMode, UnitClass } from "rules";
import type { TargetingMode } from "../../../selectionState";
import { formatMoveMode } from "../rightPanelHelpers";
import { useI18n, type Language } from "../../../../i18n";
import { getAbilityDisplay } from "../../../../i18n/displayMetadata";
import { PAPYRUS_COOL_GUY_ID } from "../../../../rulesHints";

interface BattleBottomHintsProps {
  moveModeOptions: MoveMode[] | null;
  selectedUnitId: string | null;
  selectedUnitClass?: UnitClass;
  moveDisabled: boolean;
  onMoveRequest: (unitId: string, mode?: MoveMode) => void;
}

export function getUsingName(
  targetingMode: TargetingMode,
  abilityViews: AbilityView[],
  language: Language,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (targetingMode.abilityId === "basicAttack") return t("game.attack");
  if (targetingMode.abilityId === "move") return t("game.move");
  if (targetingMode.abilityId === "place") return t("game.placeUnits");
  if (targetingMode.abilityId === "search") return t("game.searchAction");
  const ability = abilityViews.find((item) => item.id === targetingMode.abilityId);
  return getAbilityDisplay(
    String(targetingMode.abilityId),
    ability?.name ?? String(targetingMode.abilityId),
    ability?.description ?? "",
    language,
  ).name;
}

export function getCostPreview(
  targetingMode: TargetingMode,
  abilityViews: AbilityView[],
  t: ReturnType<typeof useI18n>["t"],
): string {
  const parts: string[] = [];
  const preview = targetingMode.resourcePreview;
  // Cool Guy fires as a turn-start impulse and never spends the Action, whatever its slot says.
  if (preview?.action && targetingMode.abilityId !== PAPYRUS_COOL_GUY_ID)
    parts.push(t("game.usesAction"));
  if (preview?.move) parts.push(t("game.usesMovement"));
  if (preview?.stealth) parts.push(t("game.usesStealth"));
  for (const charge of preview?.charges ?? []) {
    parts.push(t("game.costsCharges", { amount: charge.amount }));
  }

  const ability = abilityViews.find((item) => item.id === targetingMode.abilityId);
  if (
    ability &&
    !ability.chargeUnlimited &&
    typeof ability.chargeRequired === "number" &&
    ability.chargeRequired > 0
  ) {
    parts.push(t("game.costsCharges", { amount: ability.chargeRequired }));
  }

  return parts.length > 0 ? parts.join(" / ") : t("game.noCommitCost");
}

export const BattleBottomHints: FC<BattleBottomHintsProps> = ({
  moveModeOptions,
  selectedUnitId,
  selectedUnitClass,
  moveDisabled,
  onMoveRequest,
}) => {
  const { t } = useI18n();
  return (
    <>
      {moveModeOptions && selectedUnitId && (
        <div className="mt-3 text-xs">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t("game.chooseMoveMode")}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {moveModeOptions.map((mode) => (
              <button
                key={mode}
                type="button"
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition ${
                  moveDisabled
                    ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
                    : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900/70 dark:bg-sky-950/35 dark:text-sky-200 dark:hover:bg-sky-950/55"
                }`}
                onClick={() => onMoveRequest(selectedUnitId, mode)}
                disabled={moveDisabled}
              >
                {formatMoveMode(mode, t, selectedUnitClass)}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
