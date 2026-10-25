import { useEffect, useState, type FC } from "react";
import type { PapyrusLineAxis, UnitState } from "rules";
import { useI18n } from "../../../../i18n";

interface BattleHeroControlsProps {
  selectedUnit: UnitState | null;
  selectedIsPapyrus: boolean;
  selectedIsUndyne: boolean;
  papyrusLineAxis: PapyrusLineAxis;
  papyrusAxisOptions: { axis: PapyrusLineAxis; label: string }[];
  undyneAxis: "row" | "col";
  undyneAxisOptions: { axis: "row" | "col"; label: string }[];
  selectedPapyrusUnbeliever: boolean;
  selectedPapyrusLongBoneMode: boolean;
  canAct: boolean;
  onSetPapyrusAxis: (axis: PapyrusLineAxis) => void;
  onSetUndyneAxis: (axis: "row" | "col") => void;
  onTogglePapyrusLongBone: () => void;
  /**
   * Minimal layout: axes come from the cursor, so the pickers are hidden, and Long Bone
   * is picked as an attack variant instead of a standing on/off switch.
   */
  variantMode?: boolean;
  attackDisabled?: boolean;
  onAttack?: () => void;
}

export const BattleHeroControls: FC<BattleHeroControlsProps> = ({
  selectedUnit,
  selectedIsPapyrus,
  selectedIsUndyne,
  papyrusLineAxis,
  papyrusAxisOptions,
  undyneAxis,
  undyneAxisOptions,
  selectedPapyrusUnbeliever,
  selectedPapyrusLongBoneMode,
  canAct,
  onSetPapyrusAxis,
  onSetUndyneAxis,
  onTogglePapyrusLongBone,
  variantMode = false,
  attackDisabled = false,
  onAttack,
}) => {
  const { t } = useI18n();
  if (variantMode) {
    if (!selectedPapyrusUnbeliever || !selectedUnit) return null;
    return (
      <PapyrusAttackVariants
        longBoneMode={selectedPapyrusLongBoneMode}
        disabled={!canAct || attackDisabled}
        onToggleLongBone={onTogglePapyrusLongBone}
        onAttack={onAttack}
      />
    );
  }
  return (
    <>
      {selectedIsPapyrus && (
        <>
          <div className="col-span-2 mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t("game.papyrusAxis")}
          </div>
          <div className="col-span-2 grid grid-cols-4 gap-2">
            {papyrusAxisOptions.map(({ axis }) => (
              <button
                key={axis}
                type="button"
                className={`rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm transition ${
                  papyrusLineAxis === axis
                    ? "border-teal-500 bg-teal-500 text-white dark:text-slate-950"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:bg-slate-800"
                }`}
                onClick={() => onSetPapyrusAxis(axis)}
                disabled={!canAct && selectedPapyrusUnbeliever}
              >
                {axis === "row"
                  ? t("game.rows")
                  : axis === "col"
                    ? t("game.columns")
                    : axis === "diagMain"
                      ? t("game.diagonalMain")
                      : t("game.diagonalAnti")}
              </button>
            ))}
          </div>
        </>
      )}
      {selectedIsUndyne && (
        <>
          <div className="col-span-2 mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t("game.energySpearAxis")}
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-2">
            {undyneAxisOptions.map(({ axis }) => (
              <button
                key={axis}
                type="button"
                className={`rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm transition ${
                  undyneAxis === axis
                    ? "border-teal-500 bg-teal-500 text-white dark:text-slate-950"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:bg-slate-800"
                }`}
                onClick={() => onSetUndyneAxis(axis)}
              >
                {axis === "row" ? t("game.rows") : t("game.columns")}
              </button>
            ))}
          </div>
        </>
      )}
      {selectedPapyrusUnbeliever && selectedUnit && (
        <>
          <button
            type="button"
            className={`col-span-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold shadow-sm transition ${
              selectedPapyrusLongBoneMode
                ? "border-teal-500 bg-teal-500 text-white dark:text-slate-950"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:bg-slate-800"
            }`}
            onClick={onTogglePapyrusLongBone}
            disabled={!canAct}
          >
            {t("game.longBoneMode", {
              state: selectedPapyrusLongBoneMode ? t("game.on") : t("game.off"),
            })}
          </button>
        </>
      )}
    </>
  );
};

/**
 * Long Bone as an attack variant. Switching the variant is a server-side toggle, so
 * targeting starts only once the new mode is confirmed; earlier it would be reset.
 */
function PapyrusAttackVariants({
  longBoneMode,
  disabled,
  onToggleLongBone,
  onAttack,
}: {
  longBoneMode: boolean;
  disabled: boolean;
  onToggleLongBone: () => void;
  onAttack?: () => void;
}) {
  const { t } = useI18n();
  const [awaiting, setAwaiting] = useState<boolean | null>(null);
  useEffect(() => {
    if (awaiting === null || awaiting !== longBoneMode) return;
    setAwaiting(null);
    onAttack?.();
  }, [awaiting, longBoneMode, onAttack]);
  // A rejected toggle never confirms; release the buttons instead of locking them.
  useEffect(() => {
    if (awaiting === null) return;
    const timer = setTimeout(() => setAwaiting(null), 3000);
    return () => clearTimeout(timer);
  }, [awaiting]);
  const pick = (longBone: boolean) => {
    if (longBone === longBoneMode) {
      onAttack?.();
      return;
    }
    setAwaiting(longBone);
    onToggleLongBone();
  };
  return (
    <div className="col-span-2 grid grid-cols-2 gap-2" data-testid="papyrus-attack-variants">
      {[false, true].map((longBone) => (
        <button
          key={String(longBone)}
          type="button"
          className="attack-variant"
          aria-pressed={longBoneMode === longBone}
          disabled={disabled || awaiting !== null}
          onClick={() => pick(longBone)}
        >
          {longBone ? t("game.attackLongBone") : t("game.attack")}
        </button>
      ))}
    </div>
  );
}
