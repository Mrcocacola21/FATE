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

test("ranged abilities render above tokens in flight and retain their original impact layer on contact", () => {
  for (const effectId of ["gutsCrossbow", "undyneThrow"] as const) for (const placement of ["projectile", "cell"] as const) {
    const html = renderToStaticMarkup(<VfxLayer view={view()} boardSize={9} cellSize={64} isFlipped={false}
      reducedMotion={false} effects={[{ id: "ability-shot", effectId, placement, sourceCell: { col: 1, row: 4 },
        targetCell: { col: 4, row: 4 }, startedAt: Date.now(), expiresAt: Date.now() + 600 }]} />);
    assert.match(html, new RegExp(`data-vfx-layer="${placement === "projectile" ? "projectile" : "impact"}"`));
  }
});

test("unit-attached VFX follow the current visible unit coordinate", () => {
  const effects: QueuedBoardVfxRequest[] = [
    {
      id: "effect-1",
      effectId: "muzzle",
      placement: "unit",
      unitId: "target",
      anchorMode: "followUnit",
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
      effectId: "portal",
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

  assert.equal(html.match(/data-portal-effect="portal"/g)?.length, 2);
  assert.doesNotMatch(html, /vfx-line-portal/);
});

test("walking wake owns stationary deposits in one cue, hides on lost permission and reduced motion", () => {
  const now = Date.now();
  const effect: QueuedBoardVfxRequest = {
    id: "confirmed-walk", effectId: "expansion.genghisKhan.move_trail", placement: "projectile",
    unitId: "target", sourceCell: { col: 0, row: 4 }, targetCell: { col: 8, row: 4 },
    travelDurationMs: 720, startedAt: now, expiresAt: now + 960,
  };
  const render = (currentView = view(), reducedMotion = false, isFlipped = false) => renderToStaticMarkup(
    <VfxLayer effects={[effect]} view={currentView} boardSize={9} cellSize={40}
      isFlipped={isFlipped} reducedMotion={reducedMotion} />,
  );
  for (const flipped of [false, true]) {
    const html = render(view(), false, flipped);
    assert.equal(html.match(/data-vfx-cue=/g)?.length, 1, "fragments do not create independent semantic cues");
    assert.equal(html.match(/data-vfx-wake-sample=/g)?.length, 27);
    assert.match(html, /data-vfx-emission="0"/);
    assert.match(html, /--vfx-duration:240ms/);
    assert.doesNotMatch(html, /vfx-movement-follow|translateX/);
    assert.match(html, flipped ? /rotate\(180deg\)/ : /rotate\(0deg\)/);
  }
  assert.doesNotMatch(render(view(), true), /data-vfx-cue=/);
  const hidden = view(); hidden.units.target.position = null;
  assert.doesNotMatch(render(hidden), /data-vfx-wake-sample=/, "no residue leaks the hidden unit's past route");
});

test("melee stroke owns contact and follow-through, refusing a missing target or lost attacker position", () => {
  const now = Date.now();
  const effect: QueuedBoardVfxRequest = { id: "cut", effectId: "expansion.guts.attack_swing", placement: "cell", unitId: "target",
    sourceCell: { col: 4, row: 4 }, targetCell: { col: 5, row: 4 }, strikeContactMs: 420, startedAt: now, expiresAt: now + 640 };
  const render = (cue = effect, current = view()) => renderToStaticMarkup(<VfxLayer effects={[cue]} view={current}
    boardSize={9} cellSize={40} isFlipped={false} reducedMotion={false} />);
  const html = render();
  assert.equal(html.match(/data-vfx-cue=/g)?.length, 1);
  assert.match(html, /vfx-melee-stroke/);
  assert.match(html, /--melee-contact:420ms/); assert.match(html, /--melee-recovery:220ms/);
  assert.match(html, /--melee-draw:260ms/);
  assert.doesNotMatch(render({ ...effect, targetCell: undefined }), /data-vfx-cue=/);
  const hidden = view(); hidden.units.target.position = null;
  assert.doesNotMatch(render(effect, hidden), /data-vfx-cue=/);
});

test("target cut mirrors the reference sweep in screen directions without rotating left/up upside down", () => {
  const now = Date.now(), q = Math.SQRT1_2;
  // Independent screen-space matrices relative to the approved rightward cut.
  const poses = [
    { col: 1, row: 0, matrix: [1, 0, 0, 1] },
    { col: 1, row: -1, matrix: [q, q, -q, q] },
    { col: 0, row: -1, matrix: [1, 0, 0, 1] },
    { col: -1, row: -1, matrix: [-q, q, q, q] },
    { col: -1, row: 0, matrix: [-1, 0, 0, 1] },
    { col: -1, row: 1, matrix: [-q, -q, -q, q] },
    { col: 0, row: 1, matrix: [1, 0, 0, -1] },
    { col: 1, row: 1, matrix: [q, -q, q, q] },
  ];
  for (const flipped of [false, true]) for (const reducedMotion of [false, true]) for (const [index, pose] of poses.entries()) {
    const html = renderToStaticMarkup(<VfxLayer view={view()} boardSize={9} cellSize={40}
      isFlipped={flipped} reducedMotion={reducedMotion} effects={[{
        id: "cut-direction", effectId: "expansion.guts.attack_swing", placement: "cell", unitId: "target",
        sourceCell: { col: 4, row: 4 }, targetCell: { col: 4 + pose.col, row: 4 + pose.row },
        strikeContactMs: 420, startedAt: now, expiresAt: now + 640,
      }]} />);
    const transform = html.match(/transform:rotate\(([-\d.]+)deg\) scale\(([-\d]+), ([-\d]+)\)/);
    assert(transform, "facing explicitly owns both rotation and reflection");
    const angle = Number(transform[1]) * Math.PI / 180, x = Number(transform[2]), y = Number(transform[3]);
    const matrix = [Math.cos(angle) * x, Math.sin(angle) * x, -Math.sin(angle) * y, Math.cos(angle) * y];
    const expected = poses[(index + (flipped ? 4 : 0)) % 8].matrix;
    matrix.forEach((value, axis) => assert(Math.abs(value - expected[axis]) < 1e-8,
      `direction ${index}, flipped=${flipped}: transformed sweep landmark ${axis}`));
    assert.match(html, /vfx-melee-stroke/);
    assert.match(html, /data-vfx-melee-reveal="topRight"/,
      "Guts reverses its own authored crescent without changing the common direction pose");
    assert.match(html, /data-vfx-melee-rotation="180"/);
    assert.equal(html.match(/data-vfx-cue=/g)?.length, 1);
  }
});
