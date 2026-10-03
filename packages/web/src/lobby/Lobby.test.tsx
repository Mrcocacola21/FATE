import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter } from "react-router";
import { Lobby } from "../components/Lobby";
import { useGameStore } from "../store";
import { authStore } from "../auth/authStore";
import { setLanguage } from "../i18n";
import type { RoomSummary } from "../api";

const initialGame = useGameStore.getState();
const initialAuth = authStore.getState();
function mount(rooms: RoomSummary[] = [], authenticated = true) {
  useGameStore.setState(
    { ...initialGame, roomsList: rooms, fetchRooms: async () => undefined },
    true,
  );
  authStore.setState(
    { ...initialAuth, status: authenticated ? "authenticated" : "unauthenticated" },
    true,
  );
  setLanguage("en", null);
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <MemoryRouter>
        <Lobby />
      </MemoryRouter>,
    );
  });
  return renderer;
}
function cleanup(renderer: ReactTestRenderer) {
  act(() => renderer.unmount());
  useGameStore.setState(initialGame, true);
  authStore.setState(initialAuth, true);
}
function open(renderer: ReactTestRenderer, id: string) {
  act(() => renderer.root.findByProps({ "data-testid": id }).props.onClick());
}
async function submit(renderer: ReactTestRenderer) {
  await act(async () => {
    await renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
  });
}

test("Play is focused on actions/rooms; forms appear only in their dialogs", () => {
  const renderer = mount();
  try {
    assert.equal(renderer.root.findAllByType("form").length, 0);
    assert.equal(renderer.root.findAllByType("nav").length, 0);
    assert.equal(renderer.root.findAllByType("input").length, 0);
    assert(renderer.root.findByProps({ "data-testid": "room-browser" }));
    open(renderer, "create-room");
    assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 1);
    assert.equal(renderer.root.findAllByProps({ id: "player-name" }).length, 0);
    act(() => renderer.root.findByProps({ "aria-label": "Close" }).props.onClick());
    act(() => useGameStore.setState({ roomsList: [{ id: "room-42", phase: "lobby", players: { P1: false, P2: false }, ready: { P1: false, P2: false }, createdAt: 0, spectators: 0, canStart: false, roomMode: "normal", gameMode: "standard", matchType: "RATED" }] }));
    open(renderer, "join-by-id");
    assert(renderer.root.findByProps({ id: "room-id" }));
    assert(renderer.root.findByProps({ id: "lobby-role" }));
  } finally {
    cleanup(renderer);
  }
});

test("Casual is the default; Rated has a clear description and sends explicit intent", async () => {
  const renderer = mount();
  const requests: unknown[] = [];
  useGameStore.setState({ joinRoom: async (params) => { requests.push(params); } });
  try {
    open(renderer, "create-room");
    const casual = renderer.root.findByProps({ type: "radio", value: "CASUAL" });
    const rated = renderer.root.findByProps({ type: "radio", value: "RATED" });
    assert.equal(casual.props.checked, true);
    assert.equal(rated.props.checked, false);
    assert.match(JSON.stringify(renderer.toJSON()), /competitive rating is not affected/);
    assert.match(JSON.stringify(renderer.toJSON()), /Glicko-2/);
    act(() => rated.props.onChange());
    assert.equal(renderer.root.findByProps({ type: "radio", value: "RATED" }).props.checked, true);
    await submit(renderer);
    assert.equal((requests[0] as { matchType: string }).matchType, "RATED");
  } finally { cleanup(renderer); }
});

test("unauthenticated creator sees the Rated authentication requirement", () => {
  const renderer = mount([], false);
  try {
    open(renderer, "create-room");
    assert.equal(renderer.root.findByProps({ type: "radio", value: "RATED" }).props.disabled, true);
    assert.match(JSON.stringify(renderer.toJSON()), /Rated matches require authenticated players/);
  } finally { cleanup(renderer); }
});

test("create/join submit existing semantics and only spectators provide temporary names", async () => {
  const renderer = mount();
  const joins: unknown[] = [];
  useGameStore.setState({
    joinRoom: async (params) => {
      joins.push(params);
    },
  });
  try {
    open(renderer, "create-room");
    await submit(renderer);
    assert.deepEqual(joins[0], { mode: "create", role: "P1", name: undefined, matchType: "CASUAL" });
    act(() => renderer.root.findByProps({ "aria-label": "Close" }).props.onClick());
    act(() => useGameStore.setState({ roomsList: [{ id: "room-42", phase: "lobby", players: { P1: false, P2: false }, ready: { P1: false, P2: false }, createdAt: 0, spectators: 0, canStart: false, roomMode: "normal", gameMode: "standard", matchType: "RATED" }] }));
    open(renderer, "join-by-id");
    act(() =>
      renderer.root
        .findByProps({ id: "room-id" })
        .props.onChange({ target: { value: " room-42 " } }),
    );
    act(() =>
      renderer.root.findByProps({ id: "lobby-role" }).props.onChange({ target: { value: "P2" } }),
    );
    assert.equal(renderer.root.findAllByProps({ id: "player-name" }).length, 0);
    await submit(renderer);
    assert.deepEqual(joins[1], { mode: "join", roomId: "room-42", role: "P2", name: undefined });
    act(() =>
      renderer.root
        .findByProps({ id: "lobby-role" })
        .props.onChange({ target: { value: "spectator" } }),
    );
    act(() =>
      renderer.root
        .findByProps({ id: "player-name" })
        .props.onChange({ target: { value: " Observer " } }),
    );
    await submit(renderer);
    assert.deepEqual(joins[2], {
      mode: "join",
      roomId: "room-42",
      role: "spectator",
      name: "Observer",
    });
  } finally {
    cleanup(renderer);
  }
});

test("room browser preserves seats, defaults full rooms to spectator, and displays asynchronous join errors inside dialog", async () => {
  const room: RoomSummary = {
    id: "occupied-room",
    createdAt: 0,
    phase: "battle",
    players: { P1: true, P2: true },
    ready: { P1: true, P2: true },
    spectators: 0,
    canStart: false,
    roomMode: "normal",
    matchType: "CASUAL",
    gameMode: "standard",
  };
  const renderer = mount([room], false);
  try {
    const spectate = renderer.root
      .findAllByType("button")
      .find((node) => node.children.includes("Spectate"));
    assert(spectate);
    act(() => spectate.props.onClick());
    assert.equal(renderer.root.findByProps({ id: "lobby-role" }).props.value, "spectator");
    assert.equal(
      renderer.root.findAllByType("option").filter((node) => node.props.disabled).length,
      2,
    );
    act(() => useGameStore.setState({ joinError: "Room not found" }));
    assert(renderer.root.findByProps({ role: "dialog" }).findByProps({ role: "alert" }));
    assert.match(JSON.stringify(renderer.toJSON()), /Room not found/);
  } finally {
    cleanup(renderer);
  }
});
