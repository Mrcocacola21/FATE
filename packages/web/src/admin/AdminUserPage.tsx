import { useState } from "react";
import { Link, useParams } from "react-router";
import { useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import { RankEmblem } from "../ranks/RankEmblem";
import { getRankPresentation } from "../ranks/rankAssets";
import { formatCompetitiveRating } from "../ranks/rankProgress";
import { adminApi } from "./api";
import {
  AdminError,
  Badge,
  DateValue,
  Empty,
  Metadata,
  Loading,
  TechnicalId,
  UserIdentity,
} from "./components";
import { ModerationDialog, type ModerationAction } from "./ModerationDialog";
import { canModerate, canChangeRole } from "./policy";
import { modes, type AdminUserDetail } from "./types";
import { useAdminResource } from "./useAdminResource";

export function AdminUserPage() {
  const { userId = "" } = useParams();
  return <UserDetail key={userId} userId={userId} />;
}
function UserDetail({ userId }: { userId: string }) {
  const { t } = useI18n();
  const actor = useAuthStore((s) => s.user);
  const resource = useAdminResource(userId, () => adminApi.user(userId));
  const [updated, setUpdated] = useState<AdminUserDetail>();
  const [action, setAction] = useState<ModerationAction>();
  const [notice, setNotice] = useState("");
  const user = updated ?? resource.data;
  return (
    <div className="admin-section">
      <Link className="admin-back" to="/admin/users">
        ← {t("admin.users")}
      </Link>
      {resource.error ? (
        <AdminError error={resource.error} retry={resource.retry} />
      ) : !user ? (
        <Loading />
      ) : (
        <>
          <section className="admin-panel">
            <div className="admin-detail-heading">
              <UserIdentity user={user} />
              <div className="admin-badges">
                <Badge value={user.role} />
                <Badge value={user.blocked ? "BLOCKED" : "ACTIVE"} danger={user.blocked} />
              </div>
            </div>
            <Metadata
              items={[
                [t("admin.createdAt"), <DateValue key="user.createdAt" value={user.createdAt} />],
                [t("admin.updatedAt"), <DateValue key="user.updatedAt" value={user.updatedAt} />],
                [t("admin.matchCount"), user.matchCount],
                ...(user.email ? [[t("admin.email"), user.email] as [string, string]] : []),
                ...(user.blocked
                  ? ([
                      [
                        t("admin.blockedAt"),
                        <DateValue key="user.blockedAt" value={user.blockedAt} />,
                      ],
                      [t("admin.blockReason"), user.blockedReason || t("admin.noReason")],
                    ] as [string, React.ReactNode][])
                  : []),
              ]}
            />
            <TechnicalId label={t("admin.userId")} value={user.id} />
            <div className="admin-actions">
              <Link className="btn btn-secondary" to={`/admin/matches?participant=${user.id}`}>
                {t("admin.viewMatches")}
              </Link>
              {actor && canModerate(actor, user) && (
                <button
                  className={`btn ${user.blocked ? "btn-secondary" : "btn-danger"}`}
                  onClick={() => setAction(user.blocked ? "unblock" : "block")}
                >
                  {t(user.blocked ? "admin.unblock" : "admin.block")}
                </button>
              )}
              {actor && canChangeRole(actor, user) && (
                <button className="btn btn-secondary" onClick={() => setAction("changeRole")}>
                  {t("admin.changeRole")}
                </button>
              )}
            </div>
            {notice && (
              <p className="admin-notice" role="status">
                {notice}
              </p>
            )}
          </section>
          <section className="admin-panel">
            <h2>{t("admin.ratings")}</h2>
            <div className="admin-rating-list">
              {modes.map((mode) => {
                const rating = user.ratings.find((r) => r.gameMode === mode),
                  rank = getRankPresentation(rating?.rankTier);
                return (
                  <div className="admin-rating" key={mode}>
                    <h3>{t(`admin.labels.${mode}`)}</h3>
                    {rating ? (
                      <>
                        <RankEmblem rank={rating.rankTier} size="small" decorative />
                        <div>
                          <strong>{rank && t(rank.labelKey)}</strong>
                          <span className="admin-muted">
                            {t("competitive.games", { count: rating.ratedGames })}
                          </span>
                        </div>
                        <strong className="admin-rating-value">
                          {formatCompetitiveRating(rating.rating)}
                        </strong>
                      </>
                    ) : (
                      <Empty kind="ratings" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          {action && (
            <ModerationDialog
              action={action}
              user={user}
              onClose={() => setAction(undefined)}
              onUpdated={(next) => {
                setUpdated({ ...user, ...next });
                setNotice(t(`admin.success.${action}`));
                setAction(undefined);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
