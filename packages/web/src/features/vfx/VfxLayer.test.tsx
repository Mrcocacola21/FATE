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
