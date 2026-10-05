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
      VALIDATION_ERROR: "invalidRevision",
      REPLAY_ACTION_GAP: "integrityError",
      REPLAY_DUPLICATE_REVISION: "integrityError",
      INVALID_SNAPSHOT: "integrityError",
      UNSUPPORTED_SNAPSHOT_VERSION: "integrityError",
      INVALID_ACTION_LOG: "integrityError",
      UNSUPPORTED_ACTION_FORMAT: "integrityError",
      RNG_RESTORE_FAILED: "integrityError",
      REPLAY_FINAL_STATE_MISMATCH: "integrityError",
      REPLAY_RNG_MISMATCH: "integrityError",
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
