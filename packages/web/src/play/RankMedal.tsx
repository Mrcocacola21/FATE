import { useI18n } from "../i18n";

/** A presentation slot; tiers and assets will come from the real rank system. */
export function RankMedal({
  assetUrl,
  label,
  size = "large",
}: {
  assetUrl?: string;
  label?: string;
  size?: "large" | "small";
}) {
  const { t } = useI18n();
  return (
    <div
      className="rank-medal"
      data-size={size}
      data-testid="rank-medal"
      role="img"
      aria-label={label ?? t("competitive.medal")}
    >
      {assetUrl ? (
        <img src={assetUrl} alt="" />
      ) : (
        <span className="rank-medal-sigil" aria-hidden="true">
          F
        </span>
      )}
    </div>
  );
}
