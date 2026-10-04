import { useEffect } from "react";
import { useI18n } from "../i18n";
import { getRankPresentation } from "./rankAssets";

export interface RankEmblemProps {
  /** A canonical tier, never a rating or a leaderboard placement. */
  rank?: string | null;
  size?: "small" | "medium" | "large" | "hero";
  /** Use when an adjacent visible rank name supplies the same information. */
  decorative?: boolean;
}

export function RankEmblem({ rank, size = "medium", decorative = false }: RankEmblemProps) {
  const { t } = useI18n();
  const presentation = getRankPresentation(rank);
  useEffect(() => {
    if (import.meta.env?.DEV && rank != null && !presentation) {
      console.warn("[RankEmblem] Unknown rank tier; displaying an unassigned frame.");
    }
  }, [rank, presentation]);

  return (
    <div
      className="rank-emblem"
      data-size={size}
      data-rank={presentation?.id}
      data-assigned={Boolean(presentation)}
      data-testid="rank-emblem"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={
        decorative
          ? undefined
          : presentation
            ? t("ranks.emblem", { rank: t(presentation.labelKey) })
            : t("ranks.unassigned")
      }
    >
      {presentation ? (
        <img
          key={presentation.id}
          src={presentation.asset}
          alt=""
          width={1254}
          height={1254}
          decoding="async"
        />
      ) : (
        <svg
          className="rank-emblem-unassigned"
          viewBox="0 0 160 160"
          fill="none"
          aria-hidden="true"
        >
          <path d="M80 20 126 80 80 140 34 80Z" stroke="currentColor" strokeDasharray="3 9" />
          <path
            d="M60 36 80 10 100 36M60 124 80 150 100 124M24 65 12 80 24 95M136 65 148 80 136 95"
            stroke="currentColor"
          />
          <path d="M80 66V94M66 80H94" stroke="currentColor" opacity=".55" />
        </svg>
      )}
    </div>
  );
}
