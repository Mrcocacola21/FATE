import type { FC } from "react";

interface HpBarProps {
  current: number;
  max: number;
  showText: boolean;
  className?: string;
}

export const HpBar: FC<HpBarProps> = ({ current, max, showText, className }) => {
  const safeMax = max > 0 ? max : 1;
  const clampedCurrent = Math.max(0, Math.min(current, safeMax));
  const pct = Math.round((clampedCurrent / safeMax) * 100);

  return (
    <div
      className={`relative h-2 rounded-full border border-slate-900/40 bg-white/80 shadow-sm dark:border-neutral-200/20 dark:bg-neutral-900/70 ${
        className ?? ""
      }`}
    >
      <div
        className="h-full rounded-full bg-emerald-500"
        style={{ width: `${pct}%` }}
      />
      {showText && (
        <div className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold text-slate-900 dark:text-slate-100">
          {clampedCurrent}/{safeMax}
        </div>
      )}
    </div>
  );
};
