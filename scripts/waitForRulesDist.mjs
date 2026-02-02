import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const targets = [
  path.join(repoRoot, "packages", "rules", "dist", "index.js"),
  path.join(repoRoot, "node_modules", "rules", "dist", "index.js"),
];

const timeoutMs = Number(process.env.RULES_DIST_WAIT_TIMEOUT_MS ?? "30000");
const intervalMs = Number(process.env.RULES_DIST_WAIT_INTERVAL_MS ?? "200");

const startedAt = Date.now();

const existing = targets.find((p) => fs.existsSync(p));
if (existing) {
  console.log(`[waitForRulesDist] Found rules dist: ${existing}`);
  process.exit(0);
}

console.log(
  `[waitForRulesDist] Waiting for rules dist (${timeoutMs}ms timeout):\n` +
    targets.map((p) => `  - ${p}`).join("\n")
);

const timer = setInterval(() => {
  const found = targets.find((p) => fs.existsSync(p));
  if (found) {
    clearInterval(timer);
    console.log(`[waitForRulesDist] Found rules dist: ${found}`);
    process.exit(0);
  }
  if (Date.now() - startedAt > timeoutMs) {
    clearInterval(timer);
    console.error(
      `[waitForRulesDist] rules dist missing after ${timeoutMs}ms. ` +
        "Start npm -w rules build:watch or run npm -w rules build once."
    );
    process.exit(1);
  }
}, intervalMs);
