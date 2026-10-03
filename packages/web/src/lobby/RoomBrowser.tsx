import { MatchTypeBadge } from "../matches/MatchTypeBadge";
import type { RoomSummary } from "../api";
import { useI18n } from "../i18n";
import { getPhaseLabel } from "../i18n/displayMetadata";
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
  return (
    <PanelCard className="p-4 sm:p-6" data-testid="room-browser">
      <SectionHeader
        className="room-browser-header"
        title={t("lobby.availableRooms")}
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
      <div className="mt-5 space-y-3">
        {rooms.length === 0 && (
          <div className="play-empty-state">
            <EmptyState
              title={t("lobby.noRooms")}
              description={t("shell.emptyRooms")}
              icon={<TacticalIcon name="actions" />}
            />
            <button type="button" className="btn btn-secondary mt-4" onClick={onCreate} disabled={actionsDisabled}>
              {t("shell.createMatch")}
            </button>
          </div>
        )}
        {rooms.map((room) => (
          <article
            key={room.id}
            className="room-card group"
            data-state={
              room.phase !== "lobby"
                ? "playing"
                : room.players.P1 && room.players.P2
                  ? "full"
                  : "available"
            }
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-all font-mono text-sm font-semibold text-slate-900 dark:text-white">
                    {room.id}
                  </h3>
                  <StatusBadge tone={room.phase === "lobby" ? "success" : "warning"}>
                    {getPhaseLabel(room.phase, t)}
                  </StatusBadge>
                  <MatchTypeBadge matchType={room.matchType} />
                  {room.roomMode === "test" ? (
                    <StatusBadge tone="special">{t("testRoom.badge")}</StatusBadge>
                  ) : null}
                  {room.roomMode === "normal" ? (
                    <StatusBadge tone="info">
                      {getGameModeName(room.gameMode ?? "standard", t)}
                    </StatusBadge>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge tone="info">
                    {t("mobile.playersCount", {
                      count: Number(room.players.P1) + Number(room.players.P2),
                    })}
                  </StatusBadge>
                  <span className="room-seat" data-occupied={String(room.players.P1)}>
                    P1 {room.players.P1 ? t("common.occupied") : t("common.open")}
                  </span>
                  <span className="room-seat" data-occupied={String(room.players.P2)}>
                    P2 {room.players.P2 ? t("common.occupied") : t("common.open")}
                  </span>
                  <StatusBadge tone="info">
                    {t("lobby.spectators", { count: room.spectators })}
                  </StatusBadge>
                </div>
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  {t("lobby.readyState", {
                    p1: room.ready.P1 ? t("common.ready") : t("common.waiting"),
                    p2: room.ready.P2 ? t("common.ready") : t("common.waiting"),
                  })}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary w-full sm:w-auto"
                disabled={actionsDisabled}
                onClick={() => {
                  onJoin(room);
                }}
              >
                {room.phase !== "lobby" || (room.players.P1 && room.players.P2)
                  ? t("lobby.spectateRoom")
                  : t("lobby.joinRoom")}
              </button>
            </div>
          </article>
        ))}
      </div>
    </PanelCard>
  );
}
