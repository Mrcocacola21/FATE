import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";

export function requestId(request: { headers: Record<string, unknown> }): string {
  const id = request.headers["x-request-id"];
  return typeof id === "string" && /^[a-zA-Z0-9._-]{1,64}$/.test(id) ? id : randomUUID();
}
export function correlateUser(request: FastifyRequest, userId: string) {
  request.authUserId = userId;
  request.log = request.log.child({ userId });
}
export function registerRequestContext(server: FastifyInstance) {
  server.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
    const route = request.routeOptions.url;
    const params = request.params as Record<string, unknown> | undefined;
    if (route?.includes("/matches/:id") && typeof params?.id === "string")
      request.log = request.log.child({ matchId: params.id });
  });
  // One access event, after authentication, without raw URLs, headers or bodies.
  server.addHook("onResponse", async (request, reply) => {
    if (["/health", "/api/health", "/ready", "/metrics"].includes(request.routeOptions.url ?? "")) return;
    request.log.info({ event: "http_request_complete", method: request.method,
      route: request.routeOptions.url ?? "UNKNOWN", statusCode: reply.statusCode,
      durationMs: reply.elapsedTime, ...(request.authUserId ? { userId: request.authUserId } : {}) }, "HTTP request complete");
  });
}
