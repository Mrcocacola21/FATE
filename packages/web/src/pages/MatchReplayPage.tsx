import { useCallback, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAuthStore } from "../auth/authStore";
import { ApiError } from "../api/client";
import { useI18n } from "../i18n";
import { ReplayHeader } from "../replay/ReplayHeader";
import { ReplayBoard } from "../replay/ReplayBoard";
import { ReplayControls } from "../replay/ReplayControls";
import { ReplayActionInfo } from "../replay/ReplayActionInfo";
import { ReplayError } from "../replay/ReplayError";
import { parseRevision, replayRevisions } from "../replay/navigation";
import { useReplayMetadata, useReplayState } from "../replay/useReplay";
import type { ReplayMetadata } from "../replay/types";

export function MatchReplayPage() {
  const { id = "" } = useParams();
  const owner = useAuthStore((state) => state.user?.id);
  return <ReplayPage key={`${owner}:${id}`} id={id} />;
}
function ReplayPage({ id }: { id: string }) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const result = useReplayMetadata(id, attempt);
  return (
    <section
      className="replay-page mx-auto min-w-0 w-full"
      aria-labelledby="replay-title"
      data-testid="replay-page"
    >
      <Link
        to={`/matches/${encodeURIComponent(id)}`}
        className="mb-4 inline-block text-sm underline"
      >
        {t("replay.back")}
      </Link>
      {!result && <p role="status">{t("matches.loading")}</p>}
      {Boolean(result?.error) && (
        <ReplayError error={result?.error} retry={() => setAttempt((value) => value + 1)} />
      )}
      {result?.data && <ReplayViewer key={id} metadata={result.data} />}
    </section>
  );
}
export function ReplayViewer({ metadata }: { metadata: ReplayMetadata }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const revisions = useMemo(() => replayRevisions(metadata), [metadata]);
  const query = params.get("revision");
  const revision = query === null ? metadata.initialRevision : parseRevision(query, revisions);
  const navigate = useCallback(
    (target: number) => {
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set("revision", String(target));
        return next;
      });
    },
    [setParams],
  );
  const { response, loading, error, retry } = useReplayState(metadata.matchId, revision);
  return (
    <>
      <ReplayHeader metadata={metadata} />
      <p className="my-3 text-center font-semibold" data-testid="replay-visible-revision">
        {response
          ? t("replay.position", { revision: response.revision, final: metadata.finalRevision })
          : t("matches.loading")}
      </p>
      <div className="replay-board-stage relative" aria-busy={loading}>
        {response && <ReplayBoard state={response.state} />}
        {loading && (
          <p role="status" className="replay-loading">
            {t("replay.loadingRevision", { revision })}
          </p>
        )}
      </div>
      {revision === null && <ReplayError error={new ApiError("INVALID_REPLAY_REVISION")} />}
      {Boolean(error) && <ReplayError error={error} retry={retry} />}
      <ReplayControls
        revisions={revisions}
        revision={revision ?? metadata.initialRevision}
        onNavigate={navigate}
      />
      {response && <ReplayActionInfo metadata={metadata} revision={response.revision} />}
    </>
  );
}
