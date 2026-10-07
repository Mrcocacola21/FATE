# Phase 8 — Movement and hazards feedback

This change integrates movement and hazard presentation into the existing web
playback architecture. No artwork was created. The authorized follow-up correction
fixes endpoint-only relocation in rules and explicitly carries that semantic
through event projection; turn costs, hazard damage, and hidden ability identity
remain unchanged.

## 1. Movement presentation architecture

```text
ProjectedGameEvent
  -> existing PresentationSession ingress (baseline, ordering, dedupe, cancellation)
  -> existing visualResolution chain release
  -> movementCueFromEvent / confirmedMovement
  -> MovementPresentationPlan inside CombatVisualPlaybackPlan
  -> one ordered playback queue and playbackStartedAt
     -> visualMotionByUnitId -> Board token and HP position
     -> movementCueEffects -> BoardEffectsLayer
     -> movementCueVfx -> existing VFX queue / VfxLayer
     -> existing combat damage cues -> SfxPlaybackSession / HP / death
```

There is no additional event bus, transport dedupe system, animation store, or
authoritative state mutation. `movementCues` on the client-only batch share the
same event offsets and clock origin as Phase 7 combat cues. Existing deferred
combat chains and early manual dice remain in use.

## 2. Authoritative path handling

Only `unitMoved` and `intimidateResolved` authorize new movement operations.
Their explicit `provenance`, `from`, and `to` determine behavior. Each supplied
segment is retained separately and played in event order. The mapper never
reads a selected destination, pending route, movement preview, hidden hazard
array, or differences between room snapshots to invent a path.

Snapshot positions are used for baselines, final reconciliation, and a silent
1.5-second compatibility correction when an event is lost. That correction
emits no movement, hazard, reveal, or audio cues. An ahead snapshot stays behind
the scheduled visual movement. Reconnect snapshots establish positions silently.

## 3. Normal movement

One segment takes at most 160 ms. For multiple confirmed segments in one batch,
segment duration is `min(160, 720 / segmentCount)` ms, limiting travel time to
720 ms while preserving every segment. Reduced motion uses 50 ms per segment.
Combat and decisions can add their existing semantic pauses.

The token and its HP bar interpolate continuously in the existing Board renderer.
The unit's presentation position remains anchored to the current segment until
arrival. Movement feedback is a restrained procedural trail between the exact
event endpoints. Intermediate board cells are never added to an endpoint event.

## 4. Teleport

Explicit `teleport` provenance produces a 220 ms transition (100 ms with reduced
motion). The token fades at the source, switches to the destination halfway
through, and fades back in. Existing `portal` effects mark departure and arrival.
There is no walking trail, swept route, or inferred intermediate hazard check.
A supplied destination trigger starts after the teleport transition.

The follow-up fixes the previously reported Trickster discrepancy rather than
leaving it as a rules limitation. Default `PendingMove.mode = normal` now uses the
recovered Trickster mechanic for both provenance and hazard/forest checks.
Teleport from A to C checks only C; stakes, snares, and forest between them do not
interrupt the relocation. Destination hazards retain their existing behavior.

Court's global move is also endpoint-only and does not enqueue Rider path attacks.
Femto's Divine Move, Grozny's Invade Time (including its Tyrant branch), Lechy's
Guide Traveler, Asgore's Soul Parade relocation, and Duolingo's relocation emit
explicit `movementKind: teleport` on their ability provenance. The client consumes
that semantic without guessing from distance or ability name. Projection preserves
the movement semantic while redacting an unauthorized ability ID. Odin already
emits teleport provenance and remains compatible.

## 5. Forced movement

`intimidateResolved` supplies the Stare move, with authoritative forced provenance.
Other `unitMoved` forced causes supported by the current contract are
`hiddenCollision`, `court`, `moonSwap`, and `donWindmills`. They use token
interpolation and a distinct procedural `push` trail. The source/collider is
never inferred or looked up. No voluntary movement sound or hero signature is
substituted. Playback never modifies the unit's voluntary Move slot.

## 6. Rider

Explicit Rider segments retain their order, including interleaved combat:
segment -> combat timeline -> next confirmed segment. There are no scheduled
future cells after an interruption. Correlated/deferred events continue to use
the existing Phase 7 chain release behavior.

The actual ordinary Rider action commits one endpoint movement event before
requesting path attacks. It does not emit a per-cell traversal or intermediate
combat timing. Its presentation therefore follows that committed segment and
the emitted attack order. Reaction movement that supplies multiple reached
segments is supported by the same queue. Reconstructing per-cell encounters for
an ordinary Rider from the final snapshot would violate this phase's invariant.

The current contract has no `movementId`; the implementation uses event IDs and
the supplied ordered segments. Movement audio is silent, so segments do not
produce per-cell audio spam.

## 7. Vlad stakes

Owner-projected `stakesPlaced.positions` produce grouped small placement sprites
and pulses at exactly those cells. Opponent/spectator projection supplies only
the existing nonpositional `hiddenSetupCompleted` notice, which produces no
positional effects or sounds. Persistent authorized markers still come from the
projected view; snapshots never synthesize placement effects.

`stakeTriggered.markerPos` owns one trigger sprite and the interruption cue.
Its single authoritative damage amount feeds the existing Phase 7 damage cue,
HP tween, generic hit sound, and death system. The presentation never counts
stakes to calculate damage or removes their persistent markers. Tests using the
real stake helper verify two stacked stakes reveal, remain in state, and cause
exactly one damage/HP operation.

Rules currently emit hazard `stealthRevealed` before `stakeTriggered`. A lethal
stake diagnostic emits `unitMoved -> unitDied -> stakeTriggered`. Playback keeps
that supplied order, including death before the later trigger; it does not
silently rewrite the mechanic or reorder the rules' event contract to match the
request's recommended impact-before-death sequence.

## 8. Hidden movement and reveal

Only recipient-projected movement can create a trail or token interpolation.
Real owner/opponent/spectator projection tests verify that an unknown hidden
mover's earlier endpoints do not enter the opponent/spectator plan.

Only the explicit `stealthRevealed` event owns the one-shot reveal. A stake reveal
uses its authorized trigger cell. Other reveals use a supplied preceding
movement endpoint, a subsequent movement source, or the authorized batch view
when the current reveal contract supplies no event-time cell. Hazard cues never
independently synthesize a second reveal.

Newly revealed tokens remain absent until their reveal phase. Early roll plans
cannot expose a unit whose reveal still belongs to a deferred chain. Revealed
stake HP starts from the visible post-trigger HP plus the supplied stake damage,
allowing the shared damage tween to decrement once when there was no prior
visible HP baseline.

## 9. Jack snares

Only owner-projected `snarePlaced.cell` produces placement feedback. Public
`snareTriggered.cell` produces one wire trigger sprite and a stop cue. The
existing wrapped indicator begins at the trigger timestamp and persists through
the normal projected status state. Snare triggers do not invent direct damage.

The mapper consumes one authorized trigger cell and never enumerates other
traps, IDs, or remaining counts. Existing persistent status rendering is retained;
no new persistent status VFX architecture is introduced.

## 10. Interruption model

There is no planned destination input in `MovementPresentationPlan`. Reached
endpoints come only from authorized movement events. `stakeTriggered.stopped`
and the immobilizing snare trigger add interruption feedback at their authorized
cells. Missing future segments remain absent from the plan and queue.

Existing ingress handles duplicate IDs and reconnect baselines. Session tokens
cancel pending callbacks. Playback also checks the session key before starting
an old plan, and suppresses the old playing batch during the reset render so
audio/VFX consumers cannot baseline against stale work. The new snapshot becomes
the visual baseline immediately on a binding change.

## 11. Audio and VFX mapping

| Semantic cue           | Runtime VFX / procedural effect                                     | Sound                          |
| ---------------------- | ------------------------------------------------------------------- | ------------------------------ |
| Normal / Rider segment | `movementTrail`, tone `move`; token interpolation                   | Silence                        |
| Forced segment         | `movementTrail`, tone `push`; token interpolation                   | Silence                        |
| Teleport               | `portal` at source and destination; token fade                      | Silence                        |
| Stake placement        | `stakePlace`; small cell pulse                                      | Silence                        |
| Stake trigger          | `stakeTrigger`; stop pulse/text                                     | Shared `common.combat.hit`     |
| Snare placement        | `snarePlace`; small cell pulse                                      | Silence                        |
| Snare trigger          | `snareTrigger`; stop pulse/text; existing wrapped indicator         | Silence                        |
| Explicit reveal        | `hiddenReveal`; localized reveal text                               | Silence                        |
| Hazard damage / death  | Existing `combatHit`, `unitDeath`, floating damage, HP/death phases | Existing generic combat sounds |

The runtime sound registry contains no approved generic movement, teleport,
placement, snare, or reveal sound. Those cues intentionally remain silent.
Placement feedback therefore gives unauthorized recipients no location, pan,
count-dependent audio, or timing hint. The four newly registered hazard sprite
strips already existed in the asset library; their PNG/frame dimensions pass
the existing registry validation. They are also available in the VFX preview.

## 12. Files created

- `packages/web/src/game/effects/movementPresentation.ts`
- `packages/web/src/game/effects/movementPresentation.test.ts`
- `packages/web/scripts/movement-smoke.mjs`
- `docs/phase-8-movement-hazards-report.md`

Browser fixtures, screenshots, the rules diagnostic, and browser `report.json`
are generated under ignored `packages/web/test-results/movement/`.

## 13. Files modified

- `packages/web/package.json` — repeatable `test:movement:e2e` command.
- `packages/web/src/components/Board.tsx` — token/HP presentation motion using canonical geometry.
- `packages/web/src/game/effects/combatPlayback.ts` — shared movement, reveal, snare status, hazard damage scheduling.
- `packages/web/src/game/effects/useVisualResolution.ts` — motion frames, silent position reconciliation, session guards.
- `packages/web/src/game/effects/types.ts` — client-only movement cues.
- `packages/web/src/game/effects/eventToEffects.ts` — semantic movement effects and shared cue consumption.
- `packages/web/src/game/effects/eventToEffects.test.ts` — endpoint trail assertion now rejects fabricated intermediate cells.
- `packages/web/src/game/effects/useBoardEffects.ts` — shared movement cue forwarding.
- `packages/web/src/features/vfx/vfxEventMapper.ts` — normalized movement/hazard cues.
- `packages/web/src/features/vfx/useBoardVfx.ts` — shared movement cue forwarding.
- `packages/web/src/features/vfx/vfxRegistry.ts` — existing placement/trigger sprite registrations.
- `packages/web/src/features/vfx/vfxTypes.ts` — four hazard VFX IDs.
- `packages/web/src/features/vfx/vfxPreviewScenarios.ts` — hazard sprite preview coverage.
- `packages/web/src/features/vfx/VfxLayer.tsx` — explicit effect ID attribute for browser verification.

The follow-up also modifies the rules movement handler; the above endpoint
relocation ability emitters; `model/semantic.ts`, `model/events/projected.ts`,
`view/events.ts`, and `view/eventPayload.ts`; and the rules test index. It creates
`packages/rules/src/tests/core/teleportMovement.test.ts`. The generated server
OpenAPI response schema includes the optional movement semantic. Server transport
implementation is unchanged.

## 14. Tests added

Eighteen focused web tests cover explicit normal provenance, ahead snapshots, ordered
and capped segments, teleport fade/anchors, arrival-before-hazard scheduling,
forced causes and immutable slots, interleaved Rider combat, interrupted future
cells, real Rider hidden-safe previews, real placement projections, real stacked
stake triggers and hidden-path redaction, snare/status timing, deferred reveal
privacy, deferred transport provenance, P1/P2 edges/corners, duplicate ingress,
and reset cancellation without relying on token invalidation alone. New cases
exercise actual default, selected, borrowed, and Court relocation events, plus
ability teleports with a redacted ability ID. Three rules regression tests verify
intermediate hazard/forest exclusion, destination-only hazard activation, and
safe projection of endpoint relocation semantics.

The browser smoke uses production `Board`, effects/VFX hooks, and projected-event
fixtures for P1/P2. It captures actual token geometry and checks scheduled hazards,
private placement, status timing, pointer safety, and reset cleanup.

## 15. Test results

| Command/check                                                 | Result                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| `npm run -w web test:effects`                                 | 124 passed                                                  |
| `npm run -w web test:sfx`                                     | 38 passed                                                   |
| `npm run -w web test:vfx`                                     | 50 passed                                                   |
| `npm run test:web`                                            | 590 passed; 2 suite executions including setup              |
| `npm run -w rules test`                                       | Passed; 445 legacy passing checks                           |
| ESLint on changed TypeScript/TSX implementation and new tests | Passed, zero warnings                                       |
| `git diff --check`                                            | Passed                                                      |
| `npm run build`                                               | Passed: rules, server, web typecheck, production Vite build |
| `node packages/web/scripts/movement-smoke.mjs`                | Passed, 8 browser observation groups                        |

The original Phase 8 validation above precedes the authorized rules correction.
Follow-up validation passed: effects (126 tests), complete web (592 tests),
complete rules, server units (11 suite executions), contract checks (20 suite
executions), targeted lint, the production build, and the browser smoke (9 groups).
Existing build notices about
Browserslist data and bundle size remain; performance polish is deferred.

## 16. Manual browser test

No manual local two-player game or manual audio listening was performed.
Automated headless Edge verified normal/Rider/forced token interpolation in both
orientations, teleport departure/fade/arrival with no trail, stake feedback after
arrival with one damage text, snare impact and wrapped status after arrival,
owner-only placement sprites, reset cleanup, usable board clicks, and no page
errors. Actual recipient projection and gameplay interruption were verified
separately with deterministic rules-backed tests.

The follow-up browser smoke adds an ability teleport with its ability ID redacted,
verifying source hold, destination arrival, fade, and absence of a movement trail.
It now reports nine observation groups.

Playwright's virtual clock drives RAF and timers. Native CSS animations are
paused at the matching shared timestamp for the sprite inspections/screenshots;
this is not a claim of a manual real-time visual or listening check.

## 17. Deferred work

- Kaiser/Vlad major hero combat VFX, including Dora, Carpet Strike, and Forest.
- Sans signatures, including Gaster Blaster.
- Asgore signatures, including Fireball and Fire Parade.
- Full Boat/Tralala transport presentation.
- Remaining hero signature coverage.
- Persistent status VFX architecture.
- Final preload and performance polish.
- The lethal stake event-order discrepancy and richer ordinary Rider traversal
  events. The Trickster endpoint-only hazard correction is implemented in the
  authorized follow-up.

Work stops at Movement and Hazards Feedback.
