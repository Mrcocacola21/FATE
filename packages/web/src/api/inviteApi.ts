import { ApiError, isRecord, type ApiClient } from "./client";
import { parsePlayer, type Player } from "./friendApi";

export interface LobbyInvite {
  id: string;
  from: Player;
  to: Player;
  roomId: string;
  /** The free seat the invited player takes. */
  seat: "P1" | "P2";
  lobbyName: string | null;
  gameMode: string;
  createdAt: string;
  expiresAt: string;
}
export interface LobbyInvites {
  incoming: LobbyInvite[];
  outgoing: LobbyInvite[];
}

const fail = (): never => {
  throw new ApiError("INVALID_RESPONSE");
};
const text = (value: unknown) => (typeof value === "string" && value ? value : fail());

export function parseInvite(value: unknown): LobbyInvite {
  if (!isRecord(value) || (value.seat !== "P1" && value.seat !== "P2")) return fail();
  return {
    id: text(value.id),
    from: parsePlayer(value.from),
    to: parsePlayer(value.to),
    roomId: text(value.roomId),
    seat: value.seat,
    lobbyName: value.lobbyName === null ? null : text(value.lobbyName),
    gameMode: text(value.gameMode),
    createdAt: text(value.createdAt),
    expiresAt: text(value.expiresAt),
  };
}

const list = (value: unknown) => (Array.isArray(value) ? value.map(parseInvite) : fail());

export function createInviteApi(authenticated: ApiClient) {
  return {
    send: (roomId: string, userId: string) =>
      authenticated.request(
        `/api/lobbies/${encodeURIComponent(roomId)}/invites`,
        (value) => (isRecord(value) ? parseInvite(value.invite) : fail()),
        { method: "POST", body: JSON.stringify({ userId }) },
      ),
    list: () =>
      authenticated.request("/api/invites", (value): LobbyInvites =>
        isRecord(value) ? { incoming: list(value.incoming), outgoing: list(value.outgoing) } : fail(),
      ),
    remove: (id: string) =>
      authenticated.request(`/api/invites/${encodeURIComponent(id)}`, () => undefined, {
        method: "DELETE",
      }),
  };
}
