import { queue, useQueue } from "../matchmaking/store";
import { ActiveMatchNotice } from "../matches/ActiveMatchNotice";
import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { useGameStore } from "../store";
import { useI18n, type Translate } from "../i18n";
import { localizeServerText } from "../i18n/displayMetadata";
import { RoomBrowser } from "../lobby/RoomBrowser";
import { RoomConnectionDialog, type RoomDialogKind } from "../lobby/RoomConnectionDialog";
import { lookupRoom, type RoomSummary } from "../api";
import type { PlayerRole } from "../ws";
import { TacticalIcon } from "../ui/TacticalIcon";
import { useCapabilities } from "../layout/Capabilities";

function loadFailure(cause: unknown, t: Translate) {
  return localizeServerText(cause instanceof Error ? cause.message : "", t) || t("errors.loadRooms");
}

export function Lobby() {
  const { pathname } = useLocation();
  const queueStatus = useQueue((s) => s.status.status);
  const inQueue = queueStatus === "QUEUED" || queueStatus === "MATCHING";
  const { t, language } = useI18n();
  const capabilities = useCapabilities();
  const { roomsList, fetchRooms } = useGameStore();
  const [dialog, setDialog] = useState<{
    kind: RoomDialogKind;
    room?: RoomSummary;
    role?: PlayerRole;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Until the first answer the list is unknown, which is not the same as empty.
  const [loaded, setLoaded] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [code, setCode] = useState("");
  const [codeState, setCodeState] = useState<"idle" | "busy" | "failed">("idle");
  useEffect(() => {
    setDialog(null);
  }, [pathname]);
  // /lobby?join=<room id> (from a friend's status) opens the join dialog for that room.
  const [params, setParams] = useSearchParams();
  const joinId = params.get("join");
  useEffect(() => {
    if (!joinId) return;
    // Clearing the parameter re-runs this effect, so the lookup is not tied to its cleanup.
    void lookupRoom(joinId).then(
      (room) => setDialog({ kind: "join", room }),
      () => undefined,
    );
    setParams({}, { replace: true });
  }, [joinId, setParams]);
  useEffect(() => {
    let active = true;
    let loading = false;
    const load = () => {
      if (loading) return;
      loading = true;
      void fetchRooms()
        .then(() => {
          if (!active) return;
          setError(null);
          setLoadedAt(new Date());
        })
        .catch((cause) => {
          if (active) setError(loadFailure(cause, t));
        })
        .finally(() => {
          loading = false;
          if (active) setLoaded(true);
        });
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [fetchRooms, t]);
  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await fetchRooms();
      setLoadedAt(new Date());
    } catch (cause) {
      setError(loadFailure(cause, t));
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  };
  const open = (kind: RoomDialogKind, room?: RoomSummary, role?: PlayerRole) => {
    if (inQueue) return;
    useGameStore.setState({ joinError: null });
    setDialog({ kind, room, role });
  };
  // A typed code is resolved here; an empty one opens the dialog to paste it there.
  const joinByCode = () => {
    const id = code.trim();
    if (!id) {
      open("join");
      return;
    }
    if (inQueue || codeState === "busy") return;
    setCodeState("busy");
    void lookupRoom(id).then(
      (room) => {
        setCodeState("idle");
        setCode("");
        open("join", room);
      },
      () => setCodeState("failed"),
    );
  };
  const stale = !!error && roomsList.length > 0 && loadedAt !== null;
  return (
    <div className="lobby-page mx-auto max-w-6xl" data-testid="lobby-page">
      <ActiveMatchNotice />
      <header className="lobby-header">
        <div className="min-w-0">
          <p className="lobby-header__kicker">{t("customLobby.kicker")}</p>
          <h1 className="lobby-header__title">{t("customLobby.title")}</h1>
          <p className="lobby-header__description">{t("customLobby.description")}</p>
        </div>
        <div className="lobby-header__actions">
          <div className="lobby-code">
            <input
              id="lobby-code"
              className="lobby-code__input"
              value={code}
              placeholder={t("customLobby.code")}
              aria-label={t("customLobby.pasteCode")}
              aria-invalid={codeState === "failed" || undefined}
              aria-describedby={codeState === "failed" ? "lobby-code-error" : undefined}
              autoComplete="off"
              spellCheck={false}
              disabled={inQueue}
              onChange={(event) => {
                setCode(event.target.value);
                if (codeState === "failed") setCodeState("idle");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  joinByCode();
                }
              }}
            />
            <button
              type="button"
              className="lobby-code__go"
              disabled={inQueue}
              aria-busy={codeState === "busy"}
              aria-label={t("customLobby.joinCode")}
              data-testid="join-by-id"
              onClick={joinByCode}
            >
              <TacticalIcon name="arrow" />
            </button>
            {codeState === "failed" && (
              <p id="lobby-code-error" role="alert" className="lobby-code__error">
                {t("matchTypes.lookupFailed")}
              </p>
            )}
          </div>
          {capabilities?.testRooms.enabled && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={inQueue}
              data-testid="create-test-room"
              onClick={() => open("test")}
            >
              <TacticalIcon name="unit" />
              {t("testRoom.create")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary lobby-create"
            disabled={inQueue}
            data-testid="create-room"
            onClick={() => open("create")}
          >
            <TacticalIcon name="plus" />
            {t("customLobby.create")}
          </button>
        </div>
      </header>
      {inQueue && (
        <div className="lobby-notice" role="status">
          <TacticalIcon name="leaderboard" />
          <p>{t("customLobby.queueNotice")}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void queue.cancel()}>
            {t("matchmaking.cancel")}
          </button>
        </div>
      )}
      {error && (
        <div className="lobby-notice" data-tone="error" role="alert">
          <TacticalIcon name="rules" />
          <p>
            {stale
              ? t("customLobby.staleList", {
                  time: loadedAt!.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" }),
                })
              : error}
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            {t("customLobby.retry")}
          </button>
        </div>
      )}
      <RoomBrowser
        rooms={roomsList}
        refreshing={refreshing}
        loading={!loaded && roomsList.length === 0}
        stale={stale}
        actionsDisabled={inQueue}
        onRefresh={() => void refresh()}
        onCreate={() => open("create")}
        onJoin={(room, role) => open("join", room, role)}
      />
      {dialog && (
        <RoomConnectionDialog
          kind={dialog.kind}
          room={dialog.room}
          preferredRole={dialog.role}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
