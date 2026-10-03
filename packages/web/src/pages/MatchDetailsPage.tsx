import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useI18n } from "../i18n";
import { matchApi } from "../api/matchApi";
import { Avatar } from "../profile/Avatar";
import { MatchLoadError } from "../matches/MatchLoadError";
import {
  finishReasonLabel,
  formatDate,
  formatDuration,
  matchDate,
  modeLabel,
  outcomeLabel,
} from "../matches/presentation";
import type { MatchDetails } from "../matches/types";
import { MatchReplayLink } from "../replay/MatchReplayLink";

export function MatchDetailsPage() {
  const { id = "" } = useParams();
  const { t, language } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const key = `${id}:${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    data?: MatchDetails;
    error?: unknown;
  } | null>(null);
  useEffect(() => {
    let active = true;
    matchApi.getMatchDetails(id).then(
      (data) => {
        if (active) setResult({ key, data });
      },
      (error: unknown) => {
        if (active) setResult({ key, error });
      },
    );
    return () => {
      active = false;
    };
  }, [id, key]);
  const current = result?.key === key ? result : null;
  const match = current?.data;
  return (
    <section aria-labelledby="match-details-title" data-testid="match-details-page">
      <p className="section-kicker">{t("auth.brand")}</p>
      <h1 id="match-details-title" className="mt-2 text-2xl font-bold">
        {t("matches.details")}
      </h1>
      {!current && (
        <p role="status" className="mt-4">
          {t("matches.loading")}
        </p>
      )}
      {Boolean(current?.error) && (
        <MatchLoadError error={current?.error} retry={() => setAttempt(attempt + 1)} />
      )}
      {match && (
        <>
          <p className="mt-4 font-semibold">
            {t("matches.finished")} · {modeLabel(match.gameMode, t)}
          </p>
          <div className="my-6 grid gap-4 sm:grid-cols-2">
            {[...match.participants]
              .sort((a, b) => a.seat.localeCompare(b.seat))
              .map((p) => (
                <article key={p.seat} className="match-participant p-4" data-outcome={p.outcome}>
                  <p className="mb-3 text-sm font-bold">
                    {p.seat} · {outcomeLabel(p.outcome, t)}
                  </p>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      username={p.username ?? p.displayName}
                      displayName={p.displayName}
                      avatarUrl={p.avatarUrl}
                      small
                    />
                    <div className="min-w-0 break-words">
                      <h2 className="font-bold">{p.displayName}</h2>
                      {p.username && (
                        <Link
                          className="text-sm underline"
                          to={`/users/${encodeURIComponent(p.username)}`}
                        >
                          @{p.username}
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              ))}
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[
              [t("matches.date"), formatDate(matchDate(match), language, t)],
              [t("matches.startedAt"), formatDate(match.startedAt, language, t)],
              [t("matches.finishedAt"), formatDate(match.finishedAt, language, t)],
              [t("matches.duration"), formatDuration(match.durationMs, t)],
              [t("matches.finishReason"), finishReasonLabel(match.finishReason, t)],
              [t("matches.finalRevision"), match.finalRevision ?? t("matches.unavailable")],
              [t("matches.turnCount"), match.turnCount ?? t("matches.unavailable")],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <MatchReplayLink id={match.id} finalRevision={match.finalRevision} />
        </>
      )}
    </section>
  );
}
