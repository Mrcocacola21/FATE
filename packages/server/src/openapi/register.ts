import type { FastifyInstance, FastifySchema } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REFRESH_COOKIE } from "../auth/httpSecurity";
import { authErrors } from "../auth/authErrors";
import { AppError } from "../errors/appError";
import { domainErrors } from "../errors/domainErrors";
import { apiTags, type ApiContract } from "./contract";
import { requestSchema, responseComponents, responseRef, type JsonSchema } from "./schemas";

const errorDescriptions: Record<number, string> = {
  400: "Request validation failed (including unsupported query fields).",
  401: "Missing, expired or invalid credentials.",
  403: "Account blocked, forbidden origin or insufficient permissions.",
  404: "Resource not found.",
  409: "Conflict with current resource state.",
  410: "Match interrupted and no longer resumable.",
  429: "Rate limit exceeded.",
  500: "Unexpected server error.",
  503: "Required service is unavailable.",
};

export interface ApiRouteRegistration {
  method: string;
  url: string;
  contract?: ApiContract;
  hidden: boolean;
}
declare module "fastify" {
  interface FastifyInstance {
    apiRouteInventory: ApiRouteRegistration[];
  }
}

export function contractSchema(contract: ApiContract): FastifySchema {
  const success = contract.success ?? 200;
  const errors = { 400: ["VALIDATION_ERROR"], 500: ["INTERNAL_SERVER_ERROR"], ...contract.errors };
  const response: Record<number, JsonSchema> = Object.fromEntries(
    Object.entries(errors).map(([status, codes]) => [
      status,
      {
        ...responseRef(
          status === "400" && codes.every((code) => code === "VALIDATION_ERROR")
            ? "ValidationError"
            : "ApiError",
        ),
        description: `${errorDescriptions[Number(status)]} Codes: ${codes.join(", ")}.`,
      },
    ]),
  );
  response[success] = {
    ...(contract.response ? responseRef(contract.response) : { type: "null" }),
    description:
      success === 204 ? "Session cookie cleared; no response body." : "Successful response.",
    ...(contract.responseExample === undefined ? {} : { example: contract.responseExample }),
    ...(contract.cookie
      ? {
          headers: {
            "Set-Cookie": {
              type: "string",
              description: `${contract.cookie === "set" ? "Sets or rotates" : "Clears"} the HttpOnly ${REFRESH_COOKIE} cookie; path /api/auth. Secure in production. SameSite is configuration dependent.`,
            },
          },
        }
      : {}),
  };
  const role =
    contract.role === "ADMIN"
      ? " Requires ADMIN."
      : contract.role
        ? " Requires MODERATOR or ADMIN."
        : "";
  const security: Record<string, string[]>[] =
    contract.auth === "bearer"
      ? [{ BearerAuth: [] }]
      : contract.auth === "optionalBearer"
        ? [{}, { BearerAuth: [] }]
        : contract.auth === "refresh"
          ? [{ RefreshCookie: [] }]
          : contract.auth === "optionalRefresh"
            ? [{}, { RefreshCookie: [] }]
            : [];
  const body = contract.body ? requestSchema(contract.body) : undefined;
  if (body) {
    const properties = body.properties as Record<string, JsonSchema> | undefined;
    if (properties?.password) properties.password.format = "password";
    if (contract.requestExample !== undefined) body.example = contract.requestExample;
  }
  return {
    operationId: contract.operationId,
    tags: [contract.tag],
    summary: contract.summary,
    description: `${contract.description ?? contract.summary}${role}`,
    security,
    ...(body ? { body } : {}),
    ...(contract.params ? { params: requestSchema(contract.params) } : {}),
    ...(contract.query ? { querystring: requestSchema(contract.query) } : {}),
    response,
  };
}

export async function registerOpenApi(server: FastifyInstance): Promise<void> {
  const contracts = new Map<string, ApiContract>();
  server.decorate("apiRouteInventory", []);
  server.addHook("onRoute", (route) => {
    if (route.config?.apiContract)
      contracts.set(route.config.apiContract.operationId, route.config.apiContract);
    for (const method of typeof route.method === "string" ? [route.method] : route.method)
      server.apiRouteInventory.push({
        method,
        url: route.url,
        contract: route.config?.apiContract,
        hidden: route.schema?.hide === true,
      });
  });
  const version = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8"))
    .version as string;
  await server.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "FATE API",
        version,
        description:
          "REST API for FATE. Access credentials are Bearer JWTs; refresh credentials remain in an HttpOnly cookie. Auth mutations require a trusted Origin for browsers (native clients may omit Origin). Real-time gameplay uses WebSocket and is outside this specification.",
      },
      servers: [{ url: "/", description: "Current server" }],
      tags: apiTags.map((name) => ({ name })),
      components: {
        schemas: responseComponents,
        securitySchemes: {
          BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          RefreshCookie: {
            type: "apiKey",
            in: "cookie",
            name: REFRESH_COOKIE,
            description:
              "HttpOnly refresh cookie. Browsers send it automatically; Swagger cannot read or set its value through JavaScript.",
          },
        },
      },
    },
    transform: ({ url, route }) => ({
      url,
      schema: route.config?.apiContract ? contractSchema(route.config.apiContract) : { hide: true },
    }),
    transformObject: (document) => {
      if (!("openapiObject" in document)) throw new Error("Expected OpenAPI document");
      const { openapiObject } = document;
      for (const path of Object.values(openapiObject.paths ?? {})) {
        if (!path) continue;
        for (const method of ["get", "post", "patch", "delete", "put"] as const) {
          const operation = path[method];
          if (!operation) continue;
          const contract = contracts.get(operation.operationId ?? "");
          const errorCodes = { 500: ["INTERNAL_SERVER_ERROR"], ...contract?.errors };
          for (const [status, codes] of Object.entries(errorCodes)) {
            const mapping = codes
              .map((code) => ({
                code,
                definition: domainErrors[code] ?? authErrors[code as keyof typeof authErrors],
              }))
              .find((item) => item.definition?.[0] === Number(status));
            const response = operation.responses[status];
            if (
              mapping &&
              response &&
              !("$ref" in response) &&
              response.content?.["application/json"]
            ) {
              const [httpStatus, message] = mapping.definition;
              response.content["application/json"].example = new AppError(
                mapping.code,
                httpStatus,
                message,
              ).toResponse();
            }
          }
          if (contract?.success === 204) {
            const response = operation.responses["204"];
            if (response && !("$ref" in response)) delete response.content;
          }
          if (operation.requestBody && !("$ref" in operation.requestBody))
            operation.requestBody.required = !contract?.bodyOptional;
          // Operational endpoints deliberately return { ok } on failure.
          if (contract?.response === "Health") {
            if (contract.operationId === "getReadiness")
              operation.responses["503"] = {
                description: "Startup/recovery incomplete or database unavailable.",
                content: { "application/json": { schema: responseRef("Health") } },
              };
            delete operation.responses["400"];
          }
        }
      }
      return openapiObject;
    },
  });
  if (process.env.OPENAPI_ENABLED === "false") return;
  server.get("/openapi.json", { schema: { hide: true } }, async () => server.swagger());
  if (process.env.SWAGGER_UI_ENABLED !== "false")
    await server.register(swaggerUi, {
      routePrefix: "/docs",
      uiConfig: { docExpansion: "list", deepLinking: true, persistAuthorization: false },
    });
}
