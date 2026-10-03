import { useState } from "react";
import { MatchTypeBadge } from "../matches/MatchTypeBadge";
import type { RoomSummary } from "../api";
import { useI18n } from "../i18n";
import { getGameModeName } from "../modes/modeLabels";
import { PanelCard, SectionHeader, StatusBadge } from "../components/ui";
import { EmptyState } from "../ui";
import { TacticalIcon } from "../ui/TacticalIcon";

export function RoomBrowser({
  rooms,
  refreshing,
  actionsDisabled = false,
  onRefresh,
  onCreate,
  onJoin,
}: {
  rooms: RoomSummary[];
  refreshing: boolean;
  actionsDisabled?: boolean;
  onRefresh: () => void;
  onCreate: () => void;
  onJoin: (room: RoomSummary) => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const filtered = rooms.filter(
    (room) =>
      (status === "all" ||
        (status === "waiting"
          ? room.phase === "lobby"
          : room.phase !== "lobby" && room.phase !== "ended")) &&
      (type === "all" || room.matchType === type),
  );
  return (
    <PanelCard className="p-4 sm:p-6" data-testid="room-browser">
      <SectionHeader
        className="room-browser-header"
        title={t("customLobby.browse")}
        action={
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            {refreshing ? t("common.refreshing") : t("common.refresh")}
          </button>
        }
      />
      <div className="lobby-filters mt-5">
        <label className="text-xs text-muted">
          {t("customLobby.status")}
          <select
            className="field-control mt-1"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {["all", "waiting", "active"].map((value) => (
              <option key={value} value={value}>
                {t(`customLobby.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          {t("matchTypes.label")}
          <select
            className="field-control mt-1"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="all">{t("customLobby.all")}</option>
            <option value="CASUAL">{t("matchTypes.CASUAL")}</option>
            <option value="RATED">{t("matchTypes.RATED")}</option>
          </select>
        </label>
      </div>
      <div className="mt-5 space-y-3">
        {filtered.length === 0 && (
          <div className="play-empty-state">
            <EmptyState
              title={t(rooms.length ? "customLobby.noResults" : "customLobby.empty")}
              description={t("customLobby.emptyDescription")}
              icon={<TacticalIcon name="actions" />}
            />
            <button
              type="button"
              className="btn btn-secondary mt-4"
              onClick={onCreate}
              disabled={actionsDisabled}
            >
              {t("customLobby.create")}
            </button>
          </div>
        )}
        {filtered.map((room) => {
          const reserved = room.origin === "MATCHMAKING";
          const spectate =
            reserved || room.phase !== "lobby" || (room.players.P1 && room.players.P2);
          const state =
            room.phase === "ended"
              ? "finished"
              : room.phase !== "lobby"
                ? "active"
                : reserved
                  ? "starting"
                  : "waiting";
          return (
            <article
              key={room.id}
              className="room-card group"
              data-state={room.phase !== "lobby" ? "playing" : spectate ? "full" : "available"}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="lobby-name">
                      {room.lobbyName ||
                        t(reserved ? "customLobby.ratedName" : "customLobby.defaultName")}
                    </h3>
                    <MatchTypeBadge matchType={room.matchType} />
                    {room.roomMode === "test" && (
                      <StatusBadge tone="special">{t("testRoom.badge")}</StatusBadge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {getGameModeName(room.gameMode ?? "standard", t)}
                    {room.hostName ? ` · ${t("customLobby.host")}: ${room.hostName}` : ""}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {(["P1", "P2"] as const).map((seat) => {
                      const name = room.players[seat]
                        ? room.playerNames?.[seat] || t("customLobby.guest")
                        : t("customLobby.emptySeat");
                      const rating = room.ratedCompatibility?.ratings[seat];
                      return (
                        <div key={seat} className="lobby-player">
                          <span className="lobby-avatar" aria-hidden="true">
                            {room.players[seat] ? Array.from(name)[0]?.toUpperCase() : "+"}
                          </span>
                          <div className="min-w-0">
                            <p className="break-words text-sm">
                              <span className="mr-2 text-xs text-muted">{seat}</span>
                              {name}
                            </p>
                            {room.matchType === "RATED" && rating != null && (
                              <p className="text-xs text-muted tabular-nums">
                                {Math.round(rating)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <StatusBadge tone={state === "waiting" ? "success" : "neutral"}>
                      {t(`customLobby.${state}`)}
                    </StatusBadge>
                    <span>{t("lobby.spectators", { count: room.spectators })}</span>
                    {state === "waiting" &&
                      room.ratedCompatibility?.reason === "RATED_RATING_DIFFERENCE_TOO_LARGE" && (
                        <span className="fate-notice">{t("customLobby.gapShort")}</span>
                      )}
                  </div>
                </div>
                <button
                  type="button"
                  className={`btn ${spectate ? "btn-secondary" : "btn-primary"} w-full sm:w-auto`}
                  disabled={actionsDisabled}
                  onClick={() => onJoin(room)}
                >
                  {t(spectate ? "lobby.spectateRoom" : "customLobby.join")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </PanelCard>
  );
}
