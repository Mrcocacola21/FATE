import type { PlayerId } from "rules";
import type { PlayerRole } from "./ws";

const ROOM_SESSION_KEY = "fate.room-session.v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RoomSession {
  roomId: string;
  role: PlayerRole;
  seat: PlayerId | null;
  resumeToken: string;
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isPlayerRole(value: unknown): value is PlayerRole {
  return value === "P1" || value === "P2" || value === "spectator";
}

export function loadRoomSession(
  storage: StorageLike | null = browserStorage(),
): RoomSession | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(
      storage.getItem(ROOM_SESSION_KEY) ?? "null",
    ) as Partial<RoomSession> | null;
    if (
      !parsed ||
      typeof parsed.roomId !== "string" ||
      !parsed.roomId ||
      !isPlayerRole(parsed.role) ||
      typeof parsed.resumeToken !== "string" ||
      !parsed.resumeToken
    ) {
      return null;
    }
    const seat = parsed.seat === "P1" || parsed.seat === "P2" ? parsed.seat : null;
    return { roomId: parsed.roomId, role: parsed.role, seat, resumeToken: parsed.resumeToken };
  } catch {
    return null;
  }
}

export function saveRoomSession(
  session: RoomSession,
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(ROOM_SESSION_KEY, JSON.stringify(session));
  } catch {
    // A storage failure must not block the live room snapshot.
  }
}

export function clearRoomSession(storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.removeItem(ROOM_SESSION_KEY);
  } catch {
    // The server-side leave still succeeds when browser storage is unavailable.
  }
}
