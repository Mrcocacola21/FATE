import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ConnectionIdentityService } from "../auth/connectionIdentity";
import { MultiplayerIdentityError } from "../auth/connectionIdentity";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { ReplayQueryService } from "../services/replayQueryService";
import { ReplayError } from "../replay/replayError";
import { MatchResultError } from "../persistence/matchResult";

const revisionQuery = z
  .object({
    revision: z
      .string()
      .regex(/^(0|[1-9]\d*)$/)
      .transform(Number)
      .pipe(z.number().int().min(0).max(2147483647)),
  })
  .strict();

export async function replayRoutes(
  server: FastifyInstance,
  options: {
    identity: Pick<ConnectionIdentityService, "verify">;
    replayQuery?: Pick<ReplayQueryService, "getMetadata" | "getState">;
  },
) {
  let service = options.replayQuery;
  server.addHook("preHandler", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const token = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? "")?.[1];
    try {
      if (!token || !(await options.identity.verify(token))) throw new Error();
    } catch (error) {
      if (error instanceof MultiplayerIdentityError && error.code === "ACCOUNT_BLOCKED")
        return reply.code(403).send({ error: { code: error.code, message: error.message } });
      // Central authenticated client refreshes on this existing stable convention.
      return reply
        .code(401)
        .send({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
  });
  server.setErrorHandler((error, request, reply) => {
    let status = 503,
      code = "REPLAY_UNAVAILABLE";
    if (error instanceof MatchResultError) {
      status = error.statusCode;
      code = error.code;
    } else if (error instanceof ReplayError) {
      if (error.code === "MATCH_NOT_FOUND") {
        status = 404;
        code = error.code;
      } else if (error.code === "MATCH_NOT_REPLAYABLE") {
        status = 409;
        code = error.code;
      } else if (error.code === "INVALID_TARGET_REVISION") {
        status = 400;
        code = "INVALID_REPLAY_REVISION";
      } else if (error.code !== "REPLAY_STORAGE_UNAVAILABLE") {
        status = 500;
        code = "REPLAY_INTEGRITY_ERROR";
      }
    }
    if (status >= 500)
      request.log.error({ category: code, requestId: request.id }, "Replay request failed");
    reply.code(status).send({ error: { code, message: code } });
  });
  const query = () =>
    (service ??= new ReplayQueryService(new MatchRepository(), new MatchActionRepository()));
  server.get<{ Params: { id: string } }>("/matches/:id/replay", async (request) => {
    if (!z.string().uuid().safeParse(request.params.id).success)
      throw new MatchResultError("INVALID_REQUEST", 400);
    return query().getMetadata(request.params.id);
  });
  server.get<{ Params: { id: string } }>("/matches/:id/replay/state", async (request) => {
    if (!z.string().uuid().safeParse(request.params.id).success)
      throw new MatchResultError("INVALID_REQUEST", 400);
    const parsed = revisionQuery.safeParse(request.query);
    if (!parsed.success) throw new MatchResultError("INVALID_REPLAY_REVISION", 400);
    return query().getState(request.params.id, parsed.data.revision);
  });
}
