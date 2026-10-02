import { Prisma } from "@prisma/client";
import type { FastifyError } from "fastify";
import { AuthError } from "../auth/authErrors";
import { DatabaseConfigurationError } from "../db/client";

export function toApiError(error: FastifyError): AuthError {
  if (error instanceof AuthError) return error;
  if (
    error instanceof DatabaseConfigurationError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(error.code))
  )
    return new AuthError("DATABASE_UNAVAILABLE");
  if (error.statusCode && [400, 413, 415].includes(error.statusCode))
    return new AuthError("INVALID_REQUEST");
  return new AuthError("INTERNAL_ERROR");
}
