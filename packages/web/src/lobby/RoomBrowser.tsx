import { useState, type ReactNode } from "react";
import { MatchTypeBadge } from "../matches/MatchTypeBadge";
import type { RoomSummary } from "../api";
import type { PlayerRole } from "../ws";
import { useI18n } from "../i18n";
import { getGameModeName } from "../modes/modeLabels";
import { StatusBadge } from "../components/ui";
import { Avatar } from "../profile/Avatar";
import { TacticalIcon } from "../ui/TacticalIcon";

type Seat = "P1" | "P2";
type StatusFilter = "all" | "waiting" | "active";
type TypeFilter = "all" | "CASUAL" | "RATED";

/** A room a player can sit down in: a manual lobby that has not started and has a free seat. */
export function hasOpenSeat(room: RoomSummary) {
  return (
    room.origin !== "MATCHMAKING" &&
    room.phase === "lobby" &&
    (!room.players.P1 || !room.players.P2)
  );
}

function matchesStatus(room: RoomSummary, status: StatusFilter) {
  if (status === "all") return true;
  return status === "waiting"
    ? room.phase === "lobby"
    : room.phase !== "lobby" && room.phase !== "ended";
}

/** One side of the duel: a taken seat shows the player, a free one is the button that takes it. */
function ArenaSeat({
  room,
  seat,
  canTake,
  blockedReason,
  onTake,
}: {
  room: RoomSummary;
  seat: Seat;
  canTake: boolean;
  blockedReason: string | null;
  onTake: () => void;
}) {
  const { t } = useI18n();
  const side = seat === "P2" ? "end" : "start";
  if (room.players[seat]) {
    const name = room.playerNames?.[seat] || t("customLobby.guest");
    const rating = room.matchType === "RATED" ? room.ratedCompatibility?.ratings[seat] : null;
    const ready = room.phase === "lobby" && room.ready[seat];
    return (
      <div className="lobby-arena__seat" data-side={side} data-taken>
        <span className="lobby-arena__arch">
          <Avatar username={name} avatarUrl={room.playerAvatars?.[seat] ?? null} arch />
          {ready && <span className="lobby-arena__ready" aria-hidden="true" />}
        </span>
        <span className="lobby-arena__who">
          <strong>
            <bdi>{name}</bdi>
          </strong>
          <small>
            {rating != null && (
              <>
                <bdi dir="ltr">{Math.round(rating)}</bdi>
                {" · "}
              </>
            )}
            {ready ? t("common.ready") : seat}
          </small>
        </span>
      </div>
    );
  }
  const arch = (
    <span className="lobby-arena__arch" data-empty>
      <span aria-hidden="true">+</span>
    </span>
  );
  if (canTake)
    return (
      <button type="button" className="lobby-arena__seat" data-side={side} data-open onClick={onTake}>
        {arch}
        <span className="lobby-arena__who">
          <strong>{t("customLobby.takeSeat")}</strong>
          <small>
            {seat} · {t("customLobby.emptySeat")}
          </small>
        </span>
      </button>
    );
  return (
    <div className="lobby-arena__seat" data-side={side} data-blocked>
      {arch}
      <span className="lobby-arena__who">
        <strong>
          {t(room.origin === "MATCHMAKING" ? "customLobby.reserved" : "customLobby.openSeat")}
        </strong>
        <small>{blockedReason ?? t("customLobby.emptySeat")}</small>
      </span>
    </div>
  );
}

function Arena({
  room,
  actionsDisabled,
  onJoin,
}: {
  room: RoomSummary;
  actionsDisabled: boolean;
  onJoin: (room: RoomSummary, role?: PlayerRole) => void;
}) {
  const { t } = useI18n();
  const reserved = room.origin === "MATCHMAKING";
  const open = hasOpenSeat(room);
  const state =
    room.phase === "ended"
      ? "finished"
      : room.phase !== "lobby"
        ? "active"
        : reserved
          ? "starting"
          : "waiting";
  const gap =
    state === "waiting" && room.ratedCompatibility?.reason === "RATED_RATING_DIFFERENCE_TOO_LARGE";
  const seat = (value: Seat) => (
    <ArenaSeat
      room={room}
      seat={value}
      canTake={open && !actionsDisabled}
      blockedReason={open && actionsDisabled ? t("customLobby.queueBlocked") : null}
      onTake={() => onJoin(room, value)}
    />
  );
  return (
    <article className="lobby-arena" data-open={(open && !actionsDisabled) || undefined}>
      <header className="lobby-arena__head">
        <div className="min-w-0">
          <h3 className="lobby-arena__name">
            {room.lobbyName || t(reserved ? "customLobby.ratedName" : "customLobby.defaultName")}
          </h3>
          <p className="lobby-arena__meta">
            {getGameModeName(room.gameMode ?? "standard", t)}
            {room.hostName ? ` · ${t("customLobby.host")}: ${room.hostName}` : ""}
          </p>
        </div>
        <span className="lobby-arena__badges">
          <MatchTypeBadge matchType={room.matchType} />
          {room.roomMode === "test" && (
            <StatusBadge tone="special">{t("testRoom.badge")}</StatusBadge>
          )}
        </span>
      </header>
      <div className="lobby-arena__versus">
        {seat("P1")}
        <span className="lobby-arena__vs" aria-hidden="true">
          <span>{t("customLobby.vs")}</span>
        </span>
        {seat("P2")}
      </div>
      {gap && (
        <p className="lobby-arena__warning">
          <TacticalIcon name="rules" />
          {t("customLobby.gapShort")}
        </p>
      )}
      <footer className="lobby-arena__foot">
        <span className="lobby-arena__status" data-state={state}>
          {t(`customLobby.${state}`)}
        </span>
        <span className="lobby-arena__spectators">
          {t("lobby.spectators", { count: room.spectators })}
        </span>
        <button
          type="button"
          className={`btn btn-sm ${open ? "btn-ghost" : "btn-secondary"}`}
          disabled={actionsDisabled}
          onClick={() => onJoin(room, "spectator")}
        >
          {t("lobby.spectateRoom")}
        </button>
      </footer>
    </article>
  );
}

function Segments<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="lobby-segments" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count != null && <span className="lobby-segments__count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

function Group({ title, children, size }: { title: string; children: ReactNode; size: number }) {
  return (
    <section className="lobby-group" aria-label={title}>
      <h2 className="lobby-group__title">
        {title} <span>{size}</span>
      </h2>
      <div className="lobby-arenas">{children}</div>
    </section>
  );
}

export function RoomBrowser({
  rooms,
  refreshing,
  loading = false,
  stale = false,
  actionsDisabled = false,
  onRefresh,
  onCreate,
  onJoin,
}: {
  rooms: RoomSummary[];
  refreshing: boolean;
  /** No list has arrived yet: show placeholders rather than "no lobbies". */
  loading?: boolean;
  /** The last refresh failed, so the list shown is older. */
  stale?: boolean;
  actionsDisabled?: boolean;
  onRefresh: () => void;
  onCreate: () => void;
  onJoin: (room: RoomSummary, role?: PlayerRole) => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const ofType = rooms.filter((room) => type === "all" || room.matchType === type);
  const filtered = ofType.filter((room) => matchesStatus(room, status));
  // Rooms with a free seat come first: they are what most visitors are here for.
  const open = filtered.filter(hasOpenSeat);
  const watch = filtered.filter((room) => !hasOpenSeat(room));
  const count = (value: StatusFilter) => ofType.filter((room) => matchesStatus(room, value)).length;
  const arenas = (items: RoomSummary[]) =>
    items.map((room) => (
      <Arena key={room.id} room={room} actionsDisabled={actionsDisabled} onJoin={onJoin} />
    ));
  return (
    <section
      className="lobby-browser"
      data-testid="room-browser"
      aria-label={t("customLobby.browse")}
      aria-busy={loading || refreshing}
      data-stale={stale || undefined}
    >
      {rooms.length > 0 && (
        <div className="lobby-toolbar">
          <Segments
            label={t("customLobby.status")}
            value={status}
            onChange={setStatus}
            options={(["all", "waiting", "active"] as const).map((value) => ({
              value,
              label: t(`customLobby.${value}`),
              count: count(value),
            }))}
          />
          <Segments
            label={t("matchTypes.label")}
            value={type}
            onChange={setType}
            options={[
              { value: "all" as const, label: t("customLobby.allTypes") },
              { value: "CASUAL" as const, label: t("matchTypes.CASUAL") },
              { value: "RATED" as const, label: t("matchTypes.RATED") },
            ]}
          />
          <span className="lobby-toolbar__spacer" />
          <span className="lobby-toolbar__fresh">{t("customLobby.autoRefresh")}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            {refreshing ? t("common.refreshing") : t("common.refresh")}
          </button>
        </div>
      )}
      {loading ? (
        <div className="lobby-arenas" role="status" aria-label={t("customLobby.loadingRooms")}>
          {[0, 1].map((key) => (
            <div key={key} className="lobby-arena lobby-arena--skeleton" aria-hidden="true">
              <i style={{ width: "45%" }} />
              <i style={{ width: "30%" }} />
              <div className="lobby-arena__versus">
                <i className="lobby-arena__ghost" />
                <span />
                <i className="lobby-arena__ghost" />
              </div>
            </div>
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="lobby-empty">
          <span className="lobby-empty__arch" aria-hidden="true">
            +
          </span>
          <h2>{t("customLobby.empty")}</h2>
          <p>{t("customLobby.emptyDescription")}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onCreate}
            disabled={actionsDisabled}
          >
            <TacticalIcon name="plus" />
            {t("customLobby.create")}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="lobby-empty">
          <h2>{t("customLobby.noResults")}</h2>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setStatus("all");
              setType("all");
            }}
          >
            {t("customLobby.resetFilters")}
          </button>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <Group title={t("customLobby.openSeats")} size={open.length}>
              {arenas(open)}
            </Group>
          )}
          {watch.length > 0 && (
            <Group title={t("customLobby.spectateGroup")} size={watch.length}>
              {arenas(watch)}
            </Group>
          )}
        </>
      )}
    </section>
  );
}
