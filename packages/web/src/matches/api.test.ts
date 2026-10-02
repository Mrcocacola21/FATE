import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "../api/client";
import { createMatchApi, parseMatchDetails, parseMatchHistory } from "../api/matchApi";
import { readHistoryFilters } from "./MatchHistoryFilters";
import { formatDuration, modeLabel } from "./presentation";
import { translate, setLanguage } from "../i18n";

const metadata = {
  id: "id",
  status: "FINISHED",
  gameMode: "classic",
  createdAt: "2026-01-01T00:00:00Z",
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  finishReason: null,
  finalRevision: null,
  turnCount: null,
};
const item = { ...metadata, result: "WIN", seat: "P1", opponent: null };
const history = { items: [item], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } };

test("history and details decoders validate responses and remove unexpected private fields", () => {
  const parsed = parseMatchHistory({
    ...history,
    secret: "private",
    items: [{ ...item, passwordHash: "private" }],
  });
  assert.equal(parsed.items[0].durationMs, null);
  assert.equal(parsed.items[0].opponent, null);
  assert.doesNotMatch(JSON.stringify(parsed), /secret|passwordHash|private/);
  const identity = { userId: null, seat: "P1", displayName: "Old Name" };
  const detail = parseMatchDetails({
    ...metadata,
    winner: null,
    loser: null,
    participants: [{ ...identity, outcome: null, resultData: { secret: "hidden" } }],
  });
  assert.equal(detail.participants[0].username, null);
  assert.doesNotMatch(JSON.stringify(detail), /resultData|hidden/);
  for (const invalid of [
    null,
    {},
    { ...history, items: [{ ...item, result: "banana" }] },
    { ...history, items: [{ ...item, durationMs: -1 }] },
    { ...history, pagination: { ...history.pagination, page: 0 } },
    { ...history, items: [{ ...item, createdAt: "invalid-date" }] },
  ])
    assert.throws(() => parseMatchHistory(invalid), /INVALID_RESPONSE/);
});

test("public match API sends bounded pagination and combined filters to correct endpoints", async () => {
  const paths: string[] = [];
  const api = createMatchApi(
    createApiClient("http://localhost", async (path) => {
      paths.push(String(path));
      const data = String(path).includes("/users/")
        ? history
        : { ...metadata, winner: null, loser: null, participants: [] };
      return new Response(JSON.stringify(data), { status: 200 });
    }),
  );
  await api.getUserMatches("user-id", { page: 2, limit: 20, result: "WIN", gameMode: "classic" });
  await api.getMatchDetails("match-id");
  assert.equal(
    paths[0],
    "http://localhost/api/users/user-id/matches?page=2&limit=20&result=WIN&gameMode=classic",
  );
  assert.equal(paths[1], "http://localhost/api/matches/match-id");
});

test("URL parser rejects invalid filters, duplicate parameters and unsupported modes", () => {
  for (const query of [
    "page=-1",
    "page=1.2",
    "page=1e2",
    "page=21474837",
    "limit=101",
    "result=banana",
    "gameMode=test",
    "status=CANCELLED",
    "page=1&page=2",
  ])
    assert.equal(readHistoryFilters(new URLSearchParams(query)), null, query);
  assert.deepEqual(readHistoryFilters(new URLSearchParams("result=DRAW&gameMode=draft&page=2")), {
    page: 2,
    limit: 20,
    result: "DRAW",
    gameMode: "draft",
  });
  setLanguage("en", null);
  assert.equal(formatDuration(0, translate), "0m 00s");
  assert.equal(formatDuration(null, translate), "Not available");
  assert.equal(modeLabel("legacy-mode", translate), "legacy-mode");
});
