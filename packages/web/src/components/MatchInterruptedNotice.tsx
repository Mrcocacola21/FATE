import { Link } from "react-router";
import { useGameStore } from "../store";
import { useI18n } from "../i18n";

export function MatchInterruptedNotice() {
  const interrupted = useGameStore(state => state.joinError === "MATCH_INTERRUPTED");
  const { t } = useI18n();
  if (!interrupted) return null;
  return (
    <div role="alert" className="fate-notice mb-4 text-sm">
      <p>{t("errors.matchInterrupted")}</p>
      <Link to="/lobby" className="btn btn-secondary mt-3">{t("shell.multiplayer")}</Link>
    </div>
  );
}
