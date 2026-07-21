import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlayerView } from "rules";
import { VfxLayer } from "./VfxLayer";
import type { QueuedBoardVfxRequest } from "./vfxTypes";

function view(): PlayerView {
  return {
    boardSize: 9,
    units: {
      target: {
        id: "target",
        owner: "P1",
        class: "berserker",
        hp: 5,
        attack: 2,
        position: { col: 4, row: 4 },
        isStealthed: false,
        stealthTurnsLeft: 0,
        stealthAttemptedThisTurn: false,
        turn: {
          moveUsed: false,
          attackUsed: false,
          actionUsed: false,
          stealthUsed: false,
        },
        charges: {},
        cooldowns: {},
        hasMovedThisTurn: false,
        hasAttackedThisTurn: false,
        hasActedThisTurn: false,
        isAlive: true,
      },
    },
  } as unknown as PlayerView;
}

test("VFX overlay is non-interactive and hidden from accessibility tree", () => {
  const html = renderToStaticMarkup(
    <VfxLayer
      effects={[]}
      view={view()}
      boardSize={9}
      cellSize={10}
      isFlipped={false}
      reducedMotion={false}
    />,
  );

  assert.match(html, /pointer-events-none/);
  assert.match(html, /overflow-hidden/);
  assert.match(html, /aria-hidden="true"/);
});

test("unit-attached VFX follow the current visible unit coordinate", () => {
  const effects: QueuedBoardVfxRequest[] = [
    {
      id: "effect-1",
      effectId: "muzzle",
      placement: "unit",
      unitId: "target",
      sourceCell: { col: 1, row: 1 },
      startedAt: Date.now(),
      expiresAt: Date.now() + 400,
    },
  ];

  const html = renderToStaticMarkup(
    <VfxLayer
      effects={effects}
      view={view()}
      boardSize={9}
      cellSize={10}
      isFlipped={false}
      reducedMotion={false}
    />,
  );

  assert.match(html, /left:40px/);
  assert.match(html, /top:40px/);
  assert.doesNotMatch(html, /top:70px/);
});

test("portal VFX stays centered on its target cell and scales from cell size", () => {
  const now = Date.now();
  const effects: QueuedBoardVfxRequest[] = [
    {
      id: "portal-1",
      effectId: "portal",
      placement: "cell",
      sourceCell: { col: 4, row: 4 },
      startedAt: now,
      expiresAt: now + 820,
    },
  ];

  const html = renderToStaticMarkup(
    <VfxLayer
      effects={effects}
      view={view()}
      boardSize={9}
      cellSize={40}
      isFlipped={false}
      reducedMotion={false}
    />,
  );

  assert.match(html, /data-portal-effect="portal"/);
  assert.match(html, /left:150px;top:150px;width:60px;height:60px/);
  assert.doesNotMatch(html, /background-image/);
});

test("procedural portal paths render only fixed source and destination portals", () => {
  const now = Date.now();
  const effects: QueuedBoardVfxRequest[] = [
    {
      id: "portal-path",
      effectId: "tralala",
      placement: "path",
      path: [
        { col: 1, row: 1 },
        { col: 2, row: 2 },
        { col: 3, row: 3 },
      ],
      startedAt: now,
      expiresAt: now + 850,
    },
  ];

  const html = renderToStaticMarkup(
    <VfxLayer
      effects={effects}
      view={view()}
      boardSize={9}
      cellSize={40}
      isFlipped={false}
      reducedMotion={false}
    />,
  );

  assert.equal(html.match(/data-portal-effect="tralala"/g)?.length, 2);
  assert.doesNotMatch(html, /vfx-line-tralala/);
});
