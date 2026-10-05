import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// Keep Vite/esbuild outside the Fastify/Prisma native engine process on Windows.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const server = await createServer({
  root: path.join(root, "packages/web"),
  configFile: path.join(root, "packages/web/vite.config.ts"),
  resolve: { alias: { rules: path.join(root, "packages/rules/src/index.ts") } },
  server: { host: "127.0.0.1", port: 0, strictPort: true },
  logLevel: "error",
});
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address === "string") throw new Error("Vite did not bind a TCP port");
console.log(`FATE_VITE_READY ${JSON.stringify({ port: address.port })}`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  process.exit(0);
}
process.once("SIGTERM", close);
process.once("SIGINT", close);
