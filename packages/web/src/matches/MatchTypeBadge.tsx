import { StatusBadge } from "../components/ui";
import { useI18n } from "../i18n";
import type { MatchType } from "./matchType";

export function MatchTypeBadge({ matchType }: { matchType: MatchType }) {
  const { t } = useI18n();
  return (
    <StatusBadge tone={matchType === "RATED" ? "info" : "neutral"}>
      {t(`matchTypes.${matchType}`)}
    </StatusBadge>
  );
}
