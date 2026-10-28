import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import type { Player, Relationship } from "../api/friendApi";
import { useI18n } from "../i18n";
import { MoreMenu } from "./PlayerRow";
import { friendApi, friendBadgeStore } from "./friendStore";

/** The one button that moves a relationship forward: add, accept, cancel, or a settled label. */
export function RelationshipButton({
  player,
  relationship,
  onChange,
  size = "sm",
}: {
  player: Player;
  relationship: Relationship;
  onChange(): void;
  size?: "sm" | "lg";
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sized = size === "sm" ? " btn-sm" : "";
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(
        t(
          failure instanceof ApiError && failure.code === "FRIEND_REQUEST_NOT_ALLOWED"
            ? "friends.notAllowed"
            : "friends.actionError",
        ),
      );
    } finally {
      setBusy(false);
      onChange();
      void friendBadgeStore.getState().refresh();
    }
  };
  const errorLine = error && (
    <span role="alert" className="relationship-error">
      {error}
    </span>
  );
  if (relationship.blocked)
    return <span className="relationship-note">{t("friends.blockedNote")}</span>;
  switch (relationship.status) {
    case "friends":
      return <span className="relationship-done">{t("friends.inFriends")}</span>;
    case "incoming":
      return (
        <>
          <button
            type="button"
            className={`btn btn-primary${sized}`}
            disabled={busy}
            onClick={() => void run(() => friendApi.accept(relationship.requestId!))}
          >
            {t("friends.acceptRequest")}
          </button>
          <button
            type="button"
            className={`btn btn-secondary${sized}`}
            disabled={busy}
            onClick={() => void run(() => friendApi.deleteRequest(relationship.requestId!))}
          >
            {t("friends.decline")}
          </button>
          {errorLine}
        </>
      );
    case "outgoing":
      return (
        <>
          <span className="relationship-done">{t("friends.requested")}</span>
          <button
            type="button"
            className={`btn btn-ghost${sized}`}
            disabled={busy}
            onClick={() => void run(() => friendApi.deleteRequest(relationship.requestId!))}
          >
            {t("friends.cancel")}
          </button>
          {errorLine}
        </>
      );
    default:
      return relationship.canRequest ? (
        <>
          <button
            type="button"
            className={`btn btn-primary${sized}`}
            disabled={busy}
            onClick={() => void run(() => friendApi.sendRequest(player.username))}
          >
            {t("friends.add")}
          </button>
          {errorLine}
        </>
      ) : (
        <span className="relationship-note">{t("friends.closed")}</span>
      );
  }
}

/** Public profile: the relationship button plus remove and block in a "⋯" menu. */
export function RelationshipActions({ player }: { player: Player }) {
  const { t } = useI18n();
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const load = useCallback(() => {
    friendApi.relationship(player.id).then(setRelationship, () => setRelationship(null));
  }, [player.id]);
  useEffect(load, [load]);
  if (!relationship) return null;
  const act = (action: () => Promise<unknown>) => () =>
    void action()
      .catch(() => undefined)
      .finally(() => {
        load();
        void friendBadgeStore.getState().refresh();
      });
  const menu = [
    ...(relationship.status === "friends"
      ? [{ label: t("friends.remove"), onSelect: act(() => friendApi.remove(player.id)) }]
      : []),
    relationship.blocked
      ? { label: t("friends.unblock"), onSelect: act(() => friendApi.unblock(player.id)) }
      : {
          label: t("friends.block"),
          danger: true,
          onSelect: act(() => friendApi.block(player.id)),
        },
  ];
  return (
    <span className="relationship-actions" data-testid="relationship-actions">
      <RelationshipButton player={player} relationship={relationship} onChange={load} size="lg" />
      <MoreMenu items={menu} />
    </span>
  );
}
