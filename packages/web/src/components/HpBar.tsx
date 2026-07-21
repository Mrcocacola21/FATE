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
  const tone = pct <= 30 ? "bg-rose-500" : pct <= 60 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div
      className={`relative h-2 overflow-hidden rounded-full border border-black/35 bg-white/80 shadow-sm dark:border-white/20 dark:bg-black/70 ${
        className ?? ""
      }`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${tone}`}
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
