import { ApiError } from "../api/client";
import { useI18n } from "../i18n";
import { matchErrorMessage } from "../matches/presentation";

export function ReplayError({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useI18n();
  const code = error instanceof ApiError ? error.code : "";
  const key = (
    {
      MATCH_NOT_REPLAYABLE: "unavailable",
      INVALID_REPLAY_REVISION: "invalidRevision",
      REPLAY_INTEGRITY_ERROR: "integrityError",
      UNAUTHORIZED: "authenticationRequired",
    } as Record<string, string>
  )[code];
  return (
    <div role="alert" className="my-4">
      <p>{key ? t(`replay.${key}`) : matchErrorMessage(error, t)}</p>
      {retry && (
        <button className="replay-button mt-2 text-sm" onClick={retry}>
          {t("matches.retry")}
        </button>
      )}
    </div>
  );
}
