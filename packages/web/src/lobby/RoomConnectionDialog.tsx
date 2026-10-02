import { useState } from "react";
import type { RoomSummary } from "../api";
import type { PlayerRole } from "../ws";
import { useGameStore } from "../store";
import { useAuthStore } from "../auth/authStore";
import { useCapabilities } from "../layout/Capabilities";
import { useI18n } from "../i18n";
import { localizeServerText } from "../i18n/displayMetadata";
import { Dialog } from "../ui/Dialog";

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
    if (room.phase !== "lobby" || (room.players.P1 && room.players.P2)) return "spectator";
    return room.players.P1 ? "P2" : "P1";
  });
  const [name, setName] = useState("");
  const [debugToken, setDebugToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetRoom = room ?? roomsList.find((item) => item.id === roomId.trim());
  const test = kind === "test" || targetRoom?.roomMode === "test";
  const showName = test || role === "spectator";
  const title = t(
    kind === "test"
      ? "testRoom.create"
      : kind === "create"
        ? "shell.createMatch"
        : "lobby.joinById",
  );
  const roleTaken = (value: PlayerRole) => value !== "spectator" && !!targetRoom?.players[value];

  const submit = async () => {
    if (kind === "join" && !roomId.trim()) {
      setError(t("lobby.roomIdRequired"));
      return;
    }
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
        {kind === "join" ? (
          <div>
            <label className="field-label" htmlFor="room-id">
              {t("lobby.roomId")}
            </label>
            <input
              id="room-id"
              className="field-control font-mono"
              value={roomId}
              readOnly={!!room}
              required
              placeholder={t("lobby.pasteRoomId")}
              onChange={(event) => setRoomId(event.target.value)}
              autoComplete="off"
            />
          </div>
        ) : (
          <p className="text-sm text-muted">
            {t(kind === "test" ? "testRoom.createDescription" : "shell.createDescription")}
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
            disabled={busy || roleTaken(role)}
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
