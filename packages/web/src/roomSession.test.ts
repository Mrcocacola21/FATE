import assert from "node:assert/strict";
import test from "node:test";
import { clearRoomSession, loadRoomSession, saveRoomSession } from "./roomSession";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

test("room resume identity survives a page reload", () => {
  const storage = memoryStorage();
  saveRoomSession({ roomId: "room-1", role: "P2", seat: "P2", resumeToken: "resume-2" }, storage);
  assert.deepEqual(loadRoomSession(storage), {
    roomId: "room-1",
    role: "P2",
    seat: "P2",
    resumeToken: "resume-2",
  });
  clearRoomSession(storage);
  assert.equal(loadRoomSession(storage), null);
});

test("invalid persisted room data is ignored", () => {
  const storage = memoryStorage();
  storage.setItem("fate.room-session.v1", JSON.stringify({ roomId: "room-1", role: "player2" }));
  assert.equal(loadRoomSession(storage), null);
});

test("unavailable browser storage never blocks room state handling", () => {
  const storage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(loadRoomSession(storage), null);
  assert.doesNotThrow(() =>
    saveRoomSession({ roomId: "room-1", role: "P2", seat: "P2", resumeToken: "resume-2" }, storage),
  );
  assert.doesNotThrow(() => clearRoomSession(storage));
});
