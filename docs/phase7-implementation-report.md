# Phase 7 — Persistent Match Results

Implemented in the existing workspace on 2026-10-02. Earlier uncommitted Phase 6 changes were preserved. No commit, deployment or production database mutation was performed.

## 1. Files

New files:

- `packages/server/prisma/migrations/20261002050000_persistent_match_results/migration.sql`
- `packages/server/src/persistence/matchResult.ts`
- `packages/server/src/routes/matchRoutes.ts`
- `packages/server/src/tests/matchResult.test.ts`
- `packages/server/src/tests/matchResult.integration.test.ts`
- This report.

Updated for this phase:

- `packages/server/prisma/schema.prisma`
- `packages/server/src/services/matchService.ts`
- `packages/server/src/repositories/matchRepository.ts`
- `packages/server/src/persistence/matchLifecycle.ts`
- `packages/server/src/index.ts`
- `packages/server/src/tests/databaseFoundation.test.ts`
- `packages/server/src/tests/matchLifecycle.test.ts`
- `packages/server/src/tests/match.integration.test.ts`
- `packages/server/src/tests/matchTestSupport.ts`
- `packages/server/package.json`
- `README.md`

Rules, WebSocket gameplay handlers, frontend production flows and dependency versions required no Phase 7 edits. The working tree also contains the preceding Phase 6 changes; they are described separately in `phase6-implementation-report.md`.

## 2. Prisma schema

Added `MatchOutcome { WIN, LOSS, DRAW }`. New Match and MatchParticipant fields are nullable to preserve historical rows. Added named `MatchLoser` User relation with `onDelete: SetNull` and `User.lostMatches`. Winner and participant deletion semantics remain SetNull. Existing status/creator/winner/participant indexes and unique constraints remain; the only added index is `Match_loserUserId_idx`.

## 3. Migration

New incremental migration `20261002050000_persistent_match_results`. Earlier migrations were not edited, and no database reset or `db push` was used.

Verified two paths on owned, isolated PostgreSQL 16:

- All six migrations through `prisma migrate deploy` on `fate_phase7_test`.
- The five preceding migration SQL files on `fate_phase7_upgrade_test`, then inserted User, Profile, AuthSession, WAITING/IN_PROGRESS/FINISHED Matches, linked and unlinked participants. Applied the new migration SQL and checked unchanged row counts, password hash, historical names, and null new fields.

Only disposable test databases were touched. The owned Docker container was removed after verification.

## 4. Durable Match fields

Existing fields retained: id, roomId, status, gameMode, seed, createdById, createdAt, startedAt, finishedAt, winnerSeat, winnerUserId, finishReason, finalRevision, updatedAt.

Added fields: `loserSeat`, `loserUserId`, `durationMs`, `turnCount`. Competitive finalization writes FINISHED, both identities/seats, reason, final timestamp, revision, duration and turn count together.

## 5. Participant result fields

`outcome` becomes WIN/LOSS for a decisive match and DRAW for both seats in the actual chess draw. `resultData` contains the documented version 1 summary:

```json
{ "version": 1, "remainingUnits": 2, "remainingHealth": 9 }
```

Counts include all living owned units, including living tokens; health sums their non-negative HP. These are derived from existing state, not accumulated invented kill/score statistics. At ended phase the existing spectator projection makes units public. No hero identifiers, hidden mechanics, full GameState, connection IDs or credentials are persisted. The read mapper whitelists the three summary keys even if historical JSON has extra fields.

## 6. Winner/loser derivation and draws

Pure `extractPersistentMatchResult` reads the accepted ended GameRoom. Decisive seats come from authoritative GameOver winner/loser. User IDs come from verified frozen runtime seat identities. The service compares them against both persisted MatchParticipant rows, requires exactly P1/P2 and distinct non-null users, and refuses mismatches. Legacy unlinked user IDs remain null; names are never used to invent identity.

The actual `chess_party` rule ends a match when both kings die, emitting gameDraw with null GameOver. Extraction recognizes this existing ended state from the authoritative chess king mapping and dead units. Both winner/loser seats and IDs remain null and both outcomes become DRAW. Rules were not changed, and no other draw was invented.

## 7. Finish reasons

Dedicated `mapGameEndReasonToMatchFinishReason` preserves the reasons currently produced by competitive decisive rules: `allEnemyUnitsDefeated` and `unknown` (special rules, including Frisk friendship). The existing mutual king defeat maps to `chessMutualKingDefeat`. Although the rules type contains other labels, no resignation, disconnect, timeout or forfeit flow was added. Unsupported extraction reasons fail explicitly. The existing String column was retained.

## 8. Duration and timestamp

Lifecycle captures one server Date at the accepted terminal transition and retains it in the retry buffer. The transaction derives `durationMs = captured finishedAt - persisted startedAt`, covering initiative/setup/placement as well as battle. Missing legacy startedAt produces null duration and `match:missing_started_at`. Negative or PostgreSQL Int-overflow duration is rejected as invalid; no client clock is accepted.

## 9. Revision

Final revision is GameRoom revision after the accepted terminal action increments it. Decisive extraction verifies equality with `gameOver.endedAtRevision`. Draws use the accepted ended room revision. Later connection metadata cannot rewrite the stored final revision.

## 10. Turn count

Turn count means the authoritative terminal battle turn index, including the terminal turn. Battle numbering starts at 1 after placement and progresses across rounds. Decisive results use `gameOver.endedAtTurn`; legacy absent stamps remain null. The existing chess draw lacks GameOver, so its final authoritative `turnNumber` supplies the index. This is neither revision/action count nor a count of completed turns.

## 11. Atomic finalization

Runtime end → pure extraction → `MatchService.finalizeMatch` → result-specific repository transaction → PostgreSQL. The service owns lifecycle, identity, outcome and equivalence validation; the repository owns Prisma operations.

The transaction conditionally updates Match where id and status=IN_PROGRESS. PostgreSQL locks the parent row and serializes competing finalizers. Within the same transaction, the service validates the loaded participants, then the repository writes result metadata and updates the existing two participant rows. Either every write commits or every write rolls back. There is no exposed partially committed FINISHED state.

## 12. Idempotency

The zero-row conditional update path loads the existing result. Equivalent FINISHED results return its canonical DTO. The first committed finishedAt/duration remain unchanged even if the retry supplies a newer server timestamp. Revision, turn count, identities, reason, outcomes and summaries must match. No new participant/result rows or side effects are created.

## 13. Conflicts and failures

Changed results raise `MATCH_RESULT_CONFLICT` without changing the original. Invalid first results raise `MATCH_RESULT_INVALID`; WAITING/CANCELLED finalization raises `MATCH_INVALID_TRANSITION`.

A persistence failure never rolls back the accepted gameplay action: the room remains ended and retains its existing lifetime. Captured data retries through the existing five-second room queue, with at most five finish attempts. Domain integrity failures and Prisma unique/foreign-key/missing-record integrity failures stop immediately. Exhaustion logs `MATCH_RESULT_RETRY_EXHAUSTED`; safe logs omit Prisma values, names and tokens. Ordinary actions do no result database work. Pending start remains ordered before finish.

## 14. Endpoint and DTO

`GET /api/matches/:id` uses a thin route, MatchService and MatchRepository. The explicit MatchDetailsDTO includes id/status/mode, created/start/finish timestamps, duration/revision/turn count/reason, winner/loser historical identities and participant outcomes/summaries. It excludes raw Prisma rows, seed, full state, actions and snapshots.

| Case | HTTP | Code |
| --- | --- | --- |
| Finished | 200 | Completed DTO |
| WAITING, IN_PROGRESS, CANCELLED | 409 | MATCH_NOT_FINISHED |
| Unknown valid UUID | 404 | MATCH_NOT_FOUND |
| Invalid UUID | 400 | INVALID_REQUEST |
| Database unavailable | 503 | MATCH_PERSISTENCE_UNAVAILABLE |

Errors use `{ "error": { "code": "...", "message": "..." } }`.

## 15. Access and historical identity

The endpoint is public. It returns only safe result data and historical `displayNameSnapshot` as `displayName`; it loads no current Profile/User relations. A renamed or removed account cannot replace the historical name. User removal nulls identifiers according to existing deletion semantics while preserving seats, names and outcomes. Test/sandbox rooms have no competitive Match and create no result.

## 16. Focused tests

- Extraction: P1 and P2 winners, loser/user derivation, final revision, terminal turn, missing turn stamp, exact summaries, unsupported reasons, rejected invalid state/test rooms, real rules-produced chess draw and safe JSON whitelisting.
- Runtime retries: accepted ended state retained, original captured result retried, permanent conflict stops immediately, transient finalization bounded to five attempts.
- PostgreSQL: both decisive winners; actual runtime terminal actions for P1, P2 and chess draw; exact duration; legacy null identities/start; canonical timestamp despite eight concurrent retries; conflicting concurrent winners; changed reason/revision/turn/identity/summary/outcome conflicts.
- Atomic rollback: a narrowly scoped test trigger fails the actual P2 SQL update after Match/P1 writes; all result fields and both participant outcomes remain uncommitted. Removing the trigger permits retry.
- API: public completed response, exact allowed keys, historical name after rename, deleted user, malformed/unknown/unfinished IDs, safe handling of extra private JSON keys, legacy completed rows.
- Existing real HTTP/WebSocket match integration now verifies winner/loser user IDs, participant outcomes, duration, revision and historical result reads. Existing start/finish outage ordering, spectators, reconnect, sandbox and ordinary-action isolation assertions remain.
- Checked zero MatchAction, MatchSnapshot and RatingHistory writes.

## 17. Commands

| Command/check | Result |
| --- | --- |
| `npm install` | Passed; no dependency version changes |
| `npm run -w server prisma:generate` | Passed |
| `npm run -w server db:validate` | Passed |
| `npm run -w server db:migrate:deploy` | Passed on isolated PostgreSQL; six migrations |
| Incremental SQL upgrade with existing rows | Passed |
| `npm run -w web typecheck` | Passed |
| `npm run lint` | Passed; 0 errors, 0 warnings |
| `npm run build` | Passed |
| `npm run test` | Passed |
| `npm run -w server test:results:db` | Passed |
| `npm run -w server test:match:db` | Passed |
| `npm run -w server test:db` | Passed |
| `npm run -w server test:auth:db` | Passed |
| `npm run -w server test:profile:db` | Passed |
| `npm run -w web test:multiplayer:e2e` | Passed on installed Edge/Chromium |
| `git diff --check` | Passed |

Root build includes web typecheck. Root tests cover deterministic rules, rules dependency boundaries, server/auth/profile/lifecycle/identity/projection/WS/reconnect/hardening/modes/test rooms and web auth/profile regressions. The Vite build retains its existing bundle-size advisory; lint reports no warnings. Final focused checks were rerun after the final result/retry edits.

## 18. Observed results

Transaction failure leaves Match IN_PROGRESS with null final fields and both participant outcomes/summaries null. Retry commits one FINISHED result. Same-result races return identical DTOs; conflicting races yield exactly one success and one MATCH_RESULT_CONFLICT. The public DTO keeps Historical Alice after profile rename and account deletion. Real runtime draw writes DRAW/DRAW with no fabricated winner/loser. Real WS gameplay end stores the authenticated users and final accepted revision. Existing browser reload/auth/reconnect behavior remains intact.

## 19. Manual versus automated verification

No human manual playthrough was claimed. HTTP/WebSocket/game-end verification was automated against the actual server and PostgreSQL. Terminal scenarios use controlled battle fixtures followed by real accepted actions; they are not full matches played from deployment to victory.

The browser smoke used the actual frontend, server, isolated PostgreSQL and installed Edge with separate account contexts. It covered guest login redirect, anonymous spectator, two accounts/participant linkage/start, F5, expired-token refresh, resume account mismatch, memory-only access tokens, logout and anonymous sandbox F5. Completed result semantics were checked through integration tests; there is no new match details frontend page.

## 20. Limits and unverified cases

The finalization retry buffer remains process-local and is lost on process exit. After five failed finish attempts or a permanent integrity failure, automatic retry stops and emits an error; this phase adds no durable outbox/recovery or operational repair UI. Production migration/application behavior was not executed against production data. No long-duration/large-scale load test or manual mobile playthrough was performed. Historical results are not guessed or backfilled, and special decisive reasons remain as coarse as the existing rules expose them.

## 21. Deferred scope

MatchAction/MatchSnapshot persistence, full state persistence, replay/restart recovery, history lists/filtering/pagination/UI, match detail UI, aggregate statistics/charts, Glicko-2/RatingHistory, leaderboard, matchmaking, achievements and administration remain deferred. No placeholders or new rating side effects were introduced.
