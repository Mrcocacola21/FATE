import type { FastifyInstance } from "fastify";
import { checkDatabaseReadiness } from "../db/readiness";

export function registerHealthRoutes(
  server: FastifyInstance,
  check: () => Promise<boolean> = checkDatabaseReadiness,
): void {
  server.get("/health", async () => ({ ok: true }));
  server.get("/api/health", async () => ({ ok: true }));
  server.get("/ready", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    const ok = await check();
    return reply.code(ok ? 200 : 503).send({ ok });
  });
}
