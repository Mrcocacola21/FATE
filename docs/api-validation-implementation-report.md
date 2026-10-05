# API validation and error cleanup — implementation report

The REST boundary now validates inputs with Zod and emits one error envelope. Existing gameplay, Glicko-2 calculations, per-mode ratings, rank thresholds, matchmaking ranges, the manual Rated gap, recovery and admin/audit policies retain their behavior. No Prisma schema changes, migrations or dependencies were added.

The detailed contract and complete route inventory are in [api-errors.md](api-errors.md). The following sections cover the 26 requested report items.

## 1. Existing patterns actually found

Fastify feature plugins registered separate error handlers. Auth and admin already shared typed `AuthError` codes, while public profile/history/rating/leaderboard routes used Zod with inconsistent validation responses. Root room/game handlers returned string errors or top-level error fields. Replay, matchmaking, identity and persistence used separate domain errors and broad catch blocks. The frontend already had a code-first `ApiError` and localized code mappings, alongside direct-fetch room/game/hero helpers with arbitrary `Error` messages.

## 2. Main inconsistencies

The same invalid input could produce `INVALID_REQUEST`, a feature-specific code, a string, or a framework response. Validation issues lacked normalized field details. Room creation returned 200; replay integrity failures became aggregate 500 errors. Blanket catches could hide bugs as unavailable storage or invalid authentication. Missing access credentials used different REST codes across feature families. Direct frontend fetches discarded status and structured details. Some service creation happened before route argument validation, unnecessarily touching database configuration for malformed requests.

## 3. Files added and changed

The complete source/test/documentation manifest follows this report. Main implementation groups:

- Server application errors: `errors/appError.ts`, `errors/domainErrors.ts`, shared `routes/apiErrorHandler.ts`, and bootstrap registration in `index.ts`.
- Server validation: `validation/commonSchemas.ts`, `parseRequest.ts`, `queryValidation.ts`, `jsonParser.ts`, and feature request schemas.
- REST routes: auth, profile, admin/audit, matchmaking, matches/actions/history/statistics, rating, leaderboard, replay, and root lobby/game routes.
- Supporting adapters: shared Bearer parsing, identity error propagation, persistence/replay causes, and profile resource-aware constraint mapping.
- Frontend: shared API client, former direct-fetch helpers, code mappings, form field feedback, and replay error presentation.
- Tests: shared envelope assertions, new server/client contract suites, UI regressions, and existing fixtures updated to the coordinated contract.

## 4. Canonical envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": {
      "fields": [{ "path": "email", "message": "Invalid value." }]
    }
  }
}
```

Codes are SCREAMING_SNAKE_CASE, messages are safe English fallbacks, and optional object `details` is omitted when absent. Unexpected exceptions return `INTERNAL_SERVER_ERROR` with `An unexpected server error occurred.` and no details.

## 5. Application/domain error architecture

`AppError` carries code, status, safe message and optional details. Existing `AuthError` extends it; `ValidationError` normalizes Zod issues. Domain adapters translate existing match, identity and replay error types outside pure rules. Root, framework and feature handlers share one implementation. Known database availability errors retain an explicit 503; unknown exceptions and unrelated Prisma constraints become safe 500 responses. Creation/storage wrappers retain their cause so real bugs remain distinguishable from dependency failures. Server logs retain the real exception, category and existing request ID.

## 6. HTTP status policy

| HTTP | Meaning |
| --- | --- |
| 200 / 201 / 204 | Existing read/update/action success; registration/room/game creation; logout |
| 400 | Invalid body/query/params, enums, pagination, date range or request parsing |
| 401 | Missing/invalid/expired access, invalid credentials, invalid refresh |
| 403 | Blocked account, current role/permission denial, existing security policy |
| 404 | Missing resource or unknown route |
| 409 | Structurally valid request conflicts with current domain state |
| 410 | Existing interrupted live-room recovery outcome |
| 429 | Existing rate limits |
| 500 | Unexpected exception or unknown database error |
| 503 | Explicit configuration/dependency unavailability or readiness failure |

No repository-wide 422 policy or new 405 routing layer was introduced. Existing specific authorization and recovery outcomes are preserved.

## 7. Zod validation architecture

`parseInput` provides inferred output and normalized failures. Shared REST query validation uses a feature's exported schema or a strict empty object by default. Feature handlers also parse input so isolated plugins retain validation. Query transforms are not assigned back to the request and therefore are not run on already-transformed values. Params/body/query validation occurs before relevant service access. The existing secure Fastify JSON parser is wrapped at its boundary; malformed JSON is 400, while an application `SyntaxError` remains an unexpected 500.

## 8. Shared schemas

Reusable schemas cover UUID resource/user/match IDs, bounded live room IDs, empty objects, role, game mode, match type, sort order, explicit boolean queries, ISO date-time, page and bounded limit/integer queries. Live rooms retain named IDs required by the current WS/debug/recovery runtime. Username lookup remains a username route rather than being mistakenly converted to UUID validation. Decimal query values reject empty strings, signs, fractions, exponents, repeated values and out-of-range numbers. Only omitted values get defaults.

## 9. Feature schemas

Added local lobby REST, matchmaking join, action journal query and replay revision schemas. Existing auth/profile/admin/history/rating/leaderboard schemas reuse shared primitives. Sensitive mutation bodies are strict. No-body mutations accept omission or `{}` and reject extra fields. Existing game action payload schemas remain shared with WS and preserve their stripping/actor semantics. Pagination exceptions are documented: normal lists 20/100, admin action/audit lists 50/200, action journal 100/500; existing page bounds remain intact. Inverted date ranges identify the upper-bound field.

## 10. Auth cleanup

REST access failures consistently use existing `UNAUTHORIZED` / 401. Login retains safe `INVALID_CREDENTIALS`; refresh retains `INVALID_REFRESH_TOKEN`. Bearer syntax is shared and case-insensitive. Missing credentials fail before configuration/session access. Invalid refresh tokens clear the cookie, and logout retains idempotent 204 behavior. Blocked identities consistently return 403. Unknown identity/database exceptions are no longer swallowed as bad tokens. Password policy, hashing and refresh rotation remain unchanged.

## 11. RBAC cleanup

Existing current-account checks remain authoritative for role and blocked status, including stale tokens. Role denial uses canonical 403. Admin/moderator target restrictions, self-protection, last-admin protection and audit access remain the existing policies. Runtime revocation behavior is preserved.

## 12. Lobby and matchmaking cleanup

Room/game creation validates strict inputs and returns 201. Root errors use the envelope. Real state conflicts use stable domain codes and 409; the Rated gap exposes only `difference` and `maxDifference`. Legacy lowercase/sentence rule rejection identifiers map to REST `RULES_REJECTED` without modifying pure rule or WS outcomes. Queue mutations validate shape before queue operations; unexpected failures propagate to the shared handler. No matchmaking range, cancellation, connection or matching policy changes were made.

## 13. Replay cleanup

Malformed UUID/revision input uses 400 validation errors. Valid revisions outside the replay's available domain retain `INVALID_REPLAY_REVISION` / 400. Known stored replay integrity conflicts return precise existing codes / 409 rather than aggregate `REPLAY_INTEGRITY_ERROR` / 500. Missing/non-replayable matches use 404/409. Unexpected storage bugs produce generic 500; explicit dependency failures remain 503. Replay algorithms and recovery data are not repaired or fabricated.

## 14. Rating and leaderboard cleanup

UUIDs, game modes, ordering and pagination use exported Zod schemas. Unknown users remain 404. Explicit bad query values are rejected rather than defaulted or capped. Glicko-2, per-mode initialization/history, rank boundaries, leaderboard policy and Rated restrictions are unchanged and covered by existing suites plus database tests.

## 15. Admin and audit cleanup

Shared validation covers IDs, roles, statuses, enums, pagination and date filters. Parsed arguments are obtained before lazy service creation. Block/role bodies reject client-supplied actor/privilege fields. Specific expected admin policy codes remain intact. Audit records, privacy, event generation and permissions retain their existing semantics. Profile P2002 mapping is limited to the username constraint; unrelated constraints are rethrown rather than mislabeled conflicts.

## 16. Unknown routes

Unknown REST routes return 404 `ROUTE_NOT_FOUND` in the canonical envelope. Invalid encoded route parameters return 400 validation errors through Fastify's framework error boundary. Unsupported methods currently follow the router's 404 behavior.

## 17. Rate limits

Existing rate-limit enforcement returns 429 `RATE_LIMITED` with a generic safe message. Retry-After/rate-limit headers remain managed by the existing plugin. No counters, windows, keys or rate-limit architecture were redesigned. The new contract suite exercises a real limiter and checks Retry-After.

## 18. Health/readiness exceptions

`/health` and `/api/health` retain `{ "ok": true }`. `/ready` retains 200/503 `{ "ok": boolean }`. Operational query tolerance, liveness independence from DB checks, CORS preflight and WS input handling remain intact. No universal success envelope was added.

## 19. Frontend ApiError architecture

`api/client.ts` retains the compatible code-first constructor and exposes status, code, safe message and optional details. One parser validates the canonical envelope. Malformed/empty/HTML/legacy failures receive safe `SERVER_ERROR` fallback; transport failure becomes `NETWORK_ERROR`; failed success decoding becomes `INVALID_RESPONSE`. 204 uses the same decoder with `undefined`. Auth/profile forms extract field paths for accessible validation feedback. UI localization and behavior use codes, not backend message matching.

## 20. Legacy parsing removed

The former room/game/hero/capability direct fetch paths now use the shared client. Raw response text and string/top-level legacy errors are not accepted as typed server errors. Existing success DTOs remain compatible; authenticated refresh single-flight and account-change protections remain intact.

## 21. Coordinated breaking changes

Old `INVALID_REQUEST` and feature-specific malformed-input codes become `VALIDATION_ERROR`. Missing/invalid REST identity codes converge on existing `UNAUTHORIZED`. Raw root error shapes become canonical objects. Creation status changes from 200 to 201. Replay integrity responses change from aggregate 500 to precise domain codes / 409. Unknown internal failures use `INTERNAL_SERVER_ERROR`. Unsupported query fields and sensitive body fields now fail explicitly; a forged room `userId` is rejected. Frontend callers, localized mappings and affected fixtures were updated together.

## 22. Tests added/updated

New `server/src/tests/apiErrors.test.ts` has five groups covering invalid params/query/body/enums, normalized multiple-field issues, malformed JSON/media type, missing/invalid/expired auth, blocked accounts, stale-role RBAC, real Rated conflict, legacy rule rejection, not-found routes, rate limits, real logger privacy, Prisma privacy, explicit booleans and timestamps. `assertApiError.ts` checks the envelope and forbidden diagnostics. New frontend parser tests cover status/code/message/details and safe fallback/decoding. Added login/blocked/validation and profile field-feedback component regressions. Existing auth/profile/match/lobby/history/statistics/replay/admin fixtures were updated for changed contract outcomes. Database fixtures confirm privileged/forged fields cannot silently affect state.

## 23. Commands actually executed

Executed `npm run -w server prisma:generate`, `db:validate`, `db:migrate:deploy`, `npm run -w web typecheck`, `npm run lint`, `npm run build`, `npm run test`, focused server `test:api-errors`/`test:replay-api`, and focused web `test:auth`/`test:profile`/`test:i18n`.

All 19 separate server database commands passed against a disposable PostgreSQL 16 Docker instance bound only to localhost, with a test database name and local-only test credentials:

```text
npm run -w server test:db
npm run -w server test:auth:db
npm run -w server test:profile:db
npm run -w server test:match:db
npm run -w server test:results:db
npm run -w server test:actions:db
npm run -w server test:history:db
npm run -w server test:statistics:db
npm run -w server test:rating:db
npm run -w server test:leaderboard:db
npm run -w server test:snapshots:db
npm run -w server test:replay:db
npm run -w server test:replay-api:db
npm run -w server test:recovery:db
npm run -w server test:match-types:db
npm run -w server test:matchmaking:db
npm run -w server test:rating:modes:db
npm run -w server test:admin:db
npm run -w server test:audit:db
```

`test:rating:modes:db` covers two integration files, so these commands execute 20 DB test files. All 11 existing migrations were applied to this temporary database. Production Neon was not used. Relevant profile/admin/audit DB tests were repeated after the final related changes.
The task-owned test container was stopped and automatically removed after verification. The user's Docker daemon remains running.

## 24. Exact verification results

| Command / check | Final result |
| --- | --- |
| `npm run -w server prisma:generate` | Exit 0; Prisma Client 6.19.0 generated |
| `npm run -w server db:validate` | Exit 0; schema valid with disposable local test DB configuration |
| `npm run -w server db:migrate:deploy` | Exit 0; 11 existing migrations applied |
| `npm run -w web typecheck` | Exit 0; also repeated successfully within final root build |
| `npm run lint` | Exit 0; 0 errors, 0 warnings with `--max-warnings 0` |
| `npm run build` | Exit 0; rules/server TypeScript, web typecheck and Vite build passed |
| `npm run test` | Exit 0; 213 TAP tests across 16 groups, 0 failed/skipped, plus successful custom domain/security/WS runners |
| `npm run -w server test:api-errors` | 5/5 groups passed; included again in final root run |
| `npm run -w server test:replay-api` | Exit 0; included again in final root run |
| `npm run -w web test:auth` | 36/36 passed; included again in final root run |
| `npm run -w web test:profile` | 13/13 passed; included again in final root run |
| `npm run -w web test:i18n` | 5/5 passed |
| Separate DB commands listed above | 19/19 commands exit 0; 20 DB test files |
| `git diff --check` | Exit 0; no whitespace errors |

The root build emits Vite's existing CJS API deprecation and chunk-size advisory (main JS approximately 1,071 kB before gzip). Some existing Node test runners emit the MockTimers experimental API notice. These do not affect the exit results; ESLint itself has zero warnings. Logs and the DB exit manifest remain in ignored `.tmp/api-contract-*` files for local inspection.

## 25. Verification limits

The API responses were inspected through actual Fastify injections and focused integration assertions, including all 11 requested representative response categories. Frontend component/parser tests and domain suites passed; browser E2E smoke scripts and production deployment were not run. Readiness behavior is covered by the existing deployment suite. Existing unrelated build/dependency notices are documented with the final results; no bundle-size or dependency upgrade work was added to this phase.

## 26. Deferred to the OpenAPI phase

Deferred full OpenAPI generation, adapter choice, formal reusable response declarations and broader success DTO modernization. A separate 405 router, API versioning, observability redesign and WS protocol changes remain outside this task. Request schemas are exported and the canonical error DTO is centralized so later documentation work can use them.

## File manifest

Added:

- `docs/api-errors.md`
- `docs/api-validation-implementation-report.md`
- `packages/server/src/auth/bearer.ts`
- `packages/server/src/errors/appError.ts`
- `packages/server/src/errors/domainErrors.ts`
- `packages/server/src/lobby/restSchemas.ts`
- `packages/server/src/matches/actionQuerySchema.ts`
- `packages/server/src/matchmaking/schemas.ts`
- `packages/server/src/replay/querySchema.ts`
- `packages/server/src/tests/apiErrors.test.ts`
- `packages/server/src/tests/assertApiError.ts`
- `packages/server/src/validation/commonSchemas.ts`
- `packages/server/src/validation/jsonParser.ts`
- `packages/server/src/validation/parseRequest.ts`
- `packages/server/src/validation/queryValidation.ts`
- `packages/web/src/auth/apiErrors.test.ts`

Changed:

- `README.md`
- `packages/server/package.json`
- `packages/server/src/admin/schemas.ts`
- `packages/server/src/auth/authErrors.ts`
- `packages/server/src/auth/authMiddleware.ts`
- `packages/server/src/auth/connectionIdentity.ts`
- `packages/server/src/index.ts`
- `packages/server/src/leaderboard/querySchema.ts`
- `packages/server/src/matches/historySchema.ts`
- `packages/server/src/persistence/matchLifecycle.ts`
- `packages/server/src/rating/historySchema.ts`
- `packages/server/src/replay/replayError.ts`
- `packages/server/src/routes.ts`
- `packages/server/src/routes/adminRoutes.ts`
- `packages/server/src/routes/apiErrorHandler.ts`
- `packages/server/src/routes/authRoutes.ts`
- `packages/server/src/routes/leaderboardRoutes.ts`
- `packages/server/src/routes/matchHistoryRoutes.ts`
- `packages/server/src/routes/matchRoutes.ts`
- `packages/server/src/routes/matchmakingRoutes.ts`
- `packages/server/src/routes/profileRoutes.ts`
- `packages/server/src/routes/ratingRoutes.ts`
- `packages/server/src/routes/replayRoutes.ts`
- `packages/server/src/routes/statisticsRoutes.ts`
- `packages/server/src/schemas.ts`
- `packages/server/src/services/profileService.ts`
- `packages/server/src/services/replayService.ts`
- `packages/server/src/tests/admin.integration.test.ts`
- `packages/server/src/tests/auth.integration.test.ts`
- `packages/server/src/tests/auth.test.ts`
- `packages/server/src/tests/lobby.test.ts`
- `packages/server/src/tests/match.integration.test.ts`
- `packages/server/src/tests/matchHistory.test.ts`
- `packages/server/src/tests/matchLifecycle.test.ts`
- `packages/server/src/tests/matchResult.integration.test.ts`
- `packages/server/src/tests/matchTypes.test.ts`
- `packages/server/src/tests/playerStatistics.test.ts`
- `packages/server/src/tests/profile.integration.test.ts`
- `packages/server/src/tests/profile.test.ts`
- `packages/server/src/tests/replayApi.test.ts`
- `packages/server/src/tests/testRoom.test.ts`
- `packages/web/src/admin/components.tsx`
- `packages/web/src/admin/locales.ts`
- `packages/web/src/api.ts`
- `packages/web/src/api/client.ts`
- `packages/web/src/auth/AuthForm.tsx`
- `packages/web/src/auth/components.test.tsx`
- `packages/web/src/auth/errorMessage.ts`
- `packages/web/src/auth/session.test.ts`
- `packages/web/src/i18n/locales/en.ts`
- `packages/web/src/i18n/locales/uk.ts`
- `packages/web/src/matches/presentation.ts`
- `packages/web/src/profile/ProfileForm.tsx`
- `packages/web/src/profile/components.test.tsx`
- `packages/web/src/profile/errorMessage.ts`
- `packages/web/src/profile/store.test.ts`
- `packages/web/src/replay/ReplayError.tsx`
- `packages/web/src/replay/replay.test.tsx`
- `packages/web/src/statistics/api.test.ts`
