import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { UnitDeploymentContent } from "./UnitDeploymentContent";
import { COMMANDER_AURA_CANVAS, CommanderAura, commanderAuraCells, commanderAuraFrame } from "./CommanderAura";
import { commanderAuraBounds } from "./expansionPresence.generated";
import { imagePreloader } from "./imagePreload";
import type { QueuedBoardVfxRequest } from "./vfxTypes";

test("commander field includes diagonals, clips at board edges and mirrors exact cell geometry", () => {
  assert.equal(commanderAuraCells({ col: 4, row: 4 }, 9).length, 8);
  assert.deepEqual(commanderAuraCells({ col: 0, row: 0 }, 9), [{ col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }]);
  assert.equal(commanderAuraCells({ col: 4, row: 0 }, 9).length, 5);
  for (const effectId of ["expansion.genghisKhan.commander_aura", "expansion.jebe.commander_aura", "expansion.hassan.commander_aura",
    "expansion.donKihote.commander_aura", "expansion.elCidCompeador.commander_aura", "expansion.vladTepes.commander_aura"] as const) {
    for (const isFlipped of [false, true]) {
      const html = renderToStaticMarkup(<CommanderAura effectId={effectId} position={{ col: 0, row: 0 }} boardSize={9}
        cellSize={60} isFlipped={isFlipped} reducedMotion={false} />);
      assert.equal((html.match(/data-aura-cell=/g) ?? []).length, 3);
      assert.match(html, /width:180px;height:180px/);
      assert.match(html, isFlipped ? /left:420px;top:-60px/ : /left:-60px;top:420px/);
      assert.match(html, isFlipped ? /inset\(60px 60px 0px 0px\)/ : /inset\(0px 0px 60px 60px\)/);
      assert.match(html, /commander-aura-breath/);
      assert.match(html, /commander-aura-orbit/);
      assert.match(html, /preserveAspectRatio="none"/);
      const hero = effectId.split(".")[1], bounds = commanderAuraBounds[hero], frame = commanderAuraFrame(hero);
      assert(Math.abs(frame.x + bounds.left / COMMANDER_AURA_CANVAS * frame.width - 3) < .001, `${hero}: left contour`);
      assert(Math.abs(frame.y + bounds.top / COMMANDER_AURA_CANVAS * frame.height - 3) < .001, `${hero}: top contour`);
      assert(Math.abs(frame.x + (bounds.left + bounds.width) / COMMANDER_AURA_CANVAS * frame.width - 297) < .001, `${hero}: right contour`);
      assert(Math.abs(frame.y + (bounds.top + bounds.height) / COMMANDER_AURA_CANVAS * frame.height - 297) < .001, `${hero}: bottom contour`);
    }
  }
});

test("cold portrait cannot leave deploy or commander field playing alone; token DOM survives cue and cleanup", async t => {
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  Object.defineProperty(globalThis, "Image", { configurable: true, value: class ImageStub {} });
  t.after(() => { if (previousImage) Object.defineProperty(globalThis, "Image", previousImage); else Reflect.deleteProperty(globalThis, "Image"); });
  let resolve!: (image: HTMLImageElement) => void;
  t.mock.method(imagePreloader, "load", () => new Promise<HTMLImageElement>(done => { resolve = done; }));
  const src = "/cold-genghis-test.webp";
  const now = Date.now();
  const effect: QueuedBoardVfxRequest = { id: "placed", effectId: "expansion.genghisKhan.deploy", placement: "cell",
    unitId: "commander", sourceCell: { col: 4, row: 4 }, startedAt: now, expiresAt: now + 720 };
  const render = (cue?: QueuedBoardVfxRequest) => <UnitDeploymentContent portraitSrc={src} effect={cue} reducedMotion={false}>
    <img src={src} alt="" /></UnitDeploymentContent>;
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(render()); });
  const portrait = renderer.root.findByType("img");
  act(() => { renderer.update(render(effect)); });
  assert.equal(renderer.root.findAll(node => Boolean(node.props["data-vfx-cue"])).length, 0);
  assert.equal(renderer.root.findByType("img"), portrait, "starting a cue cannot replace the portrait");
  await act(async () => { resolve({ naturalWidth: 128, naturalHeight: 128 } as HTMLImageElement); });
  assert.equal(renderer.root.findAll(node => Boolean(node.props["data-vfx-cue"])).length, 1);
  assert.equal(renderer.root.findByType("img"), portrait);
  assert.equal(renderer.root.findByProps({ "data-unit-deployment": "placed" }).props.className.includes("unit-deployment-enter"), true);
  act(() => { renderer.update(render()); });
  assert.equal(renderer.root.findByType("img"), portrait, "expiry cannot swap the token subtree");
  assert.equal(renderer.root.findAll(node => Boolean(node.props["data-vfx-cue"])).length, 0);
  act(() => renderer.unmount());

  // A newly mounted field has the same readiness constraint as deployment.
  act(() => { renderer = create(<CommanderAura effectId="expansion.genghisKhan.commander_aura" position={{ col: 4, row: 4 }}
    portraitSrc="/cold-aura-test.webp" boardSize={9} cellSize={64} isFlipped={false} reducedMotion={false} />); });
  assert.equal(renderer.toJSON(), null);
  await act(async () => { resolve({ naturalWidth: 128, naturalHeight: 128 } as HTMLImageElement); });
  assert.equal(renderer.root.findAll(node => Boolean(node.props["data-commander-radius"])).length, 1);
  act(() => renderer.unmount());
});

test("portrait finishing after deployment expires does not cause a late appearance flash", async t => {
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  Object.defineProperty(globalThis, "Image", { configurable: true, value: class ImageStub {} });
  t.after(() => { if (previousImage) Object.defineProperty(globalThis, "Image", previousImage); else Reflect.deleteProperty(globalThis, "Image"); });
  let clock = 1000, resolve!: (image: HTMLImageElement) => void;
  t.mock.method(Date, "now", () => clock);
  t.mock.method(imagePreloader, "load", () => new Promise<HTMLImageElement>(done => { resolve = done; }));
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<UnitDeploymentContent portraitSrc="/late-portrait.webp" reducedMotion={false}
    effect={{ id: "late", effectId: "expansion.zoro.deploy", placement: "cell", startedAt: 1000, expiresAt: 1600 }}><img src="/late-portrait.webp" /></UnitDeploymentContent>); });
  clock = 1800;
  await act(async () => { resolve({ naturalWidth: 128, naturalHeight: 128 } as HTMLImageElement); });
  assert.equal(renderer.root.findAll(node => Boolean(node.props["data-vfx-cue"])).length, 0);
  act(() => renderer.unmount());
});
