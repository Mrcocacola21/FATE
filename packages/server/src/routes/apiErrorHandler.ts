import { ReplayError } from "../replay/replayError";
import { MatchCreationError } from "../persistence/matchLifecycle";
import { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AuthError } from "../auth/authErrors";
import { DatabaseConfigurationError } from "../db/client";
import { AppError, internalError } from "../errors/appError";
import { ValidationError } from "../validation/parseRequest";
import { toDomainApiError } from "../errors/domainErrors";

export function toApiError(error: unknown): AppError {
  if (error instanceof MatchCreationError && error.cause !== undefined)
    return toApiError(error.cause);
  if (error instanceof ReplayError && error.code === "REPLAY_STORAGE_UNAVAILABLE" && error.cause !== undefined)
    return toApiError(error.cause);
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return new ValidationError(error);
  if (
    error instanceof DatabaseConfigurationError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(error.code))
  ) return new AuthError("DATABASE_UNAVAILABLE");
  const domainError = toDomainApiError(error);
  if (domainError) return domainError;
  // Only known parser errors are input failures. Unknown exceptions stay private.
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    if (["FST_ERR_CTP_INVALID_JSON_BODY", "FST_ERR_CTP_EMPTY_JSON_BODY",
      "FST_ERR_CTP_INVALID_CONTENT_LENGTH", "FST_ERR_CTP_BODY_TOO_LARGE",
      "FST_ERR_CTP_INVALID_MEDIA_TYPE", "FST_ERR_BAD_URL"].includes(error.code))
      return new AppError("VALIDATION_ERROR", 400, "Request validation failed.");
  }
  return internalError();
}

export function registerApiErrorHandler(
  server: FastifyInstance,
  onFailure?: (failure: AppError, reply: FastifyReply) => void,
): void {
  server.setErrorHandler((error, request, reply) => {
    handleApiError(error, request, reply, onFailure);
  });
}

export function handleApiError(error: unknown, request: FastifyRequest, reply: FastifyReply,
  onFailure?: (failure: AppError, reply: FastifyReply) => void): void {
  const failure = toApiError(error);
  if (failure.statusCode >= 500)
    request.log.error({ err: error, category: failure.code, requestId: request.id }, "API request failed");
  onFailure?.(failure, reply);
  reply.code(failure.statusCode).send(failure.toResponse());
}
