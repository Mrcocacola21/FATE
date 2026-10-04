import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router";
import { authStore } from "../auth/authStore";
import { ApiError } from "../api/client";
import { setLanguage, translate } from "../i18n";
import { Sidebar } from "../layout/Sidebar";
import { AdminGuard } from "./AdminLayout";
import { AdminOverviewPage } from "./AdminOverviewPage";
import { AdminUsersPage } from "./AdminUsersPage";
import { AdminUserPage } from "./AdminUserPage";
import { AdminMatchesPage } from "./AdminMatchesPage";
import { AdminMatchPage } from "./AdminMatchPage";
import { AdminAuditPage } from "./AdminAuditPage";
import { fixtureAudit } from "./fixtures";
import { adminApi } from "./api";
import { fixtureUser, fixtureMatch, fixtureSummary, fixtureAction, fixturePage } from "./fixtures";
import type { AdminUserDetail, Query } from "./types";

const originalAuth = authStore.getState(),
  originalApi = { ...adminApi };
let renderer: ReactTestRenderer | undefined, navigate: NavigateFunction;
const calls: Query[] = [];
beforeEach(() => {
  setLanguage("en", null);
  calls.length = 0;
  authStore.setState(
    {
      ...originalAuth,
      initialized: true,
      status: "authenticated",
      user: {
        id: "staff",
        role: "ADMIN",
        email: "staff@example.test",
        username: "staff",
        displayName: "Staff",
        avatarUrl: null,
        createdAt: fixtureUser.createdAt,
      },
    },
    true,
  );
  adminApi.summary = async () => fixtureSummary;
  adminApi.audit = async (query) => {
    calls.push(query);
    return fixturePage(fixtureAudit, Number(query.page), 80);
  };
  adminApi.users = async (query) => {
    calls.push(query);
    return fixturePage([fixtureUser], Number(query.page), 42);
  };
  adminApi.user = async () => fixtureUser;
  adminApi.matches = async (query) => {
    calls.push(query);
    return fixturePage([fixtureMatch], Number(query.page), 42);
  };
  adminApi.match = async () => fixtureMatch;
  adminApi.actions = async (_id, query) => {
    calls.push(query);
    return fixturePage([fixtureAction], Number(query.page), 80);
  };
  adminApi.block = async (_id, reason) => ({
    ...fixtureUser,
    blocked: true,
    blockedReason: reason,
    blockedAt: fixtureUser.updatedAt,
  });
  adminApi.unblock = async () => fixtureUser;
  adminApi.changeRole = async (_id, role) => ({ ...fixtureUser, role });
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  Object.assign(adminApi, originalApi);
  authStore.setState(originalAuth, true);
});
function Probe() {
  navigate = useNavigate();
  return null;
}
async function mount(path = "/admin") {
  await act(async () => {
    renderer = create(
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <Routes>
          <Route path="/admin" element={<AdminGuard />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="users/:userId" element={<AdminUserPage />} />
            <Route path="matches" element={<AdminMatchesPage />} />
            <Route path="matches/:matchId" element={<AdminMatchPage />} />
            <Route path="audit" element={<AdminAuditPage />} />
          </Route>
          <Route path="/login" element={<p>{translate("auth.login")}</p>} />
        </Routes>
      </MemoryRouter>,
    );
  });
}
const text = () => JSON.stringify(renderer?.toJSON());
const button = (label: string) =>
  renderer!.root.findAllByType("button").find((node) => node.children.join("") === label)!;
const select = (label: string) =>
  renderer!.root
    .findAllByType("label")
    .find((node) => node.findAllByType("span")[0]?.children.join("") === label)!
    .findByType("select");

test("audit ADMIN viewer labels four events, links resources and exposes read-only structured details", async () => {
  await mount("/admin/audit");
  for (const label of [
    "User blocked",
    "User unblocked",
    "Role changed",
    "Match interrupted",
    "Staff",
    "System",
  ])
    assert(text().includes(label), label);
  const links = renderer!.root.findAllByType("a");
  assert(links.some((a) => a.props.href === `/admin/users/${fixtureUser.id}`));
  assert(links.some((a) => a.props.href === `/admin/matches/${fixtureMatch.matchId}`));
  const details = renderer!.root
    .findAllByType("button")
    .filter((b) => b.children.join("") === "Details");
  await act(async () => details[2].props.onClick());
  assert.match(text(), /Previous role/);
  assert.match(text(), /New role/);
  await act(async () => details[3].props.onClick());
  assert.match(text(), /Recovery reason/);
  assert.match(text(), /ACTION_LOG_GAP/);
  assert.match(text(), /Last durable revision/);
  assert.equal(renderer!.root.findAllByType("textarea").length, 0);
  assert(
    !renderer!.root
      .findAllByType("button")
      .some((b) => /Delete|Edit|Clear/.test(b.children.join(""))),
  );
  await act(async () => select("Event").props.onChange({ target: { value: "USER_BLOCKED" } }));
  assert.equal(calls[calls.length - 1]?.eventType, "USER_BLOCKED");
});

test("MODERATOR cannot mount audit data and has no Audit Log navigation", async () => {
  authStore.setState({ user: { ...authStore.getState().user!, role: "MODERATOR" } });
  await mount("/admin/audit");
  assert.match(text(), /Access denied/);
  assert.equal(calls.length, 0);
  assert(!renderer!.root.findAllByType("a").some((a) => a.props.href === "/admin/audit"));
});

test("audit viewer has empty and safe error states and translations in both locales", async () => {
  adminApi.audit = async () => fixturePage([]);
  await mount("/admin/audit");
  assert.match(text(), /No audit events match/);
  adminApi.audit = async () => {
    throw new ApiError("SERVER_ERROR", 503);
  };
  await act(async () => button("Refresh").props.onClick());
  assert.match(text(), /administration service is unavailable/);
  await act(async () => setLanguage("uk", null));
  assert(text().includes("Журнал аудиту"));
});

test("USER direct routes and unresolved sessions never mount admin data", async () => {
  let count = 0;
  adminApi.summary = async () => {
    count++;
    return fixtureSummary;
  };
  authStore.setState({ user: { ...authStore.getState().user!, role: "USER" } });
  await mount();
  assert.match(text(), /Access denied/);
  assert.equal(count, 0);
  assert.doesNotMatch(text(), /Total users/);
  await act(async () => authStore.setState({ status: "initializing" }));
  assert.equal(count, 0);
  assert.doesNotMatch(text(), /System overview/);
});
for (const role of ["USER", "MODERATOR", "ADMIN"] as const)
  test(`${role} sidebar access follows the session role`, async () => {
    authStore.setState({ user: { ...authStore.getState().user!, role } });
    await act(async () => {
      renderer = create(
        <MemoryRouter>
          <Sidebar
            testRoomsEnabled={false}
            onRules={() => {}}
            onSettings={() => {}}
            onTestRoom={() => {}}
            onNavigate={() => {}}
          />
        </MemoryRouter>,
      );
    });
    assert.equal(renderer!.root.findAllByProps({ to: "/admin" }).length, role === "USER" ? 0 : 1);
  });
test("moderator overview renders only actual summary counts", async () => {
  authStore.setState({ user: { ...authStore.getState().user!, role: "MODERATOR" } });
  await mount();
  assert.match(text(), /1,248/);
  assert.match(text(), /2,180/);
  assert.match(text(), /1,500/);
  assert.match(text(), /Recent activity/);
  assert.doesNotMatch(text(), /growth|system health|%/);
});
test("user URL state restores pagination, role, lowercase status; filter resets page", async () => {
  await mount("/admin/users?page=2&role=USER&status=blocked&search=max");
  assert.deepEqual(calls[0], {
    page: 2,
    limit: 20,
    order: "desc",
    search: "max",
    role: "USER",
    status: "BLOCKED",
    sort: "createdAt",
  });
  await act(async () => select("Role").props.onChange({ target: { value: "MODERATOR" } }));
  assert.equal(calls[calls.length - 1]?.page, 1);
  assert.equal(calls[calls.length - 1]?.role, "MODERATOR");
  await act(async () => button(translate("matches.next")).props.onClick());
  assert.equal(calls[calls.length - 1]?.page, 2);
});
test("user loading, empty and domain error states retain table headings", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof adminApi.users>>) => void;
  adminApi.users = () =>
    new Promise((done) => {
      resolve = done;
    }) as ReturnType<typeof adminApi.users>;
  await mount("/admin/users");
  assert.match(text(), /Loading records/);
  assert.equal(renderer!.root.findAllByType("th").length, 5);
  await act(async () => resolve(fixturePage([])));
  assert.match(text(), /No users match/);
  adminApi.users = async () => {
    throw new ApiError("NETWORK_ERROR");
  };
  await act(async () => navigate("/admin/users?role=ADMIN"));
  assert.match(text(), /Unable to reach the server/);
});
for (const targetRole of ["USER", "MODERATOR", "ADMIN"] as const)
  test(`moderator viewing ${targetRole} gets permitted actions`, async () => {
    authStore.setState({ user: { ...authStore.getState().user!, role: "MODERATOR" } });
    adminApi.user = async () => ({ ...fixtureUser, role: targetRole });
    await mount(`/admin/users/${fixtureUser.id}`);
    assert.equal(!!button("Block user"), targetRole === "USER");
    assert.equal(!!button("Change role"), false);
  });
test("user detail reuses canonical emblems and never renders unexpected secret fields", async () => {
  adminApi.user = async () =>
    ({
      ...fixtureUser,
      passwordHash: "SECRET_VALUE",
      refreshToken: "TOKEN_VALUE",
    }) as AdminUserDetail;
  await mount(`/admin/users/${fixtureUser.id}`);
  assert.match(text(), /Black Moon/);
  assert.match(text(), /Half/);
  assert.match(text(), /Destiny/);
  assert.equal(renderer!.root.findAllByProps({ "data-testid": "rank-emblem" }).length, 3);
  assert.doesNotMatch(text(), /SECRET_VALUE|TOKEN_VALUE|passwordHash|refreshToken/);
  assert.match(text(), /11111111/);
  assert.equal(
    renderer!.root.findAllByProps({ to: `/admin/matches?participant=${fixtureUser.id}` }).length,
    1,
  );
});
test("block confirmation sends reason and applies only the server-confirmed account", async () => {
  let mutation = 0,
    reason = "";
  adminApi.block = async (_id, input) => {
    mutation++;
    reason = input;
    return {
      ...fixtureUser,
      blocked: true,
      blockedReason: input,
      blockedAt: fixtureUser.updatedAt,
    };
  };
  await mount(`/admin/users/${fixtureUser.id}`);
  await act(async () => button("Block user").props.onClick());
  assert.equal(mutation, 0);
  assert.match(text(), /Block Max/);
  await act(async () =>
    renderer!.root.findByType("textarea").props.onChange({ target: { value: "  harassment  " } }),
  );
  await act(async () => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(reason, "harassment");
  assert.equal(mutation, 1);
  assert.match(text(), /Account blocked/);
  assert.ok(button("Unblock user"));
});
test("block policy failure keeps account active and displays controlled error", async () => {
  adminApi.block = async () => {
    throw new ApiError("INSUFFICIENT_TARGET_ROLE", 403);
  };
  await mount(`/admin/users/${fixtureUser.id}`);
  await act(async () => button("Block user").props.onClick());
  await act(async () => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.match(text(), /You cannot moderate/);
  assert.doesNotMatch(text(), /Account blocked/);
  assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 1);
});
test("unblock requires confirmation and restores Active after server success", async () => {
  adminApi.user = async () => ({ ...fixtureUser, blocked: true, blockedAt: fixtureUser.updatedAt });
  await mount(`/admin/users/${fixtureUser.id}`);
  await act(async () => button("Unblock user").props.onClick());
  await act(async () => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.match(text(), /Account unblocked/);
  assert.ok(button("Block user"));
});
test("role confirmation updates role and last-admin rejection is understandable", async () => {
  await mount(`/admin/users/${fixtureUser.id}`);
  await act(async () => button("Change role").props.onClick());
  await act(async () => select("New role").props.onChange({ target: { value: "MODERATOR" } }));
  await act(async () => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.match(text(), /Role updated/);
  adminApi.changeRole = async () => {
    throw new ApiError("LAST_ADMIN_PROTECTED", 409);
  };
  await act(async () => button("Change role").props.onClick());
  await act(async () => select("New role").props.onChange({ target: { value: "USER" } }));
  await act(async () => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.match(text(), /last active administrator cannot be demoted/);
});
test("match URL filters reach backend and mode aliases survive filter changes", async () => {
  await mount(
    `/admin/matches?page=2&mode=CLASSIC&type=RATED&participant=${fixtureUser.id}&status=FINISHED`,
  );
  assert.equal(calls[0].participantUserId, fixtureUser.id);
  assert.equal(calls[0].gameMode, "classic");
  assert.equal(calls[0].matchType, "RATED");
  await act(async () => select("Status").props.onChange({ target: { value: "WAITING" } }));
  assert.equal(calls[calls.length - 1]?.gameMode, "classic");
  assert.equal(calls[calls.length - 1]?.page, 1);
});
test("match inspection shows names, snapshot metadata and paginated read-only action payload", async () => {
  await mount(`/admin/matches/${fixtureMatch.matchId}`);
  assert.match(text(), /Night Games/);
  assert.match(text(), /Polina/);
  assert.match(text(), /Recorded actions/);
  assert.match(text(), /Snapshots/);
  assert.match(text(), /knight/);
  assert.equal(renderer!.root.findAllByType("textarea").length, 0);
  assert.doesNotMatch(text(), /Force win|Inject|Edit action|Delete action/);
  assert.equal(calls[0].order, "asc");
  await act(async () => button(translate("matches.next")).props.onClick());
  assert.equal(calls[calls.length - 1]?.page, 2);
  await act(async () => select("Order").props.onChange({ target: { value: "desc" } }));
  assert.equal(calls[calls.length - 1]?.order, "desc");
  assert.equal(calls[calls.length - 1]?.page, 1);
});
test("late responses cannot overwrite a newer filtered page", async () => {
  let resolve!: (value: ReturnType<typeof fixturePage<typeof fixtureUser>>) => void;
  adminApi.users = (query) =>
    query.role === "USER"
      ? new Promise((done) => {
          resolve = done;
        })
      : Promise.resolve(fixturePage([{ ...fixtureUser, displayName: "Latest record" }]));
  await mount("/admin/users?role=USER");
  await act(async () => navigate("/admin/users?role=ADMIN"));
  await act(async () => resolve(fixturePage([{ ...fixtureUser, displayName: "Stale record" }])));
  assert.match(text(), /Latest record/);
  assert.doesNotMatch(text(), /Stale record/);
});
