import { useEffect } from "react";
import { useI18n, type TranslationKey } from "../i18n";
import { getRankPresentation, UNCALIBRATED_RANK_ASSET } from "./rankAssets";

export interface RankEmblemProps {
  /** A canonical tier, never a rating or a leaderboard placement. */
  rank?: string | null;
  /**
   * The player's rating has not settled yet (too few rated games): the medal shows calibration
   * instead of the tier, so an early rating never reads as an earned rank.
   */
  calibrating?: boolean;
  size?: "small" | "medium" | "large" | "hero";
  /** Use when an adjacent visible rank name supplies the same information. */
  decorative?: boolean;
}

export function RankEmblem({
  rank,
  calibrating = false,
  size = "medium",
  decorative = false,
}: RankEmblemProps) {
  const { t } = useI18n();
  const presentation = calibrating ? null : getRankPresentation(rank);
  useEffect(() => {
    if (import.meta.env?.DEV && rank != null && !calibrating && !presentation) {
      console.warn("[RankEmblem] Unknown rank tier; displaying the uncalibrated emblem.");
    }
  }, [rank, calibrating, presentation]);

  return (
    <div
      className="rank-emblem"
      data-size={size}
      data-rank={presentation?.id}
      data-assigned={Boolean(presentation)}
      data-calibrating={calibrating || undefined}
      data-testid="rank-emblem"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={
        decorative
          ? undefined
          : presentation
            ? t("ranks.emblem", { rank: t(presentation.labelKey) })
            : calibrating
              ? t("ranks.emblem", { rank: t("ranks.calibrating") })
              : t("ranks.unassigned")
      }
    >
      <img
        key={presentation?.id ?? "uncalibrated"}
        src={presentation?.asset ?? UNCALIBRATED_RANK_ASSET}
        alt=""
        width={1254}
        height={1254}
        decoding="async"
      />
    </div>
  );
}

/** The rank name to print beside an emblem: calibration until the rating settles. */
export function rankNameKey(rank: unknown, calibrating: boolean): TranslationKey {
  if (calibrating) return "ranks.calibrating";
  return getRankPresentation(rank)?.labelKey ?? "ranks.unassigned";
}
