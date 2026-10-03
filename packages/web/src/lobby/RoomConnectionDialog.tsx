import { useEffect, useState } from "react";
import { lookupRoom, type RoomSummary } from "../api";
import type { MatchType } from "../matches/matchType";
import { MatchTypeBadge } from "../matches/MatchTypeBadge";
import type { PlayerRole } from "../ws";
import { useGameStore } from "../store";
import { useAuthStore } from "../auth/authStore";
import { useCapabilities } from "../layout/Capabilities";
import { useI18n } from "../i18n";
import { localizeServerText } from "../i18n/displayMetadata";
import { Dialog } from "../ui/Dialog";
import { GAME_MODE_IDS, getGameModeName } from "../modes/modeLabels";
import type { GameModeId } from "rules";

export type RoomDialogKind = "create" | "join" | "test";

export function RoomConnectionDialog({
  kind,
  room,
  onClose,
}: {
  kind: RoomDialogKind;
  room?: RoomSummary;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const capabilities = useCapabilities();
  const authenticated = useAuthStore((state) => state.status === "authenticated");
  const { joinRoom, joinError, roomsList } = useGameStore();
  const [roomId, setRoomId] = useState(room?.id ?? "");
  const [role, setRole] = useState<PlayerRole>(() => {
    if (!room) return kind === "join" && !authenticated ? "spectator" : "P1";
    if (
      room.origin === "MATCHMAKING" ||
      room.phase !== "lobby" ||
      (room.players.P1 && room.players.P2)
    )
      return "spectator";
    return room.players.P1 ? "P2" : "P1";
  });
  const [name, setName] = useState("");
  const [lobbyName, setLobbyName] = useState("");
  const [gameMode, setGameMode] = useState<GameModeId>("standard");
  const [debugToken, setDebugToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchType, setMatchType] = useState<MatchType>("CASUAL");
  const [lookup, setLookup] = useState<{ id: string; room?: RoomSummary; failed?: boolean } | null>(
    null,
  );
  const knownRoom = room ?? roomsList.find((item) => item.id === roomId.trim());
  const targetRoom = knownRoom ?? (lookup?.id === roomId.trim() ? lookup.room : undefined);
  useEffect(() => {
    if (kind !== "join" || knownRoom || !roomId.trim()) return;
    let active = true;
    const id = roomId.trim();
    const timer = setTimeout(() => {
      void lookupRoom(id).then(
        (resolved) => {
          if (active) setLookup({ id, room: resolved });
        },
        () => {
          if (active) setLookup({ id, failed: true });
        },
      );
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [kind, knownRoom, roomId]);
  const test = kind === "test" || targetRoom?.roomMode === "test";
  const showName = test || role === "spectator";
  const title = t(
    kind === "test"
      ? "testRoom.create"
      : kind === "create"
        ? "customLobby.create"
        : "customLobby.joinCode",
  );
  const roleTaken = (value: PlayerRole) =>
    value !== "spectator" &&
    (!!targetRoom?.players[value] ||
      targetRoom?.origin === "MATCHMAKING" ||
      (!!targetRoom && targetRoom.phase !== "lobby"));

  const submit = async () => {
    if (kind === "join" && !roomId.trim()) {
      setError(t("lobby.roomIdRequired"));
      return;
    }
    if (kind === "join" && !targetRoom) return;
    setBusy(true);
    setError(null);
    useGameStore.setState({ joinError: null });
    try {
      await joinRoom({
        mode: kind === "join" ? "join" : "create",
        ...(kind === "join" ? { roomId: roomId.trim() } : {}),
        role,
        name: showName && name.trim() ? name.trim() : undefined,
        ...(test ? { roomMode: "test" as const } : {}),
        ...(kind === "test" ? { debugToken: debugToken.trim() || undefined } : {}),
        ...(kind === "create"
          ? { matchType, gameMode, ...(lobbyName.trim() ? { lobbyName: lobbyName.trim() } : {}) }
          : {}),
      });
      // joinRoom sends a WebSocket request; the authoritative error/snapshot
      // arrives asynchronously. Keep this dialog available for server errors.
    } catch (cause) {
      setError(
        localizeServerText(cause instanceof Error ? cause.message : "", t) ||
          t(kind === "join" ? "errors.joinRoom" : "errors.createRoom"),
      );
    } finally {
      setBusy(false);
    }
  };

  if (kind === "test" && !capabilities?.testRooms.enabled) return null;
  return (
    <Dialog title={title} id="room-dialog-title" onClose={onClose} busy={busy}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {kind === "join" && !room ? (
          <div>
            <label className="field-label" htmlFor="room-id">
              {t("customLobby.code")}
            </label>
            <input
              id="room-id"
              className="field-control font-mono"
              value={roomId}
              readOnly={!!room}
              required
              placeholder={t("customLobby.pasteCode")}
              onChange={(event) => setRoomId(event.target.value)}
              autoComplete="off"
            />
          </div>
        ) : (
          <p className="text-sm text-muted">
            {room
              ? room.lobbyName || t("customLobby.defaultName")
              : t(kind === "test" ? "testRoom.createDescription" : "customLobby.createDescription")}
          </p>
        )}
        {kind === "create" && (
          <>
            <div>
              <label className="field-label" htmlFor="lobby-name">
                {t("customLobby.name")} ({t("common.optional")})
              </label>
              <input
                id="lobby-name"
                className="field-control"
                value={lobbyName}
                maxLength={60}
                placeholder={t("customLobby.namePlaceholder")}
                onChange={(event) => setLobbyName(event.target.value)}
              />
            </div>
            <label className="field-label" htmlFor="create-game-mode">
              {t("matchmaking.mode")}
              <select
                id="create-game-mode"
                className="field-control mt-2"
                value={gameMode}
                onChange={(event) => setGameMode(event.target.value as GameModeId)}
              >
                {GAME_MODE_IDS.map((mode) => (
                  <option key={mode} value={mode}>
                    {getGameModeName(mode, t)}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend className="field-label">{t("matchTypes.label")}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["CASUAL", "RATED"] as const).map((value) => (
                  <label
                    key={value}
                    className={`panel-card-muted cursor-pointer p-4 ${matchType === value ? "ring-1 ring-slate-500 dark:ring-slate-400" : ""}`}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <input
                        type="radio"
                        name="match-type"
                        value={value}
                        checked={matchType === value}
                        disabled={value === "RATED" && !authenticated}
                        aria-label={t(`matchTypes.${value}`)}
                        aria-describedby={`match-type-${value}`}
                        onChange={() => setMatchType(value)}
                      />
                      {t(`matchTypes.${value}`)}
                    </span>
                    <span id={`match-type-${value}`} className="mt-2 block text-sm text-muted">
                      {t(
                        value === "RATED"
                          ? "matchTypes.ratedDescription"
                          : "matchTypes.casualDescription",
                      )}
                    </span>
                  </label>
                ))}
              </div>
              {!authenticated && <p className="mt-2 text-sm">{t("matchTypes.authRequired")}</p>}
            </fieldset>
          </>
        )}
        {kind === "join" && targetRoom && (
          <div className="panel-card-muted space-y-2 p-3">
            <MatchTypeBadge matchType={targetRoom.matchType} />
            <p className="text-sm">
              {t(
                targetRoom.matchType === "RATED"
                  ? "matchTypes.ratedDescription"
                  : "matchTypes.casualDescription",
              )}
            </p>
          </div>
        )}
        {kind === "join" && roomId.trim() && !targetRoom && (
          <p role="status" className="text-sm">
            {t(
              lookup?.id === roomId.trim() && lookup.failed
                ? "matchTypes.lookupFailed"
                : "matchTypes.lookupPending",
            )}
          </p>
        )}
        {kind !== "test" && (
          <div>
            <label className="field-label" htmlFor="lobby-role">
              {t("lobby.role")}
            </label>
            <select
              id="lobby-role"
              className="field-control"
              value={role}
              onChange={(event) => setRole(event.target.value as PlayerRole)}
            >
              {(["P1", "P2", "spectator"] as const).map((value) => (
                <option key={value} value={value} disabled={roleTaken(value)}>
                  {t(`roles.${value}`)}
                  {value !== "spectator" ? ` (${value})` : ""}
                  {roleTaken(value) ? ` — ${t("common.taken")}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {showName && (
          <div>
            <label className="field-label" htmlFor="player-name">
              {t("lobby.displayName")} <span className="font-normal">({t("common.optional")})</span>
            </label>
            <input
              id="player-name"
              className="field-control"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="nickname"
              placeholder={t("lobby.commanderName")}
            />
          </div>
        )}
        {kind === "test" && capabilities?.testRooms.requiresToken && (
          <div>
            <label className="field-label" htmlFor="test-room-token">
              {t("testRoom.debugToken")}
            </label>
            <input
              id="test-room-token"
              type="password"
              className="field-control"
              value={debugToken}
              onChange={(event) => setDebugToken(event.target.value)}
              autoComplete="off"
              required
            />
          </div>
        )}
        {error || joinError ? (
          <p className="fate-notice text-sm" role="alert">
            {error ?? localizeServerText(joinError, t)}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || roleTaken(role) || (kind === "join" && !targetRoom)}
            aria-busy={busy}
            data-testid="submit-room"
          >
            {busy ? t(kind === "join" ? "lobby.joining" : "lobby.creating") : title}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
