interface GameLoadingStateProps {
  connectionStatus: string;
  joined: boolean;
  roomId: string | null;
  role: string | null;
  leavingRoom: boolean;
  onLeave: () => void;
}

export function GameLoadingState({
  connectionStatus,
  joined,
  roomId,
  role,
  leavingRoom,
  onLeave,
}: GameLoadingStateProps) {
  return (
    <div className="min-h-screen bg-app p-6">
      <div className="mx-auto max-w-xl rounded-2xl border-ui bg-surface p-6 shadow-sm shadow-slate-900/5 dark:shadow-black/40">
        <h1 className="text-xl font-semibold text-primary">FATE</h1>
        <p className="mt-2 text-sm text-muted">Waiting for room state...</p>
        <div className="mt-4 text-xs text-muted">
          Connected: {connectionStatus === "connected" ? "yes" : "no"} | Status: {connectionStatus}
          {" "}| Joined: {joined ? "yes" : "no"} | Room: {roomId ?? "-"} | Role: {role ?? "-"}
        </div>
        <button
          className="mt-4 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
          onClick={onLeave}
          disabled={leavingRoom}
        >
          {leavingRoom ? "Leaving..." : "Leave"}
        </button>
      </div>
    </div>
  );
}
