import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const assets = fileURLToPath(new URL("../dist/assets/", import.meta.url));
const css = readdirSync(assets).filter(name => name.endsWith(".css")).map(name => readFileSync(assets + name, "utf8")).join("\n");
for (const tone of ["move", "teleport", "push"]) {
  const rule = css.match(new RegExp(`\\.board-effect-trail-${tone}\\{([^}]+)\\}`));
  assert(rule, `${tone}: common trail must survive the production content scan`);
  assert.match(rule[1], /background:/); assert.match(rule[1], /box-shadow:/);
}
assert.match(css, /\.board-effect-cell-move\{[^}]*background:/, "reduced-motion endpoint feedback must keep its color");
console.log("Production CSS: three painted movement trail tones and reduced-motion endpoint tone PASS.");
