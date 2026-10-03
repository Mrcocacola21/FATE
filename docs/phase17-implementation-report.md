# Phase 17 — Casual / Rated separation

Implemented against the current working tree, including the existing uncommitted
Phase 15/16 work. Existing changes were preserved. No production migration or
deployment was performed.

## Requested 30-point implementation report

1. **Files:** the added and changed files are listed below, separated from the
   pre-existing Phase 15/16 worktree changes.
2. **Existing fields:** Match.isRated and Match.ratingProcessedAt; rating model
   Rating; audit model RatingHistory.
3. **Schema:** no Phase 17 schema change.
4. **Migration:** no new migration; existing rating migration is
   20261003010000_glicko2_rating.
5. **Canonical name:** application matchType = CASUAL | RATED.
6. **Gameplay mode:** gameMode still selects standard/classic/draft rules;
   competitive classification is independent.
7. **Compatibility:** omitted classification defaults to Casual; historical
   records derive classification from their existing isRated flag.
8. **Creation contract:** optional matchType in both REST creation routes and
   WS create; Rated creation requires verified authentication.
9. **Validation:** invalid classification and Rated test rooms are rejected;
   participant identity checks run on the server.
10. **Runtime:** one readonly GameRoom.matchType with a protected property.
11. **Persistence:** normal WAITING Match receives isRated at creation.
12. **Immutability:** no update API; WS join cannot override classification;
    reconnect receives authoritative room metadata.
13. **Eligibility:** two distinct verified persistent users; existing initial
    rating defaults remain supported.
14. **RatingService:** existing eligibility, atomic processing and recovery are
    retained; completion invokes processing only for persisted Rated matches.
15. **Casual:** normal results, journals, snapshots, career stats and replay;
    zero rating mutations/audit rows, null ratingProcessedAt.
16. **Rated:** eligible FINISHED results use existing atomic, idempotent Glicko-2
    processing for both players.
17. **Test/debug:** Casual only; existing ephemeral behavior retained;
    Heartbreak stays hidden when disabled.
18. **Room Browser:** every room exposes a textual classification badge.
19. **Join by ID:** resolves metadata before enabling Join and explains impact.
20. **Pre-match/HUD:** type and staging description; persistent active badge.
21. **History/details:** display persisted classification.
22. **Replay:** unchanged deterministic gameplay reconstruction, classification
    added to metadata and ReplayHeader.
23. **Leaderboard:** processed Rated data only; Casual cannot affect qualification,
    rated win rate or last rated activity.
24. **Statistics:** general career statistics include both eligible match types.
25. **Tests:** new runtime, six-game PostgreSQL and browser suites; updated
    rating, result DTO, creation, decoder and replay regression fixtures/tests.
26. **Visual review:** four viewports; the exact inspected screens are listed below.
27. **Commands:** the command/result matrix below records actual executions.
28. **Results:** typecheck, lint (zero errors/warnings), build, complete root tests,
    listed DB suites and browser smoke all exited 0.
29. **Verification limits:** no replay screenshot, production deployment/migration
    or large-scale load test; replay DB/API/frontend behavior was tested.
30. **Deferred:** Matchmaking Queue, automatic rated matching, seasons and
    placement/rank-tier UX.

## Architecture and durable compatibility

The actual Prisma model is **Rating**, not PlayerRating. The current Match already
has `isRated Boolean @default(false)` and nullable `ratingProcessedAt`; the
existing Phase 15 migration is `20261003010000_glicko2_rating`. RatingHistory,
the rating eligibility predicate and leaderboard queries already use this flag.
Phase 17 reuses it. **No schema change, new migration or extra durable enum** was
introduced. Historical rows retain their stored classification; unrated rows stay
Casual. No rating backfill or recovery scan was added.

Application/API representation is `matchType: "CASUAL" | "RATED"`. Runtime
GameRoom has one readonly `matchType`, additionally protected by a non-writable,
non-configurable property descriptor. MatchLifecycle maps it to durable isRated
when creating the normal WAITING Match, before publishing the room. Read services
derive matchType from isRated. GameState contains no competitive classification.

Existing gameplay `gameMode` remains standard/classic/draft. Its lobby selector,
rules, abilities, RNG and replay algorithms are unchanged. No shared DTO package
exists in the current repository; server and web each centralize their application
MatchType contract outside packages/rules, following the existing transport-type
architecture.

## Contracts, validation and identity

| Surface | Contract |
| --- | --- |
| POST /rooms, POST /api/games | Optional matchType, independently optional gameMode. Omission means CASUAL. Rated creator needs a verified Bearer token. |
| WS joinRoom, mode=create | Optional matchType; omitted means CASUAL. RATED requires verified accessToken. |
| WS joinRoom, mode=join | Must omit matchType. An attempt to supply it is rejected as MATCH_TYPE_IMMUTABLE. |
| GET /rooms, GET /rooms/:id | Public safe RoomSummary includes matchType. Missing room returns controlled ROOM_NOT_FOUND. |
| WS joinAck, roomState.meta | Authoritative matchType accompanies joining/reconnecting state. |
| History, details, replay metadata | Classification mapped from the persisted isRated field. Web decoders validate it explicitly. |

Zod rejects values outside CASUAL/RATED, including null. Runtime construction also
validates the value, protecting internal call sites. Rated test-room intent is
rejected, rather than silently downgraded. There is no update/toggle endpoint.
Room seat transitions never copy a client classification into the runtime room.

Normal P1/P2 already required verified persistent accounts and distinct users in
this architecture; Casual retains these restrictions. Rated seat errors use
RATED_MATCH_REQUIRES_AUTHENTICATION and RATED_MATCH_SAME_USER. Rated start checks
the existing distinct-seat identity invariant, returning
RATED_MATCH_INVALID_PARTICIPANTS when it fails. The same validation covers draft
start. Public spectating remains supported. Existing rating rows/placements are
not required; canonical initial Glicko-2 defaults still apply.

## Rating, persistence and statistics behavior

**Casual:** the normal lifecycle persists Match result, participants, actions and
snapshots, including status, winner/outcomes, timestamps, duration, turns and final
revision. Completion skips RatingService. Its recovery entrypoint independently
recognizes isRated=false as ineligible. Neither player's rating, ratingDeviation,
volatility, ratedGames or rating timestamps change. There are zero RatingHistory
rows and ratingProcessedAt remains null, including repeated finalization.

**Rated:** normal result persistence commits first, then the existing RatingService
processes an eligible FINISHED result. Both ratings, both RatingHistory records
and ratingProcessedAt commit atomically under the existing serializable
transaction and ordered player locks. Duplicate completion/recovery remains
idempotent. Existing tests retain failure rollback, concurrency, lazy defaults,
invalid/self-play exclusions and restart recovery coverage.

**Test/debug/Heartbreak:** always Casual. Existing ephemeral test-room behavior
remains: no persistent Match, action journal, rating writes or RatingHistory.
Heartbreak is absent from the rendered navigation when test rooms are disabled;
no Rated selector is exposed in its creation dialog.

Leaderboard implementation is unchanged: only successfully processed rated games
contribute to rated counts, wins/losses/draws, winRate, qualification, rank and last
rated activity. General career statistics still count eligible completed matches
of both types, with byGameMode describing gameplay rules. Deterministic replay
works for both classifications; only its metadata/header gains a badge.

## UI and accessibility

Create Match defaults to Casual and offers two compact native-radio cards with
visible rating consequences. Rated is disabled for unauthenticated creators with
an explanation. Native keyboard selection, explicit accessible names, checked
state and associated descriptions support screen readers. Cards stack on mobile.
English and Ukrainian include labels, descriptions, lookup status and error text.

Room cards show textual badges before Join. Join by ID uses cached room metadata
or a debounced public lookup; Join stays disabled until the metadata is resolved.
Stale lookup results cannot enable a different typed ID. The dialog displays a
visible rating consequence statement. Pre-match staging repeats the type and
description; the compact active HUD preserves a badge across reconnect. History
cards, Match Details and ReplayHeader expose the persisted classification.

No live rating estimates, zero-delta Casual rating section, large glowing borders,
or extra confirmation flow were added.

## Files added

- packages/server/src/matches/matchType.ts
- packages/server/src/tests/matchTypes.test.ts
- packages/server/src/tests/matchTypes.integration.test.ts
- packages/web/src/matches/matchType.ts
- packages/web/src/matches/MatchTypeBadge.tsx
- packages/web/scripts/match-types-smoke.mjs
- docs/phase17-implementation-report.md

## Files changed for this phase

- Server: package.json; src/store.ts; schemas.ts; routes.ts; ws.ts;
  auth/connectionIdentity.ts; persistence/matchLifecycle.ts;
  repositories/matchHistoryRepository.ts; services/matchService.ts,
  matchHistoryService.ts, replayQueryService.ts and README.md;
  tests/matchHistory.test.ts, matchResult.integration.test.ts and rating.integration.test.ts.
- Web: package.json; src/api.ts; ws.ts; store.ts; api/matchApi.ts and replayApi.ts;
  lobby/RoomConnectionDialog.tsx, RoomBrowser.tsx and Lobby.test.tsx;
  game/components/GameTopBar.tsx;
  game/gameshell-content/components/GameShellSideColumn.tsx;
  matches/types.ts, MatchHistoryList.tsx, api.test.ts and components.test.tsx;
  pages/MatchDetailsPage.tsx; replay/types.ts, ReplayHeader.tsx and replay.test.tsx;
  statistics/fixtures.ts; i18n/displayMetadata.ts and locales/en.ts, uk.ts.
- Existing browser fixtures: app-shell-server.ts exposes the second test account;
  app-shell-smoke.mjs, match-history-smoke.mjs and statistics-smoke.mjs include
  classification in HTTP finished-match fixtures for the strict decoders.
- Root README.md documents product semantics and transport contracts.

Schema, old migrations, packages/rules, RatingService and Leaderboard/Statistics
algorithms were not changed by Phase 17. Other dirty/untracked files belong to
the existing worktree and are not attributed to this phase.

## Verification

New runtime tests cover safe defaults, explicit Rated persistence, REST and WS
validation, room lookup/list and joining metadata, immutability, authenticated
creation, invalid/same-user competitors, public spectating and Casual test rooms.

New guarded PostgreSQL test runs **six complete legal classic games**, with normal
runtime action persistence. It checks all four rating fields and both users,
duplicate finalization/recovery, zero Casual audit rows, full journals/snapshots,
deterministic replay for Casual and Rated, history/details classification and
career totals. Three Casual wins + two Rated wins + one Rated loss produce:
career gamesPlayed=6; leaderboard ratedGames=3, wins=2, losses=1, winRate=2/3.
A Jan 10 Casual result leaves last rated activity at Jan 1.

Existing rating integration now creates its Rated runtime room through the real
creation contract, instead of changing isRated after creating a Casual room.
Frontend tests cover Casual default, descriptions, explicit Rated request,
authentication explanation and strict response metadata.

Local database verification uses a disposable postgres:16-alpine container,
fate-phase17-postgres, bound only to 127.0.0.1:53517 with isolated database
fate_phase17_test. All eight existing migrations were applied to the empty local
database using migrate deploy; migrate status reported up to date. No Neon URL
was used for a migration or integration test.
After verification, the owned test container and its disposable volume were
removed successfully with `docker rm --force --volumes fate-phase17-postgres`.

Transcripts are preserved under the ignored packages/web/test-results/phase17
directory; screenshots under packages/web/test-results/match-types.

| Command actually executed | Result |
| --- | --- |
| npm install | Exit 0; existing dependency advisories reported, no automatic audit fix. |
| npm run -w server prisma:generate | Exit 0 (also run by build/test pre-hooks). |
| npm run -w server db:validate | Exit 0, valid schema. |
| npm run -w server db:migrate:deploy | Exit 0, eight existing migrations applied to empty local test DB. |
| npm run -w server db:migrate:status | Exit 0, local schema up to date. |
| npm run -w web typecheck | Exit 0, no TypeScript errors. |
| npm run lint | Exit 0, zero errors and zero warnings. |
| npm run build | Exit 0; existing Vite bundle-size/CJS/Browserslist advisories remain. |
| npm run test | Exit 0, complete root suite green. |
| npm run -w server test:match-types | Exit 0, runtime/REST/WS assertions passed. |
| npm run -w server test:match-types:db | Exit 0, complete six-game scenario passed. |
| npm run -w server test:rating:db | Exit 0, atomic/idempotent rating regression passed. |
| npm run -w server test:leaderboard:db | Exit 0, all rated-only/qualification/ranking/API regressions passed. |
| npm run -w server test:statistics:db | Exit 0, general career statistics regression passed. |
| npm run -w server test:replay:db | Exit 0, deterministic reconstruction/read-only regression passed. |
| npm run -w server test:history:db | Exit 0, history DB/API regression passed. |
| npm run -w server test:results:db | Exit 0, atomic results/HTTP regression passed. |
| npm run -w server test:replay-api:db | Exit 0, durable replay API/read-only regression passed. |
| npm run -w web test:shell | Exit 0, 12 passed / 0 failed. |
| npm run -w web test:matches | Exit 0, 15 passed / 0 failed. |
| npm run -w web test:replay | Exit 0, 10 passed / 0 failed, including both classification badges. |
| npm run -w web test:i18n | Exit 0, 5 passed / 0 failed. |
| npm run -w web test:match-types:e2e | Exit 0, all four viewports and both real WS create/start/reconnect flows passed; no horizontal overflow or uncaught page errors. |

Verification issues resolved during the work: the fast legal bot needed periodic
journal draining to stay within the normal shutdown timeout; Windows Prisma
generation had to run after active DB clients released the engine DLL; the public
result DTO key-whitelist test needed its intended new matchType field. The browser
test uses a built Vite preview to avoid dev transform startup stalls, waits for
authoritative state and accepts the application's existing Leave confirmation.
These adjustments do not relax rating or persistence assertions.

Browser automation checked 1920x1080, 1366x768, 768x1024 and 390x844: Casual
default, selected Rated, mixed room cards, join metadata, history and details.
Both pre-match and active placement HUDs were checked at 1366x768 and 390x844,
and both types retained their badge after reload. A room absent from the browser
list was resolved using GET /rooms/:id before Join became available. Heartbreak
was absent with test rooms disabled.

Screenshots visually inspected: rooms-1920, rooms-390, create-rated-390,
create-casual-1920, prematch-casual-390, prematch-rated-1366, active-casual-1366,
active-rated-390, reconnect-casual-390, history-768 and details-rated-1366.
Cards, badges and descriptions remain readable without horizontal overflow.
The in-app Node REPL browser tool was unavailable; automation used the existing
Playwright dependency with installed Chromium. Browser data fixtures verify UI
behavior; the separate real PostgreSQL suites verify rating/persistence effects.

No required local behavior remains unverified. Screenshots of replay itself were
not taken in this phase; both persisted deterministic replays, replay API and
both ReplayHeader classifications were verified by DB and frontend tests.

## Deferred scope

Matchmaking Queue, automatic rated opponent matching, seasons, separate placement
algorithms and rank-tier UX remain deferred. No queue, rewards, decay, alternate
balance or second room system was introduced. Production deployment/migration and
real large-scale load testing were not performed.
