import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter, useLocation } from "react-router";
import { Sidebar } from "./Sidebar";
import { AppShell } from "./AppShell";
import { CapabilitiesProvider, useCapabilities } from "./Capabilities";
import { authStore } from "../auth/authStore";
import { profileStore } from "../profile/profileStore";
import { useGameStore } from "../store";
import { getLanguage, setLanguage, translate } from "../i18n";
import { getTheme, setTheme } from "../theme";
import { ThemeToggle } from "../components/ThemeToggle";

const initialAuth = authStore.getState();
const initialProfile = profileStore.getState();
const initialGame = useGameStore.getState();
const user = {
  id: "shell-user",
  username: "Commander",
  displayName: "Tactician",
  avatarUrl: null,
  email: "test@example.test",
  createdAt: "2026-10-03T00:00:00Z",
};
function reset() {
  authStore.setState({ ...initialAuth, status: "unauthenticated", initialized: true }, true);
  profileStore.setState(initialProfile, true);
  useGameStore.setState(initialGame, true);
  setLanguage("en", null);
}
function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}
function mount(component: React.ReactNode, path = "/") {
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
const noop = () => undefined;
function sidebar(enabled = false) {
  return (
    <Sidebar
      testRoomsEnabled={enabled}
      onRules={noop}
      onSettings={noop}
      onTestRoom={noop}
      onNavigate={noop}
    />
  );
}
function button(renderer: ReactTestRenderer, text: string) {
  const found = renderer.root.findAllByType("button").find((node) => node.children.includes(text));
  assert(found, `Button ${text}`);
  return found;
}

test("sidebar renders primary navigation and highlights history details/public history", () => {
  reset();
  for (const path of ["/matches", "/matches/example", "/users/Commander/matches"]) {
    const renderer = mount(sidebar(), path);
    try {
      const links = renderer.root.findAllByType("a");
      for (const href of ["/", "/figures", "/matches", "/profile"])
        assert(links.some((link) => link.props.href === href));
      const active = links.filter((link) => link.props["aria-current"] === "page");
      assert.equal(active.length, 1);
      assert.equal(active[0].props.href, "/matches");
      act(() =>
        links
          .find((link) => link.props.href === "/figures")!
          .props.onClick({ button: 0, preventDefault() {} }),
      );
      assert.equal(
        renderer.root.findByProps({ "data-testid": "location" }).children.join(""),
        "/figures",
      );
    } finally {
      act(() => renderer.unmount());
    }
  }
});

test("Heartbreak and entire DEV section are absent from the rendered tree when test rooms are disabled", () => {
  reset();
  for (const enabled of [false, true]) {
    const renderer = mount(sidebar(enabled));
    try {
      assert.equal(
        renderer.root.findAllByProps({ "data-testid": "developer-navigation" }).length,
        Number(enabled),
      );
      assert.equal(
        renderer.root.findAllByType("a").filter((node) => node.props.href === "/heartbreak").length,
        Number(enabled),
      );
      assert.equal(JSON.stringify(renderer.toJSON()).includes("Heartbreak"), enabled);
    } finally {
      act(() => renderer.unmount());
    }
  }
});

test("account menu shows authenticated identity, opens profile, and signs out", async () => {
  reset();
  let logouts = 0;
  authStore.setState({
    status: "authenticated",
    user,
    logout: async () => {
      logouts++;
      authStore.setState({ status: "unauthenticated", user: null });
    },
  });
  const renderer = mount(sidebar());
  try {
    assert.match(JSON.stringify(renderer.toJSON()), /Tactician/);
    assert.equal(
      renderer.root.findAllByType("button").some((node) => node.children.includes("Sign out")),
      false,
    );
    act(() => renderer.root.findByProps({ "aria-label": "Account menu" }).props.onClick());
    const menu = renderer.root.findByProps({ id: "sidebar-account-actions" });
    act(() => menu.findByType("a").props.onClick({ button: 0, preventDefault() {} }));
    assert.equal(
      renderer.root.findByProps({ "data-testid": "location" }).children.join(""),
      "/profile",
    );
    act(() => renderer.root.findByProps({ "aria-label": "Account menu" }).props.onClick());
    await act(async () => {
      await button(renderer, "Sign out").props.onClick();
    });
    assert.equal(logouts, 1);
    assert(renderer.root.findAllByType("a").some((node) => node.props.href === "/login"));
  } finally {
    act(() => renderer.unmount());
    reset();
  }
});

test("settings reuse language/theme controls and persist authenticated preferences", async () => {
  reset();
  const saved: unknown[] = [];
  authStore.setState({ status: "authenticated", user });
  profileStore.setState({
    save: async (patch) => {
      saved.push(patch);
      if (patch.preferredLanguage) setLanguage(patch.preferredLanguage, null);
      if (patch.preferredTheme) setTheme(patch.preferredTheme);
      return {
        ...user,
        preferredLanguage: "en",
        preferredTheme: "light",
        updatedAt: user.createdAt,
      };
    },
  });
  const renderer = mount(
    <AppShell>
      <span>{"Content"}</span>
    </AppShell>,
  );
  const previousTheme = getTheme();
  try {
    assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 0);
    act(() => button(renderer, "Settings").props.onClick());
    assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 1);
    await act(async () => {
      await renderer.root
        .findByProps({ "aria-label": translate("language.ukrainian") })
        .props.onClick();
    });
    assert.equal(getLanguage(), "uk");
    const themeButton = renderer.root.findByType(ThemeToggle).findByType("button");
    await act(async () => {
      await themeButton.props.onClick();
    });
    assert.notEqual(getTheme(), previousTheme);
    assert.equal(saved.length, 2);
  } finally {
    act(() => renderer.unmount());
    reset();
    setTheme(previousTheme);
  }
});

test("standalone auth and immersive game layouts reserve the full content width", () => {
  reset();
  for (const props of [{ standalone: true }, { immersive: true }]) {
    const renderer = mount(
      <AppShell {...props}>
        <span>{"Game or auth"}</span>
      </AppShell>,
    );
    try {
      assert.equal(renderer.root.findAllByType("aside").length, 0);
      assert.equal(renderer.root.findByType("main").props.className, undefined);
    } finally {
      act(() => renderer.unmount());
    }
  }
});

test("capabilities are fetched once for multiple consumers and developer UI stays absent before/after disabled response", async () => {
  reset();
  const originalFetch = globalThis.fetch;
  let count = 0;
  let finish!: (response: Response) => void;
  globalThis.fetch = async () => {
    count++;
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  };
  function Navigation() {
    const capabilities = useCapabilities();
    return (
      <Sidebar
        testRoomsEnabled={capabilities?.testRooms.enabled === true}
        onRules={noop}
        onSettings={noop}
        onTestRoom={noop}
        onNavigate={noop}
      />
    );
  }
  const renderer = mount(
    <>
      <CapabilitiesProvider>
        <Navigation />
      </CapabilitiesProvider>
      <CapabilitiesProvider>
        <Navigation />
      </CapabilitiesProvider>
    </>,
  );
  try {
    assert.equal(count, 1);
    assert.equal(JSON.stringify(renderer.toJSON()).includes("Heartbreak"), false);
    await act(async () => {
      finish(new Response(JSON.stringify({ testRooms: { enabled: false, requiresToken: false } })));
    });
    assert.equal(JSON.stringify(renderer.toJSON()).includes("Heartbreak"), false);
  } finally {
    act(() => renderer.unmount());
    globalThis.fetch = originalFetch;
    reset();
  }
});
