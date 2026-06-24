import { useEffect, useState } from "react";
import { useGameStore } from "../store";
import type { PlayerRole } from "../ws";
import { PanelCard, SectionHeader, StatusBadge } from "./ui";
import { RulesModal } from "./RulesModal";
import { ThemeToggle } from "./ThemeToggle";

interface LobbyProps {
  onOpenFigures?: () => void;
  onOpenHeartbreak?: () => void;
}

const roleLabels: Record<PlayerRole, string> = {
  P1: "Player One",
  P2: "Player Two",
  spectator: "Spectator",
};

function phaseLabel(phase: string) {
  return `${phase.charAt(0).toUpperCase()}${phase.slice(1)}`;
}

export function Lobby({ onOpenFigures, onOpenHeartbreak }: LobbyProps) {
  const { connectionStatus, roomsList, joinError, fetchRooms, joinRoom } = useGameStore();

  const [roomId, setRoomId] = useState("");
  const [role, setRole] = useState<PlayerRole>("P1");
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
    setRefreshing(true);
    setLocalError(null);
    try {
      await fetchRooms();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to load rooms");
    } finally {
      setRefreshing(false);
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

  const connectionTone =
    connectionStatus === "connected"
      ? "success"
      : connectionStatus === "connecting"
        ? "warning"
        : "neutral";

  return (
    <div className="app-shell px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <PanelCard as="header" className="relative overflow-hidden p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl dark:bg-teal-400/10" />
          <div className="relative flex min-w-0 flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 max-w-2xl">
              <div className="section-kicker">Online tactical board game</div>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                FATE Command Lobby
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
                Assemble your figure set, claim a seat, and enter an authoritative multiplayer
                match.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StatusBadge tone={connectionTone} dot>
                  {connectionStatus === "connected"
                    ? "Server connected"
                    : connectionStatus === "connecting"
                      ? "Connecting to server"
                      : "Connects when you join"}
                </StatusBadge>
                <StatusBadge tone="info">{roomsList.length} open rooms</StatusBadge>
              </div>
            </div>
            <nav
              className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center"
              aria-label="Lobby navigation"
            >
              {onOpenFigures ? (
                <button
                  type="button"
                  className="btn btn-strong w-full sm:w-auto"
                  onClick={onOpenFigures}
                >
                  Figure Set
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary w-full sm:w-auto"
                onClick={() => setShowRules(true)}
              >
                Rules
              </button>
              {onOpenHeartbreak ? (
                <button
                  type="button"
                  className="btn btn-secondary w-full sm:w-auto"
                  onClick={onOpenHeartbreak}
                >
                  Heartbreak
                </button>
              ) : null}
              <ThemeToggle className="w-full sm:w-auto" />
            </nav>
          </div>
        </PanelCard>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <PanelCard className="min-h-[430px] p-5 sm:p-6">
            <SectionHeader
              kicker="Match browser"
              title="Available rooms"
              description="Join an open seat or watch an active match as a spectator."
              action={
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              }
            />

            <div className="mt-5 space-y-3">
              {roomsList.length === 0 ? (
                <div className="panel-card-muted flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                      <path
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.7"
                        d="M4 7.5h16v10H4zM8 11h.01M16 11h.01M9 16h6"
                      />
                    </svg>
                  </div>
                  <div className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    No rooms are open
                  </div>
                  <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Create a new room to become the host. It will appear here for the second player
                    and spectators.
                  </p>
                </div>
              ) : null}

              {roomsList.map((room) => (
                <article
                  key={room.id}
                  className="group rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:-translate-y-px hover:border-slate-300 hover:bg-white hover:shadow-lg hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-all font-mono text-sm font-semibold text-slate-900 dark:text-white">
                          {room.id}
                        </h3>
                        <StatusBadge tone={room.phase === "lobby" ? "success" : "warning"}>
                          {phaseLabel(room.phase)}
                        </StatusBadge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusBadge tone={room.players.P1 ? "neutral" : "success"}>
                          P1 {room.players.P1 ? "occupied" : "open"}
                        </StatusBadge>
                        <StatusBadge tone={room.players.P2 ? "neutral" : "success"}>
                          P2 {room.players.P2 ? "occupied" : "open"}
                        </StatusBadge>
                        <StatusBadge tone="info">
                          {room.spectators} spectator
                          {room.spectators === 1 ? "" : "s"}
                        </StatusBadge>
                      </div>
                      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        Ready state: P1 {room.ready.P1 ? "ready" : "waiting"} / P2{" "}
                        {room.ready.P2 ? "ready" : "waiting"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary w-full sm:w-auto"
                      onClick={() => {
                        const suggested =
                          room.players.P1 && !room.players.P2
                            ? "P2"
                            : room.players.P2 && !room.players.P1
                              ? "P1"
                              : "spectator";
                        setJoinRole(suggested);
                        setLocalError(null);
                        setPendingJoinRoom({
                          id: room.id,
                          players: room.players,
                        });
                      }}
                    >
                      Join room
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </PanelCard>

          <div className="space-y-5">
            <PanelCard className="p-5 sm:p-6">
              <SectionHeader
                kicker="Host a match"
                title="Create room"
                description={`You will join immediately as ${roleLabels[role].toLowerCase()}.`}
              />
              <button
                type="button"
                className="btn btn-primary mt-5 w-full"
                onClick={handleCreate}
                disabled={busy}
              >
                {busy ? "Creating room..." : "Create new room"}
              </button>
            </PanelCard>

            <PanelCard className="p-5 sm:p-6">
              <SectionHeader
                kicker="Direct connection"
                title="Join by room ID"
                description="Use an invite ID or choose your default role before creating."
              />
              <div className="mt-5 space-y-4">
                <div>
                  <label className="field-label" htmlFor="room-id">
                    Room ID
                  </label>
                  <input
                    id="room-id"
                    className="field-control font-mono"
                    placeholder="Paste room ID"
                    value={roomId}
                    onChange={(event) => setRoomId(event.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="lobby-role">
                    Role
                  </label>
                  <select
                    id="lobby-role"
                    className="field-control"
                    value={role}
                    onChange={(event) => setRole(event.target.value as PlayerRole)}
                  >
                    <option value="P1">Player One (P1)</option>
                    <option value="P2">Player Two (P2)</option>
                    <option value="spectator">Spectator</option>
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="player-name">
                    Display name <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="player-name"
                    className="field-control"
                    placeholder="Commander name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="nickname"
                  />
                </div>
                <button type="button" className="btn btn-strong w-full" onClick={handleJoin}>
                  Join room
                </button>
                {localError || joinError ? (
                  <div
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-200"
                    role="alert"
                  >
                    {localError ?? joinError}
                  </div>
                ) : null}
              </div>
            </PanelCard>
          </div>
        </div>

        {pendingJoinRoom ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-room-title"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !joinBusy) {
                setPendingJoinRoom(null);
              }
            }}
          >
            <PanelCard className="w-full max-w-md p-5 shadow-2xl sm:p-6">
              <SectionHeader
                kicker="Choose a seat"
                title={<span id="join-room-title">Join room</span>}
                description={
                  <span className="break-all font-mono text-xs">{pendingJoinRoom.id}</span>
                }
              />
              <fieldset className="mt-5 space-y-2">
                <legend className="sr-only">Room role</legend>
                {(["P1", "P2", "spectator"] as PlayerRole[]).map((option) => {
                  const taken = option !== "spectator" && pendingJoinRoom.players[option];
                  return (
                    <label
                      key={option}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-3 text-sm transition ${
                        joinRole === option
                          ? "border-teal-500 bg-teal-50 text-teal-900 ring-2 ring-teal-500/10 dark:bg-teal-950/40 dark:text-teal-100"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-200 dark:hover:border-slate-700"
                      } ${taken ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="joinRole"
                          value={option}
                          checked={joinRole === option}
                          disabled={taken}
                          onChange={() => setJoinRole(option)}
                          className="h-4 w-4 accent-teal-600"
                        />
                        <span className="font-semibold">{roleLabels[option]}</span>
                      </span>
                      <StatusBadge tone={taken ? "neutral" : "success"}>
                        {taken ? "Taken" : "Available"}
                      </StatusBadge>
                    </label>
                  );
                })}
              </fieldset>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPendingJoinRoom(null)}
                  disabled={joinBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
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
                      setLocalError(err instanceof Error ? err.message : "Failed to join room");
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
              {localError || joinError ? (
                <div
                  className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-200"
                  role="alert"
                >
                  {localError ?? joinError}
                </div>
              ) : null}
            </PanelCard>
          </div>
        ) : null}

        <RulesModal open={showRules} onClose={() => setShowRules(false)} />
      </div>
    </div>
  );
}
