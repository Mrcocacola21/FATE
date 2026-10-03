import type { RatedCompatibility } from "../api";
import { useI18n } from "../i18n";

export function RatedCompatibilityPanel({
  compatibility,
}: {
  compatibility?: RatedCompatibility | null;
}) {
  const { t } = useI18n();
  const message = compatibility?.eligible
    ? "eligible"
    : compatibility?.reason === "RATED_RATING_DIFFERENCE_TOO_LARGE"
      ? "gapTooLarge"
      : compatibility?.reason === "RATED_MATCH_INVALID_PARTICIPANTS"
        ? "distinctRequired"
        : "ratingUnavailable";
  return (
    <div
      className="panel-card-muted mt-4 p-3 text-sm"
      id="rated-start-eligibility"
      aria-live="polite"
      data-testid="rated-compatibility"
    >
      {compatibility && (
        <p className="text-xs text-muted tabular-nums">
          {t("customLobby.difference")}:{" "}
          {compatibility.difference === null ? "—" : Math.ceil(compatibility.difference)} /{" "}
          {compatibility.maxDifference}
        </p>
      )}
      <p className="mt-1">{t(`customLobby.${message}`)}</p>
      {message === "gapTooLarge" && (
        <p className="mt-2 text-xs text-muted">{t("customLobby.casualGuidance")}</p>
      )}
    </div>
  );
}
