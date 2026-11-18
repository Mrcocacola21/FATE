import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_CROP, clampCrop, drawCrop, outputSide, rotateCrop, zoomCrop } from "./avatarFile";

const wide = { width: 400, height: 200 };

test("the picture always covers the frame and zoom stays in range", () => {
  assert.deepEqual(clampCrop(wide, { ...INITIAL_CROP, x: 5, y: 5 }), {
    x: 0.5,
    y: 0,
    zoom: 1,
    rotation: 0,
  });
  assert.equal(clampCrop(wide, { ...INITIAL_CROP, zoom: 0.2 }).zoom, 1);
  assert.equal(clampCrop(wide, { ...INITIAL_CROP, zoom: 10 }).zoom, 4);
  // Zoom 2 doubles the room to move: 400 px shown as 4 frame sides, 200 px as 2.
  assert.deepEqual(clampCrop(wide, { x: -9, y: 9, zoom: 2, rotation: 0 }), {
    x: -1.5,
    y: 0.5,
    zoom: 2,
    rotation: 0,
  });
});

test("zoom keeps the framed point and a quarter turn turns the offset", () => {
  const zoomed = zoomCrop(wide, { x: 0.25, y: 0.1, zoom: 2, rotation: 0 }, 4);
  assert.deepEqual(zoomed, { x: 0.5, y: 0.2, zoom: 4, rotation: 0 });
  const turned = rotateCrop(wide, { x: 0.3, y: 0.2, zoom: 2, rotation: 0 });
  assert.equal(turned.rotation, 90);
  // Turned, the wide picture is tall: x has room 0.5 and y has room 1.5.
  assert.deepEqual([turned.x, turned.y], [-0.2, 0.3]);
  assert.equal(rotateCrop(wide, { ...INITIAL_CROP, rotation: 270 }).rotation, 0);
});

test("the upload is at most 256 px and never upscales a small crop", () => {
  assert.equal(outputSide({ width: 4000, height: 3000 }, INITIAL_CROP), 256);
  assert.equal(outputSide({ width: 300, height: 200 }, { ...INITIAL_CROP, zoom: 2 }), 100);
  assert.equal(outputSide({ width: 40, height: 40 }, { ...INITIAL_CROP, zoom: 4 }), 16);
});

test("drawing maps the framed square onto the canvas", () => {
  const calls: unknown[][] = [];
  const context = new Proxy(
    {},
    {
      get: (_, name) =>
        name === "imageSmoothingQuality"
          ? "high"
          : (...args: unknown[]) => calls.push([name, ...args]),
      set: () => true,
    },
  ) as CanvasRenderingContext2D;
  const source = { ...wide } as unknown as CanvasImageSource & typeof wide;
  drawCrop(context, source, { x: 0.25, y: 0, zoom: 1, rotation: 90 }, 256);
  assert.deepEqual(
    calls.filter(([name]) => name !== "save" && name !== "restore" && name !== "clearRect"),
    [
      ["translate", 192, 128],
      ["rotate", Math.PI / 2],
      ["scale", 1.28, 1.28],
      ["drawImage", source, -200, -100],
    ],
  );
});
