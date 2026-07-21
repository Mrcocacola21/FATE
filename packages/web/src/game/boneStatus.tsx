import type { FC } from "react";
import type { PapyrusBoneType, UnitState } from "rules";
import { useI18n } from "../i18n";

export interface ActiveBoneStatus {
  kind: PapyrusBoneType;
  source: "papyrus" | "sansBoneField";
}

export function getActiveBoneStatus(unit: UnitState | null | undefined): ActiveBoneStatus | null {
  if (!unit) return null;
  if (unit.sansBoneFieldStatus) {
    return { kind: unit.sansBoneFieldStatus.kind, source: "sansBoneField" };
  }
  if (unit.papyrusBoneStatus) {
    return { kind: unit.papyrusBoneStatus.kind, source: "papyrus" };
  }
  return null;
}

export const BoneIcon: FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.25"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7.2 8.1 15.9 16.8" />
    <path d="M5.3 9.5a2.4 2.4 0 1 1-1.1-4.6A2.4 2.4 0 1 1 8.8 6c0 .7-.3 1.3-.7 1.8" />
    <path d="M18.7 14.5a2.4 2.4 0 1 1 1.1 4.6 2.4 2.4 0 1 1-4.6-1.1c0-.7.3-1.3.7-1.8" />
  </svg>
);

export const BoneStatusPanel: FC<{ unit: UnitState }> = ({ unit }) => {
  const { t } = useI18n();
  const status = getActiveBoneStatus(unit);
  if (!status) return null;

  const isBlue = status.kind === "blue";
  return (
    <div
      className={`bone-status-panel bone-status-panel--${status.kind}`}
      data-unit-bone-status={status.kind}
      data-unit-bone-source={status.source}
    >
      <span className="bone-status-panel__icon" aria-hidden="true">
        <BoneIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="font-bold">{t(isBlue ? "game.blueBone" : "game.orangeBone")}</div>
        <p className="mt-0.5 text-xs leading-5">
          {t(isBlue ? "game.blueBoneReminder" : "game.orangeBoneReminder")}
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide opacity-75">
          {t(
            status.source === "sansBoneField"
              ? "game.boneSourceSansField"
              : "game.boneSourcePapyrus",
          )}
        </p>
      </div>
    </div>
  );
};
