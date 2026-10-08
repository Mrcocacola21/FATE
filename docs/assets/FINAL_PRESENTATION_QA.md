# Phase 15: Final presentation QA

Audit date: 2026-10-09 (Europe/Kiev). Verdict: **READY WITH KNOWN LIMITATIONS** for the presentation implementation. Physical-device, listening and deployment verification remain open; this is not unconditional deployment certification.

## 1. Executive summary

This pass audited the actual rules/server/web workspaces, both registries, Board, delivery/session/scheduler code, organized media, historical asset documentation, preview pages and browser fixtures. It adds selective roster warmup, a shared bounded load queue, image decode diagnostics, cache retention, visibility cleanup, finite legacy signature tails and a narrow-phone sizing fix. No source media was converted or re-encoded. Rules, recipient projection, the DOM/CSS renderer and Web Audio ownership remain intact.

The full regression runner, complete server script, complete web discovery, focused effects/SFX/VFX suites, typecheck, lint, production build and local browser checks passed. Database integration was attempted but could not start because `TEST_DATABASE_URL` is absent. Listening, a complete manual match, physical mobile/Safari profiling and real OS background suspension were not performed.

Evidence is committed in [PHASE15_MEASUREMENTS.json](PHASE15_MEASUREMENTS.json). Raw rerunnable outputs and screenshots live under the ignored `packages/web/test-results/phase15/`, `test-results/testing/` and existing hero/browser result directories. Root `phase15-*.log` files record command output. No external telemetry or deployment was added.

## 2. Final architecture

Rules emit authoritative events. Server projection removes unauthorized data, then delivery supplies stream/revision/event identity. `PresentationSession` establishes a silent hydration baseline and owns ordered ingress/dedupe. The existing visual-resolution/combat/movement scheduler supplies event-time cues to audio, VFX and HP/combat feedback. Snapshot receipt does not consume the live-event watermark.

`SfxPlaybackSession` owns defensive cue dedupe/timers; `SfxPlayer` resolves semantic cues through one `AudioManager`, native Web Audio nodes and separate UI/gameplay gains. `VfxLayer`, `VfxSprite` and canonical `vfxGeometry` remain the renderer. Persistent statuses remain current projected-state consumers; hydration does not produce entry/tick/reveal sounds.

`presentationPreload` coordinates these existing consumers through `AssetLoadQueue`. It reads only recipient-projected assigned hero identities. It never consults secret targets, hazard locations/counts, movement routes or private pending choices.

## 3. Current asset inventory

| Organized runtime media | Files | Transfer bytes |
| --- | ---: | ---: |
| WAV | 168 | 17,242,898 |
| MP3 | 15 | 2,357,624 |
| MPEG (`.mp3.mpeg`) | 2 | 340,621 |
| VFX PNG | 165 | 6,464,476 |

The 185 audio files total 19.02 MiB. All 165 VFX PNGs would require approximately **216.29 MiB** of ordinary RGBA pixels if decoded together. These counts exclude vendor authoring packs and unrelated portraits/board art.

The runtime registry has 91 semantic SFX definitions referencing 114 unique audio files (12,931,012 bytes), and 92 VFX definitions referencing 104 unique rasters (4,369,405 bytes). Procedural effects and shared aliases explain the differing counts. Production decoding measured 33,207,340 bytes of PCM across the registered audio library. Registered PNGs represent 148,907,008 estimated RGBA bytes. Neither figure is the normal match's residency.

Core warmup uses two UI definitions, seven gameplay definitions and five VFX definitions. The sample Kaiser/Sans/Jack roster warms 16 sound keys and 15 VFX definitions; primary/accent pairs require additional unique images. Rare transformation sounds and artwork remain lazy. Every registered path passed exact filename-case inspection and strip-dimension validation.

## 4. Preload strategy

`UI -> Core Game -> Active Roster / Heavy Match Assets -> Lazy Assets`

| Stage | Trigger and policy |
| --- | --- |
| A: UI | First meaningful gesture resumes/unlocks the context and warms one variant each of click/invalid. No fake source; landing fetches no audio. |
| B: Core | An enabled visible game Board warms first variants of seven existing common definitions and five core VFX. Joining/commands never await this work. |
| C: Roster | A sorted, deduplicated key from projected `rosterUnits` (or projected `units` for legacy fixtures) warms the assigned heroes. Ordinary relevant definitions use medium priority. |
| D: Heavy | Known roster Dora/Carpet/Forest/Gaster/Fireball/Boat/Tralala assets are submitted at high priority immediately alongside roster warmup. This stage intentionally overlaps C so signatures do not wait behind other roster art. |
| E: Lazy | Cold chosen variants warm on actual authorized cues; safe ready variants can serve the same semantic cue. Rare forms and unused artwork are not eagerly fetched. Cold sound completion never replays its original cue. |

Core is submitted first. Waiting high jobs precede medium/low jobs; active work is not preempted. Fetch/decode warmup shares four active slots and at most 256 waiting jobs. There were four peak active jobs and 31 peak pending jobs in the measured run. This is an initial bounded policy validated locally, not proof that four is optimal on every device. URL/in-flight caches deduplicate aliases and repeat requests. Legacy explicit hero-preload helper APIs remain compatible, but live Board uses the selective planner.

## 5. Memory policy

| Resource | Actual policy/limit |
| --- | --- |
| Decoded audio cache | 32 MiB soft budget; preserve core/active-roster URLs, evict oldest unpinned entries; obsolete roster-owned references released. Active source nodes retain their own buffer. |
| Warm image references | 32 MiB soft budget estimated from full natural dimensions; retain core/active roster; release obsolete warmup-owned images. DOM/CSS lifetimes remain independent. |
| Audio voices | 16 global; registry per-key limits 1–4; oldest eligible existing voice is stopped when a limit is reached. |
| Active VFX / text effects | 64 VFX / 120 generic board effects. |
| Identities / batches | 1,024 ingress event IDs; 512 VFX IDs; 128 pending presentation batches; 64 pre-baseline batches. |
| Audio scheduling | 512 consumed cue IDs and 512 delayed timers. A 600-cue test verified caps and complete reset cleanup. |
| Deferred combat | 64 chains and 1,024 total retained deferred events. |

The sample match had 25 audio buffers (7,927,956 PCM bytes) and 24 warm images (41,493,504 estimated pixel bytes). Active images therefore exceed the **soft** 32 MiB target; they are deliberately protected. After roster release and after ten Asgore/River roster cycles, both caches returned to nine core audio buffers (617,332 bytes) and five core images (2,818,048 estimated bytes), with zero pending loads or voices.

This measures owned references, not heap/RSS/GPU reclamation. Browser decoded caches, GPU copies, compositor surfaces and active nodes can retain additional memory. Dropping a JavaScript image reference does not demonstrate immediate physical memory release. No exact reclaimed-byte claim is made.

## 6. Performance results

Local headless Edge/Chromium on Windows, no network throttling, one final sample per measurement; other verification jobs ran concurrently.

| Metric | Result | Qualification |
| --- | ---: | --- |
| Core gameplay audio warmup | 19.5 ms | After UI warmup; local dev asset serving. |
| Core image fetch/decode | 14.7 ms | `Image.decode()`, not GPU upload readiness. |
| Kaiser/Sans/Jack warmup | 157.2 ms | Audio/images together, including heavy composites. |
| Repeat warm roster | 0.3 ms | Reused already-ready references. |
| Ready SFX dispatch to native `start()` | 0.4 ms | CPU dispatch, not acoustic onset/output latency. |
| Peak jobs / pending | 4 / 31 | Shared warmup budget. |

Before/after preload transfer and build sizes are actual file-byte measurements. No pre-change browser latency, heap profile, frame-time distribution, exact GPU upload timing, physical-mobile bandwidth or acoustic latency was captured. No latency improvement percentage is claimed. Cache/reference estimates and decoded PCM counts are separated from compressed transfer.

## 7. Audio tuning

Master volume remains clamped to 0–1; mute updates active master output and prevents future playback. UI/gameplay buses, persisted controls, gesture unlock, silent resume denial, URL reuse and unmute without replay passed unit and real-browser checks. No category sliders or new mixer were introduced.

Variant selection remains a pure cue-identity hash and consumes no rules RNG. Duplicate/rerender tests keep cue identity stable. Ready alternates are semantically identical fallbacks; the intended cold variant warms once for later cues.

Measured full-clip RMS after gain was approximately -21 dB for generic hits, -28 dB for dice, -30 dB for UI and -31 to -33 dB for ordinary status cues. Two legacy outliers were reduced: Lechy Confuse Terrain gain 0.4 -> 0.27 (full-clip RMS -17.75 -> -21.17 dB), and False Trail Explosion 0.4 -> 0.31 (-19.07 -> -21.28 dB). These are waveform-level comparisons, not subjective loudness/LUFS validation.

Measured long masters remain preserved: Dora 5 s, Jack signature 8.54 s, Lechy Storm 12.62 s, Guide Traveler 7.34 s and Confuse Terrain 3.64 s. Playback is now capped at 1.5 s, 2 s, 1.5 s, 1.2 s and 1.2 s respectively, with a 60 ms ending fade. A native-browser source-start observation verified Dora's 1.5 s cap. Shorter authoritative segment durations take precedence. Existing per-key voice caps and session/visibility cancellation remain effective. Listening is still required to approve perceived balance and the chosen cut points.

## 8. VFX polish

Shared strip timing, frame slices/crops, primary/accent stacking, event identity and geometry were retained. Thirty-six Dora/Carpet/Forest area cases, ten ray cases, all core artwork, resize identity, composition/frame stepping, pointer input, cleanup and reduced motion passed browser infrastructure assertions. The old test's hard-coded 0.35-cell Gaster thickness was replaced with the actual cropped-beam registry value (1.125 cells); production artwork/geometry were not changed to satisfy the old assertion.

Warmup tracks image readiness/failure and full-strip pixel footprint. Failed optional artwork is omitted safely; unknown queued VFX is ignored. Completion does not re-enqueue or restart animation. Persistent CSS/status badges continue when optional artwork is unavailable. No generic explosion fallback was added, and missing authorization still suppresses positional feedback.

Screenshots actually reviewed include the narrow light status board, dark P2 Gaster, light P2 Carpet corner and a contact sheet of reduced Dora/Carpet/Forest/Gaster/Fireball/Boat/Tralala/bone-field/storm previews. Those static views showed clipped edge art without opaque board-covering blocks; HP/selection/status layers remained visible. This is sampled screenshot QA, not complete animation or audible synchronization review.

## 9. Mobile and themes

Twenty layout combinations were asserted at 320x568, 390x844, 844x390, 768x1024 and 1440x1050, using light/dark and P1/P2. All 81 cell boxes must be within the viewport; checking document overflow alone previously missed a clipped preview grid. The preview now uses `minmax(0,1fr)` and zero minimum widths. Board fitting allows cells below its preferred 32 px minimum when shell/gutters leave insufficient space. A focused test checks both axes with/without gutters.

At the narrowest padded preview, cells measure 25 px; status stacks use the existing accessible overflow summary. Detailed HP/status text and touch precision are limited at this scale. Gameplay sound controls passed the 390 px smoke and decorative layers passed click-through tests. A full pending-decision game flow at every viewport or on physical devices was not performed. Theme/persistent-status/mobile component suites passed.

## 10. Reconnect and duplicates

Passed scenarios include silent initial/reconnect hydration, stale stream/token/socket rejection, same-revision snapshot-before-action-result, duplicate batch/event delivery, distinct identical-content event IDs, ingress bursts before React commit, room/role/stream reset and active/delayed cue cancellation. The new 120-batch ingress test preserves every distinct identity through repeated snapshots and duplicates, then establishes a silent spectator baseline.

Server tests verify journal truncation with `MAX_LOG_EVENTS=3` across 12 accepted commands, and recovery from revision 20 with an empty recent log followed by a unique revision 21. Actual WebSocket tests verify spectator/authenticated reconnect and Vlad waiting-state restoration. Full PostgreSQL restart recovery was not run.

## 11. Background tab

Visibility immediately stops gameplay voices and disables one-shot consumers. Hidden deliveries still update authoritative view/ingress and are consumed silently; persistent state reconciles normally. Resuming does not read history or replay it. The 15 s ordered-batch lifetime remains distinct from the new 500 ms audio timer lateness allowance.

A real Board harness received 120 legitimate events plus 120 duplicates while simulated `document.hidden` was true. It produced zero audio/VFX one-shots, zero historical audio on resume and one fresh subsequent audio cue. A snapshot-only HP update also remained a state update. Timer tests verify throttled callback expiry and reset. Browser visibility was simulated; true OS tab freezing/suspension remains NOT TESTED.

## 12. Spectator and privacy

Complete server projection/serialization and web mapping suites passed for private Hassan targets/pending choices, Jack snares, Vlad stakes, Chikatilo marks, stealth/event-time coordinates, hidden collisions/movement and spectator state. Unauthorized payloads are removed before web delivery. Audio omission/fallback does not bypass this boundary. Roster tests verify that modifying secret targets/hazards does not change the assigned-identity preload plan.

Persistent owner-only statuses disappear on role changes; public statuses hydrate silently. Both normal socket tests and hero/persistent browser fixtures verify public spectator versus owner-only feedback. Not every spectator join time across every ability was manually exercised.

## 13. Hero regression results

| Pack | Verified results |
| --- | --- |
| Kaiser / Vlad | Aggregate impact once, independent defender rolls/outcomes, no double HP, canonical area clipping/orientation, redacted anchors fail closed; reconnect waiting state. |
| Sans | Gaster reaches board boundary; selected direction and piercing anchors preserved; Last Attack remains at zero HP before final death; choice/reconnect/curse tick/removal and no-target branch covered. |
| Asgore | Fireball hit/miss correlation, no miss hit bloom/impact/death/HP tween, manual defender pending reconnect; Fire/Soul Parade; reduced-motion miss. |
| River Person | Only reached Boat steps, stake interruption/current-cell drop choices, separate passenger landing death, hidden path safety; multiple Tralala reactors, pause/resume/manual choices and death cancellation; no resolved-route replay. |
| Jack | Reached snares, Covering Tracks aggregate direct damage once, no duplicate matching attack damage/death, private hazards. |
| Hassan | Owner-only target/pending data; authorized order/control cues; other recipients do not receive private highlights. |
| Genghis / Chikatilo / Lechy | Actual cast/status/confirmed movement/area mappings, marks/false-token privacy, three independent manual reactors, storm and reveal fixtures. |
| Other catalog heroes | Complete roster-derived coverage, actual event mappers, shared combat/movement and projected persistent status tests passed. Bespoke manual animation/listening for each was not performed. |

The existing [hero coverage matrix](../../packages/web/src/assets/HERO_PRESENTATION_COVERAGE.md) remains authoritative for intentional generic/silent cases. Frisk One Path, Duolingo Berserker and Kaneki Scolopendra lack distinct unlock events; they restore current state silently. Undyne Direction Shift is metadata without a runtime resolver. No new gameplay trigger was invented during this pass.

## 14. Missing asset diagnostics

There are zero broken registered files/case mismatches/strip dimensions and zero media decode failures in local Chromium production checks. Unknown sounds remain silent or use only caller-approved semantic fallback. Audio/image failures diagnose once per URL in development, suppress failed-load retry loops, resolve without unhandled rejection and leave commands playable. Focused missing-asset tests cover fetch/decode failure and cache aliases. Diagnostics contain asset keys/URLs and counts, not gameplay payloads.

The two MPEG files were served as `video/mpeg` by Vite preview and both decoded through Web Audio. Audio WAV/MP3 and PNG MIME behavior also passed. This does not prove Safari support. Optional unregistered assets are preserved and never treated as missing runtime dependencies.

## 15. VFX preview

The existing gated `/vfx-preview` uses the same registry and local preview requests without commands, live stream IDs, revisions or live dedupe changes. It supports effect/replay, P1/P2, center/edges/corner, board width, ray direction, composition, reduced motion, persistent snapshots and recipient selection. Added controls/counters show real theme, warm/failed images, URL readiness, estimated pixel bytes, audio cache/voices and active/pending load jobs.

Static, strip, composite 3x3/5x5, ray, projectile, path and persistent examples are available. Snapshots/geometry checks described above were performed. The production smoke navigates the built shell because production preview access is intentionally gated; it does not enable debug gameplay in deployment.

## 16. Production build

Exact command: `npm run build`, with process-scoped local smoke endpoints:

```powershell
$env:VITE_API_URL='http://127.0.0.1:3196'
$env:VITE_WS_URL='ws://127.0.0.1:3196/ws'
npm run build
```

PASS: rules/server compilation, Prisma generation/OpenAPI schema generation, web typecheck and Vite build. Two JS chunks total 1,398,833 bytes (399,352 gzip); CSS is 180,574 bytes (32,269 gzip). The largest JS chunk remains about 1.207 MB. Physical non-JS/CSS emitted output totals 43,788,557 bytes, including existing portraits/board art. This is output size, not a landing or match download.

No duplicate emitted content hashes were found. All registered media was matched to emitted content or inline PNG data, then fetched/decoded from the built application's URLs at base `/`. Local cache headers were `no-cache`; CDN immutable caching/custom base paths/real production latency were not tested. Existing `VITE_API_URL`, `VITE_WS_URL`, `WEB_ORIGIN` configuration is preserved; no production service URL is hard-coded into presentation source. Built-shell auth requests were stubbed for this isolated media check; actual WebSocket coverage uses the existing local server fixture.

Existing warnings remain: Vite CJS Node API deprecation, old Browserslist data and a chunk over 500 kB. No blanket chunk/asset migration or warning-limit relaxation was performed. See [deployment environment contract](../production-environment.md) for real hosting configuration.

## 17. Test suites

| Executed command | Final result |
| --- | --- |
| `npm test` | PASS: 41 suite executions, including rules/boundaries, server unit/contract/WebSocket/replay benchmark and full discovered web tests. |
| `npm run -w rules test` | PASS: 449 printed scenario success lines; legacy runner has no aggregate TAP count. |
| `npm run -w server test` | PASS: complete configured script; 40 TAP cases across its TAP blocks plus legacy assertion runners (no single aggregate count). |
| `npm run test:web` | PASS: 691 tests, zero skipped/failed. |
| `npm run -w web test:effects` | PASS: 219 tests. |
| `npm run -w web test:sfx` | PASS: 43 tests. |
| `npm run -w web test:vfx` | PASS: 62 tests. |
| `npm run typecheck` | PASS: rules/server/web, benchmark and smoke configuration. |
| `npm run lint` | PASS: maintained source; generated `test-results`/dist excluded. |
| `npm run build` | PASS; warnings listed above. |
| `npm run -w web test:presentation:assets` | PASS: inventory, registered references/case and full-strip dimensions. |
| `npm run -w web test:presentation:production` | PASS: 114 audio + 104 image URLs/decode and built shell, zero page errors. |
| `npm run -w web test:phase15:e2e` | PASS: native timings/bounded Dora, cache cycles, hidden 120-event burst, fresh resume, 20 layouts. |
| `npm run -w web test:vfx:infrastructure` | PASS: 36 area cases, 10 rays, strips/composition/resize/replay/cleanup/input/reduced motion. |
| `npm run -w web test:sfx:e2e` | PASS: actual Web Audio and authoritative WebSocket fixture, controls/roll/hit/miss/death, dedupe and silent reload. |
| `npm run -w web test:sans:e2e` | PASS: Gaster, Last Attack pending/death/curse and reconnect. |
| `npm run -w web test:asgore:e2e` | PASS: hit/miss/parade, defender pending/reconnect, reduced motion and mute. |
| `npm run -w web test:river:e2e` | PASS: seven Boat/Tralala scenarios, hidden/interrupted paths, manual reactions and landing death. |
| `npm run -w web test:phase13:e2e` | PASS: Jack/Hassan/Chikatilo/Genghis/Lechy, direct damage, privacy and reactions. |
| `npm run -w web test:phase14:e2e` | PASS: silent status snapshots, lifetime/privacy/movement/death, mobile/reduced motion/input. |
| `npm run test:integration` | DID NOT START: `TEST_DATABASE_URL is required for database integration tests.` No DB assertions executed. |

Earlier failures were repaired: the infrastructure test used obsolete Gaster thickness; SFX browser fixed decode counts did not describe selective warmup and were replaced by exact stage counts plus fetch/decode URL dedupe assertions; new preview JSX labels failed the existing i18n scan and were moved into its existing copy convention. Lint initially included generated harnesses; `.eslintignore` excludes only generated output. The new browser harness initially lacked a required Board prop, and production smoke initially requested the dev-gated route; both harness mistakes were corrected. No assertion, privacy suite or TypeScript check was removed.

PostgreSQL `test:ws`, DB/auth/history/recovery integration scripts and the DB-backed full journey were not run without the required test DB. Their DB-free transport/contract counterparts were run. Media capture/video export scripts are optional artifact generators; screenshots were generated by the infrastructure/stress suites, with no claim of a complete manual match.

## 18. Files created

- `.eslintignore`.
- `docs/assets/FINAL_PRESENTATION_QA.md`, `PHASE15_MEASUREMENTS.json`.
- `packages/web/scripts/presentation-asset-audit.ts`, `presentation-production-smoke.mjs`, `presentation-stress-smoke.mjs`.
- `packages/web/src/assets/assetLoadQueue.ts`.
- `packages/web/src/features/vfx/imagePreload.ts`, `imagePreload.test.ts`.
- `packages/web/src/game/effects/presentationPreload.ts`, `presentationPreload.test.ts`, `presentationVisibility.ts`.

## 19. Files modified

- `packages/web/package.json`; `scripts/sfx-smoke.mjs`, `vfx-infrastructure-smoke.mjs`.
- `src/assets/sfx/registry.ts`, `src/assets/ASSET_INDEX.md`.
- `src/components/Board.tsx`.
- `src/features/sfx/AudioManager.ts`, `AudioManager.test.ts`, `audioPreload.ts`, `sfxPlayer.ts`, `sfxPlayer.test.ts`, `sfxPlaybackSession.ts`, `sfxPlaybackSession.test.ts`, `useBoardSfx.ts`.
- `src/features/vfx/VfxLayer.tsx`, `VfxSprite.tsx`, `vfxQueue.ts`, `README.md`.
- `src/game/effects/presentationSession.test.ts`, `useVisualResolution.test.ts`; `src/game/hooks/useBoardFit.ts`, `useBoardFit.test.ts`.
- `src/pages/VfxPreviewPage.tsx`.

Build-generated schema output has no material source change. Rules/server mechanics and binary assets have no committed modifications.

## 20. Performance changes

| Before | Change | After / evidence |
| --- | --- | --- |
| Core warmed 20 files / 1,003,692 bytes. | Warm one variant per core semantic key. | Nine files / 463,398 bytes; UI subset two files. Source-byte measurement. |
| Sample roster warmed 23 files / 3,303,838 bytes, including a rare form. | Primary variants, lazy transformations, high signatures. | 16 files / 2,810,024 bytes. Source-byte measurement; no pre-change latency comparison. |
| All matching loads submitted together; no common decode concurrency limit. | Shared four-job priority queue. | Measured peak four / 31 pending; priority/failure/cap tests pass. Optimal device-specific budget remains unverified. |
| Audio retained old roster buffers; images lacked owned-reference diagnostics. | Protect core/active roster, release obsolete references, soft budget for lazy caches. | Ten cycles return to the same core counts; no assertion of exact browser/GPU bytes reclaimed. |
| Delayed audio could play up to 15 s after its scheduled time. | Independent 500 ms timer deadline and visibility cleanup. | Late timer skipped; hidden 120-event burst and resume produce no historical cues. |
| Long master tails 3.64–12.62 s and two louder legacy effects. | Registry caps/fade and two per-definition gain changes. | Native Dora 1.5 s; modeled/measured waveform comparisons above. Subjective improvement unverified. |
| 320 px preview silently clipped a wide grid; board preferred minimum could exceed narrow container. | Explicit zero-minimum grid tracks plus container-aware compact fit. | All 81 cells verified in viewport; 25 px cells in the narrow padded preview. |
| JS 1,392,700 bytes / 397,020 gzip; CSS 180,540 / 32,270 gzip. | Add small queue/cache/visibility diagnostics. | JS 1,398,833 / 399,352 gzip; CSS 180,574 / 32,269 gzip. Slight code-size increase; emitted binary media unchanged. |

## 21. Remaining issues

| Severity | Exact limitation, reproduction, risk and recommended follow-up |
| --- | --- |
| BLOCKER | None found in the tested presentation paths. Required deployment config/database access is still needed to certify a real deployment. |
| MEDIUM | `npm run test:integration` exits before tests without `TEST_DATABASE_URL`; DB-backed recovery/journey/sockets remain unverified. Configure the project's isolated local test database, then run integration/WS/journey before release. Affected: persistence/recovery and deployment verification. |
| MEDIUM | Listening/full manual match/real OS suspension and physical mobile/Safari are untested. Play a two-account representative match, suspend/resume during an AoE/transport and compare gains/cut points. Risk: perceived balance, device/browser latency and suspension behavior. Affected: audio and Board presentation. |
| MEDIUM | Narrow 320 px padded previews need 25 px cells; dense HP/status detail and touch precision remain constrained. Reproduce with stacked-status snapshot at 320x568. Use unit details/accessible summaries; perform physical touch QA before deciding whether further UI adaptation is necessary. |
| LOW | Active roster images exceed the soft 32 MiB cache target in the Kaiser/Sans/Jack sample (39.57 MiB estimated pixels). Reproduce with `preloadPresentation` for that roster. References return to core after release; profile actual mobile heap/GPU memory before changing specific heavy assets. |
| LOW | Existing 1.207 MB main chunk and Vite/Browserslist warnings remain. Reproduce `npm run build`. This pass did not establish a chunk bottleneck; consider a separately measured code-splitting/dependency maintenance task. |
| LOW | Vite preview serves MPEG as `video/mpeg`; local Chromium decodes it, Safari/CDN behavior is unknown. Reproduce production media smoke on target browser/host and configure MIME if needed. No mass rename/conversion is justified. |
| DEFERRED | Existing missing distinct unlock events and Undyne metadata-only Direction Shift retain the documented generic/silent coverage. Implement recipient-safe rules events separately before bespoke presentation; speculative gameplay changes are outside Phase 15. |

## 22. Final acceptance checklist

PASS means actual source/test/build evidence; NOT TESTED is not a pass.

| # | Requirement | Result |
| ---: | --- | --- |
| 1 | Current implementation audited | PASS |
| 2 | Baseline measurements attempted/documented | PASS; browser pre-change latency unavailable |
| 3 | Selective core warmup | PASS |
| 4 | Authorized roster preload | PASS |
| 5 | Relevant heavy assets prioritized | PASS |
| 6 | Bounded load concurrency | PASS |
| 7 | URL/in-flight dedupe | PASS |
| 8 | Audio buffer reuse | PASS |
| 9 | Image decode measured and GPU uncertainty qualified | PASS |
| 10 | Memory/voice/instance limits enforced/documented | PASS; pinned budgets explicitly soft |
| 11 | Old roster retention | PASS; reference counts tested |
| 12 | Cold/late completion has no audio replay or VFX restart | PASS |
| 13 | Master mute/volume | PASS |
| 14 | UI/gameplay routing | PASS |
| 15 | Presentation-only variants | PASS |
| 16 | Audio concurrency bounds | PASS; subjective noise balance NOT TESTED |
| 17 | Reduced motion meaningful feedback | PASS in tests/sample screenshots |
| 18 | Mobile layouts | PASS for asserted fixtures; physical full-game usability NOT TESTED |
| 19 | Supported light/dark themes | PASS for asserted layouts/sample review |
| 20 | P1/P2 geometry | PASS |
| 21 | AoE clipping/composite timing | PASS |
| 22 | No replay after hidden-tab return | PASS simulated visibility/timer tests; OS suspension NOT TESTED |
| 23 | Silent reconnect | PASS |
| 24 | Same-revision snapshot/action result | PASS |
| 25 | Duplicate delivery | PASS |
| 26 | Distinct legitimate identities retained | PASS |
| 27 | Spectator projection | PASS |
| 28 | Traps/targets/stealth protection | PASS |
| 29 | Sans pre-death behavior | PASS |
| 30 | Fireball miss branch | PASS |
| 31 | Board-edge Gaster | PASS |
| 32 | Confirmed Boat/Tralala paths only | PASS |
| 33 | Jack direct damage once | PASS |
| 34 | Silent persistent hydration | PASS |
| 35 | Missing optional assets fail gracefully | PASS |
| 36 | Representative preview and diagnostics | PASS |
| 37 | Production media paths/MIME/decode | PASS local Chromium/root base; CDN/Safari/custom base NOT TESTED |
| 38 | No blanket conversion | PASS |
| 39 | Existing rendering/audio ownership preserved | PASS |
| 40 | Relevant suites or limitations fully documented | PASS; DB integration did not start |
| 41 | Production build | PASS |
| 42 | Test limitations disclosed | PASS |
| 43 | Final report | PASS |
| Extra | Complete manual two-player game and subjective listening | NOT TESTED |
| Extra | Database integration and deployed networking/CDN | NOT TESTED |

## 23. Final verdict

**READY WITH KNOWN LIMITATIONS.** No blocking correctness/privacy/asset issue remains in the tested presentation implementation. Loading, cache lifetime, stale audio and mobile preview defects have concrete fixes and regression evidence. Deployment/database, device/browser, true suspension and subjective audio/manual-match verification remain explicit release follow-ups. No automatic deployment was performed; this concludes the Phase 15 implementation pass.
