import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { VfxPreviewPage } from "./VfxPreviewPage";
import { VFX_PREVIEW_SCENARIOS } from "../features/vfx/vfxPreviewScenarios";

test("VFX preview page renders a trigger for every preview scenario", () => {
  const html = renderToStaticMarkup(<VfxPreviewPage />);

  assert.match(html, /data-vfx-preview-board="true"/);
  for (const scenario of VFX_PREVIEW_SCENARIOS) {
    assert.match(html, new RegExp(`data-vfx-preview-trigger="${scenario.id}"`));
  }
});
