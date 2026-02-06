import { useEffect, useState } from "react";
import { useGameStore } from "../store";
import type { PlayerRole } from "../ws";
import { RulesModal } from "./RulesModal";
import { ThemeToggle } from "./ThemeToggle";

interface LobbyProps {
  onOpenFigures?: () => void;
}

export function Lobby({ onOpenFigures }: LobbyProps) {
  const {
    connectionStatus,
    roomsList,
    joinError,
    fetchRooms,
    joinRoom,
  } = useGameStore();

  const [roomId, setRoomId] = useState("");
  const [role, setRole] = useState<PlayerRole>("P1");
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [pendingJoinRoom, setPendingJoinRoom] = useState<{
    id: string;
    players: { P1: boolean; P2: boolean };
  } | null>(null);
  const [joinRole, setJoinRole] = useState<PlayerRole>("P1");
  const [joinBusy, setJoinBusy] = useState(false);

  useEffect(() => {
    fetchRooms().catch((err) => {
      setLocalError(err instanceof Error ? err.message : "Failed to load rooms");
    });
  }, [fetchRooms]);

  const handleRefresh = async () => {
    setLocalError(null);
    try {
      await fetchRooms();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to load rooms");
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setLocalError(null);
    try {
      await joinRoom({
        mode: "create",
        role,
        name: name.trim() ? name.trim() : undefined,
      });
      await fetchRooms();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const trimmed = roomId.trim();
    if (!trimmed) {
      setLocalError("Room ID is required.");
      return;
    }
    setLocalError(null);
    try {
      await joinRoom({
        mode: "join",
        roomId: trimmed,
        role,
        name: name.trim() ? name.trim() : undefined,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to join room");
    }
  };

  return (
    <div className="min-h-screen bg-app p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border-ui bg-surface p-6 shadow-sm shadow-slate-900/5 dark:shadow-black/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-primary">FATE Lobby</h1>
              <p className="mt-2 text-sm text-muted">
                Create or join a room before playing.
              </p>
              <div className="mt-3 text-xs text-muted">
                WebSocket: {connectionStatus}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onOpenFigures && (
                <button
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                  onClick={onOpenFigures}
                >
                  Figure Set
                </button>
              )}
              <button
                className="rounded-lg bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => setShowRules(true)}
              >
                Rules
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-2xl border-ui bg-surface p-6 shadow-sm shadow-slate-900/5 dark:shadow-black/40">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-200">
                Rooms
              </h2>
              <button
                className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={handleRefresh}
              >
                Refresh
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {roomsList.length === 0 && (
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  No rooms yet.
                </div>
              )}
              {roomsList.map((room) => (
                <div
                  key={room.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-ui bg-surface-solid px-3 py-2 text-xs shadow-sm shadow-slate-900/5 dark:shadow-black/30"
                >
                  <div>
                    <div className="font-semibold text-slate-700 dark:text-slate-100">
                      {room.id}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Phase: {room.phase} | Spectators: {room.spectators}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Ready: P1 {room.ready.P1 ? "✓" : "—"} / P2{" "}
                      {room.ready.P2 ? "✓" : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>P1: {room.players.P1 ? "taken" : "open"}</span>
                    <span>P2: {room.players.P2 ? "taken" : "open"}</span>
                  </div>
                  <button
                    className="rounded-lg bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                    onClick={async () => {
                      const suggested =
                        room.players.P1 && !room.players.P2
                          ? "P2"
                          : room.players.P2 && !room.players.P1
                          ? "P1"
                          : "spectator";
                      setJoinRole(suggested);
                      setPendingJoinRoom({ id: room.id, players: room.players });
                    }}
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border-ui bg-surface p-6 shadow-sm shadow-slate-900/5 dark:shadow-black/40">
              <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-200">
                Create Room
              </h2>
              <button
                className="mt-3 w-full rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow dark:bg-teal-800/50 dark:text-slate-100 dark:hover:bg-teal-700/60"
                onClick={handleCreate}
                disabled={busy}
              >
                {busy ? "Creating..." : "Create Room"}
              </button>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Creating a room will auto-join with the selected role.
              </p>
            </div>

            <div className="rounded-2xl border-ui bg-surface p-6 shadow-sm shadow-slate-900/5 dark:shadow-black/40">
              <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-200">
                Join Room
              </h2>
              <div className="mt-3 space-y-3">
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-700 dark:focus:ring-neutral-800"
                  placeholder="Room ID"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                />
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-700 dark:focus:ring-neutral-800"
                  value={role}
                  onChange={(e) => setRole(e.target.value as PlayerRole)}
                >
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                  <option value="spectator">Spectator</option>
                </select>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-700 dark:focus:ring-neutral-800"
                  placeholder="Optional name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <button
                  className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                  onClick={handleJoin}
                >
                  Join Room
                </button>
                {(localError || joinError) && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                    {localError ?? joinError}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {pendingJoinRoom && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-slate-950/70">
            <div className="w-full max-w-sm rounded-2xl border-ui bg-surface-solid p-5 shadow-lg shadow-slate-900/10 dark:shadow-black/40">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Join room {pendingJoinRoom.id}
              </div>
              <div className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="joinRole"
                    value="P1"
                    checked={joinRole === "P1"}
                    disabled={pendingJoinRoom.players.P1}
                    onChange={() => setJoinRole("P1")}
                  />
                  <span>P1 {pendingJoinRoom.players.P1 ? "(taken)" : ""}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="joinRole"
                    value="P2"
                    checked={joinRole === "P2"}
                    disabled={pendingJoinRoom.players.P2}
                    onChange={() => setJoinRole("P2")}
                  />
                  <span>P2 {pendingJoinRoom.players.P2 ? "(taken)" : ""}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="joinRole"
                    value="spectator"
                    checked={joinRole === "spectator"}
                    onChange={() => setJoinRole("spectator")}
                  />
                  <span>Spectator</span>
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  className="flex-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                  onClick={() => setPendingJoinRoom(null)}
                  disabled={joinBusy}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                  onClick={async () => {
                    if (!pendingJoinRoom) return;
                    setJoinBusy(true);
                    setLocalError(null);
                    try {
                      await joinRoom({
                        mode: "join",
                        roomId: pendingJoinRoom.id,
                        role: joinRole,
                        name: name.trim() ? name.trim() : undefined,
                      });
                      setPendingJoinRoom(null);
                    } catch (err) {
                      setLocalError(
                        err instanceof Error ? err.message : "Failed to join room"
                      );
                    } finally {
                      setJoinBusy(false);
                    }
                  }}
                  disabled={
                    joinBusy ||
                    (joinRole === "P1" && pendingJoinRoom.players.P1) ||
                    (joinRole === "P2" && pendingJoinRoom.players.P2)
                  }
                >
                  {joinBusy ? "Joining..." : "Join"}
                </button>
              </div>
              {(localError || joinError) && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                  {localError ?? joinError}
                </div>
              )}
            </div>
          </div>
        )}
        <RulesModal open={showRules} onClose={() => setShowRules(false)} />
      </div>
    </div>
  );
}
