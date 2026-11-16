import type { HpBand, PlayerId } from "rules";
import type { FC } from "react";

interface HpBarProps {
  current: number;
  max: number;
  showText: boolean;
  /** Another side's figure: only this coarse level is known, so the bar moves in steps. */
  band?: HpBand;
  /** On the board the fill takes the owner's colour; its length alone shows the health. */
  owner?: PlayerId;
  className?: string;
}

const BAND_PERCENT: Record<HpBand, number> = { high: 100, medium: 55, low: 25 };

export const HpBar: FC<HpBarProps> = ({ current, max, showText, band, owner, className }) => {
  const safeMax = max > 0 ? max : 1;
  const clampedCurrent = Math.max(0, Math.min(current, safeMax));
  const pct = band ? BAND_PERCENT[band] : Math.round((clampedCurrent / safeMax) * 100);
  const tone = owner
    ? "hp-bar__fill--owner"
    : pct <= 30
      ? "bg-rose-500"
      : pct <= 60
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div
      className={`relative h-2 overflow-hidden rounded-full border shadow-sm ${
        owner
          ? "hp-bar--owner"
          : "border-black/35 bg-white/80 dark:border-white/20 dark:bg-black/70"
      } ${className ?? ""}`}
      data-hp-band={band}
      data-owner={owner}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-150 ease-linear motion-reduce:duration-75 ${tone}`}
        style={{ width: `${pct}%` }}
      />
      {showText && !band && (
        <div
          className={`absolute inset-0 flex items-center justify-center text-[8px] font-semibold ${
            owner ? "hp-bar__text--owner" : "text-slate-900 dark:text-slate-100"
          }`}
        >
          {clampedCurrent}/{safeMax}
        </div>
      )}
    </div>
  );
};
