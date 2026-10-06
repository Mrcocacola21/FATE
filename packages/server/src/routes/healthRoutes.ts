import type { FastifyInstance } from "fastify";
import { documented } from "../openapi/contract";
import { checkDatabaseReadiness } from "../db/readiness";

export const healthStatus = (ok: boolean) => ({ ok });

export function registerHealthRoutes(
  server: FastifyInstance,
  check: () => Promise<boolean> = checkDatabaseReadiness,
  startupReady: () => boolean = () => true,
): void {
  let previousReady: boolean | undefined;
  server.get(
    "/health",
    documented({
      operationId: "getHealth",
      tag: "Operations",
      summary: "Check process liveness",
      response: "Health",
    }),
    async () => healthStatus(true),
  );
  server.get(
    "/api/health",
    documented({
      operationId: "getApiHealth",
      tag: "Operations",
      summary: "Check process liveness (API alias)",
      response: "Health",
    }),
    async () => healthStatus(true),
  );
  server.get(
    "/ready",
    documented({
      operationId: "getReadiness",
      tag: "Operations",
      summary: "Check completed startup/recovery and database readiness",
      response: "Health",
    }),
    async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      const ok = startupReady() && (await check());
      if (previousReady !== ok) {
        server.log[ok ? "info" : "warn"]({ event: "readiness_changed", ready: ok }, "Readiness changed");
        previousReady = ok;
      }
      return reply.code(ok ? 200 : 503).send(healthStatus(ok));
    },
  );
}
