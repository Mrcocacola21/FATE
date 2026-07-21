import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getViewportLayout, useIsMobile } from "./useIsMobile";

function ResponsiveProbe() {
  return <span>{useIsMobile() ? "mobile" : "desktop"}</span>;
}

function setTestWindow(width: number) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { innerWidth: width },
  });
}

test("useIsMobile uses the 768px boundary and is safe without window", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  try {
    setTestWindow(390);
    assert.match(renderToStaticMarkup(<ResponsiveProbe />), />mobile</);

    setTestWindow(767);
    assert.match(renderToStaticMarkup(<ResponsiveProbe />), />mobile</);

    setTestWindow(768);
    assert.match(renderToStaticMarkup(<ResponsiveProbe />), />desktop</);

    setTestWindow(1024);
    assert.match(renderToStaticMarkup(<ResponsiveProbe />), />desktop</);

    Reflect.deleteProperty(globalThis, "window");
    assert.doesNotThrow(() => renderToStaticMarkup(<ResponsiveProbe />));
    assert.match(renderToStaticMarkup(<ResponsiveProbe />), />desktop</);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("viewport classification keeps tablet and desktop ranges explicit", () => {
  for (const width of [360, 375, 390, 412, 430, 767]) {
    assert.equal(getViewportLayout(width), "mobile", `${width}px should use mobile`);
  }
  assert.equal(getViewportLayout(768), "tablet");
  assert.equal(getViewportLayout(1023), "tablet");
  assert.equal(getViewportLayout(1024), "desktop");
});
