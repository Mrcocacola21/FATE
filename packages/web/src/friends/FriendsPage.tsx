import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { BlockedPlayer, Friend, FriendRequests, SearchResult } from "../api/friendApi";
import { useI18n } from "../i18n";
import { MoreMenu, PlayerRow } from "./PlayerRow";
import { friendApi, friendBadgeStore, useFriendBadge } from "./friendStore";
import { RelationshipButton } from "./RelationshipActions";
import { PresenceLine } from "./PresenceLine";

/** Friends are grouped by what they are doing, busiest first. */
const GROUPS = [
  { state: "battle", title: "presence.groupBattle" },
  { state: "lobby", title: "presence.groupLobby" },
  { state: "online", title: "presence.groupOnline" },
  { state: "offline", title: "presence.groupOffline" },
] as const;

/** Join a friend's lobby with a free seat, or watch their battle; nothing otherwise. */
function FriendAction({ friend }: { friend: Friend }) {
  const { t } = useI18n();
  const activity = friend.presence.activity;
  if (!activity) return null;
  if (friend.presence.state === "lobby" && !activity.openSeat) return null;
  return (
    <Link
      className="btn btn-secondary btn-sm"
      to={`/lobby?join=${encodeURIComponent(activity.roomId)}`}
    >
      {t(friend.presence.state === "battle" ? "presence.watch" : "presence.join")}
    </Link>
  );
}

const TABS = ["friends", "requests", "find"] as const;
type Tab = (typeof TABS)[number];

type Load<T> = { data?: T; error?: true };

function useLoad<T>(read: () => Promise<T>) {
  const [state, setState] = useState<Load<T>>({});
  const reload = useCallback(() => {
    read().then(
      (data) => setState({ data }),
      () => setState({ error: true }),
    );
  }, [read]);
  useEffect(reload, [reload]);
  return [state, reload] as const;
}

function useDate() {
  const { language } = useI18n();
  return (value: string) => new Date(value).toLocaleDateString(language);
}

/** Runs one action, refreshes what it changed and reports a failure once. */
function useAction(onDone: () => void) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch {
      setError(t("friends.actionError"));
    }
    onDone();
    void friendBadgeStore.getState().refresh();
  };
  return { run, error };
}

function FriendsTab() {
  const { t } = useI18n();
  const date = useDate();
  const [filter, setFilter] = useState("");
  const [friends, reloadFriends] = useLoad(friendApi.friends);
  // Statuses change while the page is open; re-read them when the player comes back to it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("focus", reloadFriends);
    return () => window.removeEventListener("focus", reloadFriends);
  }, [reloadFriends]);
  const [blocks, reloadBlocks] = useLoad(friendApi.blocks);
  const { run, error } = useAction(() => {
    reloadFriends();
    reloadBlocks();
  });
  const visible = (friends.data ?? []).filter((friend: Friend) =>
    `${friend.player.username} ${friend.player.displayName ?? ""}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );
  return (
    <div className="friends-tab">
      <label className="friends-field">
        <span className="sr-only">{t("friends.filter")}</span>
        <input
          id="friends-filter"
          type="search"
          className="field-control"
          placeholder={t("friends.filter")}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="friends-error">
          {error}
        </p>
      )}
      {friends.error ? (
        <p role="alert" className="friends-message">
          {t("friends.loadError")}
        </p>
      ) : !friends.data ? (
        <p role="status" className="friends-message">
          {t("profile.loading")}
        </p>
      ) : visible.length === 0 ? (
        <p className="friends-message">
          {t(friends.data.length ? "friends.emptyFiltered" : "friends.empty")}
        </p>
      ) : (
        <div className="friends-groups">
          {GROUPS.map(({ state, title }) => {
            const members = visible.filter((friend) => friend.presence.state === state);
            if (!members.length) return null;
            return (
              <section key={state} className="friends-group" aria-labelledby={`friends-${state}`}>
                <h2 id={`friends-${state}`} className="friends-group__title">
                  {t(title)} <span>{members.length}</span>
                </h2>
                <ul className="player-list">
                  {members.map((friend) => (
                    <PlayerRow
                      key={friend.player.id}
                      player={friend.player}
                      detail={<PresenceLine presence={friend.presence} />}
                    >
                      <FriendAction friend={friend} />
                      <MoreMenu
                        items={[
                          {
                            label: t("friends.remove"),
                            onSelect: () => void run(() => friendApi.remove(friend.player.id)),
                          },
                          {
                            label: t("friends.block"),
                            danger: true,
                            onSelect: () => void run(() => friendApi.block(friend.player.id)),
                          },
                        ]}
                      />
                    </PlayerRow>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {blocks.data && blocks.data.length > 0 && (
        <details className="friends-blocked">
          <summary>
            {t("friends.blockedTitle")} · {blocks.data.length}
          </summary>
          <ul className="player-list">
            {blocks.data.map((row: BlockedPlayer) => (
              <PlayerRow key={row.player.id} player={row.player} detail={date(row.blockedAt)}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void run(() => friendApi.unblock(row.player.id))}
                >
                  {t("friends.unblock")}
                </button>
              </PlayerRow>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function RequestsTab() {
  const { t } = useI18n();
  const date = useDate();
  const [requests, reload] = useLoad(friendApi.requests);
  const { run, error } = useAction(reload);
  const data: FriendRequests | undefined = requests.data;
  if (requests.error)
    return (
      <p role="alert" className="friends-message">
        {t("friends.loadError")}
      </p>
    );
  if (!data)
    return (
      <p role="status" className="friends-message">
        {t("profile.loading")}
      </p>
    );
  if (!data.incoming.length && !data.outgoing.length)
    return <p className="friends-message">{t("friends.noRequests")}</p>;
  return (
    <div className="friends-tab">
      {error && (
        <p role="alert" className="friends-error">
          {error}
        </p>
      )}
      {data.incoming.length > 0 && (
        <section className="friends-group" aria-labelledby="friends-incoming">
          <h2 id="friends-incoming" className="friends-group__title">
            {t("friends.incoming")} <span>{data.incoming.length}</span>
          </h2>
          <ul className="player-list">
            {data.incoming.map((request) => (
              <PlayerRow
                key={request.id}
                player={request.player}
                detail={t("friends.sentAt", { date: date(request.createdAt) })}
              >
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void run(() => friendApi.accept(request.id))}
                >
                  {t("friends.accept")}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void run(() => friendApi.deleteRequest(request.id))}
                >
                  {t("friends.decline")}
                </button>
              </PlayerRow>
            ))}
          </ul>
        </section>
      )}
      {data.outgoing.length > 0 && (
        <section className="friends-group" aria-labelledby="friends-outgoing">
          <h2 id="friends-outgoing" className="friends-group__title">
            {t("friends.outgoing")} <span>{data.outgoing.length}</span>
          </h2>
          <ul className="player-list">
            {data.outgoing.map((request) => (
              <PlayerRow
                key={request.id}
                player={request.player}
                detail={t("friends.sentAt", { date: date(request.createdAt) })}
              >
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void run(() => friendApi.deleteRequest(request.id))}
                >
                  {t("friends.cancel")}
                </button>
              </PlayerRow>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FindTab() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    query: string;
    rows?: SearchResult[];
    error?: true;
  } | null>(null);
  const trimmed = query.trim();
  const search = useCallback(() => {
    if (trimmed.length < 2) return;
    friendApi.search(trimmed).then(
      (rows) => setResults({ query: trimmed, rows }),
      () => setResults({ query: trimmed, error: true }),
    );
  }, [trimmed]);
  useEffect(() => {
    if (trimmed.length < 2) return;
    const timer = setTimeout(search, 250);
    return () => clearTimeout(timer);
  }, [search, trimmed]);
  const current = results?.query === trimmed ? results : null;
  return (
    <div className="friends-tab">
      <label className="friends-field" htmlFor="friends-search">
        <span className="friends-field__label">{t("friends.searchLabel")}</span>
        <input
          id="friends-search"
          type="search"
          className="field-control"
          autoComplete="off"
          maxLength={32}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="friends-field__hint">{t("friends.searchHint")}</span>
      </label>
      {trimmed.length >= 2 &&
        (current?.error ? (
          <p role="alert" className="friends-message">
            {t("friends.loadError")}
          </p>
        ) : !current?.rows ? (
          <p role="status" className="friends-message">
            {t("profile.loading")}
          </p>
        ) : current.rows.length === 0 ? (
          <p className="friends-message">{t("friends.searchEmpty")}</p>
        ) : (
          <ul className="player-list" aria-label={t("friends.tabFind")}>
            {current.rows.map((row) => (
              <PlayerRow key={row.player.id} player={row.player}>
                <RelationshipButton
                  player={row.player}
                  relationship={row.relationship}
                  onChange={search}
                />
              </PlayerRow>
            ))}
          </ul>
        ))}
    </div>
  );
}

export function FriendsPage() {
  const { t } = useI18n();
  const incoming = useFriendBadge();
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : "friends";
  useEffect(() => {
    void friendBadgeStore.getState().refresh();
  }, []);
  const label: Record<Tab, string> = {
    friends: t("friends.tabFriends"),
    requests: t("friends.tabRequests"),
    find: t("friends.tabFind"),
  };
  return (
    <section className="friends-page" aria-labelledby="friends-title" data-testid="friends-page">
      <header className="friends-header">
        <span className="grimoire-kicker">{t("friends.kicker")}</span>
        <h1 id="friends-title">{t("friends.title")}</h1>
      </header>
      <div className="friends-tabs" role="tablist" aria-label={t("friends.title")}>
        {TABS.map((id) => (
          <button
            key={id}
            id={`friends-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls="friends-panel"
            onClick={() => setParams(id === "friends" ? {} : { tab: id }, { replace: true })}
          >
            {label[id]}
            {id === "requests" && incoming > 0 && (
              <span
                className="nav-count"
                aria-label={t("friends.newRequests", { value: incoming })}
              >
                {incoming}
              </span>
            )}
          </button>
        ))}
      </div>
      <div id="friends-panel" role="tabpanel" aria-labelledby={`friends-tab-${tab}`}>
        {tab === "friends" ? <FriendsTab /> : tab === "requests" ? <RequestsTab /> : <FindTab />}
      </div>
    </section>
  );
}
