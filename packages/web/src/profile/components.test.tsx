import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter, Routes, Route, useNavigate, type NavigateFunction } from "react-router";
import { profileStore } from "./profileStore";
import { ProfileForm } from "./ProfileForm";
import { ProfilePage } from "../pages/ProfilePage";
import { PublicProfilePage } from "../pages/PublicProfilePage";
import { Avatar, isUploadedAvatar, resolveAvatarUrl } from "./Avatar";
import { API_BASE } from "../api/config";
import { centerSquare } from "./avatarFile";
import { createProfileApi } from "../api/profileApi";
import { RequireAuth } from "../auth/RequireAuth";
import { authStore } from "../auth/authStore";
import { profileApi } from "../api/profileApi";
import { ApiError } from "../api/client";
import { getLanguage, setLanguage } from "../i18n";
import { getTheme } from "../theme";
import type { OwnProfile } from "./types";
import { statisticsApi } from "../api/statisticsApi";
import { matchApi } from "../api/matchApi";
import { emptyStatisticsFixture } from "../statistics/fixtures";
import { competitiveApi } from "../play/api";
import { competitiveRatingFixture } from "../ranks/testFixtures";

const originalStatistics = statisticsApi.getPlayerStatistics;
const originalMatches = matchApi.getUserMatches;
const originalRating = competitiveApi.ratings,
  originalConfig = competitiveApi.config;
test.beforeEach(() => {
  competitiveApi.ratings = async () => ({
    standard: competitiveRatingFixture(1500, 2),
    draft: competitiveRatingFixture(1500, 0),
    classic: competitiveRatingFixture(1500, 0),
  });
  competitiveApi.config = async () => 5;
  statisticsApi.getPlayerStatistics = async (id) => emptyStatisticsFixture(id);
  matchApi.getUserMatches = async () => ({
    items: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
  });
});
test.afterEach(() => {
  competitiveApi.ratings = originalRating;
  competitiveApi.config = originalConfig;
  statisticsApi.getPlayerStatistics = originalStatistics;
  matchApi.getUserMatches = originalMatches;
});

const profile: OwnProfile = {
  id: "test-profile-user",
  email: "private@example.test",
  username: "Player",
  displayName: "Display Name",
  avatarUrl: null,
  preferredLanguage: "en",
  preferredTheme: "light",
  friendRequests: "EVERYONE",
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
  authStore.setState({
    user: { ...profile, role: "USER" },
    accessToken: "memory-only",
    status: "authenticated",
  });
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
    assert.equal(publicLink.children.join(""), "View as others");
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
      authStore.setState({ user: { ...next, role: "USER" } });
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

test("profile form exposes canonical field errors without losing the draft", async () => {
  reset();
  const renderer = mount(<ProfileForm profile={profile} onCancel={() => undefined} onSave={async () => {
    throw new ApiError("VALIDATION_ERROR", 400, "Backend fallback", {
      fields: [{ path: "username", message: "Invalid value." }],
    });
  }} />);
  try {
    act(() => renderer.root.findByProps({ name: "username" }).props.onChange({ target: { value: "Draft_Name" } }));
    await act(async () => { await renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    const input = renderer.root.findByProps({ name: "username" });
    assert.equal(input.props.value, "Draft_Name");
    assert.equal(input.props["aria-invalid"], true);
    assert.equal(input.props["aria-describedby"], "profile-username-error");
    assert(renderer.root.findByProps({ id: "profile-username-error" }).children.length > 0);
  } finally { act(() => renderer.unmount()); reset(); }
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

const uploaded = `/api/avatars/${"0".repeat(8)}-0000-4000-8000-${"0".repeat(12)}?v=${"a".repeat(16)}`;

test("uploaded avatars resolve against the API origin; other values stay as typed", () => {
  assert(isUploadedAvatar(uploaded));
  assert.equal(resolveAvatarUrl(uploaded), `${API_BASE}${uploaded}`);
  for (const value of ["/api/avatars/x", "https://example.test/a.png", "/elsewhere.png", null])
    assert.equal(isUploadedAvatar(value), false);
  assert.equal(resolveAvatarUrl("https://example.test/a.png"), "https://example.test/a.png");
  const renderer = mount(<Avatar username="Player" avatarUrl={uploaded} />);
  try {
    assert.equal(renderer.root.findByType("img").props.src, `${API_BASE}${uploaded}`);
    // A relative path that is not an upload is not loaded from the page origin.
    act(() => renderer.update(<Avatar username="Player" avatarUrl="/elsewhere.png" />));
    assert.equal(renderer.root.findAllByType("img").length, 0);
  } finally {
    act(() => renderer.unmount());
  }
  assert.deepEqual(centerSquare(400, 300), { x: 50, y: 0, side: 300 });
  assert.deepEqual(centerSquare(120, 200), { x: 0, y: 40, side: 120 });
});

test("avatar upload sends the raw image with its type", async () => {
  const calls: { path: string; options?: RequestInit }[] = [];
  const client = {
    async request<T>(path: string, decode: (value: unknown) => T, options?: RequestInit) {
      calls.push({ path, options });
      return decode({ profile: { ...profile, avatarUrl: uploaded } });
    },
  };
  const api = createProfileApi(client, client);
  const image = new Blob(["webp"], { type: "image/webp" });
  assert.equal((await api.uploadAvatar(image)).avatarUrl, uploaded);
  assert.equal(calls[0].path, "/api/profile/avatar");
  assert.equal(calls[0].options?.method, "PUT");
  assert.equal(calls[0].options?.body, image);
  assert.equal(new Headers(calls[0].options?.headers).get("content-type"), "image/webp");
});

test("profile form uploads and removes pictures without touching the typed link", async () => {
  const withUpload = { ...profile, avatarUrl: uploaded };
  const saved: unknown[] = [];
  let removed = 0;
  const uploads: Blob[] = [];
  const renderer = mount(
    <ProfileForm
      profile={withUpload}
      onSave={async (patch) => {
        saved.push(patch);
        return withUpload;
      }}
      onCancel={() => {}}
      onUploadAvatar={async (image) => {
        uploads.push(image);
        return withUpload;
      }}
      onRemoveAvatar={async () => {
        removed++;
        return profile;
      }}
    />,
  );
  try {
    // The upload is not a link: the field is empty and saving other fields keeps the picture.
    assert.equal(renderer.root.findByProps({ name: "avatarUrl" }).props.value, "");
    act(() =>
      renderer.root
        .findByProps({ name: "displayName" })
        .props.onChange({ target: { value: "Renamed" } }),
    );
    await act(async () => {
      await renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    assert.deepEqual(saved, [{ displayName: "Renamed" }]);
    // A file that is not a supported image never reaches the server.
    const input = renderer.root.findByProps({ "data-testid": "profile-avatar-file" });
    await act(async () => {
      input.props.onChange({
        target: { files: [new File(["<svg/>"], "a.svg", { type: "image/svg+xml" })], value: "" },
      });
    });
    assert.equal(uploads.length, 0);
    assert.match(text(renderer), /Choose a PNG, JPEG, WebP or GIF image/);
    await act(async () => button(renderer, "Remove picture").props.onClick());
    assert.equal(removed, 1);
    assert.match(text(renderer), /Picture updated/);
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
