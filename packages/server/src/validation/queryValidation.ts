import type { FastifyInstance, FastifyContextConfig } from "fastify";
import type { z } from "zod";
import { emptyObjectSchema } from "./commonSchemas";
import { ValidationError } from "./parseRequest";

declare module "fastify" {
  interface FastifyContextConfig {
    querySchema?: Pick<z.ZodType<unknown>, "safeParse">;
  }
}

/** All REST routes reject unsupported query fields. Feature schemas remain local. */
export function registerQueryValidation(server: FastifyInstance): void {
  server.addHook("preValidation", async (request) => {
    if (
      !request.routeOptions.url ||
      request.method === "OPTIONS" ||
      request.routeOptions.url === "/openapi.json" ||
      request.routeOptions.url === "/docs" ||
      request.routeOptions.url.startsWith("/docs/") ||
      ["/ws", "/health", "/api/health", "/ready"].includes(request.routeOptions.url)
    )
      return;
    const result = (request.routeOptions.config.querySchema ?? emptyObjectSchema).safeParse(
      request.query,
    );
    if (!result.success) throw new ValidationError(result.error);
  });
}

export function queryConfig(schema: Pick<z.ZodType<unknown>, "safeParse">): FastifyContextConfig {
  return { querySchema: schema };
}
