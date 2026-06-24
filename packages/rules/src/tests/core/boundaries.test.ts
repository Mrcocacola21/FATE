import {
  assert,
  fs,
  path,
} from "../helpers/testUtils";
export function testActionModuleBoundaries() {
  const actionsDir = path.resolve(__dirname, "..", "..", "actions");
  const heroesDir = path.join(actionsDir, "heroes");
  const actionFiles = fs
    .readdirSync(actionsDir)
    .filter((name) => name.endsWith(".ts"));
  const heroFiles = fs
    .readdirSync(heroesDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => path.join("heroes", name));
  const files = [...actionFiles, ...heroFiles];

  const allowedExact = new Set(["./shared", "./types", "./domain"]);
  const allowedPrefixes = ["./utils/", "./heroes/"];
  const allowlistByFile = new Map<string, Set<string>>([
    [
      "registry.ts",
      new Set([
        "./abilityActions",
        "./combatActions",
        "./lobbyActions",
        "./movementActions",
        "./pendingRollActions",
        "./placementActions",
        "./stealthActions",
        "./turnActions",
      ]),
    ],
    ["index.ts", new Set(["./armyActions", "./lobbyActions", "./registry"])],
    ["pendingRollActions.ts", new Set(["./pendingRoll"])],
  ]);

  const violations: string[] = [];

  for (const relativePath of files) {
    const fullPath = path.join(actionsDir, relativePath);
    const content = fs.readFileSync(fullPath, "utf8");
    const lines = content.split(/\r?\n/);
    const fileAllowlist = allowlistByFile.get(relativePath);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;
      const match = trimmed.match(
        /^(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/
      );
      if (!match) continue;
      const spec = match[1];
      if (!spec.startsWith("./")) continue;
      const fileBase = path.basename(relativePath, ".ts");
      const isMatchingFolderIndexShim = spec === `./${fileBase}/index`;
      const isAllowed =
        allowedExact.has(spec) ||
        allowedPrefixes.some((prefix) => spec.startsWith(prefix)) ||
        isMatchingFolderIndexShim ||
        (fileAllowlist ? fileAllowlist.has(spec) : false);
      if (!isAllowed) {
        violations.push(`${relativePath} -> ${spec}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("Action module boundary violations:");
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
  }

  assert.strictEqual(
    violations.length,
    0,
    "Action module boundary violations detected"
  );

  console.log("action_module_boundaries passed");
}
