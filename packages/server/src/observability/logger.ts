import pino, { type DestinationStream, type LoggerOptions, type Logger } from "pino";
import { readObservabilityConfig } from "../config";

const secretFields = new Set([
  "authorization", "cookie", "set-cookie", "password", "passwordhash", "accesstoken",
  "refreshtoken", "token", "resumetoken", "debugtoken", "seatsecret", "reclaimsecret",
  "seattokens", "jwt_access_secret", "jwt_refresh_secret", "database_url", "direct_url",
  "accesssecret", "refreshsecret", "jwtsecret", "jwtaccesssecret", "jwtrefreshsecret", "seatreclaimsecret",
]);
const privateFields = new Set(["body", "state", "gamestate", "snapshot", "actionpayload", "payload"]);

/** Never serialize arbitrary exception messages/metadata: Prisma can embed query values. */
export function safeError(error: unknown) {
  const err = error instanceof Error ? error : undefined;
  return {
    type: err && ["Error", "TypeError", "RangeError", "ReplayError", "MatchSnapshotError",
      "PrismaClientKnownRequestError", "PrismaClientInitializationError"].includes(err.name) ? err.name : "Error",
    ...(err && "code" in err && typeof err.code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(err.code)
      ? { errorCode: err.code } : {}),
    stack: err?.stack?.split("\n").filter(line => /^\s+at /.test(line)).slice(0, 20)
      .map(line => line.replace(/(?:postgres(?:ql)?|https?):\/\/\S+/gi, "[REDACTED_URL]"))
      .join("\n"),
  };
}

function scrub(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) return safeError(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => scrub(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    secretFields.has(key.toLowerCase()) || privateFields.has(key.toLowerCase())
      ? "[REDACTED]" : ["err", "error"].includes(key) ? safeError(item)
        : key === "req" && item && typeof item === "object" ? { method: "method" in item ? item.method : undefined }
          : key === "res" && item && typeof item === "object" ? { statusCode: "statusCode" in item ? item.statusCode : undefined }
            : scrub(item, seen),
  ]));
}

// Pino intentionally resets the bindings formatter on child(). Keep the public
// child API, explicitly supply the sanitizer, and apply it recursively to children.
let pinoChild: Logger["child"] | undefined;
function protectChildBindings(logger: Logger) {
  const child = pinoChild ??= logger.child;
  logger.child = function (this: Logger, bindings, options) {
    return child.call(this, scrub(bindings) as Record<string, unknown>, options);
  } as Logger["child"];
}

export function loggerOptions(): LoggerOptions {
  return {
    level: readObservabilityConfig().logLevel,
    onChild: protectChildBindings,
    // Defence in depth, including child bindings. Formatter protects nested structured data.
    redact: [...secretFields].flatMap(key => [`["${key}"]`, `*["${key}"]`, `req.headers["${key}"]`, `res.headers["${key}"]`]),
    serializers: { err: value => value, error: value => value,
      req: req => ({ method: req.method }), res: res => ({ statusCode: res.statusCode }) },
    formatters: { log: object => scrub(object) as Record<string, unknown>,
      bindings: object => scrub(object) as Record<string, unknown> },
  };
}

export function createLogger(stream?: DestinationStream) {
  const logger = stream ? pino(loggerOptions(), stream) : pino(loggerOptions());
  protectChildBindings(logger);
  return logger;
}

// Lazy default keeps injected test loggers and DB-free tools independent of configuration.
let defaultLogger: ReturnType<typeof createLogger> | undefined;
export function getLogger() { return defaultLogger ??= createLogger(); }
