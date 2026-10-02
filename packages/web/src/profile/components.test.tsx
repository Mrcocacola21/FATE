import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter, Routes, Route, useNavigate, type NavigateFunction } from "react-router";
import { profileStore } from "./profileStore";
import { ProfileForm } from "./ProfileForm";
import { ProfilePage } from "../pages/ProfilePage";
import { PublicProfilePage } from "../pages/PublicProfilePage";
import { Avatar } from "./Avatar";
import { RequireAuth } from "../auth/RequireAuth";
import { authStore } from "../auth/authStore";
import { profileApi } from "../api/profileApi";
import { ApiError } from "../api/client";
import { getLanguage, setLanguage } from "../i18n";
import { getTheme } from "../theme";
import type { OwnProfile } from "./types";

const profile: OwnProfile = {
  id: "test-profile-user",
  email: "private@example.test",
  username: "Player",
  displayName: "Display Name",
  avatarUrl: null,
  preferredLanguage: "en",
  preferredTheme: "light",
  createdAt: "2026-10-02T00:00:00Z",
  updatedAt: "2026-10-02T00:00:00Z",
};
const initialAuth = authStore.getState();
const initialProfile = profileStore.getState();
function reset() {
  authStore.setState({ ...initialAuth, status: "unauthenticated", initialized: true }, true);
  profileStore.setState(initialProfile, true);
  setLanguage("en", null);
}
function mount(content: React.ReactNode, path = "/profile") {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<MemoryRouter initialEntries={[path]}>{content}</MemoryRouter>);
  });
  return renderer;
}
function button(renderer: ReactTestRenderer, label: string) {
  const result = renderer.root
    .findAllByType("button")
    .find((node) => node.children.join("") === label);
  assert(result, `button ${label}`);
  return result;
}
function text(renderer: ReactTestRenderer) {
  return JSON.stringify(renderer.toJSON());
}
function signedIn() {
  authStore.setState({ user: profile, accessToken: "memory-only", status: "authenticated" });
  profileStore.setState({ profile });
}

test("own profile is protected and renders email only after authentication", async () => {
  reset();
  let renderer = mount(
    <RequireAuth>
      <ProfilePage />
    </RequireAuth>,
  );
  assert.equal(renderer.root.findAllByProps({ "data-testid": "profile-page" }).length, 0);
  act(() => renderer.unmount());
  signedIn();
  renderer = mount(
    <RequireAuth>
      <ProfilePage />
    </RequireAuth>,
  );
  try {
    assert.match(text(renderer), /private@example.test/);
    assert.match(text(renderer), /Display Name/);
    assert(renderer.root.findAllByType("p").some((node) => node.children.join("") === "@Player"));
    const publicLink = renderer.root
      .findAllByType("a")
      .find((link) => link.props.href === "/users/Player");
    assert(publicLink);
    assert.equal(publicLink.props.href, "/users/Player");
    assert.equal(publicLink.children.join(""), "Public profile");
  } finally {
    act(() => renderer.unmount());
    reset();
  }
});

test("editing populates values, sends only changed data, updates visible identity and cancel discards drafts", async () => {
  reset();
  signedIn();
  let submitted: unknown;
  profileStore.setState({
    save: async (patch) => {
      submitted = patch;
      const next = { ...profile, ...patch };
      profileStore.setState({ profile: next });
      authStore.setState({ user: next });
      return next;
    },
  });
  const renderer = mount(<ProfilePage />);
  try {
    act(() => button(renderer, "Edit profile").props.onClick());
    assert.equal(renderer.root.findByProps({ name: "username" }).props.value, "Player");
    assert.equal(renderer.root.findByProps({ name: "displayName" }).props.value, "Display Name");
    act(() =>
      renderer.root
        .findByProps({ name: "displayName" })
        .props.onChange({ target: { value: " Saved Name " } }),
    );
    await act(async () => {
      await renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    assert.deepEqual(submitted, { displayName: "Saved Name" });
    assert.match(text(renderer), /Saved Name/);
    assert.match(text(renderer), /Profile updated/);
    act(() => button(renderer, "Edit profile").props.onClick());
    act(() =>
      renderer.root
        .findByProps({ name: "displayName" })
        .props.onChange({ target: { value: "Unsaved" } }),
    );
    act(() => button(renderer, "Cancel").props.onClick());
    assert.doesNotMatch(text(renderer), /Unsaved/);
    act(() => button(renderer, "Edit profile").props.onClick());
    assert.equal(renderer.root.findByProps({ name: "displayName" }).props.value, "Saved Name");
  } finally {
    act(() => renderer.unmount());
    reset();
  }
});

test("form handles conflicts, preserves drafts and rejects dangerous avatar URLs", async () => {
  reset();
  let calls = 0;
  const renderer = mount(
    <ProfileForm
      profile={profile}
      onCancel={() => undefined}
      onSave={async () => {
        calls++;
        throw new ApiError("USERNAME_ALREADY_TAKEN", 409);
      }}
    />,
  );
  try {
    act(() =>
      renderer.root
        .findByProps({ name: "username" })
        .props.onChange({ target: { value: "Taken" } }),
    );
    await act(async () => {
      await renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    assert.equal(calls, 1);
    assert.match(
      renderer.root.findByProps({ role: "alert" }).children.join(""),
      /username is already taken/,
    );
    assert.equal(renderer.root.findByProps({ name: "username" }).props.value, "Taken");
    act(() =>
      renderer.root
        .findByProps({ name: "avatarUrl" })
        .props.onChange({ target: { value: "javascript:alert(1)" } }),
    );
    await act(async () => {
      await renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    assert.equal(calls, 1);
    assert.match(renderer.root.findByProps({ role: "alert" }).children.join(""), /HTTP or HTTPS/);
  } finally {
    act(() => renderer.unmount());
    reset();
  }
});

test("avatar renders HTTP images and falls back for absent, unsafe or failed images", () => {
  const renderer = mount(<Avatar username="Player" avatarUrl={null} />);
  try {
    assert.equal(renderer.root.findAllByType("img").length, 0);
    assert.equal(renderer.root.findByProps({ role: "img" }).children.join(""), "PL");
    act(() => renderer.update(<Avatar username="Player" avatarUrl="javascript:alert(1)" />));
    assert.equal(renderer.root.findAllByType("img").length, 0);
    act(() =>
      renderer.update(<Avatar username="Player" avatarUrl="https://example.test/avatar.png" />),
    );
    assert.equal(renderer.root.findByType("img").props.referrerPolicy, "no-referrer");
    act(() => renderer.root.findByType("img").props.onError());
    assert.equal(renderer.root.findAllByType("img").length, 0);
    act(() =>
      renderer.update(<Avatar username="Player" avatarUrl="https://example.test/new.png" />),
    );
    assert.equal(renderer.root.findAllByType("img").length, 1);
  } finally {
    act(() => renderer.unmount());
  }
});

test("public profile has no email/preferences and handles changed usernames and missing users", async () => {
  reset();
  const original = profileApi.getPublic;
  profileApi.getPublic = async (username) => {
    if (username === "Missing") throw new ApiError("USER_NOT_FOUND", 404);
    return {
      id: profile.id,
      username,
      displayName: profile.displayName,
      avatarUrl: null,
      createdAt: profile.createdAt,
    };
  };
  let navigate!: NavigateFunction;
  function NavigationProbe() {
    navigate = useNavigate();
    return null;
  }
  const renderer = mount(
    <>
      <NavigationProbe />
      <Routes>
        <Route path="/users/:username" element={<PublicProfilePage />} />
      </Routes>
    </>,
    "/users/Player",
  );
  try {
    await act(async () => {});
    assert(renderer.root.findAllByType("p").some((node) => node.children.join("") === "@Player"));
    assert.doesNotMatch(text(renderer), /private@example.test|Language|Theme|Edit profile/);
    act(() => {
      void navigate("/users/OtherPlayer");
    });
    await act(async () => {});
    assert(
      renderer.root.findAllByType("p").some((node) => node.children.join("") === "@OtherPlayer"),
    );
    act(() => {
      void navigate("/users/Missing");
    });
    await act(async () => {});
    assert.equal(
      renderer.root.findByProps({ role: "alert" }).findByType("p").children.join(""),
      "User not found.",
    );
  } finally {
    profileApi.getPublic = original;
    act(() => renderer.unmount());
    reset();
  }
});

test("persisted language and theme apply through the existing UI state", async () => {
  reset();
  signedIn();
  const original = profileApi.getOwn;
  profileApi.getOwn = async () => ({ ...profile, preferredLanguage: "uk", preferredTheme: "dark" });
  try {
    await profileStore.getState().load();
    assert.equal(getLanguage(), "uk");
    assert.equal(getTheme(), "dark");
  } finally {
    profileApi.getOwn = original;
    reset();
  }
});
