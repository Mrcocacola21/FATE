import assert from "node:assert/strict";
import test from "node:test";
import { createAuthStore } from "./createAuthStore";
import type { AuthApi, AuthUser } from "./types";
import { ApiError, createApiClient } from "../api/client";
import { createAuthApi } from "../api/authApi";
import { createAuthenticatedClient } from "../api/authenticatedClient";
import { withAuthLock } from "./refreshLock";
import { safeReturnTo } from "./safeReturnTo";

const user: AuthUser = {
  id: "test-user",
  email: "player@example.test",
  role: "USER" as const,
  username: "Player",
  displayName: null,
  avatarUrl: null,
  createdAt: "2026-10-02T00:00:00.000Z",
};
const credentials = { user, accessToken: "initial-access", accessTokenExpiresIn: 900 };
const immediate = <T>(operation: () => Promise<T>) => operation();
function api(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    login: async () => credentials,
    register: async () => credentials,
    refresh: async () => ({ accessToken: "refreshed-access", accessTokenExpiresIn: 900 }),
    getMe: async () => user,
    logout: async () => undefined,
    ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

test("bootstrap is single-flight, loads /me, and initializes exactly once", async () => {
  const calls: string[] = [];
  const store = createAuthStore(
    api({
      refresh: async () => {
        calls.push("refresh");
        return { accessToken: "new", accessTokenExpiresIn: 900 };
      },
      getMe: async (token) => {
        calls.push(`me:${token}`);
        return user;
      },
    }),
    immediate,
  );
  const first = store.getState().initializeSession();
  const second = store.getState().initializeSession();
  assert.equal(first, second);
  await Promise.all([first, second]);
  await store.getState().initializeSession();
  assert.deepEqual(calls, ["refresh", "me:new"]);
  assert.equal(store.getState().status, "authenticated");
  assert.equal(store.getState().user, user);
  assert.equal(store.getState().accessToken, "new");
});

test("expected missing refresh session is unauthenticated without recursion", async () => {
  let calls = 0;
  const store = createAuthStore(
    api({
      refresh: async () => {
        calls++;
        throw new ApiError("INVALID_REFRESH_TOKEN", 401);
      },
    }),
    immediate,
  );
  await store.getState().initializeSession();
  await store.getState().initializeSession();
  assert.equal(calls, 1);
  assert.equal(store.getState().status, "unauthenticated");
  assert.equal(store.getState().error, null);
  assert.equal(store.getState().accessToken, null);
});

test("infrastructure failures keep an explicit retryable state, including malformed 401", async () => {
  for (const failure of [
    new ApiError("NETWORK_ERROR"),
    new ApiError("DATABASE_UNAVAILABLE", 503),
    new ApiError("INVALID_RESPONSE", 200),
    new ApiError("SERVER_ERROR", 401),
  ]) {
    let first = true;
    const store = createAuthStore(
      api({
        refresh: async () => {
          if (first) {
            first = false;
            throw failure;
          }
          return { accessToken: "retry", accessTokenExpiresIn: 900 };
        },
      }),
      immediate,
    );
    await store.getState().initializeSession();
    assert.equal(store.getState().status, "unavailable");
    assert.equal(store.getState().error, failure);
    await store.getState().initializeSession();
    assert.equal(store.getState().status, "authenticated");
  }
});

test("login and registration authenticate from returned credentials", async () => {
  const store = createAuthStore(api(), immediate);
  await store.getState().login({ email: user.email, password: "password" });
  assert.equal(store.getState().status, "authenticated");
  assert.equal(store.getState().accessToken, credentials.accessToken);
  store.getState().clearSession();
  await store.getState().register({ email: user.email, username: "Player", password: "password" });
  assert.equal(store.getState().user, user);
  assert.equal(store.getState().operation, null);
});

test("logout clears locally immediately even when backend logout fails", async () => {
  const pending = deferred<void>();
  const store = createAuthStore(api({ logout: () => pending.promise }), immediate);
  await store.getState().login({ email: user.email, password: "password" });
  const logout = store.getState().logout();
  assert.equal(store.getState().status, "unauthenticated");
  assert.equal(store.getState().user, null);
  assert.equal(store.getState().accessToken, null);
  pending.reject(new ApiError("NETWORK_ERROR"));
  await logout;
  assert.equal(store.getState().error?.code, "LOGOUT_FAILED");
});

test("late bootstrap cannot restore authentication after logout", async () => {
  const pending = deferred<{ accessToken: string; accessTokenExpiresIn: number }>();
  const store = createAuthStore(api({ refresh: () => pending.promise }), immediate);
  const initialization = store.getState().initializeSession();
  await store.getState().logout();
  pending.resolve({ accessToken: "late", accessTokenExpiresIn: 900 });
  await initialization;
  assert.equal(store.getState().status, "unauthenticated");
  assert.equal(store.getState().accessToken, null);
});

test("late login response cannot undo logout", async () => {
  const pending = deferred<typeof credentials>();
  const store = createAuthStore(api({ login: () => pending.promise }), immediate);
  const login = store.getState().login({ email: user.email, password: "password" });
  const rejected = assert.rejects(
    login,
    (failure: unknown) => failure instanceof ApiError && failure.code === "SESSION_CHANGED",
  );
  await store.getState().logout();
  pending.resolve(credentials);
  await rejected;
  assert.equal(store.getState().status, "unauthenticated");
});

test("authenticated requests refresh and retry once; concurrent 401 responses share refresh", async () => {
  let refreshes = 0;
  let retried = 0;
  const calls: string[] = [];
  const client = createApiClient("https://api.example.test", async (_url, options) => {
    const token = new Headers(options?.headers).get("Authorization");
    calls.push(token ?? "none");
    assert.equal(options?.credentials, "include");
    if (token === "Bearer initial-access") return json({ error: { code: "UNAUTHORIZED" } }, 401);
    retried++;
    return json({ ok: true });
  });
  const store = createAuthStore(
    api({
      refresh: async () => {
        refreshes++;
        return { accessToken: "new-access", accessTokenExpiresIn: 900 };
      },
    }),
    immediate,
  );
  await store.getState().login({ email: user.email, password: "password" });
  const authenticated = createAuthenticatedClient(client, store);
  const result = await Promise.all(
    Array.from({ length: 5 }, () => authenticated.request("/protected", (value) => value)),
  );
  assert.equal(result.length, 5);
  assert.equal(refreshes, 1);
  assert.equal(retried, 5);
  assert.equal(calls.length, 10);
});

test("a delayed original 401 uses a token already refreshed by another request", async () => {
  let refreshes = 0;
  let requests = 0;
  const late = deferred<Response>();
  const client = createApiClient("https://api.example.test", async (_url, options) => {
    if (new Headers(options?.headers).get("Authorization") !== "Bearer initial-access")
      return json({ ok: true });
    return ++requests === 1 ? json({ error: { code: "UNAUTHORIZED" } }, 401) : late.promise;
  });
  const store = createAuthStore(
    api({
      refresh: async () => {
        refreshes++;
        return { accessToken: "new", accessTokenExpiresIn: 900 };
      },
    }),
    immediate,
  );
  await store.getState().login({ email: user.email, password: "password" });
  const authenticated = createAuthenticatedClient(client, store);
  const first = authenticated.request("/first", (value) => value);
  const second = authenticated.request("/second", (value) => value);
  await first;
  late.resolve(json({ error: { code: "UNAUTHORIZED" } }, 401));
  await second;
  assert.equal(refreshes, 1);
});

test("failed refresh clears credentials and never retries /refresh recursively", async () => {
  let refreshes = 0;
  const client = createApiClient("https://api.example.test", async () =>
    json({ error: { code: "UNAUTHORIZED" } }, 401),
  );
  const store = createAuthStore(
    api({
      refresh: async () => {
        refreshes++;
        throw new ApiError("INVALID_REFRESH_TOKEN", 401);
      },
    }),
    immediate,
  );
  await store.getState().login({ email: user.email, password: "password" });
  await assert.rejects(
    createAuthenticatedClient(client, store).request("/protected", (value) => value),
  );
  assert.equal(refreshes, 1);
  assert.equal(store.getState().status, "unauthenticated");
  assert.equal(store.getState().accessToken, null);
});

test("a retry returning 401 is final and clears credentials", async () => {
  let refreshes = 0;
  let requests = 0;
  const client = createApiClient("https://api.example.test", async () => {
    requests++;
    return json({ error: { code: "UNAUTHORIZED" } }, 401);
  });
  const store = createAuthStore(
    api({
      refresh: async () => {
        refreshes++;
        return { accessToken: "new", accessTokenExpiresIn: 900 };
      },
    }),
    immediate,
  );
  await store.getState().login({ email: user.email, password: "password" });
  await assert.rejects(
    createAuthenticatedClient(client, store).request("/protected", (value) => value),
  );
  assert.equal(refreshes, 1);
  assert.equal(requests, 2);
  assert.equal(store.getState().status, "unauthenticated");
});

test("a request is not retried under a different signed-in account", async () => {
  const pending = deferred<Response>();
  let requests = 0;
  const client = createApiClient("https://api.example.test", async () => {
    requests++;
    return pending.promise;
  });
  const store = createAuthStore(api(), immediate);
  await store.getState().login({ email: user.email, password: "password" });
  const request = createAuthenticatedClient(client, store).request("/protected", (value) => value);
  const rejected = assert.rejects(
    request,
    (failure: unknown) => failure instanceof ApiError && failure.code === "SESSION_CHANGED",
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  store.setState({ user: { ...user, id: "other-user" }, accessToken: "other-access" });
  pending.resolve(json({ error: { code: "UNAUTHORIZED" } }, 401));
  await rejected;
  assert.equal(requests, 1);
});

test("ordinary errors and bootstrap auth endpoints never trigger automatic refresh", async () => {
  let refreshes = 0;
  const store = createAuthStore(
    api({
      refresh: async () => {
        refreshes++;
        return { accessToken: "new", accessTokenExpiresIn: 900 };
      },
    }),
    immediate,
  );
  await store.getState().login({ email: user.email, password: "password" });
  for (const status of [400, 403, 404, 409, 500]) {
    const client = createApiClient("https://api.example.test", async () =>
      json({ error: { code: "ORDINARY_ERROR" } }, status),
    );
    await assert.rejects(
      createAuthenticatedClient(client, store).request("/protected", (value) => value),
    );
  }
  for (const endpoint of ["refresh", "login", "register", "logout"]) {
    const client = createApiClient("https://api.example.test", async () => {
      throw new Error("must never fetch");
    });
    await assert.rejects(
      createAuthenticatedClient(client, store).request(`/api/auth/${endpoint}`, (value) => value),
    );
  }
  assert.equal(refreshes, 0);
});

test("auth API uses the actual contract, strips sensitive DTO fields and sends credentials", async () => {
  const bodies: unknown[] = [];
  const apiClient = createApiClient("https://api.example.test", async (url, options) => {
    assert.equal(options?.credentials, "include");
    if (options?.body) bodies.push(JSON.parse(String(options.body)));
    if (String(url).endsWith("/logout")) return new Response(null, { status: 204 });
    if (String(url).endsWith("/me"))
      return json({ user: { ...user, passwordHash: "must-not-escape" } });
    return json({
      ...credentials,
      refreshTokenHash: "must-not-escape",
      user: { ...user, passwordHash: "must-not-escape" },
    });
  });
  const auth = createAuthApi(apiClient);
  const input = { email: user.email, password: "test-password", username: "Player" };
  const registered = await auth.register(input);
  assert.deepEqual(registered, credentials);
  assert.deepEqual(await auth.getMe("token"), user);
  await auth.login({ email: user.email, password: input.password });
  assert.deepEqual(await auth.refresh(), {
    accessToken: credentials.accessToken,
    accessTokenExpiresIn: 900,
  });
  await auth.logout();
  assert.deepEqual(bodies, [input, { email: user.email, password: input.password }]);
});

test("API rejects malformed successful responses and network failures safely", async () => {
  const auth = createAuthApi(
    createApiClient("https://api.example.test", async () => json({ accessToken: "token" })),
  );
  await assert.rejects(
    auth.refresh(),
    (failure: unknown) => failure instanceof ApiError && failure.code === "INVALID_RESPONSE",
  );
  const unavailable = createApiClient("https://api.example.test", async () => {
    throw new Error("sensitive diagnostics");
  });
  await assert.rejects(
    unavailable.request("/test", (value) => value),
    (failure: unknown) => failure instanceof ApiError && failure.message === "NETWORK_ERROR",
  );
});

test("Web Locks coordinates cookie mutations and has a graceful fallback", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const names: string[] = [];
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        locks: {
          request: async <T>(name: string, operation: () => Promise<T>) => {
            names.push(name);
            return operation();
          },
        },
      },
    });
    assert.equal(await withAuthLock(async () => 42), 42);
    assert.deepEqual(names, ["fate-auth-refresh"]);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    assert.equal(await withAuthLock(async () => 43), 43);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("returnTo accepts only safe internal destinations", () => {
  assert.equal(safeReturnTo("/account?check=1#top"), "/account?check=1#top");
  for (const value of [
    null,
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/%2F%2Fevil.test",
    "/%5Cevil.test",
    "/login",
    "/register/",
    "/%00bad",
  ]) {
    assert.equal(safeReturnTo(value), "/");
  }
});
