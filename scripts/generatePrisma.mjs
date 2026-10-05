import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = path.join(root, "packages/server");
const source = await readFile(path.join(server, "prisma/schema.prisma"), "utf8");
// Prisma formats the generated copy; ignore formatting/comments, preserve quoted values.
const normalize = schema => schema.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\/|\s+/g,
  token => token.startsWith('"') ? token : "");
let current = false;
try {
  const generatedRoot = path.dirname(require.resolve(".prisma/client/package.json"));
  const generated = await readFile(path.join(generatedRoot, "schema.prisma"), "utf8");
  const client = require("@prisma/client");
  current = normalize(generated) === normalize(source)
    && client.Prisma.prismaVersion.client === require("prisma/package.json").version
    && client.Prisma.prismaVersion.client === require("@prisma/client/package.json").version;
} catch { /* Fresh install or schema/client version change requires generation. */ }
if (current && !process.argv.includes("--force")) console.log("Prisma client is current (schema and package versions match).");
else {
  const child = spawn(process.execPath, [require.resolve("prisma/build/index.js"), "generate"], { cwd: server, env: process.env, stdio: "inherit", windowsHide: true });
  child.once("error", error => { console.error(error.message); process.exitCode = 1; });
  child.once("exit", code => { process.exitCode = code ?? 1; });
}
