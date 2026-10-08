# Phase 12 — River Person / Boat / Tralala Pack

Implemented against the current rules, server delivery, projected events, shared combat/movement scheduler, audio player and DOM VFX renderer. Existing artwork and audio files were registered; no new binary assets were created. Phase 12 ends here.

## 1. Boat state machine

`useAbility(riverBoat)` requests `riverBoatCarryChoice` → passenger or `riverBoatNoPassenger` → `riverBoatDestinationChoice` → with a passenger, `riverBoatDropDestination` with `phase: planDisembark` → final accepted selection spends one Move and commits `abilityUsed` → confirmed pickup → one carrier `unitMoved` to the actual reached endpoint → travel hazard → drop or interrupted continuation.

An adjacent living ally is eligible. Current movement modes, move locks, available Move and legal adjacent drops are checked by rules. Boat has no charge requirement. Boatman spends Action to grant an extra Move; its existing rules are unchanged. Solo Boat commits at destination selection and produces no passenger pickup/drop.

Selections are authoritative pending choices, but they do not commit movement or presentation. Hover/highlights remain existing web previews. Skipping an uncommitted choice stays silent. After a travel stake, rules request `riverBoatDropDestination` with `phase: selectDisembark`, `reason: movementInterrupted` and options from the reached cell. That continuation is part of the original use.

## 2. Boat presentation

New allowlisted `riverBoatPickup` and `riverBoatDisembarked` events supply event-time anchors and passenger identity. Pickup interpolates the authorized passenger to the carrier, then creates a small cosmetic attachment. One carrier movement drives the group; Board renders the carrier with the passenger's real token as a badge. The attachment persists across an interrupted drop decision.

The shared scheduler interpolates the confirmed carrier endpoint, then passenger separation and landing. A disembark event also covers a passenger returning to its original rules position, where no passenger `unitMoved` is needed. One travel sprite/audio cue is produced per carrier segment. `boat_start_pickup.png`, `boat_travel.png` and `boat_drop.png` replace the old procedural/full-route effects.

## 3. Boat stake interruption

Existing `findStakeStopOnPath` resolves the actual stop before emitting carrier `unitMoved`. Boat currently resolves one uninterrupted start-to-stop segment, so presenting that segment is authoritative; web does not construct intermediate planned cells. Shared stake trigger, reveal, damage and HP cues follow arrival. No segment to the unreached destination is scheduled.

Rules already recalculated drops and required a new manual selection, even when the old planned drop remains legal. Those mechanics were preserved and tested. The continuation spends no extra Move, Action or charge. If no legal drop exists, or the carrier died, the existing failed-drop fallback leaves the passenger at its original rules position and clears carrying; it does not create an impossible choice or fabricated landing.

## 4. Passenger landing hazard

A passenger landing is committed placement, separate from a travel interruption. Event/presentation order is carrier arrival → passenger separation → `riverBoatDisembarked` and landing sprite → stake trigger/reveal → one damage/HP presentation → pre-death choice when applicable → final `unitDied`/death.

The shared landing helper reveals overlapping stakes, retains them and applies exactly one damage total. Landing damage or death does not request another disembark. Tests cover surviving/lethal stacked stakes, hidden passenger reveal and Sans pre-death handling.

## 5. Tralala state machine

`riverTraLaLaTargetChoice` → `riverTraLaLaDestinationChoice` → `riverTraLaLaDropDestinationChoice` → final accepted selection commits four charges and Action → correlated `pendingReactionMovement` → initial target pickup → confirmed carrier/target reached step → hazards → eligible `reactionOpportunity` / `reactionChoice` → independent Attack or Pass → combat or immediate continuation → next reactor / `reactionMovementResumed` → next confirmed step → final drop, recalculated `reactionDropChoice`, or early termination.

Only committed `abilityUsed(riverTraLaLa)` activates audiovisual feedback. The private pending route is never copied into a projected player/spectator view. No animation-finished command or gameplay delay was added.

## 6. Reached movement

`riverTraLaLaResolved` contains final endpoints and touched reactor IDs. It does not describe the reached segment order, pauses, intermediate attacks, interruptions or branches that terminate without a result. Both River completion event mappers now return no route effects.

Every transport `unitMoved` explicitly carries `provenance.kind`, `role`, `phase` and reached `stepIndex`. Web consumes the supplied `from`/`to` only. Matching carrier/passenger events share a scheduler slot using the same ability use, phase and step; they produce one travel VFX/audio cue. Snapshot state is used for reconciliation, never to reconstruct the route.

## 7. Reaction queue

The existing rules calculate eligible allies only at each reached cell: living, positive HP, positioned, no pending death, normal reaction eligibility, within the Tralala Chebyshev contact radius and able to legally attack the dragged target. Already processed reactors are excluded. Tralala ordering is row, column, then unit ID; targets are revalidated when a queued choice is reached.

Each eligible ally gets an independent choice. The reactor's owner submits `resolveReactionChoice`; Pass consumes no turn slots and proceeds to the next authoritative opportunity. Attack likewise preserves turn slots. Opponents/spectators receive the existing safe waiting decision status, without commands, legal target candidates or the future queue.

## 8. Reaction combat

Attack uses the existing `attack_attackerRoll` and defender roll pipeline. Generic dice, hit/miss, damage numbers, HP interpolation, nested defenses and death presentation are reused. Movement resumes only after pending rolls, combat queues, AoE and pre-death decisions permit the existing continuation. A three-reactor Attack/Pass/Attack test verifies two attacks, four manual rolls, three opportunities and preserved turn economy.

## 9. Mid-route death

Dragged-target death or Sans pending death cancels the remaining drag. `reactionMovementEnded(cancelled)` is appended where the existing death pipeline clears transport, and at continuation early exits. Final `unitDied` also clears cosmetic attachment; snapshot disappearance alone never plays death.

Controller death follows existing final-drop handling from the reached cell. A surviving target may need a real `reactionDropChoice`; there is no animation to the planned endpoint. Sans Last Attack stays in its existing pre-death pipeline and no final death/continuation is presented before its decision resolves. No-legal-drop Tralala termination emits a cancellation event even without `riverTraLaLaResolved`.

## 10. Hazard interruptions

Shared Phase 8 hazard feedback owns stake eruption, reveal and damage. Transport sprites last only their confirmed segment; travel audio is a bounded one-shot, so it expires before a reaction/drop wait. There are no unvisited route segments to cancel and no persistent transport audio loop.

Boat waits for the recalculated manual drop; Tralala uses its existing reached-cell completion/drop-choice rules. A verified rules defect was fixed: final Tralala placement previously omitted stake landing resolution. It now calls `applyStakeTriggerIfAny` with `entryKind: landing` before completion, preserving stacked-stake and death semantics and avoiding repeated selection. No other gameplay mechanic was changed.

## 11. Presentation correlation

`abilityUseId` identifies one rules commitment across commands, pending choices, reactions, hazards and drops. New stages are correlated through the existing rules helper. `abilityId` classifies the canonical Boat/Tralala use. The movement grouping key is `${abilityUseId}:${kind}:${phase}:${stepIndex}` and refers exclusively to emitted reached movement.

This repository has no transport `movementId`; none was invented. The existing combat chain identity retains combat buffering responsibility and is not used to guess transport identity. `eventId` identifies an individual server event for dedupe; `streamId` namespaces delivery and `revision` orders ingress. Presentation cue IDs derive from those identities. No grouping uses the latest activated hero, UI selection, coordinate equality or timing proximity.

## 12. Asset registry

All paths below are relative to `packages/web/src/assets/`. All eight SFX definitions are lazy gameplay audio with `maxVoices: 1`. Wave lengths were read from the actual files; variants use the existing presentation-only resolver, without gameplay RNG. Audio has no spatial geometry: it follows the scheduled semantic cue.

| SFX key                                            | Existing path(s)                                                                                                           | Source length / scheduled lifetime                                         | Gain |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---- |
| `hero.riverPerson.abilities.riverBoat.launch`      | `sfx/heroes/riverPerson/abilities/riverBoatLaunch.wav`                                                                     | 523 ms; committed Boat use                                                 | 0.45 |
| `hero.riverPerson.abilities.riverBoat.pickup`      | `sfx/heroes/riverPerson/abilities/riverBoatPickup.wav`                                                                     | 345 ms, bounded to 300 ms pickup                                           | 0.45 |
| `hero.riverPerson.abilities.riverBoat.move`        | `sfx/heroes/riverPerson/abilities/riverBoatMove01.wav`, `riverBoatMove02.wav`, `riverBoatMove03.wav` in the same directory | 590/605/610 ms; bounded to confirmed segment duration for Boat and Tralala | 0.30 |
| `hero.riverPerson.abilities.riverBoat.disembark`   | `sfx/heroes/riverPerson/abilities/riverBoatDisembark.wav`                                                                  | 378 ms, bounded to 180 ms landing                                          | 0.45 |
| `hero.riverPerson.abilities.riverBoat.interrupted` | `sfx/heroes/riverPerson/abilities/riverBoatInterrupted.wav`                                                                | 355 ms; confirmed failed disembark                                         | 0.40 |
| `hero.riverPerson.abilities.riverBoatman`          | `sfx/heroes/riverPerson/abilities/riverBoatmanGrant.wav`                                                                   | 348 ms; confirmed grant                                                    | 0.40 |
| `hero.riverPerson.phantasms.riverTraLaLa`          | `sfx/heroes/riverPerson/phantasms/riverTraLaLaActivate.wav`                                                                | 755 ms, bounded to 240 ms activation                                       | 0.50 |
| `hero.riverPerson.basic.death`                     | `sfx/heroes/riverPerson/basic/died.wav`                                                                                    | 1714 ms; shared final-death cue for River Person                           | 0.50 |

Each VFX strip uses 128×128 frames. Tralala primary/accent are one composite request. Runtime placement overrides are explicit; no planned-path geometry is used.

| VFX key      | Existing path(s)                                                    | Frames / native duration | Runtime geometry and timing                                                                                    |
| ------------ | ------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `boatPickup` | `vfx/heroes/riverPerson/boat_start_pickup.png`                      | 14 / 600 ms              | Event source cell, 0.9 cells, 300 ms                                                                           |
| `boat`       | `vfx/heroes/riverPerson/boat_travel.png`                            | 20 / 850 ms              | Projectile over confirmed segment, 0.75 cells, segment duration                                                |
| `boatDrop`   | `vfx/heroes/riverPerson/boat_drop.png`                              | 13 / 550 ms              | Confirmed passenger/target landing cell, 0.9 cells, 180 ms                                                     |
| `tralala`    | `vfx/heroes/riverPerson/tralala_primary.png` + `tralala_accent.png` | 26 each / 1100 ms        | Activation source cell at 0.9 cells for 240 ms; confirmed travel projectile at 0.75 cells for segment duration |

The shared movement duration is `min(160, 720 / max(1, confirmed movement event count))` ms; reduced motion uses 50 ms movement. Registry reduced-motion policies are static Boat sprites and short Tralala. P2 orientation and responsive cell sizing use the existing geometry transform. Shared stake, combat and death assets remain owned by their existing registries.

## 13. Session / reconnect

The existing presentation session dedupes event identities and treats hydration as a silent revision baseline. Reconnect during interrupted Boat restores the real drop decision; reconnect during reaction restores the real reactor-owned choice. Pending use correlation survives snapshot serialization. Hydration does not replay pickup, activation, reached travel or historical reactions.

Cosmetic attachments are carried between accepted live batches and cleared on room/stream/role reset, disable, cancellation and completion. A reconnect baseline uses authorized current positions/decisions rather than reconstructing a historical cosmetic attachment. Existing audio reset stops voices/timers while retaining decoded buffers; VFX cancellation drops old requests. Tests cover duplicate pickup/steps/opportunities and duplicate continuation/resume/drop deliveries.

## 14. Privacy

Pickup/disembark projection intersects event-time carrier and passenger visibility. Hidden-passenger events are omitted for unauthorized opponents/spectators even if a later landing hazard reveals the unit. Only the hazard/reveal/death anchors then authorize positional effects; the hidden earlier route stays absent.

New event payloads explicitly copy approved fields; internal ability source recipients and pending route/queue contexts are not serialized to clients. Reaction choices/options go only to the responding owner; other recipients receive safe pending status. Existing before-movement options remain identical with and without hidden stakes. Web works exclusively from projected identities/anchors and does not run transport legality or hazard rules.

## 15. Files created

- `docs/phase-12-river-person-pack.md`
- `packages/server/src/tests/unit/riverDelivery.test.ts`
- `packages/web/scripts/river-smoke.mjs`
- `packages/web/src/game/effects/riverPresentation.ts`
- `packages/web/src/game/effects/riverPresentation.test.ts`

## 16. Files modified

Rules:

- `packages/rules/src/actions/heroes/riverPerson/boatman.ts`
- `packages/rules/src/actions/movementActions/reactions.ts`
- `packages/rules/src/actions/registry.ts`
- `packages/rules/src/core/abilityUse.ts`
- `packages/rules/src/model/events/heroes.ts`
- `packages/rules/src/model/events/index.ts`
- `packages/rules/src/model/semantic.ts`
- `packages/rules/src/pendingRoll/resolvePendingRoll/coreCases.ts`
- `packages/rules/src/tests/heroes/reactionMovement.test.ts`
- `packages/rules/src/view/eventPayload.ts`
- `packages/rules/src/view/events.ts`

Server contract generation:

- `packages/server/src/openapi/generated/responses.json`

Web integration:

- `packages/web/package.json`
- `packages/web/src/assets/sfx/registry.ts`
- `packages/web/src/components/Board.tsx`
- `packages/web/src/features/sfx/audioPreload.ts`
- `packages/web/src/features/sfx/sfxEventMapper.ts`
- `packages/web/src/features/sfx/useBoardSfx.ts`
- `packages/web/src/features/vfx/VfxLayer.test.tsx`
- `packages/web/src/features/vfx/useBoardVfx.ts`
- `packages/web/src/features/vfx/vfxEventMapper.test.ts`
- `packages/web/src/features/vfx/vfxEventMapper.ts`
- `packages/web/src/features/vfx/vfxPreviewScenarios.test.ts`
- `packages/web/src/features/vfx/vfxPreviewScenarios.ts`
- `packages/web/src/features/vfx/vfxRegistry.ts`
- `packages/web/src/features/vfx/vfxTypes.ts`
- `packages/web/src/game/effects/combatPlayback.ts`
- `packages/web/src/game/effects/eventToEffects.ts`
- `packages/web/src/game/effects/movementPresentation.test.ts`
- `packages/web/src/game/effects/movementPresentation.ts`
- `packages/web/src/game/effects/types.ts`
- `packages/web/src/game/effects/useVisualResolution.ts`
- `packages/web/src/rulesHints.ts`

## 17. Tests added

The new web River suite has 23 tests using real deterministic rules fixtures: silent selections; pickup/grouped audio/drop; unchanged passenger position; hidden-stake preview equality/truncation/reselection/no extra cost; old drop still legal; no legal drop fallback; surviving/lethal stacked landing stakes; hidden passenger; reached Tralala pause/resume; independent Attack/Pass/Attack and manual rolls; target/controller death; Sans pre-death; no-legal-drop cancellation; transit/final landing stakes; completion without replay; reaction privacy; asymmetric P1/P2 geometry; duplicate/reconnect baseline; actual asset geometry and audio/cache cleanup.

Rules regression adds final Tralala landing on overlapping stakes with surviving and lethal HP. Two server tests exercise real command application, stable projected event IDs/rebroadcast, snapshot persistence and continuation for interrupted Boat and paused Tralala. Existing movement/VFX tests now assert confirmed transport segments and silent final-result mapping. The new browser script checks seven scenarios with production Board, ReactionChoicePanel, VFX and audio hooks.

## 18. Test results

| Command                                                                                              | Result                                                                                             |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run -w rules test`                                                                              | Passed full existing rules runner and added landing regression                                     |
| `npm run test:server`                                                                                | Passed 11 suite executions, including both new River delivery tests                                |
| `npx tsx --tsconfig tsconfig.tests.json --test packages/server/src/tests/unit/riverDelivery.test.ts` | 2 passed after fixture import/type corrections                                                     |
| `npm run test:web`                                                                                   | 656 tests passed; 2 suite executions                                                               |
| `npm run -w web test:effects`                                                                        | 190 passed                                                                                         |
| `npm run -w web test:sfx`                                                                            | 38 passed                                                                                          |
| `npm run -w web test:vfx`                                                                            | 50 passed                                                                                          |
| `npm run -w web test:river:e2e`                                                                      | All 7 browser scenarios passed                                                                     |
| `npx eslint 'packages/**/*.{ts,tsx}' --ignore-pattern '**/test-results/**' --max-warnings 0`         | Passed source lint                                                                                 |
| `npm run build`                                                                                      | Passed rules, generated server schemas/server compilation, web typecheck and Vite production build |
| `git diff --check`                                                                                   | Passed                                                                                             |

The unfiltered root lint also scans ignored browser fixture/harness files in `packages/web/test-results/` and reported unused React imports and fixture declaration warnings there, including previous movement/Sans/Asgore smoke artifacts. Source lint excludes only that generated artifact directory. The production build retains its existing large-bundle warning. No failing tests were skipped. An initial build exposed a new server test's import of rules-source test helpers; the test now constructs its fixture through public rules exports and the final build passes.

## 19. Manual browser check

No manual live two-account WebSocket match was performed. Automated headless Edge/Playwright verification ran two recipient Boards with real projected rules fixture commands, including silent selection, normal Boat pickup/travel/drop, travel stake/manual new drop/reconnect baseline, passenger landing death, hidden passenger, Tralala Attack/Pass/Attack with manual rolls, reaction death and stake interruption. It checks P1/P2, duplicate silence, actual VFX insertion and audio scheduling, and no browser/page errors.

Screenshots and `observations.json` are generated under ignored `packages/web/test-results/river/browser/`. The travelling Boat screenshot was visually inspected for carrier/passenger association and flipped recipient geometry. These are local deterministic fixture checks, not claims of a manual network match or subjective listening assessment. The in-app browser runtime was unavailable, so the installed Edge/Playwright fallback was used.

## 20. Deferred work

- Remaining hero presentation.
- Persistent status VFX.
- Preload/performance/final polish.

No later roadmap phase was started.
