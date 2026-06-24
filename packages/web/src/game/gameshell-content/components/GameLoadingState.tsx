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
    <div className="app-shell flex min-h-screen items-center justify-center p-4">
      <div className="panel-card w-full max-w-xl p-6 text-center sm:p-8">
        <div className="mx-auto h-10 w-10 animate-pulse rounded-2xl bg-teal-500/20 ring-1 ring-teal-500/40" />
        <div className="section-kicker mt-5">Synchronizing match</div>
        <h1 className="mt-2 text-2xl font-semibold text-primary">Loading FATE</h1>
        <p className="mt-2 text-sm text-muted">Waiting for the authoritative room snapshot.</p>
        <div className="panel-card-muted mt-5 grid grid-cols-2 gap-3 p-3 text-left text-xs text-muted sm:grid-cols-4">
          <div>
            <div className="font-semibold text-primary">Connection</div>
            {connectionStatus}
          </div>
          <div>
            <div className="font-semibold text-primary">Joined</div>
            {joined ? "Yes" : "No"}
          </div>
          <div>
            <div className="font-semibold text-primary">Room</div>
            <span className="break-all font-mono">{roomId ?? "-"}</span>
          </div>
          <div>
            <div className="font-semibold text-primary">Role</div>
            {role ?? "-"}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary mt-5"
          onClick={onLeave}
          disabled={leavingRoom}
        >
          {leavingRoom ? "Leaving..." : "Leave"}
        </button>
      </div>
    </div>
  );
}
