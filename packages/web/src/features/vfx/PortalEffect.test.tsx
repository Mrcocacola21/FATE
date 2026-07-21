import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PortalEffect } from "./PortalEffect";

test("PortalEffect renders layered procedural energy without a sprite image", () => {
  const html = renderToStaticMarkup(
    <PortalEffect
      effectId="portal"
      durationMs={820}
      opacity={0.9}
      blendMode="screen"
      style={{ left: 20, top: 30, width: 60, height: 60 }}
    />,
  );

  assert.match(html, /data-testid="portal-effect"/);
  assert.match(html, /portal-effect-ring/);
  assert.match(html, /portal-effect-inner/);
  assert.match(html, /portal-effect-core/);
  assert.match(html, /portal-effect-particle/);
  assert.match(html, /left:20px;top:30px;width:60px;height:60px/);
  assert.doesNotMatch(html, /background-image/);
  assert.doesNotMatch(html, /<img/);
});

test("PortalEffect reduced-motion rendering stays static and safe", () => {
  const html = renderToStaticMarkup(
    <PortalEffect effectId="portal" durationMs={450} opacity={0.58} reducedMotion />,
  );

  assert.match(html, /portal-effect-reduced/);
});

test("portal animation keyframes do not scroll or translate horizontally", () => {
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  const portalKeyframes = styles.match(
    /@keyframes portal-effect-appearance[\s\S]*?@keyframes vfx-particle-pop/,
  );

  assert.ok(portalKeyframes, "portal keyframes should be present");
  assert.doesNotMatch(portalKeyframes[0], /background-position|translateX|translate3d/);
});
