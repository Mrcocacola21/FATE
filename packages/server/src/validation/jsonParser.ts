import type { FastifyInstance } from "fastify";
import { AppError } from "../errors/appError";

/** Normalize failures at the parser boundary; handler SyntaxErrors remain 500s. */
export function registerJsonParser(server: FastifyInstance): void {
  const parseJson = server.getDefaultJsonParser("error", "error");
  server.addContentTypeParser<string>("application/json", { parseAs: "string" }, (request, body, done) => {
    parseJson(request, body, (error, value: unknown) => {
      if (error) return done(new AppError("VALIDATION_ERROR", 400, "Request validation failed."));
      done(null, value);
    });
  });
}
