import type { PresenceVisibility } from "@prisma/client";
import type { GameRoom } from "../store";

export type PresenceState = "online" | "lobby" | "battle" | "offline";

export interface PresenceActivity {
  roomId: string;
  lobbyName: string | null;
  gameMode: string;
  /** In a lobby: whether the other seat is still free. */
  openSeat: boolean;
}

export interface PresenceDto {
  state: PresenceState;
  /** When the player's last connection closed; null while online or when hidden. */
  lastSeenAt: string | null;
  /** Which lobby or battle; only for the player themself and their friends. */
  activity: PresenceActivity | null;
}

export interface PresenceSubject {
  userId: string;
  presenceVisibility: PresenceVisibility;
  lastSeenAt: Date | null;
}

/** How the viewer relates to the player whose status is shown. */
export type PresenceAudience = "self" | "friend" | "other" | "blocked";

type Busy = { state: "lobby" | "battle"; activity: PresenceActivity };

function roomActivity(room: GameRoom, seat: "P1" | "P2"): Busy | null {
  if (room.roomMode === "test" || room.interruptionReason || room.state.phase === "ended")
    return null;
  const other = seat === "P1" ? "P2" : "P1";
  const lobby = room.state.phase === "lobby" && !room.draftState;
  return {
    state: lobby ? "lobby" : "battle",
    activity: {
      roomId: room.id,
      lobbyName: room.lobbyName ?? null,
      gameMode: room.gameMode,
      openSeat: lobby && !room.seats[other] && !room.reservedUserIds,
    },
  };
}

export const hiddenPresence: PresenceDto = { state: "offline", lastSeenAt: null, activity: null };

/**
 * Online status for one server instance: connections come from AccountConnections, lobbies and
 * battles from the in-memory rooms, and "last seen" from the profile.
 */
export class PresenceService {
  constructor(
    private readonly isOnline: (userId: string) => boolean,
    private readonly rooms: () => Iterable<GameRoom>,
  ) {}

  /** The room a player holds a seat in, if any; finished or interrupted rooms do not count. */
  activityOf(userId: string): Busy | null {
    for (const room of this.rooms()) {
      const seat = (["P1", "P2"] as const).find((id) => room.seatIdentities[id]?.userId === userId);
      const busy = seat && roomActivity(room, seat);
      if (busy) return busy;
    }
    return null;
  }

  /** Every seated player's lobby or battle in one pass over the rooms. */
  activities(): Map<string, Busy> {
    const result = new Map<string, Busy>();
    for (const room of this.rooms())
      for (const seat of ["P1", "P2"] as const) {
        const userId = room.seatIdentities[seat]?.userId;
        if (!userId || result.has(userId)) continue;
        const busy = roomActivity(room, seat);
        if (busy) result.set(userId, busy);
      }
    return result;
  }

  /**
   * Applies the player's visibility: friends (and the player) see the lobby or battle, everyone
   * else at most "online" or "last seen". Blocks in either direction hide the status entirely.
   */
  presenceFor(subject: PresenceSubject, audience: PresenceAudience): PresenceDto {
    if (audience === "blocked") return hiddenPresence;
    const visibility = subject.presenceVisibility;
    const detailed = audience === "self" || audience === "friend";
    if (audience !== "self" && (visibility === "NOBODY" || (visibility === "FRIENDS" && !detailed)))
      return hiddenPresence;
    const online = this.isOnline(subject.userId);
    const lastSeenAt = online ? null : (subject.lastSeenAt?.toISOString() ?? null);
    if (!online) return { state: "offline", lastSeenAt, activity: null };
    const busy = this.activityOf(subject.userId);
    if (!busy) return { state: "online", lastSeenAt: null, activity: null };
    return detailed
      ? { state: busy.state, lastSeenAt: null, activity: busy.activity }
      : { state: "online", lastSeenAt: null, activity: null };
  }
}
