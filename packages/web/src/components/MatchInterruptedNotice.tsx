import { Link } from "react-router";
import { useGameStore } from "../store";
import { useI18n } from "../i18n";

export function MatchInterruptedNotice() {
  const joinError = useGameStore(state => state.joinError);
  const { t } = useI18n();
  if (joinError === "MATCH_FINISHED") {
    return (
      <div role="alert" className="fate-notice mb-4 text-sm">
        <p>{t("errors.matchFinished")}</p>
        <Link to="/matches" className="btn btn-secondary mt-3">{t("matches.history")}</Link>
      </div>
    );
  }
  if (joinError !== "MATCH_INTERRUPTED") return null;
  return (
    <div role="alert" className="fate-notice mb-4 text-sm">
      <p>{t("errors.matchInterrupted")}</p>
      <Link to="/lobby" className="btn btn-secondary mt-3">{t("shell.multiplayer")}</Link>
    </div>
  );
}
