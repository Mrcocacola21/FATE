import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import type { PlayerView } from "rules";
import { VfxLayer, vfxAnchor } from "./VfxLayer";
import { spritePlayback } from "./VfxSprite";
import { BOARD_LAYERS, vfxRegistry } from "./vfxRegistry";
import { areaToBoardRect, cellToBoardPoint, cellToBoardRect, rayToBoardEdge } from "./vfxGeometry";
import { enqueueBoardVfx, pruneExpiredBoardVfx, rememberProcessedVfxRequests } from "./vfxQueue";
import {
  createRuntimePreviewRequest,
  CORE_VFX_PREVIEW_IDS,
  VFX_PREVIEW_ANCHORS,
} from "./vfxPreviewScenarios";
import { PresentationSession } from "../../game/effects/presentationSession";
import type { QueuedBoardVfxRequest } from "./vfxTypes";

const view = { units: { target: { position: { col: 7, row: 6 } } } } as unknown as PlayerView;
function queued(effectId: QueuedBoardVfxRequest["effectId"]): QueuedBoardVfxRequest {
  return enqueueBoardVfx({
    current: [],
    incoming: [
      createRuntimePreviewRequest({
        id: "test:cue",
        effectId,
        anchor: "center",
        ray: "horizontal",
      }),
    ],
    now: 1000,
  })[0];
}
function render(
  effect: QueuedBoardVfxRequest,
  cellSize = 40,
  isFlipped = false,
  reducedMotion = false,
) {
  return renderToStaticMarkup(
    <VfxLayer
      effects={[effect]}
      view={view}
      boardSize={9}
      cellSize={cellSize}
      isFlipped={isFlipped}
      reducedMotion={reducedMotion}
    />,
  );
}

test("every registered PNG exists and horizontal dimensions agree with source frame metadata", () => {
  for (const definition of Object.values(vfxRegistry))
    for (const art of definition.layers ?? [definition]) {
      if (!art.asset) continue;
      const bytes = readFileSync(new URL(art.asset));
      assert.equal(bytes.toString("ascii", 1, 4), "PNG");
      if (!art.frameWidth) continue;
      assert.equal(bytes.readUInt32BE(16), art.frameWidth * (art.frames ?? 1), definition.id);
      assert.equal(bytes.readUInt32BE(20), art.frameHeight, definition.id);
    }
});

test("strip playback advances exactly one frame per step and holds the final frame", () => {
  for (const id of ["combatHit", "doraImpact", "carpetImpact", "gasterBeam"] as const) {
    const definition = vfxRegistry[id],
      count = definition.frames!;
    const playback = spritePlayback(definition, definition.durationMs);
    assert.equal(playback.frames, count);
    assert.equal(playback.style.backgroundSize, `${count * 100}% 100%`);
    assert.equal(playback.style.animationTimingFunction, `steps(${count - 1}, end)`);
    assert.equal(playback.style.animationIterationCount, 1);
    assert.equal(playback.style.backgroundPositionX, "100%");
    assert.equal(
      playback.steppingDurationMs + definition.durationMs / count,
      definition.durationMs,
    );
    const indexes = Array.from({ length: count }, (_, frame) => {
      const elapsed = ((frame + 0.5) * definition.durationMs) / count;
      return Math.min(count - 1, Math.floor((elapsed / playback.steppingDurationMs) * (count - 1)));
    });
    assert.deepEqual(
      indexes,
      Array.from({ length: count }, (_, i) => i),
    );
  }
});

test("optional inclusive slices retain full sheet sizing and play only the requested range", () => {
  const playback = spritePlayback({ ...vfxRegistry.fireball, startFrame: 3, endFrame: 8 }, 300);
  assert.equal(playback.count, 6);
  assert.equal(playback.fps, 20);
  assert.equal(playback.style.backgroundSize, "1700% 100%");
  assert.equal(playback.style.animationTimingFunction, "steps(5, end)");
  assert.equal(playback.style.backgroundPositionX, "50%");
});

test("composite is one cue with aligned timing, explicit local order and atomic cleanup", () => {
  const effect = queued("doraImpact");
  const html = render(effect);
  assert.equal((html.match(/data-vfx-cue="test:cue"/g) ?? []).length, 1);
  assert.equal((html.match(/data-vfx-frames="28"/g) ?? []).length, 2);
  assert.match(html, /z-index:0/);
  assert.match(html, /z-index:1/);
  assert.equal((html.match(/animation-duration:1108.9285714285713ms/g) ?? []).length, 2);
  assert.equal(pruneExpiredBoardVfx([effect], effect.expiresAt - 1).length, 1);
  assert.equal(pruneExpiredBoardVfx([effect], effect.expiresAt).length, 0);
  const processed = new Set<string>();
  rememberProcessedVfxRequests(processed, [effect]);
  assert.equal(
    enqueueBoardVfx({ current: [], incoming: [effect], now: 2000, processedIds: processed }).length,
    0,
  );
  for (const composition of ["primary", "accent"] as const) {
    assert.equal((render({ ...effect, composition }).match(/data-vfx-frames/g) ?? []).length, 1);
  }
});

test("resize preserves cue identity, start time and frame delay on the mounted instance", () => {
  const effect = queued("doraImpact");
  const props = {
    effects: [effect],
    view,
    boardSize: 9,
    cellSize: 40,
    isFlipped: false,
    reducedMotion: false,
  };
  const tree = create(<VfxLayer {...props} />);
  const wrapper = () => tree.root.findByProps({ "data-vfx-cue": effect.id });
  const delay = wrapper().props.style.animationDelay;
  act(() => tree.update(<VfxLayer {...props} cellSize={60} isFlipped />));
  assert.equal(wrapper().props.style.width, 180);
  assert.equal(wrapper().props.style.animationDelay, delay);
  assert.equal(wrapper().props["data-vfx-start"], effect.startedAt);
  act(() => tree.unmount());
});

test("cell centers, corners and asymmetric edges obey P1 and P2 orientation", () => {
  for (const [coord, p1, p2] of [
    [
      { col: 4, row: 4 },
      { x: 45, y: 45 },
      { x: 45, y: 45 },
    ],
    [
      { col: 0, row: 0 },
      { x: 5, y: 85 },
      { x: 85, y: 5 },
    ],
    [
      { col: 0, row: 2 },
      { x: 5, y: 65 },
      { x: 85, y: 25 },
    ],
    [
      { col: 2, row: 7 },
      { x: 25, y: 15 },
      { x: 65, y: 75 },
    ],
  ] as const) {
    assert.deepEqual(cellToBoardPoint(coord, 9, 10, false), p1);
    assert.deepEqual(cellToBoardPoint(coord, 9, 10, true), p2);
    const rect = cellToBoardRect(coord, 9, 10, true);
    assert.deepEqual(rect, { left: p2.x - 5, top: p2.y - 5, width: 10, height: 10 });
  }
});

for (const size of [1, 3, 5])
  test(`${size}x${size} footprints keep full size at all edges for either orientation`, () => {
    for (const anchor of Object.values(VFX_PREVIEW_ANCHORS))
      for (const flipped of [false, true]) {
        const rect = areaToBoardRect(anchor, size, size, 9, 40, flipped);
        assert.equal(rect.width, size * 40);
        assert.equal(rect.height, size * 40);
      }
    assert.deepEqual(areaToBoardRect({ col: 0, row: 0 }, size, size, 9, 10, false), {
      left: 5 - size * 5,
      top: 85 - size * 5,
      width: size * 10,
      height: size * 10,
    });
  });

test("area rendering uses full logical size and board root clipping, including 5x5 corner", () => {
  for (const [id, size] of [
    ["doraImpact", 3],
    ["carpetImpact", 5],
  ] as const) {
    const html = render({
      ...queued(id),
      sourceCell: { col: 0, row: 0 },
      cells: [{ col: 0, row: 0 }],
    });
    assert.match(html, new RegExp(`width:${size * 40}px;height:${size * 40}px`));
    assert.match(html, /overflow-hidden/);
    assert.doesNotMatch(html, /vfx-area/);
  }
});

test("cardinal and diagonal rays terminate at literal boundaries for both orientations", () => {
  const source = { col: 1, row: 2 };
  for (const direction of [
    { col: 1, row: 0 },
    { col: 0, row: 1 },
    { col: 1, row: 1 },
    { col: -1, row: -1 },
  ]) {
    const one = rayToBoardEdge(source, direction, 9, 10, false)!;
    const two = rayToBoardEdge(source, direction, 9, 10, true)!;
    for (const ray of [one, two]) {
      const x = ray.left + ray.width * Math.cos((ray.angleDeg * Math.PI) / 180);
      const y = ray.top + ray.width * Math.sin((ray.angleDeg * Math.PI) / 180);
      assert.ok([x, y].some((value) => Math.abs(value) < 1e-8 || Math.abs(value - 90) < 1e-8));
    }
    assert.equal(one.width, two.width);
    assert.ok(Math.abs(Math.abs(one.angleDeg - two.angleDeg) - 180) < 1e-8);
  }
  assert.equal(rayToBoardEdge(source, { col: 0, row: 0 }, 9, 10, false), null);
});

test("ray strip uses one coherent animated artwork with cell-relative thickness", () => {
  const effect = queued("gasterBeam");
  assert.match(render(effect, 40), /height:14px/);
  assert.match(render(effect, 80), /height:28px/);
  assert.equal((render(effect).match(/data-vfx-frames="20"/g) ?? []).length, 2);
  assert.doesNotMatch(render(effect), /background-repeat:repeat/);
});

test("projectile capability has source, target, rotation, travel and sprite scaling", () => {
  const html = render(queued("fireball"));
  assert.match(html, /vfx-projectile-axis/);
  assert.match(html, /rotate\(-33.690067525979785deg\)/);
  assert.match(html, /--vfx-travel:288.44410203711914px/);
  assert.match(html, /width:26px;height:26px/);
});

test("one-shot unit impacts stay on event cell; status follow is explicit and skips invisible units", () => {
  const effect = { ...queued("bunkerStatus"), unitId: "target", sourceCell: { col: 1, row: 1 } };
  assert.deepEqual(vfxAnchor(view, effect), { col: 1, row: 1 });
  assert.deepEqual(vfxAnchor(view, { ...effect, anchorMode: "followUnit" }), { col: 7, row: 6 });
  assert.equal(vfxAnchor(view, { ...effect, sourceCell: undefined }), null);
  assert.equal(vfxAnchor(view, { ...effect, anchorMode: "followUnit", unitId: "hidden" }), null);
});

test("queue snapshots caller coordinates so later mutation cannot move a historical cue", () => {
  const request = createRuntimePreviewRequest({
    id: "event:frozen",
    effectId: "combatHit",
    anchor: "left",
    ray: "horizontal",
  });
  const effect = enqueueBoardVfx({ current: [], incoming: [request], now: 1000 })[0];
  request.sourceCell!.col = 7;
  assert.deepEqual(effect.sourceCell, { col: 0, row: 4 });
});

test("decorations are pointer transparent and tactical decision layers stay above impacts", () => {
  assert.match(render(queued("doraImpact")), /pointer-events:none/);
  assert.ok(BOARD_LAYERS.ground < BOARD_LAYERS.unit);
  assert.ok(BOARD_LAYERS.unit < BOARD_LAYERS.status);
  assert.ok(BOARD_LAYERS.projectile < BOARD_LAYERS.impact);
  assert.ok(BOARD_LAYERS.impact < BOARD_LAYERS.outcome);
  assert.ok(BOARD_LAYERS.outcome < BOARD_LAYERS.decision);
});

test("reduced motion uses a meaningful middle frame, stable geometry and no strip playback", () => {
  const art = vfxRegistry.doraImpact;
  const style = spritePlayback(art, art.durationMs, true).style;
  assert.equal(style.animationName, "none");
  assert.notEqual(style.backgroundPositionX, "0%");
  assert.match(render(queued("doraImpact"), 40, false, true), /width:120px;height:120px/);
  assert.match(render(queued("doraImpact"), 40, false, true), /animation-name:none/);
});

test("runtime preview replay restarts both layers without changing live session identity", () => {
  const session = new PresentationSession();
  session.begin({ roomId: "live", recipient: "P1" });
  session.snapshot({ roomId: "live", recipient: "P1", streamId: "stream", revision: 40 });
  const before = [
    session.key,
    session.streamId,
    session.baselineRevision,
    session.highestReceivedRevision,
    session.recentEventCount,
  ];
  for (const id of CORE_VFX_PREVIEW_IDS) {
    for (let replay = 0; replay < 2; replay++) {
      const request = createRuntimePreviewRequest({
        id: `debug:${id}:${replay}`,
        effectId: id,
        anchor: "corner",
        ray: "diagonal",
      });
      assert.equal("eventId" in request || "revision" in request || "streamId" in request, false);
      const effects = enqueueBoardVfx({
        current: [],
        incoming: [request],
        now: 5000 + replay * 2000,
      });
      assert.equal(effects.length, 1);
      assert.equal(effects[0].startedAt, 5000 + replay * 2000);
      for (const art of vfxRegistry[id].layers ?? [vfxRegistry[id]]) {
        if (art.assetType === "spriteStrip")
          assert.equal(
            spritePlayback(art, vfxRegistry[id].durationMs).style[
              "--vfx-frame-start" as keyof React.CSSProperties
            ],
            "0%",
          );
      }
    }
  }
  assert.deepEqual(
    [
      session.key,
      session.streamId,
      session.baselineRevision,
      session.highestReceivedRevision,
      session.recentEventCount,
    ],
    before,
  );
});
