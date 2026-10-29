import { useEffect, useState } from "react";
import { useAuthStore } from "../auth/authStore";
import type { Friend, Player } from "../api/friendApi";
import { PlayerRow } from "../friends/PlayerRow";
import { PresenceLine } from "../friends/PresenceLine";
import { friendApi } from "../friends/friendStore";
import { useI18n } from "../i18n";
import { InviteButton } from "./InviteButton";
import { useInvitableRoom } from "./inviteStore";

const ORDER = { lobby: 0, online: 1, battle: 2, offline: 3 } as const;
const QUERY = /^[A-Za-z0-9_-]{2,32}$/;

/** Friends first (who is free at the top), or anyone by username once two letters are typed. */
function InvitePicker() {
  const { t } = useI18n();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Player[] | null>(null);
  useEffect(() => {
    let active = true;
    friendApi.friends().then(
      (list) => active && setFriends(list),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, []);
  const search = query.trim();
  useEffect(() => {
    setFound(null);
    if (!QUERY.test(search)) return;
    let active = true;
    const timer = setTimeout(() => {
      friendApi.search(search).then(
        (rows) => active && setFound(rows.map((row) => row.player)),
        () => active && setFound([]),
      );
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);
  const sorted = [...(friends ?? [])].sort(
    (a, b) => ORDER[a.presence.state] - ORDER[b.presence.state],
  );
  return (
    <div className="invite-panel__picker">
      <label className="friends-field">
        <span className="friends-field__label">{t("friends.searchLabel")}</span>
        <input
          type="search"
          className="field-control"
          value={query}
          maxLength={32}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {search ? (
        !QUERY.test(search) ? (
          <p className="friends-message">{t("friends.searchHint")}</p>
        ) : !found ? (
          <p role="status" className="friends-message">
            {t("profile.loading")}
          </p>
        ) : found.length === 0 ? (
          <p className="friends-message">{t("friends.searchEmpty")}</p>
        ) : (
          <ul className="player-list" aria-label={t("friends.searchLabel")}>
            {found.map((player) => (
              <PlayerRow key={player.id} player={player}>
                <InviteButton player={player} />
              </PlayerRow>
            ))}
          </ul>
        )
      ) : failed ? (
        <p role="alert" className="friends-message">
          {t("friends.loadError")}
        </p>
      ) : !friends ? (
        <p role="status" className="friends-message">
          {t("profile.loading")}
        </p>
      ) : sorted.length === 0 ? (
        <p className="friends-message">{t("invites.noFriends")}</p>
      ) : (
        <ul className="player-list" aria-label={t("friends.title")}>
          {sorted.map((friend) => (
            <PlayerRow
              key={friend.player.id}
              player={friend.player}
              detail={<PresenceLine presence={friend.presence} />}
            >
              <InviteButton player={friend.player} />
            </PlayerRow>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Invite a player" in the waiting room, while this player's lobby has a free seat. */
export function InvitePanel() {
  const { t } = useI18n();
  const signedIn = useAuthStore((state) => state.status === "authenticated");
  const roomId = useInvitableRoom();
  const [open, setOpen] = useState(false);
  if (!signedIn || !roomId) return null;
  return (
    <section className="invite-panel" data-testid="invite-panel">
      <button
        type="button"
        className="btn btn-secondary w-full"
        aria-expanded={open}
        aria-controls="invite-panel-picker"
        onClick={() => setOpen((value) => !value)}
      >
        {t("invites.invitePlayer")}
      </button>
      {open && (
        <div id="invite-panel-picker">
          <InvitePicker />
        </div>
      )}
    </section>
  );
}
