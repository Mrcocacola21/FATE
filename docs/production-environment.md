# Production environment contract

Both the existing [Render/Neon deployment](production-deployment.md) and the
[Docker deployment](docker-production.md) consume the application's existing
process environment. The server does not load a root `.env` automatically.
`packages/server/src/config.ts` and its auth/matchmaking parsers remain the source
of truth. Invalid required production configuration exits before listening;
messages identify variables without printing their values.

Examples below are placeholders, never deployable credentials. Generate independent
random JWT keys (at least 32 UTF-8 bytes each). Never put DB URLs, JWT keys or debug
tokens in frontend variables, image build arguments, source, or committed env files.

| Variable | Required in production? | Default / example | Purpose | Sensitive? |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Yes, set explicitly | `production` | Production validation, secure cookies, test-room policy; fixed by Compose | No |
| `PORT` | Optional | `3000` | HTTP and `/ws` share this port; host always `0.0.0.0`; Compose fixes container port to 3000 | No |
| `DATABASE_URL` | Yes | `postgresql://USER:ENCODED_PASSWORD@postgres:5432/fate` | Prisma runtime queries | Yes |
| `DIRECT_URL` | Yes | Same direct URL for Compose; non-pooled URL for Neon | Prisma migration/direct CLI operations, same DB/schema as runtime | Yes |
| `JWT_ACCESS_SECRET` | Yes | No default; `<independent-random-access-key>` | Access JWT signature key, at least 32 UTF-8 bytes | Yes |
| `JWT_REFRESH_SECRET` | Yes | No default; `<different-random-refresh-key>` | Refresh JWT signature key, at least 32 UTF-8 bytes, distinct from access key | Yes |
| `WEB_ORIGIN` | Yes | No production default; `https://fate.example.com` | Exact trusted auth browser origin; HTTPS, no path or trailing slash | No |
| `AUTH_COOKIE_SAME_SITE` | Optional | `none` in production; `none`, `lax`, `strict` allowed | Refresh cookie policy; `none` supports separate frontend origin | No |
| `JWT_ACCESS_TTL_SECONDS` | Optional | `900` | Access lifetime, positive integer up to 31536000 | No |
| `JWT_REFRESH_TTL_SECONDS` | Optional | `2592000` | Refresh lifetime, positive integer up to 31536000 | No |
| `ENABLE_TEST_ROOMS` | Optional | Disabled unless exactly `true` in production; Compose fixes `false` | Sandbox/Test rooms | No |
| `FATE_DEBUG_TOKEN` | Only for deliberately enabled debug operations | Unset; no example token | Existing protected REST debug access; required with production test rooms; deliberately not passed by base Compose | Yes |
| `LOG_LEVEL` | Optional | `info` | Existing Fastify/Pino JSON stdout logging; e.g. `warn` | No |
| `ROOM_TTL_MS` | Optional | `86400000` | Idle room cleanup; positive integer, otherwise existing fallback | No |
| `MAX_ROOMS` | Optional | `100` | In-memory room retention limit; positive integer | No |
| `MAX_LOG_EVENTS` | Optional | `5000` | Per-room action log retention; positive integer | No |
| `WS_MAX_PAYLOAD_BYTES` | Optional | `65536` | WebSocket payload limit; use a positive integer | No |
| `WS_RATE_LIMIT_WINDOW_MS` | Optional | `1000` | WebSocket rate window; use a positive integer | No |
| `WS_RATE_LIMIT_MAX_MESSAGES` | Optional | `60` | Messages allowed per window; use a positive integer | No |
| `RECONNECT_GRACE_MS` | Optional | `45000` | Seat/queue reconnection grace; nonnegative integer | No |
| `MATCH_SNAPSHOT_INTERVAL` | Optional | `20` | Durable checkpoints every N revisions; `0` disables periodic checkpoints, not final snapshots | No |
| `LEADERBOARD_MIN_RATED_GAMES` | Optional | `5` | Qualification threshold; positive integer up to 2147483647 | No |
| `MATCHMAKING_SERVER_PROCESSES` | Optional assertion; operationally one owner required | Only `1` supported; fixed by Compose | Rejects configured multi-process topology; does not coordinate owners | No |
| `MATCHMAKING_INITIAL_RATING_RANGE` | Optional | `100` | Initial rating search range, nonnegative integer | No |
| `MATCHMAKING_RATING_RANGE_STEP` | Optional | `50` | Range widening step, positive integer | No |
| `MATCHMAKING_RANGE_STEP_SECONDS` | Optional | `15` | Widening interval, positive integer fitting a signed 32-bit millisecond timer | No |
| `MATCHMAKING_MAX_RATING_RANGE` | Optional | `400` | Maximum range, at least the initial range | No |
| `OPENAPI_ENABLED` | Optional | Enabled unless exactly `false` | Existing `/openapi.json` policy | No |
| `SWAGGER_UI_ENABLED` | Optional | Enabled unless exactly `false` | Existing `/docs` policy, also requires OpenAPI enabled | No |

The matchmaking numeric controls (except JWT TTLs) must fit signed 32-bit integers;
snapshot interval accepts 0..2147483647. Do not export empty optional values: omit
them to keep application defaults. Base Compose supplies those defaults explicitly.
`TEST_DATABASE_URL` belongs exclusively to isolated tests, never production.

| Compose input (not application configuration) | Required? | Default / example | Purpose | Sensitive? |
| --- | --- | --- | --- | --- |
| `POSTGRES_DB` | Yes | `fate` in template | Initial database name; must match both URLs | No |
| `POSTGRES_USER` | Yes | `fate` in template | Initial database owner; must match both URLs | No |
| `POSTGRES_PASSWORD` | Yes | `<random-password>` | Initial PostgreSQL owner password | Yes |
| `SERVER_PORT` | Optional | `3000` | Published host port, container port stays 3000 | No |
| `SERVER_BIND_ADDRESS` | Optional | `127.0.0.1` | Published host interface; change only with appropriate network/proxy policy | No |

`POSTGRES_*` initializes an **empty** volume only. Editing those variables does not
change passwords or rename a database inside an existing volume. Manage existing
credentials through PostgreSQL and update both URLs deliberately.

Specify `DATABASE_URL` and `DIRECT_URL` explicitly rather than concatenating raw
credentials in YAML. URL-encode username/password components (e.g. `@` becomes
`%40`, `#` becomes `%23`); `POSTGRES_PASSWORD` remains the original raw password.
Single-quote raw values in a Compose env file when they contain `$`, `#` or spaces
(for example `POSTGRES_PASSWORD='<raw-password>'`) to prevent interpolation/comments.
Compose DNS is `postgres`, not `localhost`. For this direct self-hosted database,
both URLs normally match. With Neon, preserve TLS options, use the pooled hostname
for runtime and the direct hostname without `-pooler` for migrations.

Refresh cookies remain host-only (no Domain), HttpOnly, Secure in production and
scoped to `/api/auth`. Secure is controlled by `NODE_ENV`, not inferred from proxy
headers. Fastify currently does **not** enable `trustProxy`; Docker does not change
this. A proxy's client-IP/rate-limit policy needs deliberate trusted-hop configuration
if required. Auth CORS requires exact `WEB_ORIGIN`; the existing gameplay/WS policy
also permits localhost and Vercel origins. Packaging preserves that broader existing
policy and does not introduce wildcard credentialed auth CORS.

Frontend builds use only public `VITE_API_URL=https://api.example.com`,
`VITE_WS_URL=wss://api.example.com/ws`, and `VITE_ENABLE_TEST_ROOM=false`.
The frontend origin is `WEB_ORIGIN=https://fate.example.com`, not the API URL.
These values are compiled into Vite assets; changing them requires a frontend
rebuild. Third-party cookie blocking remains a browser constraint for separate sites.
