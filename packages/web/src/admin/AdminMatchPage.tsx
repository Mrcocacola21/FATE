import { Link, useParams } from "react-router";
import { useI18n } from "../i18n";
import { formatDuration, finishReasonLabel } from "../matches/presentation";
import { adminApi } from "./api";
import { AdminActionHistory } from "./AdminActionHistory";
import {
  AdminError,
  Badge,
  DateValue,
  Metadata,
  Loading,
  ParticipantName,
  TechnicalId,
} from "./components";
import { useAdminResource } from "./useAdminResource";

export function AdminMatchPage() {
  const { matchId = "" } = useParams();
  const { t } = useI18n();
  const resource = useAdminResource(matchId, () => adminApi.match(matchId));
  const match = resource.data;
  const winner = match?.participants.find((p) =>
    match.result.winnerUserId
      ? p.userId === match.result.winnerUserId
      : !!match.result.winnerSeat && p.seat === match.result.winnerSeat,
  );
  return (
    <div className="admin-section">
      <Link className="admin-back" to="/admin/matches">
        ← {t("admin.matches")}
      </Link>
      {resource.error ? (
        <AdminError error={resource.error} retry={resource.retry} />
      ) : !match ? (
        <Loading />
      ) : (
        <>
          <section className="admin-panel">
            <div className="admin-detail-heading">
              <div>
                <p className="section-kicker">{t("admin.matchDetails")}</p>
                <h2>{match.lobbyName || t("admin.match")}</h2>
              </div>
              <div className="admin-badges">
                <Badge value={match.status} danger={match.status === "CANCELLED"} />
                <Badge value={match.matchType} />
                <Badge value={match.gameMode} />
              </div>
            </div>
            <p className="admin-muted">{t("admin.readOnlyMatch")}</p>
            <Metadata
              items={[
                [t("admin.createdAt"), <DateValue key="match.createdAt" value={match.createdAt} />],
                [t("admin.startedAt"), <DateValue key="match.startedAt" value={match.startedAt} />],
                [
                  t("admin.finishedAt"),
                  <DateValue key="match.finishedAt" value={match.finishedAt} />,
                ],
                [t("admin.updatedAt"), <DateValue key="match.updatedAt" value={match.updatedAt} />],
                [
                  t("admin.origin"),
                  match.origin ? t(`admin.labels.${match.origin}`) : t("admin.notAvailable"),
                ],
                [
                  t("admin.result"),
                  winner ? (
                    <ParticipantName participant={winner} link />
                  ) : match.status === "FINISHED" ? (
                    t("admin.labels.DRAW")
                  ) : (
                    t("admin.notAvailable")
                  ),
                ],
                [
                  t("admin.finishReason"),
                  match.result.finishReason?.startsWith("SERVER_RESTART_UNRECOVERABLE:")
                    ? t("admin.recoveryFailed")
                    : finishReasonLabel(match.result.finishReason, t),
                ],
                [t("admin.duration"), formatDuration(match.result.durationMs, t)],
                [t("admin.turnCount"), match.result.turnCount],
                [t("admin.revision"), match.durableRevision],
                [t("admin.finalRevision"), match.finalRevision],
                [t("admin.latestActionRevision"), match.latestActionRevision],
                [t("admin.actionCount"), match.actionCount],
                [t("admin.snapshotCount"), match.snapshotCount],
                ...(match.matchType === "RATED"
                  ? [
                      [
                        t("admin.ratingProcessing"),
                        match.ratingProcessedAt ? (
                          <>
                            <Badge value="PROCESSED" />
                            <DateValue
                              key="match.ratingProcessedAt"
                              value={match.ratingProcessedAt}
                            />
                          </>
                        ) : (
                          <Badge value="PENDING" />
                        ),
                      ] as [string, React.ReactNode],
                    ]
                  : []),
                ...(match.latestSnapshot
                  ? ([
                      [t("admin.latestSnapshot"), match.latestSnapshot.revision],
                      [t("admin.formatVersion"), match.latestSnapshot.formatVersion],
                      [
                        t("admin.snapshotCreatedAt"),
                        <DateValue
                          key="match.latestSnapshot.createdAt"
                          value={match.latestSnapshot.createdAt}
                        />,
                      ],
                    ] as [string, React.ReactNode][])
                  : []),
              ]}
            />
            <TechnicalId label={t("admin.matchId")} value={match.matchId} />
            <TechnicalId label={t("admin.roomId")} value={match.roomId} />
            <TechnicalId label={t("admin.createdById")} value={match.createdById} />
          </section>
          <section className="admin-panel">
            <h2>{t("admin.participants")}</h2>
            <div className="admin-participants">
              {match.participants.map((p) => (
                <article key={p.seat} className="admin-participant">
                  <div className="admin-detail-heading">
                    <h3>
                      <span className="admin-muted">{p.seat} · </span>
                      <ParticipantName participant={p} link />
                    </h3>
                    {p.outcome && <Badge value={p.outcome} />}
                  </div>
                  {p.username && <p className="admin-muted">@{p.username}</p>}
                  {!p.userId && <p className="admin-muted">{t("admin.guestOrDeleted")}</p>}
                  <TechnicalId label={t("admin.userId")} value={p.userId} />
                </article>
              ))}
            </div>
          </section>
          <AdminActionHistory key={matchId} matchId={matchId} participants={match.participants} />
        </>
      )}
    </div>
  );
}
