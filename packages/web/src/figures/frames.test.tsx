import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FRAME_ART, FRAME_IDS, isFrameId, loadFrameChoice, saveFrameChoice } from "./frames";
import { FramePicker } from "./FramePicker";

function withStorage(run: () => void) {
  const store = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
  try {
    run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

test("a chosen frame is remembered and anything unknown falls back to no frame", () => {
  withStorage(() => {
    assert.equal(loadFrameChoice(), null);
    saveFrameChoice("blood-iron");
    assert.equal(loadFrameChoice(), "blood-iron");
    saveFrameChoice(null);
    assert.equal(loadFrameChoice(), null);
    localStorage.setItem("FATE_FIGURE_FRAME_V1", "golden-dragon");
    assert.equal(loadFrameChoice(), null);
  });
  assert(!isFrameId("golden-dragon"));
  for (const frame of FRAME_IDS) assert(FRAME_ART[frame].endsWith(`${frame}.webp`), frame);
});

test("the frame tab offers no frame plus every frame, each previewed on the same figure", () => {
  const html = renderToStaticMarkup(<FramePicker previewHeroId="guts" />);
  assert.match(html, /data-testid="frame-none"/);
  for (const frame of FRAME_IDS) {
    assert.match(html, new RegExp(`data-testid="frame-${frame}"`), frame);
    assert(html.includes(FRAME_ART[frame]), frame);
  }
  assert.equal((html.match(/arch\/guts\.webp/g) ?? []).length, FRAME_IDS.length + 1);
});

test("the battle board dresses each seat in the frame the room reports, and replays parse it", async () => {
  const { Board } = await import("../components/Board");
  const { createPersistentStatusPreview } = await import("../features/vfx/persistentStatusPreview");
  const { parseReplayMetadata } = await import("../api/replayApi");
  const view = createPersistentStatusPreview("statuses", "P1");
  const owners = new Set(Object.values(view.units).map((unit) => unit.owner));
  assert(owners.has("P1") && owners.has("P2"), "the fixture has figures on both sides");
  const render = (playerFrames?: { P1: string | null; P2: string | null }) =>
    renderToStaticMarkup(
      <Board
        view={view}
        playerId="P1"
        selectedUnitId={null}
        highlightedCells={{}}
        playerFrames={playerFrames}
        onSelectUnit={() => undefined}
        onCellClick={() => undefined}
      />,
    );
  const framesOf = (html: string, owner: string) =>
    [
      ...html.matchAll(
        /class="[^"]*\bunit-token\b[^"]*"[^>]*?data-owner="(P1|P2)"(?: data-frame="([a-z-]+)")?/g,
      ),
    ]
      .filter((match) => match[1] === owner)
      .map((match) => match[2] ?? null);
  const both = render({ P1: "arcane", P2: "moon-gold" });
  assert(framesOf(both, "P1").length > 0 && framesOf(both, "P2").length > 0);
  assert(framesOf(both, "P1").every((frame) => frame === "arcane"));
  assert(
    framesOf(both, "P2").every((frame) => frame === "moon-gold"),
    "the opponent's frame shows",
  );
  const unknown = render({ P1: "golden-dragon", P2: null });
  assert(
    framesOf(unknown, "P1").every((frame) => frame === null),
    "an unknown frame wears none",
  );
  assert(framesOf(unknown, "P2").every((frame) => frame === null));

  const participant = (seat: "P1" | "P2", figureFrame: unknown) => ({
    seat,
    userId: null,
    displayName: seat,
    username: null,
    avatarUrl: null,
    figureFrame,
    outcome: null,
  });
  const metadata = parseReplayMetadata({
    matchId: "m",
    status: "FINISHED",
    gameMode: "classic",
    matchType: "CASUAL",
    initialRevision: 0,
    finalRevision: 1,
    participants: [participant("P1", "blood-iron"), participant("P2", "nope")],
    winnerSeat: null,
    finishReason: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    timeline: [
      { revision: 1, actorSeat: "P1", actionType: "endTurn", createdAt: "2026-01-01T00:00:00Z" },
    ],
    draft: null,
  });
  assert.deepEqual(
    metadata.participants.map((p) => p.figureFrame),
    ["blood-iron", null],
  );
});
