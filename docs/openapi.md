# FATE REST API documentation

`/docs` serves Swagger UI; `/openapi.json` is the canonical machine-readable URL.
Both are enabled in production by default. Set `SWAGGER_UI_ENABLED=false` to disable
the UI while retaining the spec, or `OPENAPI_ENABLED=false` to disable both. Swagger's
internal `/docs/json` and `/docs/yaml` routes belong to that same UI, not separate documentation.
The server definition is relative to the current host; no deployment addresses or credentials
are read into the specification. Metadata version comes from `packages/server/package.json`.

The specification uses **OpenAPI 3.0.3**, the established target for the Fastify 4 / Swagger 8
and Zod 3 adapter used here. There is no runtime type-provider or JSON-schema validator migration.

## Sources of truth

Request bodies, params and queries use the **same Zod objects** that route handlers parse.
`documented()` puts these objects and operation metadata in Fastify's route config.
It also installs the same query schema in the existing query-validation hook.
Swagger transforms that metadata into documentation without handing converted schemas to
Fastify's AJV validator or response serializer. Strict validation, auth ordering and
unknown-query rejection therefore keep their existing behavior.

Query integer pipelines are documented as semantic integers, taking min/max from the
actual pipeline's number schema and defaults from its Zod default. Decimal URL strings
remain the only runtime input. String transformations retain input semantics. Zod
refinements still run at runtime; cross-field date relationships and the lobby name
control-character constraint are described in the operation metadata.

Response schemas are **compiled directly from public DTO producers/types**, rather than
handwritten field descriptions. `src/openapi/responseTypes.ts` links `ReturnType` /
`Awaited<ReturnType>` to auth/profile builders, public match/history/statistics/rating/
leaderboard/replay services, safe admin DTOs and the audit reader. Its small wrapper
types reflect existing `{ user }` / `{ profile }` response envelopes. Auth credentials,
room creation and health use extracted runtime DTO builders, so those types also come
from code that actually emits the JSON.

`scripts/generateResponseSchemas.cjs` uses the installed TypeScript compiler API. It reads
inferred properties, optional flags, literal enums, unions, arrays and dictionary index
types, including `Record<string, ReplayUnit>`. It never evaluates application code or
introspects a database. Unsupported types, `any`, `Date` objects, callables and positional
tuples fail generation rather than silently becoming broad objects. Intentional `unknown`
fields retain their actual extensible JSON contract (for example sanitized admin ability
payloads); stable DTO objects have named fields and reject undocumented properties.

The generated `src/openapi/generated/responses.json` is a checked-in **derived artifact**.
Do not edit it. `openapi:check` regenerates in memory and fails if it is stale; server
prebuild refreshes it. Production startup loads JSON and never loads the compiler.
The OpenAPI adapter converts nullable unions to valid 3.0 schemas, preserves `$ref`s,
and labels existing ISO timestamp string fields as date-time. Room `createdAt` remains
a numeric timestamp. Request UUID constraints come from Zod; unconstrained response
strings are not guessed to be UUIDs.

`ApiError` and `ValidationError` come from the canonical Zod error schemas. `AppError`
returns that inferred type; normalized validation fields use the same details type.
Parser failures may omit details, while Zod failures include `{ fields: [{ path, message }] }`.
Error codes are extensible strings; relevant codes/statuses are listed on each operation.
`/ready` intentionally uses `{ ok: false }` at 503. Error examples are produced by the
actual error classes. Credential examples use synthetic input values only.

## Authentication and authorization

- Access tokens are JWTs sent as `Authorization: Bearer ...` (`BearerAuth`).
- Refresh tokens stay in the HttpOnly `fate_refresh` cookie, scoped to `/api/auth`
  (`RefreshCookie`), and are never included in response JSON. Refresh rotates the cookie;
  logout clears it and is idempotent when the cookie is absent/invalid.
- Cookies are Secure in production. SameSite defaults to `none` in production and `lax`
  in development, with the existing `AUTH_COOKIE_SAME_SITE` override.
- Browser auth mutations require the configured trusted Origin; native/CLI clients may
  omit Origin. Swagger UI on an untrusted backend origin cannot bypass this check.
  HttpOnly cookies cannot be read or supplied through Swagger's JavaScript authorization box.
- Admin operations require MODERATOR or ADMIN; audit and role changes require ADMIN.
  Persisted roles/account status remain authoritative on every request. Blocked accounts
  return 403 `ACCOUNT_BLOCKED`. Email appears in admin account DTOs only for ADMIN callers.
- Casual room creation accepts guests; Rated creation requires Bearer authentication.
  Matchmaking additionally requires an active authenticated WebSocket connection.

## Coverage and intentional exclusions

The spec covers 43 operations, with Auth, Users, Profiles, Matches, Statistics, Ratings,
Leaderboard, Replay, Lobbies, Matchmaking, Admin, Audit, Operations and Heroes tags.
Historical mode strings remain as broad as the real DTOs; current rating/queue selection
uses the canonical Standard/Draft/Classic enum. RankTier comes from its actual domain type.
The competitive config endpoint exposes qualification games, not rank thresholds.

`/ws` and diagnostic `/api/games/:id`, `/api/games/:id/log`,
`/api/games/:id/actions` routes are explicitly hidden. Creation routes retain their real
shared request schema, including gated diagnostic room fields; no test-only operation
is invented. Figure Set selection and seated lobby start/join are WebSocket operations,
so there are no invented REST routes. Replay uses the safe `ReplayView`; admin snapshots
contain metadata only. Audit and persistent MatchAction history expose GET operations only.

## Contributor workflow and verification

For a new REST route:

1. Define/reuse the canonical Zod request schemas and parse those objects in the handler.
2. Build a safe public DTO; link its actual producer/type in `responseTypes.ts` and `ApiResponses`.
3. Attach `documented({ operationId, tag, body, params, query, response, ... })` beside the route.
4. Specify public/optional/Bearer/cookie security, required role, actual success status and error codes.
   Pass existing route config as the helper's second argument to preserve rate-limit settings.
5. Regenerate response schemas and add representative real-response assertions.

From the repository root:

```sh
npm run -w server openapi:schemas
npm run -w server openapi:validate
npm run -w server openapi:generate
npm run -w server test:openapi
npm run test
```

Generation emits optional `docs/generated/openapi.json` (ignored by Git) and is deterministic,
with no timestamp or live DB dependency. Validation uses Swagger Parser to check structure
and references. Tests compare registered REST routes against documented operations, detect
missing metadata/duplicate operation IDs, check secret field exclusions/security/cookies/
status conventions, and smoke the Swagger assets. `assertDocumentedResponse` uses AJV to
validate actual JSON against both the compiler-generated schema and its published OpenAPI
representation. Auth, admin/audit, match, room, rating, history, statistics, leaderboard and
replay responses have representative coverage, including null and omitted fields.

Specification generation uses `buildServer({ documentationOnly: true, matchRecovery: false })`.
Recovery and retry/queue timers do not start; services remain lazy. This option is used by
the generator/tests and does not alter normal production startup.

WebSocket/AsyncAPI documentation, client SDK generation, CI enforcement and a public developer
portal remain separate future work. No Prisma migrations or gameplay changes are required.

Response drift tests found that `makePlayerView` spread internal `stakeCounter` and
`jackTrapCounter` fields into JSON despite their explicit exclusion from `PlayerView`.
The projection now omits those counters, matching the intended public DTO; authoritative
state, rules and replay behavior are unchanged.
