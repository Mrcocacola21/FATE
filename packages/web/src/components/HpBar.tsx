import type { HpBand } from "rules";
import type { FC } from "react";

interface HpBarProps {
  current: number;
  max: number;
  showText: boolean;
  /** Another side's figure: only this coarse level is known, so the bar moves in steps. */
  band?: HpBand;
  className?: string;
}

const BAND_PERCENT: Record<HpBand, number> = { high: 100, medium: 55, low: 25 };

export const HpBar: FC<HpBarProps> = ({ current, max, showText, band, className }) => {
  const safeMax = max > 0 ? max : 1;
  const clampedCurrent = Math.max(0, Math.min(current, safeMax));
  const pct = band ? BAND_PERCENT[band] : Math.round((clampedCurrent / safeMax) * 100);
  const tone = pct <= 30 ? "bg-rose-500" : pct <= 60 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div
      className={`relative h-2 overflow-hidden rounded-full border border-black/35 bg-white/80 shadow-sm dark:border-white/20 dark:bg-black/70 ${
        className ?? ""
      }`}
      data-hp-band={band}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-150 ease-linear motion-reduce:duration-75 ${tone}`}
        style={{ width: `${pct}%` }}
      />
      {showText && !band && (
        <div className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold text-slate-900 dark:text-slate-100">
          {clampedCurrent}/{safeMax}
        </div>
      )}
    </div>
  );
};
