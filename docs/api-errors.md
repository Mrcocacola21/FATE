# REST validation and error contract

All normal REST failures use this envelope:

```json
{
  "error": {
    "code": "RATED_RATING_DIFFERENCE_TOO_LARGE",
    "message": "Rated players are too far apart.",
    "details": { "difference": 450, "maxDifference": 400 }
  }
}
```

`code` is a stable SCREAMING_SNAKE_CASE identifier. `message` is safe English fallback text; clients use `code` for behavior and own UI localization. `details` is an optional object, **omitted** when there is no useful metadata. Success DTOs keep their existing shapes.

Older pure game-rule rejections sometimes contain a sentence or lowercase identifier instead of a code. REST maps these to `RULES_REJECTED` / 409 and retains the safe fallback message. WS and pure rules keep their existing semantics.

## Status policy

| Condition | HTTP | Public code |
| --- | --- | --- |
| Invalid params, body, query, JSON, content type or request size | 400 | `VALIDATION_ERROR` |
| Missing, malformed, invalid or expired access credentials | 401 | `UNAUTHORIZED` |
| Wrong email or password | 401 | `INVALID_CREDENTIALS` |
| Missing, malformed, expired, revoked or reused refresh credentials | 401 | `INVALID_REFRESH_TOKEN` |
| Blocked identity | 403 | `ACCOUNT_BLOCKED` |
| Insufficient current role / permission | 403 | `FORBIDDEN` or an existing specific policy code |
| Untrusted authentication origin | 403 | `FORBIDDEN_ORIGIN` |
| Missing resource | 404 | `USER_NOT_FOUND`, `MATCH_NOT_FOUND`, `ROOM_NOT_FOUND`, `HERO_NOT_FOUND` |
| Unknown route (including unsupported methods) | 404 | `ROUTE_NOT_FOUND` |
| Valid input conflicts with current state | 409 | Existing domain-specific code |
| Previously interrupted, unavailable live room | 410 | `MATCH_INTERRUPTED` (existing recovery behavior) |
| Existing rate limit exceeded | 429 | `RATE_LIMITED` |
| Unexpected exception, invariant failure or unknown Prisma error | 500 | `INTERNAL_SERVER_ERROR` |
| Known DB connection/configuration/timeout failure | 503 | `DATABASE_UNAVAILABLE` |
| Auth configuration unavailable | 503 | `AUTH_UNAVAILABLE` |
| Explicit matchmaking shutdown / unavailable runtime dependency | 503 | Existing specific availability code |

Registration and REST room/game creation return 201. Login, queue join/cancel and existing action/update routes retain 200. Logout retains 204. No 422 policy is introduced. Fastify does not separately distinguish unsupported methods here; a separate 405 router is deferred.

`UNAUTHORIZED` and `USERNAME_ALREADY_TAKEN` remain the existing REST identifiers. The authenticated client refreshes once on a canonical `401 UNAUTHORIZED`; arbitrary 401 responses do not trigger refresh. WebSocket codes and frame shapes remain separate.

## Expected and unexpected failures

`errors/appError.ts` defines `AppError(code, statusCode, message, details?)`. Authentication and admin policy errors extend it through the existing `AuthError`. `ValidationError` carries normalized field issues. `errors/domainErrors.ts` maps existing identity, match-type, result and replay errors at the application/HTTP boundary; pure replay/game/rating helpers do not acquire HTTP dependencies.

One implementation in `routes/apiErrorHandler.ts` handles root, framework and feature plugin errors. Feature plugins register that same implementation so isolated integration tests have the production contract. Unknown exceptions always return:

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected server error occurred."
  }
}
```

The real exception is logged with its category and Fastify request ID. Expected client failures do not produce ERROR stack logs. Request authorization/cookie headers retain existing logger redaction. Responses never contain stacks, SQL, Prisma/Zod codes, JWT diagnostics or internal metadata. Existing registration/profile unique constraints remain translated at their resource-aware service boundary; there is no global P2002/P2025-to-conflict conversion.

Room creation and replay storage wrappers preserve their cause for HTTP classification and logging. A programming failure no longer becomes a guessed persistence/replay 503. Known database availability failures deliberately retain 503.

Replay syntax errors use `VALIDATION_ERROR`; a syntactically valid revision unavailable within the stored match still uses `INVALID_REPLAY_REVISION` / 400. Known stored replay gaps, incompatible snapshots/actions and integrity conflicts use their existing precise domain identifiers / 409. Unknown replay failures use generic 500. These mappings do not repair, clamp or fabricate replay data.

## Zod input validation

`validation/commonSchemas.ts` contains resource/user/match IDs, live room IDs, page/limit/integer queries, explicit boolean queries, ISO date-time, role, game-mode, match-type and sort-order primitives. Feature schemas remain exported beside auth, profile, admin/audit, lobby, matchmaking, match history/actions, rating history, leaderboard and replay.

`parseInput` returns inferred Zod output or throws `ValidationError`. Routes validate params before service/database access. Shared query validation rejects unsupported fields across REST; a feature route advertises its query schema with `queryConfig`. Standalone plugin handlers also parse their input. Omitted query values alone receive defaults. Query transforms are deliberately not applied twice to the request object.

Mutation bodies for registration, login, profile, room creation, queue join and admin actions are strict. No-body refresh/logout/unblock/cancel operations accept an omitted body or `{}` and reject null/extra fields. Password whitespace and the existing 8–128 character policy remain unchanged. Existing game action Zod schemas retain their payload semantics and stripping behavior, shared with the WS protocol; extra fields cannot override the actor or server-owned ratings.

Persistent IDs are UUIDs. `/api/users/:username` is a username lookup, **not** a UUID lookup. Live room IDs also support named IDs used by the existing WS/debug/recovery runtime, so `/rooms/missing` is a valid identifier followed by a 404. Hero IDs are bounded non-empty strings.

Query integers accept canonical decimal digit strings, not empty strings, signs, exponents, fractions, whitespace, arrays or repeated fields. Bounds are rejected, never silently capped or defaulted:

| Endpoint family | Page default / maximum | Limit default / maximum |
| --- | --- | --- |
| User match history, rating history, leaderboard | 1 / 21,474,836 | 20 / 100 |
| Admin user/match lists | 1 / 1,000,000 | 20 / 100 |
| Admin action/audit lists | 1 / 1,000,000 | 50 / 200 |
| Public completed action journal | Revision cursor defaults to 0, maximum 2,147,483,647 | 100 / 500 |

Existing bounded page/limit exceptions are preserved. Game mode defaults to `standard` only when omitted where the endpoint already had that default. JSON numeric fields use real numbers without string coercion. Boolean query primitives accept only `true`/`false`. Date filters accept ISO date-time with a timezone offset; invalid calendar dates and inverted ranges are rejected. No current production REST route introduces a new boolean filter.

Validation issues have a deterministic, safe structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": {
      "fields": [
        { "path": "email", "message": "Invalid value." },
        { "path": "role", "message": "Unexpected field." }
      ]
    }
  }
}
```

Fields are sorted by path/message and contain only paths and normalized messages. Raw Zod union branches, received values, issue objects and refinement internals are excluded. Parser failures may omit details because no field path is available. The existing secure JSON parser is wrapped at its boundary so malformed JSON produces 400 while application SyntaxErrors remain 500.

## Authentication and authorization

`auth/bearer.ts` shares case-insensitive Bearer syntax across protected REST, replay/actions, matchmaking and optional authenticated room creation. A supplied malformed header fails even on an endpoint that permits anonymous creation. Missing headers on protected routes fail before token/config/DB access. Missing or syntactically invalid refresh tokens likewise fail before session/database access and clear the refresh cookie. Logout remains idempotent for invalid refresh credentials.

Current account status and role are still loaded for protected account/admin operations; role/status in stale JWTs does not grant access. Login retains one error for an unknown email and wrong password. Account blocking remains consistent across login, refresh and protected REST; WS retains its existing `ACCOUNT_BLOCKED` frame code. AuditLog continues recording only its existing security/admin state transitions.

## Frontend

`api/client.ts` owns response parsing and `ApiError(status, code, message, details)` (the constructor retains its existing code-first argument order). The parser accepts only a canonical code/message envelope and preserves optional structured details. HTML, empty failures, malformed JSON and legacy envelopes yield safe `SERVER_ERROR` errors without retaining proxy text. Invalid successful DTO decoding yields `INVALID_RESPONSE`; network errors yield `NETWORK_ERROR`. 204 responses pass `undefined` through the same success decoder.

All REST calls, including the former direct fetch room/game/hero helpers in `api.ts`, use that client. Existing success DTOs are preserved. Auth/profile/admin/history/replay UI mappings branch on codes. Auth and profile forms use normalized field paths for accessible validation feedback. Refresh single-flight, account-change guards, localized messages and gameplay WS networking retain their existing behavior.

## Operational exceptions

`GET /health` and `/api/health` retain `200 { "ok": true }`. `GET /ready` retains `200/503 { "ok": boolean }`. Existing operational query tolerance remains intact, and liveness performs no DB checks. CORS preflight and `/ws` are excluded from business query validation. No universal success envelope or WS protocol migration is introduced.

## Route audit

All rows use the canonical handler and validate applicable params/body/query. Empty query objects are strict by default except the operational/WS exceptions above. GET bodies are not part of these contracts.

| Method / route | Input schemas | Access |
| --- | --- | --- |
| GET `/`, `/api/capabilities`, `/api/competitive/config`, `/api/heroes`, `/rooms` | Empty query | Public |
| GET `/api/heroes/:id` | Hero params, empty query | Public |
| GET `/rooms/:id` | Live room params, empty query | Public |
| POST `/rooms`, `/api/games` | Strict create-room body, empty query | Optional Bearer; Rated requires authentication; existing test-room gate |
| GET `/api/games/:id` | Live room params, player query | Existing debug REST gate |
| GET `/api/games/:id/log` | Live room params, empty query | Existing debug REST gate |
| POST `/api/games/:id/actions` | Live room params, player query, existing game-action schema | Existing debug gate and action permissions |
| POST `/api/auth/register`, `/login` | Strict credential body, empty query | Trusted auth origin, existing rate limits |
| POST `/api/auth/refresh`, `/logout` | Empty/omitted body, empty query, refresh cookie verification | Trusted auth origin; refresh rate limit |
| GET `/api/auth/me` | Empty query | Current active account |
| GET / PATCH `/api/profile` | Empty query / strict profile patch | Current active account |
| GET `/api/users/:username` | Username params, empty query | Public |
| GET `/api/users/:id/matches` | UUID params, match-history query | Public |
| GET `/api/users/:id/statistics` | UUID params, empty query | Public |
| GET `/api/users/:id/rating` | UUID params, game-mode query | Public |
| GET `/api/users/:id/ratings` | UUID params, empty query | Public |
| GET `/api/users/:id/rating/history` | UUID params, rating-history query | Public |
| GET `/api/leaderboard` | Leaderboard query | Public |
| GET `/api/matches/:id` | UUID params, empty query | Public result-only read |
| GET `/api/matches/:id/actions` | UUID params, revision/limit query | Active identity |
| GET `/api/matches/:id/replay` | UUID params, empty query | Active identity |
| GET `/api/matches/:id/replay/state` | UUID params, revision query | Active identity |
| GET / DELETE `/api/matchmaking/queue` | Empty query / empty or omitted cancel body | Active identity, existing rate limit |
| POST `/api/matchmaking/queue` | Strict join body, empty query | Active identity, existing rate limit |
| GET `/api/admin/users` | User-list query | Current moderator/admin |
| GET `/api/admin/users/:userId` | UUID params, empty query | Current moderator/admin |
| POST `/api/admin/users/:userId/block` | UUID params, strict block body, empty query | Existing target-role/self policy |
| POST `/api/admin/users/:userId/unblock` | UUID params, empty/omitted body, empty query | Existing target-role policy |
| PATCH `/api/admin/users/:userId/role` | UUID params, strict role body, empty query | Current admin, existing self/last-admin policy |
| GET `/api/admin/matches` | Match-list query | Current moderator/admin |
| GET `/api/admin/matches/:matchId` | UUID params, empty query | Current moderator/admin |
| GET `/api/admin/matches/:matchId/actions` | UUID params, admin action-list query | Current moderator/admin |
| GET `/api/admin/summary` | Empty query | Current moderator/admin |
| GET `/api/admin/audit` | Audit/date query | Current admin only |

## Coordinated contract changes

Old `INVALID_REQUEST`, `MATCHMAKING_INVALID_REQUEST`, REST `INVALID_LOBBY_NAME`/`INVALID_MATCH_TYPE`, and malformed replay input codes become `VALIDATION_ERROR`. All missing/invalid REST access credentials use existing `UNAUTHORIZED`; raw WS-specific access codes are not exposed over REST. Raw string/top-level debug gameplay errors become canonical objects. Unknown server errors use `INTERNAL_SERVER_ERROR`; raw library messages and blanket guessed availability/conflict responses are removed. Replay integrity failures now retain precise stored-data codes / 409 instead of aggregate `REPLAY_INTEGRITY_ERROR` / 500. Frontend code mappings and integration fixtures change together. No persistent schema, database migration, gameplay/rating/matchmaking policy, recovery algorithm or audit policy changes accompany this cleanup.

Full OpenAPI generation, API versioning, a separate 405 router and broader success DTO modernization remain future work. Exported feature schemas and error DTOs can support that work without selecting an OpenAPI adapter now.
