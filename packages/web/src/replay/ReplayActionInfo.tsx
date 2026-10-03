import { useI18n } from "../i18n";
import { formatDate } from "../matches/presentation";
import type { ReplayMetadata } from "./types";

export function ReplayActionInfo({
  metadata,
  revision,
}: {
  metadata: ReplayMetadata;
  revision: number;
}) {
  const { t, language } = useI18n();
  const action = metadata.timeline.find((entry) => entry.revision === revision);
  const actor = metadata.participants.find((p) => p.seat === action?.actorSeat);
  const actionKey = `replay.actions.${action?.actionType}`;
  const translated = t(actionKey);
  const label =
    translated !== actionKey
      ? translated
      : action?.actionType.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return (
    <p className="mt-3 text-center text-sm" data-testid="replay-action-info">
      {action
        ? `${actor?.displayName ?? action.actorSeat ?? t("replay.system")} · ${label} · ${formatDate(action.createdAt, language, t)}`
        : t("replay.initial")}
    </p>
  );
}
