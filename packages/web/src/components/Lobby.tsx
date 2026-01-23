import { useEffect, useState } from "react";
import { useGameStore } from "../store";
import type { PlayerRole } from "../ws";

export function Lobby() {
  const {
    connectionStatus,
    roomsList,
    joinError,
    fetchRooms,
    createRoom,
    joinRoom,
  } = useGameStore();

  const [roomId, setRoomId] = useState("");
  const [role, setRole] = useState<PlayerRole>("P1");
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const newRoomId = await createRoom();
      setRoomId(newRoomId);
      await joinRoom(
        newRoomId,
        role,
        name.trim() ? name.trim() : undefined
      );
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
      await joinRoom(trimmed, role, name.trim() ? name.trim() : undefined);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to join room");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-sky-50 to-emerald-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded border border-slate-200 bg-white/80 p-6 shadow-sm">
          <h1 className="text-xl font-semibold">FATE Lobby</h1>
          <p className="mt-2 text-sm text-slate-500">
            Create or join a room before playing.
          </p>
          <div className="mt-3 text-xs text-slate-500">
            WebSocket: {connectionStatus}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded border border-slate-200 bg-white/80 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-600">Rooms</h2>
              <button
                className="rounded bg-slate-200 px-3 py-1 text-xs"
                onClick={handleRefresh}
              >
                Refresh
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {roomsList.length === 0 && (
                <div className="text-xs text-slate-400">No rooms yet.</div>
              )}
              {roomsList.map((room) => (
                <div
                  key={room.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-700">{room.id}</div>
                    <div className="text-[11px] text-slate-500">
                      Phase: {room.phase} | Spectators: {room.spectators}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span>P1: {room.p1Taken ? "taken" : "open"}</span>
                    <span>P2: {room.p2Taken ? "taken" : "open"}</span>
                  </div>
                  <button
                    className="rounded bg-slate-200 px-2 py-1 text-[11px]"
                    onClick={async () => {
                      setRoomId(room.id);
                      setLocalError(null);
                      try {
                        await joinRoom(
                          room.id,
                          role,
                          name.trim() ? name.trim() : undefined
                        );
                      } catch (err) {
                        setLocalError(
                          err instanceof Error
                            ? err.message
                            : "Failed to join room"
                        );
                      }
                    }}
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded border border-slate-200 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-600">Create Room</h2>
              <button
                className="mt-3 w-full rounded bg-teal-500 px-4 py-2 text-sm font-semibold text-white"
                onClick={handleCreate}
                disabled={busy}
              >
                {busy ? "Creating..." : "Create Room"}
              </button>
              <p className="mt-2 text-[11px] text-slate-500">
                Creating a room will auto-join with the selected role.
              </p>
            </div>

            <div className="rounded border border-slate-200 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-600">Join Room</h2>
              <div className="mt-3 space-y-3">
                <input
                  className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Room ID"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                />
                <select
                  className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value as PlayerRole)}
                >
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                  <option value="spectator">Spectator</option>
                </select>
                <input
                  className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Optional name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <button
                  className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  onClick={handleJoin}
                >
                  Join Room
                </button>
                {(localError || joinError) && (
                  <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {localError ?? joinError}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
