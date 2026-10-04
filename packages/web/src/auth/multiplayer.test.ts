import assert from "node:assert/strict";
import test from "node:test";
import { createAuthStore } from "./createAuthStore";
import { multiplayerAccessToken } from "./multiplayerAuth";
import type { AuthApi } from "./types";
import { ApiError } from "../api/client";
import { sendJoinRoom, sendSwitchRole } from "../ws";
import { loadRoomSession, saveRoomSession } from "../roomSession";

const user = {
  id: "user-a",
  email: "a@example.test",
  role: "USER" as const,
  username: "alice",
  displayName: null,
  avatarUrl: null,
  createdAt: "2026-10-02T00:00:00.000Z",
};
function api(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    refresh: async () => ({ accessToken: "refreshed", accessTokenExpiresIn: 900 }),
    getMe: async () => user,
    login: async () => ({ user, accessToken: "current", accessTokenExpiresIn: 900 }),
    register: async () => ({ user, accessToken: "current", accessTokenExpiresIn: 900 }),
    logout: async () => undefined,
    ...overrides,
  };
}
const lock = <T>(operation: () => Promise<T>) => operation();

test("reload reconnect waits for HTTP session restoration, then sends JWT with resume token", async () => {
  let resolve!: (value: { accessToken: string; accessTokenExpiresIn: number }) => void;
  const refresh = new Promise<{ accessToken: string; accessTokenExpiresIn: number }>((yes) => {
    resolve = yes;
  });
  let refreshes = 0,
    sent = 0;
  const store = createAuthStore(
    api({
      refresh: () => {
        refreshes++;
        return refresh;
      },
    }),
    lock,
  );
  const frames: string[] = [];
  const socket = {
    send: (frame: string) => {
      sent++;
      frames.push(frame);
    },
  } as WebSocket;
  const reconnect = (async () => {
    const accessToken = await multiplayerAccessToken(store, "P1");
    sendJoinRoom(socket, {
      mode: "join",
      roomId: "room-a",
      role: "P1",
      resumeToken: "resume-a",
      accessToken,
    });
  })();
  await Promise.resolve();
  assert.equal(sent, 0);
  resolve({ accessToken: "restored", accessTokenExpiresIn: 900 });
  await reconnect;
  assert.equal(refreshes, 1);
  assert.deepEqual(JSON.parse(frames[0]), {
    type: "joinRoom",
    mode: "join",
    roomId: "room-a",
    role: "P1",
    resumeToken: "resume-a",
    accessToken: "restored",
  });
  assert(!frames[0].includes("userId"));
});

test("current JWT is reused and near-expiry refresh is single-flight", async () => {
  let refreshes = 0;
  const store = createAuthStore(
    api({
      refresh: async () => {
        refreshes++;
        return { accessToken: "fresh", accessTokenExpiresIn: 900 };
      },
    }),
    lock,
  );
  await store.getState().login({ email: user.email, password: "test" });
  assert.equal(await multiplayerAccessToken(store, "P1"), "current");
  assert.equal(refreshes, 0);
  store.setState({ accessTokenExpiresAt: Date.now() - 1 });
  assert.deepEqual(
    await Promise.all([multiplayerAccessToken(store, "P1"), multiplayerAccessToken(store, "P2")]),
    ["fresh", "fresh"],
  );
  assert.equal(refreshes, 1);
});

test("anonymous players require sign-in; anonymous spectators and debug rooms remain usable", async () => {
  let refreshes = 0;
  const store = createAuthStore(
    api({
      refresh: async () => {
        refreshes++;
        throw new ApiError("INVALID_REFRESH_TOKEN", 401);
      },
    }),
    lock,
  );
  assert.equal(await multiplayerAccessToken(store, "P1", "test"), undefined);
  assert.equal(refreshes, 0);
  await assert.rejects(
    multiplayerAccessToken(store, "P1"),
    (error: unknown) => error instanceof ApiError && error.code === "AUTH_REQUIRED",
  );
  await assert.rejects(
    multiplayerAccessToken(store, "P2"),
    (error: unknown) => error instanceof ApiError && error.code === "AUTH_REQUIRED",
  );
  assert.equal(await multiplayerAccessToken(store, "spectator"), undefined);
  assert.equal(refreshes, 1);
});

test("authenticated spectator and seat-auth messages carry current JWT only in frames", async () => {
  const store = createAuthStore(api(), lock);
  await store.getState().login({ email: user.email, password: "test" });
  const frames: string[] = [];
  const socket = {
    send: (frame: string) => {
      frames.push(frame);
    },
  } as WebSocket;
  const accessToken = await multiplayerAccessToken(store, "spectator");
  sendJoinRoom(socket, { mode: "join", roomId: "room-a", role: "spectator", accessToken });
  sendSwitchRole(socket, "P1", accessToken);
  assert.equal(JSON.parse(frames[0]).accessToken, "current");
  assert.deepEqual(JSON.parse(frames[1]), {
    type: "switchRole",
    role: "P1",
    accessToken: "current",
  });
});

test("public spectating remains available when HTTP session restoration fails", async () => {
  const store = createAuthStore(
    api({
      refresh: async () => {
        throw new ApiError("DATABASE_UNAVAILABLE", 503);
      },
    }),
    lock,
  );
  assert.equal(await multiplayerAccessToken(store, "spectator"), undefined);
  await assert.rejects(
    multiplayerAccessToken(store, "P1"),
    (error: unknown) => error instanceof ApiError && error.code === "DATABASE_UNAVAILABLE",
  );
});

test("logout leaves gameplay continuity intact and credential fields cannot enter persisted room sessions", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const store = createAuthStore(api(), lock);
  await store.getState().login({ email: user.email, password: "test" });
  const session = {
    roomId: "room-a",
    role: "P1" as const,
    seat: "P1" as const,
    resumeToken: "resume-a",
    accessToken: "must-not-persist",
  };
  saveRoomSession(session, storage);
  const before = loadRoomSession(storage);
  await store.getState().logout();
  assert.deepEqual(loadRoomSession(storage), before);
  assert(!Array.from(values.values()).join().includes("must-not-persist"));
  await assert.rejects(
    multiplayerAccessToken(store, "P1"),
    (error: unknown) => error instanceof ApiError && error.code === "AUTH_REQUIRED",
  );
});
