import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter, useLocation } from "react-router";
import { authStore } from "./authStore";
import { RequireAuth } from "./RequireAuth";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { ApiError } from "../api/client";
import { setLanguage } from "../i18n";

const originalState = authStore.getState();
const user = {
  id: "test-user",
  username: "Player",
  email: "player@example.test",
  role: "USER" as const,
  displayName: null,
  avatarUrl: null,
  createdAt: "2026-10-02T00:00:00Z",
};
function reset() {
  authStore.setState({ ...originalState, status: "unauthenticated", initialized: true }, true);
  setLanguage("en", { setItem: () => undefined });
}
function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}
function mount(component: React.ReactNode, path = "/login") {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <MemoryRouter initialEntries={[path]}>
        {component}
        <LocationProbe />
      </MemoryRouter>,
    );
  });
  return renderer;
}
async function submit(renderer: ReactTestRenderer, fields: Record<string, string>) {
  const original = globalThis.FormData;
  class TestFormData {
    get(name: string) {
      return fields[name] ?? null;
    }
  }
  Object.defineProperty(globalThis, "FormData", { configurable: true, value: TestFormData });
  try {
    await act(async () => {
      await renderer.root
        .findByType("form")
        .props.onSubmit({ preventDefault() {}, currentTarget: { reset() {} } });
    });
  } finally {
    Object.defineProperty(globalThis, "FormData", { configurable: true, value: original });
  }
}

test("login renders accessible fields and submits only email/password", async () => {
  reset();
  let submitted: unknown;
  authStore.setState({
    login: async (input) => {
      submitted = input;
      authStore.setState({ status: "authenticated", user, accessToken: "token" });
    },
  });
  const renderer = mount(<LoginPage />);
  try {
    assert.equal(renderer.root.findByProps({ name: "email" }).props.type, "email");
    assert.equal(
      renderer.root.findByProps({ name: "password" }).props.autoComplete,
      "current-password",
    );
    await submit(renderer, { email: user.email, password: " password " });
    assert.deepEqual(submitted, { email: user.email, password: " password " });
    assert.equal(authStore.getState().status, "authenticated");
    assert.equal(renderer.root.findByProps({ "data-testid": "location" }).children.join(""), "/");
  } finally {
    act(() => renderer.unmount());
    reset();
  }
});

test("login shows a localized generic credentials error", async () => {
  reset();
  authStore.setState({
    login: async () => {
      throw new ApiError("INVALID_CREDENTIALS", 401);
    },
  });
  const renderer = mount(<LoginPage />);
  try {
    await submit(renderer, { email: user.email, password: "password" });
    assert.equal(
      renderer.root.findByProps({ role: "alert" }).children.join(""),
      "Invalid email or password.",
    );
  } finally {
    act(() => renderer.unmount());
    reset();
  }
});

test("failed server logout is visible on the login route and can be retried", async () => {
  reset();
  let retried = 0;
  authStore.setState({
    error: new ApiError("LOGOUT_FAILED"),
    logout: async () => {
      retried++;
      authStore.setState({ error: null });
    },
  });
  const renderer = mount(<LoginPage />);
  try {
    assert.match(
      renderer.root.findByProps({ role: "alert" }).children.join(""),
      /server could not confirm sign out/,
    );
    const retry = renderer.root
      .findAllByType("button")
      .find((button) => button.children.join("") === "Retry sign out");
    assert(retry);
    await act(async () => {
      await retry.props.onClick();
    });
    assert.equal(retried, 1);
    assert.equal(authStore.getState().error, null);
  } finally {
    act(() => renderer.unmount());
    reset();
  }
});

test("form prevents two submissions in the same render cycle", async () => {
  reset();
  let calls = 0;
  let finish!: () => void;
  authStore.setState({
    login: () => {
      calls++;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
  });
  const renderer = mount(<LoginPage />);
  const original = globalThis.FormData;
  class TestFormData {
    get(name: string) {
      return name === "email" ? user.email : "password";
    }
  }
  Object.defineProperty(globalThis, "FormData", { configurable: true, value: TestFormData });
  try {
    await act(async () => {
      const onSubmit = renderer.root.findByType("form").props.onSubmit;
      const event = { preventDefault() {}, currentTarget: { reset() {} } };
      onSubmit(event);
      onSubmit(event);
    });
    assert.equal(calls, 1);
    assert.equal(renderer.root.findByProps({ type: "submit" }).props.disabled, true);
    await act(async () => {
      finish();
    });
  } finally {
    Object.defineProperty(globalThis, "FormData", { configurable: true, value: original });
    act(() => renderer.unmount());
    reset();
  }
});

test("register validates confirmation and never sends it to the backend", async () => {
  reset();
  let calls = 0;
  let submitted: unknown;
  authStore.setState({
    register: async (input) => {
      calls++;
      submitted = input;
      authStore.setState({ status: "authenticated", user, accessToken: "token" });
    },
  });
  const renderer = mount(<RegisterPage />, "/register");
  try {
    assert.equal(renderer.root.findByProps({ name: "username" }).props.autoComplete, "username");
    assert.equal(
      renderer.root.findByProps({ name: "confirmation" }).props.autoComplete,
      "new-password",
    );
    await submit(renderer, {
      email: user.email,
      username: "Player",
      password: "password",
      confirmation: "different",
    });
    assert.equal(calls, 0);
    assert.equal(
      renderer.root.findByProps({ role: "alert" }).children.join(""),
      "Passwords do not match.",
    );
    await submit(renderer, {
      email: user.email,
      username: "Player",
      password: "password",
      confirmation: "password",
    });
    assert.equal(calls, 1);
    assert.deepEqual(submitted, { email: user.email, username: "Player", password: "password" });
    assert.equal(authStore.getState().status, "authenticated");
  } finally {
    act(() => renderer.unmount());
    reset();
  }
});

test("registration maps duplicate email and username errors", async () => {
  for (const [code, message] of [
    ["EMAIL_ALREADY_REGISTERED", "An account with this email already exists."],
    ["USERNAME_ALREADY_TAKEN", "This username is already taken."],
  ]) {
    reset();
    authStore.setState({
      register: async () => {
        throw new ApiError(code, 409);
      },
    });
    const renderer = mount(<RegisterPage />, "/register");
    try {
      await submit(renderer, {
        email: user.email,
        username: "Player",
        password: "password",
        confirmation: "password",
      });
      assert.equal(renderer.root.findByProps({ role: "alert" }).children.join(""), message);
    } finally {
      act(() => renderer.unmount());
      reset();
    }
  }
});

test("login displays blocked accounts and marks canonical validation field paths", async () => {
  for (const code of ["ACCOUNT_BLOCKED", "VALIDATION_ERROR"]) {
    reset();
    authStore.setState({ login: async () => {
      throw new ApiError(code, code === "ACCOUNT_BLOCKED" ? 403 : 400, "Backend fallback", {
        fields: [{ path: "email", message: "Invalid value." }],
      });
    } });
    const renderer = mount(<LoginPage />);
    try {
      await submit(renderer, { email: user.email, password: "password" });
      const message = renderer.root.findByProps({ role: "alert" }).children.join("");
      assert.match(message, code === "ACCOUNT_BLOCKED" ? /account is blocked/ : /Check your email, username and password/);
      assert.equal(renderer.root.findByProps({ name: "email" }).props["aria-invalid"], code === "VALIDATION_ERROR");
      assert.equal(renderer.root.findByProps({ name: "password" }).props["aria-invalid"], false);
    } finally { act(() => renderer.unmount()); reset(); }
  }
});

test("protected route waits during initialization, redirects guests and renders signed-in content", () => {
  for (const status of [
    "initializing",
    "unauthenticated",
    "authenticated",
    "unavailable",
  ] as const) {
    reset();
    authStore.setState({ status, user: status === "authenticated" ? user : null });
    const renderer = mount(
      <RequireAuth>
        <span data-testid="protected">{"Protected"}</span>
      </RequireAuth>,
      "/account",
    );
    try {
      assert.equal(
        renderer.root.findAllByProps({ "data-testid": "protected" }).length,
        status === "authenticated" ? 1 : 0,
      );
      assert.equal(
        renderer.root.findByProps({ "data-testid": "location" }).children.join(""),
        status === "unauthenticated" ? "/login" : "/account",
      );
    } finally {
      act(() => renderer.unmount());
      reset();
    }
  }
});

test("logging out removes protected profile content", async () => {
  reset();
  authStore.setState({
    status: "authenticated",
    user,
    accessToken: "token",
    logout: async () => {
      authStore.setState({ status: "unauthenticated", user: null, accessToken: null });
    },
  });
  const renderer = mount(
    <RequireAuth>
      <section data-testid="profile-page">{"Profile"}</section>
    </RequireAuth>,
    "/profile",
  );
  try {
    assert.equal(renderer.root.findAllByProps({ "data-testid": "profile-page" }).length, 1);
    await act(async () => {
      await authStore.getState().logout();
    });
    assert.equal(renderer.root.findAllByProps({ "data-testid": "profile-page" }).length, 0);
    assert.equal(
      renderer.root.findByProps({ "data-testid": "location" }).children.join(""),
      "/login",
    );
  } finally {
    act(() => renderer.unmount());
    reset();
  }
});
