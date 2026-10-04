import assert from "node:assert/strict";
import test from "node:test";
import { createAuthStore } from "../auth/createAuthStore";
import type { AuthApi } from "../auth/types";
import { ApiError, createApiClient } from "../api/client";
import { createAuthenticatedClient } from "../api/authenticatedClient";
import { createProfileApi } from "../api/profileApi";
import { createProfileStore } from "./createProfileStore";
import type { OwnProfile, ProfileApi } from "./types";

const profile: OwnProfile = {
  id: "user-a",
  username: "Player",
  email: "player@example.test",
  displayName: null,
  avatarUrl: null,
  createdAt: "2026-10-02T00:00:00Z",
  updatedAt: "2026-10-02T00:00:00Z",
  preferredLanguage: "uk",
  preferredTheme: "dark",
};
const user = { ...profile, role: "USER" as const };
const authApi: AuthApi = {
  login: async () => ({ user, accessToken: "token", accessTokenExpiresIn: 900 }),
  register: async () => ({ user, accessToken: "token", accessTokenExpiresIn: 900 }),
  refresh: async () => ({ accessToken: "restored", accessTokenExpiresIn: 900 }),
  getMe: async () => user,
  logout: async () => undefined,
};
function setup(api: ProfileApi, applied: OwnProfile[] = []) {
  const auth = createAuthStore(authApi, (operation) => operation());
  auth.setState({ status: "authenticated", initialized: true, accessToken: "original", user });
  const store = createProfileStore(api, auth, (value) => applied.push(value));
  return { auth, store };
}

test("loaded and saved profiles synchronize identity/preferences while access credentials stay in memory", async () => {
  const applied: OwnProfile[] = [];
  let saved = profile;
  const api: ProfileApi = {
    getOwn: async () => saved,
    getPublic: async () => saved,
    updateOwn: async (patch) => {
      saved = { ...saved, ...patch };
      return saved;
    },
  };
  const { auth, store } = setup(api, applied);
  await Promise.all([store.getState().load(), store.getState().load()]);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].preferredLanguage, "uk");
  assert.equal(applied[0].preferredTheme, "dark");
  await store.getState().save({
    username: "Renamed",
    displayName: "New Name",
    avatarUrl: "https://example.test/avatar.png",
  });
  assert.equal(auth.getState().user?.username, "Renamed");
  assert.equal(auth.getState().user?.displayName, "New Name");
  assert.equal(auth.getState().user?.avatarUrl, saved.avatarUrl);
  assert.equal(auth.getState().accessToken, "original");
  assert.equal(store.getState().profile?.preferredLanguage, "uk");
  auth.getState().clearSession();
  assert.equal(store.getState().profile, null);
});

test("failed saves keep the profile and applied preferences unchanged", async () => {
  const applied: OwnProfile[] = [];
  const { store } = setup(
    {
      getOwn: async () => profile,
      getPublic: async () => profile,
      updateOwn: async () => {
        throw new ApiError("USERNAME_ALREADY_TAKEN", 409);
      },
    },
    applied,
  );
  await store.getState().load();
  await assert.rejects(store.getState().save({ username: "Taken" }), ApiError);
  assert.equal(store.getState().profile?.username, "Player");
  assert.equal(store.getState().saving, false);
  assert.equal(applied.length, 1);
});

test("late loads and saves cannot restore a logged-out account or mutate a different session", async () => {
  let complete!: (value: OwnProfile) => void;
  const { auth, store } = setup({
    getOwn: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    getPublic: async () => profile,
    updateOwn: async () => profile,
  });
  const flight = store.getState().load();
  auth.getState().clearSession();
  complete(profile);
  await flight;
  assert.equal(store.getState().profile, null);
  assert.equal(auth.getState().user, null);
  auth.setState({ status: "authenticated", user, accessToken: "new" });
  const api = {
    getOwn: async () => profile,
    getPublic: async () => profile,
    updateOwn: () =>
      new Promise<OwnProfile>((resolve) => {
        complete = resolve;
      }),
  };
  const savingStore = createProfileStore(api, auth, () => assert.fail("late response applied"));
  const save = savingStore.getState().save({ displayName: "Late" });
  await assert.rejects(
    savingStore.getState().save({ displayName: "Duplicate" }),
    (error: unknown) => error instanceof ApiError && error.code === "REQUEST_IN_PROGRESS",
  );
  auth.getState().clearSession();
  auth.setState({ status: "authenticated", user, accessToken: "same-owner-new-session" });
  complete({ ...profile, displayName: "Late" });
  await assert.rejects(
    save,
    (error: unknown) => error instanceof ApiError && error.code === "SESSION_CHANGED",
  );
  assert.equal(savingStore.getState().profile, null);
});

test("a stale GET cannot overwrite a successful PATCH", async () => {
  let complete!: (value: OwnProfile) => void;
  const { store } = setup({
    getOwn: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    getPublic: async () => profile,
    updateOwn: async (patch) => ({ ...profile, ...patch }),
  });
  const read = store.getState().load();
  await store.getState().save({ displayName: "Saved" });
  complete(profile);
  await read;
  assert.equal(store.getState().profile?.displayName, "Saved");
  assert.equal(store.getState().loading, false);
});

test("profile requests reuse session restoration and expired-access refresh/retry", async () => {
  let refreshes = 0;
  const auth = createAuthStore(
    {
      ...authApi,
      refresh: async () => {
        refreshes++;
        return { accessToken: `restored-${refreshes}`, accessTokenExpiresIn: 900 };
      },
    },
    (operation) => operation(),
  );
  const authorizations: string[] = [];
  const client = createApiClient("https://api.example.test", async (_input, options) => {
    const token = new Headers(options?.headers).get("Authorization") ?? "";
    authorizations.push(token);
    if (authorizations.length === 1)
      return new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), { status: 401 });
    return new Response(JSON.stringify({ profile }));
  });
  const api = createProfileApi(client, createAuthenticatedClient(client, auth));
  const store = createProfileStore(api, auth, () => undefined);
  await auth.getState().initializeSession();
  await store.getState().load();
  assert.deepEqual(authorizations, ["Bearer restored-1", "Bearer restored-2"]);
  assert.equal(refreshes, 2);
  assert.equal(auth.getState().status, "authenticated");
  assert.equal(store.getState().profile?.id, profile.id);
});
