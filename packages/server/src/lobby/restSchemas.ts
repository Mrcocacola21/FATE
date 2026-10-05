import { z } from "zod";
import { CreateGameBodySchema, PlayerIdSchema } from "../schemas";
import { roomIdSchema } from "../validation/commonSchemas";

export const createRoomSchema = CreateGameBodySchema.strict();
export const roomParamsSchema = z.object({ id: roomIdSchema }).strict();
export const heroParamsSchema = z.object({ id: z.string().min(1).max(128) }).strict();
export const playerQuerySchema = z.object({ playerId: PlayerIdSchema }).strict();
