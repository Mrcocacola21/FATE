# Phase 2 — Authentication Backend implementation report

Implemented backend authentication alongside the existing realtime game system. GameRoom,
P1/P2/spectator assignment, WebSocket messages and resume-token behavior are unchanged.

## Files

Added:

- `packages/server/src/auth/{authErrors,authMiddleware,config,httpSecurity,password,schemas,tokens,userDto}.ts`
- `packages/server/src/repositories/authSessionRepository.ts`
- `packages/server/src/services/authService.ts`
- `packages/server/src/routes/authRoutes.ts`
- `packages/server/src/tests/auth.test.ts`
- `packages/server/src/tests/auth.integration.test.ts`
- `packages/server/src/tests/testDatabase.ts`
- `packages/server/prisma/migrations/20261002010000_auth_sessions/migration.sql`
- `docs/auth-phase-2-report.md`

Changed:

- Prisma schema: AuthSession and User.authSessions relation.
- UserRepository: account lookup with Profile and atomic account/Profile/Rating/session creation.
- Repository exports: AuthSessionRepository.
- Database client: typed configuration error; existing lazy client retained.
- Server bootstrap: scoped auth plugin, auth-specific CORS and sensitive-header log redaction.
- Server package and root lockfile: cookie/rate-limit plugins, Argon2, JWT library/types and auth test scripts.
- `.env.example`, root README and services README: configuration, contracts, lifecycle and testing.

## Database and architecture

Migration: **20261002010000_auth_sessions**, incremental after the untouched foundation migration.
AuthSession has UUID id/userId, SHA-256 refreshTokenHash, expiresAt, revokedAt, lastUsedAt,
createdAt and updatedAt. It indexes userId/expiresAt and cascades with User deletion.
Profile and Rating schema/defaults are unchanged. Registration creates User, Profile, default Rating
and initial session with one transactional Prisma nested write, rolling everything back on conflict.

Request flow: HTTP validation/cookies → AuthService → existing UserRepository/new
AuthSessionRepository → Prisma → PostgreSQL. Token signing/claim validation and password hashing
have dedicated modules. Routes do not query Prisma. Database/configuration are requested lazily so
gameplay remains runnable without PostgreSQL or auth keys.

Passwords: Argon2id, 65536 KiB memory, three passes, one lane and library-generated random salts.
Passwords are not trimmed. Unknown/passwordless accounts still perform password verification against
a per-service dummy hash. Emails are trimmed/lowercased; handles are case-sensitive and permit only
ASCII letters, digits, underscore and hyphen, with length 3–32.

JWTs: HS256, independent explicitly configured keys of at least 32 UTF-8 bytes. No fallback keys.
Access claims: sub, type=access, jti, iat, exp. Refresh claims: sub, sid, jti, type=refresh, iat, exp.
Verification pins the algorithm and validates required claims/types; token types are not interchangeable.
Default TTLs: access 900 seconds, refresh 2592000 seconds, configurable through
JWT_ACCESS_TTL_SECONDS/JWT_REFRESH_TTL_SECONDS. JWT_ACCESS_SECRET/JWT_REFRESH_SECRET are required.

Each login creates a separate persisted session; raw refresh tokens are never stored. Refresh replaces
the SHA-256 fingerprint and jti and updates lastUsedAt while preserving the original fixed expiresAt.
An update conditioned on session id, user id, old hash, no revocation and future expiry permits exactly
one rotation. Stale/reused tokens revoke that session, including the losing concurrent request.
Clients must serialize refresh. Logout revokes only the current session; outstanding access tokens
expire naturally. `/me` loads the current account and rejects deleted users.

## HTTP security and contracts

Endpoints: POST /api/auth/register (201), login (200), refresh (200), logout (204),
GET /api/auth/me (200). Responses use one safe account DTO and never include hashes or refresh tokens.

Refresh cookie: fate_refresh, HttpOnly, host-only, Path=/api/auth, fixed session expiry.
Development: Secure=false, SameSite=Lax. Production: Secure=true, SameSite=None by default for the
Render/Vercel deployment. AUTH_COOKIE_SAME_SITE can select lax/strict/none; none requires production HTTPS.
Auth CORS grants credentials to the exact WEB_ORIGIN. Auth POST requests independently reject
untrusted Origin, including arbitrary Vercel origins; originless CLI/native clients are deliberately
supported, with originless Sec-Fetch-Site: cross-site requests rejected. Gameplay and WebSocket origin
policies remain unchanged. Auth responses set Cache-Control: no-store. Local rate limits per IP/endpoint:
register 5/minute, login 10/minute, refresh 30/minute.

Error shape: `{ "error": { "code": "...", "message": "..." } }`.
Codes: INVALID_REQUEST (400); UNAUTHORIZED, INVALID_CREDENTIALS, INVALID_REFRESH_TOKEN (401);
FORBIDDEN_ORIGIN (403); EMAIL_ALREADY_REGISTERED, USERNAME_ALREADY_TAKEN (409); RATE_LIMITED (429);
INTERNAL_ERROR (500); DATABASE_UNAVAILABLE, AUTH_UNAVAILABLE (503).
Underlying SQL/Prisma/JWT errors and sensitive fields are not returned or logged.

## Verification actually performed

| Command | Result |
| --- | --- |
| `npm install` | Passed; dependency installation and rules postinstall build completed. |
| `npm install -w server @fastify/cookie@^9 @fastify/rate-limit@^9 argon2 jsonwebtoken` | Passed. |
| `npm install -w server -D @types/jsonwebtoken` | Passed. |
| `npm run -w server prisma:generate` | Passed, Prisma Client 6.19.0. |
| `npm run -w server db:validate` | Passed with the isolated test DATABASE_URL. |
| `npm run -w server db:migrate:deploy` | Both migrations applied to isolated PostgreSQL 16; subsequent deployment reported no pending migrations. |
| `npx prisma migrate diff --from-url $env:DATABASE_URL --to-schema-datamodel packages/server/prisma/schema.prisma --exit-code` | Passed: no difference detected. |
| `npm run -w server test:auth:db` | Passed all seven reported lifecycle groups against real PostgreSQL. |
| `npm run -w server test:db` | Existing persistence integration suite passed. |
| `npx tsx packages/server/src/tests/auth.test.ts` | Password/JWT, HTTP validation, CORS/Origin, cookie, rate-limit and missing/unreachable database checks passed. |
| `npm run test` | Passed rules tests, rules boundary checks and all existing/new server test scripts. |
| `npm run build` | Passed rules/server builds, web typecheck and Vite build, with explicit build-only VITE_API_URL/VITE_WS_URL values. Existing Vite large-chunk warning remains. |
| `npm run -w server build` | Passed again after final auth edits, including Prisma generation and server TypeScript compilation. |
| `npx tsc -p packages/server/tsconfig.json --noEmit` | Passed after final auth edits. |
| `npm run -w web typecheck` | Passed. |
| `npm run lint` | Failed: 3199 errors, 15 warnings, all in unchanged existing files. |
| Targeted `npx eslint` on all new/modified server TypeScript files | Passed, zero diagnostics. Full JSON lint output confirmed zero errors in changed files. |
| `git diff --check` | Passed. |

The first build attempt overlapped with the test script's rules/dist cleanup and failed resolving
the rules package; rerunning the full build separately passed. Initial helper/test assertions were
corrected for the Argon2 library's parameter ordering and expected lowercased email; final suites passed.

The real test database was provisioned in a dedicated disposable `postgres:16-alpine` container,
`fate-auth-test-20261002`, bound only to 127.0.0.1:55432, database `fate_auth_test`. No existing development
or production database was reset, migrated or modified. Database-dependent checks were all executed.
The tests clean up only accounts created by their run and reject non-test database/schema names.
The disposable container was stopped after verification and removed automatically by Docker.

Integration coverage includes registration/default related records/KDF/storage/DTOs, validation and
conflicts, concurrent email and username registration, rollback, login/no-password/generic errors,
separate device sessions, valid/missing/malformed/expired/wrong-type access tokens, deleted users,
refresh rotation/fixed lifetime/reuse/expiry/revocation/concurrency, logout/cookie clearing/idempotence,
session isolation and AuthSession deletion cascade. Existing public gameplay is also exercised.

Frontend authentication/session management, profiles, email verification/reset, OAuth, MFA, roles/RBAC,
persistent matches, ratings, matchmaking and account-to-GameRoom integration remain deferred as requested.

Library compatibility references used during implementation: [Fastify cookie](https://github.com/fastify/fastify-cookie),
[Fastify rate limit](https://github.com/fastify/fastify-rate-limit), [node-argon2](https://github.com/ranisalt/node-argon2),
[jsonwebtoken](https://github.com/auth0/node-jsonwebtoken).
