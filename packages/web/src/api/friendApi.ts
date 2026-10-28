import { ApiError, isRecord, type ApiClient } from "./client";

export interface Player {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}
export type RelationshipStatus = "none" | "friends" | "outgoing" | "incoming";
export interface Relationship {
  status: RelationshipStatus;
  requestId: string | null;
  blocked: boolean;
  canRequest: boolean;
}
export type PresenceState = "online" | "lobby" | "battle" | "offline";
export interface Presence {
  state: PresenceState;
  lastSeenAt: string | null;
  activity: {
    roomId: string;
    lobbyName: string | null;
    gameMode: string;
    openSeat: boolean;
  } | null;
}
export interface Friend {
  player: Player;
  friendsSince: string;
  presence: Presence;
}
export interface FriendRequest {
  id: string;
  player: Player;
  createdAt: string;
}
export interface FriendRequests {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}
export interface SearchResult {
  player: Player;
  relationship: Relationship;
}
export interface BlockedPlayer {
  player: Player;
  blockedAt: string;
}

const fail = (): never => {
  throw new ApiError("INVALID_RESPONSE");
};
const text = (value: unknown) => (typeof value === "string" && value ? value : fail());
const nullableText = (value: unknown) =>
  value === null || typeof value === "string" ? value : fail();
const list = (value: unknown) => (Array.isArray(value) ? value : fail());

export function parsePlayer(value: unknown): Player {
  if (!isRecord(value)) return fail();
  return {
    id: text(value.id),
    username: text(value.username),
    displayName: nullableText(value.displayName),
    avatarUrl: nullableText(value.avatarUrl),
  };
}

export function parseRelationship(value: unknown): Relationship {
  if (
    !isRecord(value) ||
    !["none", "friends", "outgoing", "incoming"].includes(value.status as string) ||
    typeof value.blocked !== "boolean" ||
    typeof value.canRequest !== "boolean"
  )
    return fail();
  return {
    status: value.status as RelationshipStatus,
    requestId: nullableText(value.requestId),
    blocked: value.blocked,
    canRequest: value.canRequest,
  };
}

const offline: Presence = { state: "offline", lastSeenAt: null, activity: null };

export function parsePresence(value: unknown): Presence {
  // Older servers send no presence; treat that as offline rather than failing the list.
  if (value === undefined) return offline;
  if (!isRecord(value) || !["online", "lobby", "battle", "offline"].includes(value.state as string))
    return fail();
  const activity = value.activity;
  return {
    state: value.state as PresenceState,
    lastSeenAt: nullableText(value.lastSeenAt),
    activity:
      activity === null || activity === undefined
        ? null
        : isRecord(activity) && typeof activity.openSeat === "boolean"
          ? {
              roomId: text(activity.roomId),
              lobbyName: nullableText(activity.lobbyName),
              gameMode: text(activity.gameMode),
              openSeat: activity.openSeat,
            }
          : fail(),
  };
}

const friend = (value: unknown): Friend =>
  isRecord(value)
    ? {
        player: parsePlayer(value.player),
        friendsSince: text(value.friendsSince),
        presence: parsePresence(value.presence),
      }
    : fail();
const request = (value: unknown): FriendRequest =>
  isRecord(value)
    ? { id: text(value.id), player: parsePlayer(value.player), createdAt: text(value.createdAt) }
    : fail();
const relationshipBody = (value: unknown) =>
  isRecord(value) ? parseRelationship(value.relationship) : fail();
const nothing = () => undefined;

/** Every call is the signed-in player's own social graph. */
export function createFriendApi(authenticated: ApiClient) {
  const send = <T>(path: string, decode: (value: unknown) => T, method = "GET", body?: object) =>
    authenticated.request(path, decode, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const id = encodeURIComponent;
  return {
    friends: () =>
      send("/api/friends", (value) => (isRecord(value) ? list(value.friends).map(friend) : fail())),
    requests: () =>
      send(
        "/api/friends/requests",
        (value): FriendRequests =>
          isRecord(value)
            ? {
                incoming: list(value.incoming).map(request),
                outgoing: list(value.outgoing).map(request),
              }
            : fail(),
      ),
    incomingCount: () =>
      send("/api/friends/requests/count", (value) =>
        isRecord(value) && Number.isSafeInteger(value.incoming) && (value.incoming as number) >= 0
          ? (value.incoming as number)
          : fail(),
      ),
    sendRequest: (username: string) =>
      send("/api/friends/requests", relationshipBody, "POST", { username }),
    accept: (requestId: string) =>
      send(
        `/api/friends/requests/${id(requestId)}/accept`,
        (value) => (isRecord(value) ? friend(value.friend) : fail()),
        "POST",
      ),
    deleteRequest: (requestId: string) =>
      send(`/api/friends/requests/${id(requestId)}`, nothing, "DELETE"),
    remove: (userId: string) => send(`/api/friends/${id(userId)}`, nothing, "DELETE"),
    relationship: (userId: string) =>
      send(`/api/friends/relationship/${id(userId)}`, relationshipBody),
    blocks: () =>
      send("/api/friends/blocks", (value): BlockedPlayer[] =>
        isRecord(value)
          ? list(value.blocked).map((row) =>
              isRecord(row)
                ? { player: parsePlayer(row.player), blockedAt: text(row.blockedAt) }
                : fail(),
            )
          : fail(),
      ),
    block: (userId: string) => send(`/api/friends/blocks/${id(userId)}`, nothing, "PUT"),
    unblock: (userId: string) => send(`/api/friends/blocks/${id(userId)}`, nothing, "DELETE"),
    search: (query: string) =>
      send(`/api/players/search?q=${encodeURIComponent(query)}`, (value): SearchResult[] =>
        isRecord(value)
          ? list(value.players).map((row) =>
              isRecord(row)
                ? {
                    player: parsePlayer(row.player),
                    relationship: parseRelationship(row.relationship),
                  }
                : fail(),
            )
          : fail(),
      ),
  };
}
export type FriendApi = ReturnType<typeof createFriendApi>;

/** Presence is public: signed-out visitors use the plain client, players their own session. */
export const readPresence = (client: ApiClient, userId: string) =>
  client.request(`/api/users/${encodeURIComponent(userId)}/presence`, (value) =>
    isRecord(value) ? parsePresence(value.presence) : fail(),
  );
