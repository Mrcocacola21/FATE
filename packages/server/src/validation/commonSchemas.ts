import { z } from "zod";

export const resourceIdSchema = z.string().uuid();
export const userIdSchema = resourceIdSchema;
export const matchIdSchema = resourceIdSchema;
// Live rooms can also have named IDs restored/created through the WS protocol.
export const roomIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
export const idParamsSchema = z.object({ id: resourceIdSchema }).strict();
export const emptyObjectSchema = z.object({}).strict();
export const sortOrderSchema = z.enum(["asc", "desc"]);
export const userRoleSchema = z.enum(["USER", "MODERATOR", "ADMIN"]);
export const gameModeSchema = z.enum(["standard", "draft", "classic"]);
export const matchTypeSchema = z.enum(["CASUAL", "RATED"]);

/** Query integers accept decimal digits only; omitted values alone receive defaults. */
export const queryIntegerSchema = (min: number, max: number) =>
  z.string().regex(min === 0 ? /^(0|[1-9]\d*)$/ : /^[1-9]\d*$/)
    .transform(Number).pipe(z.number().int().min(min).max(max));
export const pageSchema = queryIntegerSchema(1, 21474836).default("1");
export const limitSchema = (max = 100, defaultValue = 20) =>
  queryIntegerSchema(1, max).default(String(defaultValue));
export const booleanQuerySchema = z.enum(["true", "false"]).transform(value => value === "true");
export const dateTimeSchema = z.string().datetime({ offset: true }).transform(value => new Date(value));
