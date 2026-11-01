function positiveMs(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * How long a started match waits for a competitor who lost the connection. Five minutes
 * covers a router restart or switching to mobile data; a restart starts a fresh window,
 * never an invented old deadline.
 */
export function reconnectGraceMs(): number {
  return positiveMs("RECONNECT_GRACE_MS", 300_000);
}

/** Lobby seats and queue entries are released sooner: nobody has a battle to lose yet. */
export function lobbyReconnectGraceMs(): number {
  return positiveMs("LOBBY_RECONNECT_GRACE_MS", 45_000);
}

/** A socket that misses a whole interval of pings is dead even if TCP has not noticed. */
export function wsHeartbeatIntervalMs(): number {
  return positiveMs("WS_HEARTBEAT_INTERVAL_MS", 15_000);
}

/** A match with no accepted action for this long has been forgotten, even with tabs still open. */
export function activeMatchIdleMs(): number {
  return positiveMs("ACTIVE_MATCH_IDLE_TIMEOUT_MS", 3_600_000);
}
