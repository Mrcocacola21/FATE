import { MatchmakingPanel } from "../matchmaking/MatchmakingPanel";
import { useQueue } from "../matchmaking/store";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useGameStore } from "../store";
import { useI18n } from "../i18n";
import { localizeServerText } from "../i18n/displayMetadata";
import { RoomBrowser } from "../lobby/RoomBrowser";
import { RoomConnectionDialog, type RoomDialogKind } from "../lobby/RoomConnectionDialog";
import type { RoomSummary } from "../api";
import { TacticalIcon } from "../ui/TacticalIcon";

export function Lobby() {
  const { pathname } = useLocation();
  const queueStatus = useQueue(s => s.status.status);
  const inQueue = queueStatus === "QUEUED" || queueStatus === "MATCHING";
  const { t } = useI18n();
  const { roomsList, fetchRooms } = useGameStore();
  const [dialog, setDialog] = useState<{ kind: RoomDialogKind; room?: RoomSummary } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    setDialog(null);
  }, [pathname]);
  useEffect(() => {
    let active = true;
    fetchRooms().catch((cause) => {
      if (active)
        setError(
          localizeServerText(cause instanceof Error ? cause.message : "", t) ||
            t("errors.loadRooms"),
        );
    });
    return () => {
      active = false;
    };
  }, [fetchRooms, t]);
  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await fetchRooms();
    } catch (cause) {
      setError(
        localizeServerText(cause instanceof Error ? cause.message : "", t) || t("errors.loadRooms"),
      );
    } finally {
      setRefreshing(false);
    }
  };
  const open = (kind: RoomDialogKind, room?: RoomSummary) => {
    if (inQueue) return;
    useGameStore.setState({ joinError: null });
    setDialog({ kind, room });
  };
  return (
    <div className="play-page mx-auto max-w-6xl space-y-6" data-testid="play-page">
      <header className="play-header">
        <p className="section-kicker">{t("shell.multiplayer")}</p>
        <h1 className="font-display mt-1 text-3xl font-semibold sm:text-4xl">{t("shell.play")}</h1>
        <p className="mt-2 text-sm text-muted">{t("shell.playDescription")}</p>
      </header>
      <MatchmakingPanel />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={inQueue}
          data-testid="create-room"
          onClick={() => open("create")}
        >
          <TacticalIcon name="plus" />
          {t("shell.createMatch")}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={inQueue}
          data-testid="join-by-id"
          onClick={() => open("join")}
        >
          {t("lobby.joinById")}
        </button>
      </div>
      {error && (
        <p role="alert" className="fate-notice text-sm">
          {error}
        </p>
      )}
      <RoomBrowser
        rooms={roomsList}
        refreshing={refreshing}
        actionsDisabled={inQueue}
        onRefresh={() => void refresh()}
        onCreate={() => open("create")}
        onJoin={(room) => open("join", room)}
      />
      {dialog && (
        <RoomConnectionDialog
          kind={dialog.kind}
          room={dialog.room}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
