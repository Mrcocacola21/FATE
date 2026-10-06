# Phase 3: Safe Projected Game Events / Hidden Information

Implemented on 2026-10-06. Scope is recipient projection, truthful types, and the required transport/consumer changes. Gameplay, RNG, and assets are unchanged.

## 1. Root problem

The old projector manufactured objects such as `{ type: "unitMoved" } as GameEvent`, even though authoritative movement requires `unitId`, `from`, and `to`. Consumers could compile while assuming missing fields existed. A public-event allowlist also returned complete authoritative objects, silently forwarding any future private field. Final-state visibility could retroactively expose a hidden movement when a later effect revealed its actor.

The replacement has two exhaustive switches: an explicit field copier and a recipient policy switch. Neither has a public fallback. Unknown runtime variants are omitted. Coordinates, dice and structured search results are copied explicitly, so nested future properties are not forwarded either.

## 2. Final type model

`GameEvent` remains the internal discriminated gameplay union. Its visual metadata no longer has a broad `Record<string, unknown>` index signature. Internal movement authorization is a symbol-keyed recipient list, not a state snapshot.

`ProjectedGameEvent` derives existing complete payload variants while removing that internal symbol. It selectively permits an absent AoE source, attack source, death killer, or carpet-strike source. Stake triggers have no stake-ID list. An explicit `{ type: "eventRedacted" }` notice has only optional opaque visual-chain metadata. Required movement coordinates remain required; incomplete movements cannot typecheck.

The existing flattened transport envelope is retained:

```ts
// Server internal, identified once at acceptance:
type AuthoritativeDeliveredGameEvent = GameEvent & { eventId: string };

// Recipient/network/browser:
type DeliveredGameEvent = ProjectedGameEvent & { eventId: string };
interface LiveEventBatch {
  streamId: string;
  revision: number;
  events: DeliveredGameEvent[];
}
```

Projection replaces only payload visibility. It copies the original eventId; it does not assign IDs or revisions. A privately omitted event contributes no delivery. Chain IDs and completion markers retain their original identity. Projected objects have no internal authorization symbols, even before JSON serialization.

## 3. Projection policy

All retained events first pass through explicit field copies. There is no raw-object pass-through.

| Policy | Internal events |
| --- | --- |
| Public scalar copies | combatVisualBatchReady, turnStarted, roundStarted, initiativeRollRequested, initiativeRolled, initiativeResolved, placementStarted, ruleDeclarationSelected, ruleDeclarationSetupCompleted, courtRolesAssigned, courtRolesSwapped, courtRollResult, chessKingDeathResolved, gameDraw, moonRollResult, advantageThresholdDeclared, advantageWinTriggered, arenaChosen, gameEnded |
| Explicit copies, omitted unless unit references are visible | chessKingSelected, berserkerDefenseChosen, damageBonusApplied, bunkerEntered, bunkerEnterFailed, bunkerExited, forestActivated, carpetStrikeTriggered, unitHealed, moveBlocked, battleStarted, mettatonRatingChanged, papyrusUnbelieverActivated, papyrusBoneApplied, papyrusBonePunished, sansUnbelieverActivated, sansBadassJokeApplied, sansMoveDenied, sansBoneFieldActivated, sansBoneFieldApplied, sansBoneFieldPunished, sansLastAttackApplied, sansLastAttackTick, sansLastAttackRemoved |
| Owner/acting-recipient-only interactive data | stealthEntered, rollRequested, pendingRollUnhandled, moveOptionsGenerated, chargesUpdated, intimidateTriggered, reactionOpportunity, controlledAttackDeclared |
| Event-time positional authorization; otherwise omitted | unitMoved, riverBoatResolved, riverTraLaLaResolved |
| Detailed if authorized; otherwise a payload-free notice | unitPlaced, hiddenCollisionResolved, abilityUsed, chikatiloMarkApplied, stealthRevealed, intimidateResolved, pureBloodRedirected, lechyStormRollResult, unitTransformed |
| Hidden setup completion notice for nonowners | stakesPlaced; hiddenSetupCompleted is already an explicit safe notice |
| Field-by-field source/target filtering | searchStealth, courtEffectApplied, moonEffectApplied, aoeResolved, carpetStrikeCenter, carpetStrikeAttackRolled, asgoreSoulParadeResolved, lechyStormStarted, lokiChickenGroupApplied |
| Visible outcomes only | friskHugsApplied, lokiChickenApplied, riverBoatmanGranted, riverBoatDisembarkFailed, reactionChoiceResolved, reactionMovementResumed |
| Nonpositional visible death; unknown killer omitted | unitDied |
| Visible defender outcome; hidden attacker identity omitted | attackResolved |
| Authorized trigger cell/unit/result; no stack identifiers | stakeTriggered |
| Unclassified runtime variant | omitted; adding a union member fails both exhaustive never checks |

Private stealth-entry events are omitted, rather than replaced one-for-one with notices. This prevents per-target selection cardinality from leaking through an event count. Safe notices are ignored by effect mappers and the event log.

## 4. Vlad stakes

- Owner receives placement positions, owner markers, and their authorized pending placement context.
- Opponent receives only hiddenSetupCompleted, with vladStakes identity when the source is visible; otherwise the identity is hidden. No positions, ordering, or marker IDs are present.
- Spectator receives the same public completion policy and only revealed, cell-deduplicated markers.
- Stake triggers expose the authorized affected unit, trigger cell, damage and stop result. The stakeIdsRevealed list is removed for every recipient, preventing hidden stack IDs/count from crossing this boundary.

Forest activation's nine-stake consumption is an existing fixed gameplay value, not a newly disclosed variable placement count.

## 5. Jack snares

Owner trap markers and owner pending placement/covering-tracks choices remain available. Opponent and spectator get no trap markers or private placement context. No trap visibility was widened. Existing Covering Tracks AoE payloads expose public blast geometry while filtering hidden source identity and victims. Jack still has no dedicated snarePlaced/snareTriggered semantic event; this phase does not add one.

## 6. Hassan

Assassin Order candidates, selected IDs, cells, counts and queue context stay in the owner's pending roll. Other recipients receive the allowlisted waiting decision. Stealth-entry outcomes are owner-only, and controlled-attack declarations are controller-owner-only; visible Hassan does not make its selections public.

Enemy/spectator unit snapshots also remove stealthSuccessMinRoll. This is essential: Hassan's selected allies change that field, so merely hiding the pending selection would still reveal assignments through state differences.

## 7. Stealth and hidden movement

Every engine unitMoved emitter captures authorization using its local state, at both endpoints, before subsequent reveal/hide effects. Odin adjacency and Chikatilo tracking use their current rules at those endpoints. Hidden collision, Intimidate, placement, and committed River positional outcomes capture the small corresponding fact as well.

A hidden A-to-B-to-C path remains omitted when the same resolution later reveals the unit at C. A public segment remains available when the unit later hides. Legacy positional events without a fact conservatively expose details only to their owner; final visibility is never evidence that a historical segment was public.

Search result arrays filter unauthorized target identities even for the searching owner. Failed searches do not disclose hidden target IDs. A death event has no location field; hidden deaths are omitted for unauthorized recipients, and hidden dead-unit/stasis coordinates are removed from public snapshots. Death does not reveal historical locations.

## 8. Last-known positions

Last-known markers remain in their dedicated historical view field. The projector and authorization capture never consult lastKnownPositions. Existing presentation consumers receive only projected movements and authorized visible state; a historical marker cannot become a current movement destination, beam endpoint, caster coordinate or audio anchor.

## 9. AoE and pending AoE

Committed center and radius remain public geometry. Source/caster IDs are independently filtered by recipient visibility. Ability identity is omitted when its source is hidden. Each affected/revealed/damaged list and each damage/roll map is filtered independently. Carpet-strike geometry also survives without a hidden source ID.

Pending AoE previews now accept state plus recipient. An unauthorized viewer receives only center/radius; an authorized viewer additionally receives casterId/abilityId. Pending previews never carry the caster's current cell or victim lists.

Owner roll projection removes nested resume contexts, unauthorized source/target IDs, hidden entries in candidate/queue/outcome structures, and internal chain source/remaining-roll counts. Queue indexes are recalculated after filtering rather than revealing the number of hidden preceding victims. Descriptive names and ability identity are scrubbed from all roll text fields when the source is hidden. Opaque chain identity/deferral metadata stays intact.

Room metadata's pending-roll IDs, kinds and presentation now go only to that roll's owner. Opponent/spectator waiting UI uses pendingDecision, preserving status without transmitting private progress.

## 10. Spectators

Spectators use their own public-information projection, not a combination of player views. They receive revealed stakes, visible effects/units, public blast geometry and safe waiting status. They receive no Jack trap markers, private Hassan assignments, owner roll context, hidden movement paths, last-known markers or private remaining-target counts. Existing finished-match state visibility remains the existing policy; historical private event paths are still not replayed through final visibility.

## 11. Web migration

Recipient events now use ProjectedGameEvent in store/event ingress, presentation event/batch types, visualResolution, combatPlayback, eventToEffects, EventLog, localized eventMessages, SFX/VFX mappers, VFX request types/preview scenarios, and DraftScreen. API/WebSocket delivery types inherit the projected contract through DeliveredGameEvent. The SFX source lookup handles an absent attack source. Preview fixtures now contain valid complete payloads instead of asserting incomplete events as authoritative ones. No assets, registries, new effects or audio implementation were added.

## 12. Files changed

**rules**

- [packages/rules/src/actions/heroes/chikatilo/setup.ts](../packages/rules/src/actions/heroes/chikatilo/setup.ts)
- [packages/rules/src/actions/heroes/griffith.ts](../packages/rules/src/actions/heroes/griffith.ts)
- [packages/rules/src/actions/heroes/grozny/movement.ts](../packages/rules/src/actions/heroes/grozny/movement.ts)
- [packages/rules/src/actions/heroes/lechy/guideTraveler.ts](../packages/rules/src/actions/heroes/lechy/guideTraveler.ts)
- [packages/rules/src/actions/heroes/newBatch.ts](../packages/rules/src/actions/heroes/newBatch.ts)
- [packages/rules/src/actions/heroes/newBatchPost.ts](../packages/rules/src/actions/heroes/newBatchPost.ts)
- [packages/rules/src/actions/heroes/odin.ts](../packages/rules/src/actions/heroes/odin.ts)
- [packages/rules/src/actions/heroes/riverPerson/boatman.ts](../packages/rules/src/actions/heroes/riverPerson/boatman.ts)
- [packages/rules/src/actions/movementActions/move.ts](../packages/rules/src/actions/movementActions/move.ts)
- [packages/rules/src/actions/movementActions/reactions.ts](../packages/rules/src/actions/movementActions/reactions.ts)
- [packages/rules/src/actions/placementActions.ts](../packages/rules/src/actions/placementActions.ts)
- [packages/rules/src/core/events/combatEvents/tacticalEvents.ts](../packages/rules/src/core/events/combatEvents/tacticalEvents.ts)
- [packages/rules/src/core/events/combatEvents/unitEvents.ts](../packages/rules/src/core/events/combatEvents/unitEvents.ts)
- [packages/rules/src/model/events/index.ts](../packages/rules/src/model/events/index.ts)
- [packages/rules/src/model/events/projected.ts](../packages/rules/src/model/events/projected.ts)
- [packages/rules/src/model/events/visibility.ts](../packages/rules/src/model/events/visibility.ts)
- [packages/rules/src/model/roll.ts](../packages/rules/src/model/roll.ts)
- [packages/rules/src/model/state.ts](../packages/rules/src/model/state.ts)
- [packages/rules/src/pendingRoll/resolvers/heroes/resolveAsgoreRoll/choices.ts](../packages/rules/src/pendingRoll/resolvers/heroes/resolveAsgoreRoll/choices.ts)
- [packages/rules/src/pendingRoll/resolvers/heroes/resolveChikatiloRoll/placement.ts](../packages/rules/src/pendingRoll/resolvers/heroes/resolveChikatiloRoll/placement.ts)
- [packages/rules/src/pendingRoll/resolvers/heroes/resolveVladRoll/intimidate.ts](../packages/rules/src/pendingRoll/resolvers/heroes/resolveVladRoll/intimidate.ts)
- [packages/rules/src/ruleDeclarations/index.ts](../packages/rules/src/ruleDeclarations/index.ts)
- [packages/rules/src/stealth/collision.ts](../packages/rules/src/stealth/collision.ts)
- [packages/rules/src/tests/core/projectedEvents.test.ts](../packages/rules/src/tests/core/projectedEvents.test.ts)
- [packages/rules/src/tests/core/snapshots.test.ts](../packages/rules/src/tests/core/snapshots.test.ts)
- [packages/rules/src/tests/heroes/chikatilo.test.ts](../packages/rules/src/tests/heroes/chikatilo.test.ts)
- [packages/rules/src/tests/index.ts](../packages/rules/src/tests/index.ts)
- [packages/rules/src/view/delivery.ts](../packages/rules/src/view/delivery.ts)
- [packages/rules/src/view/eventPayload.ts](../packages/rules/src/view/eventPayload.ts)
- [packages/rules/src/view/events.ts](../packages/rules/src/view/events.ts)
- [packages/rules/src/view/helpers.ts](../packages/rules/src/view/helpers.ts)
- [packages/rules/src/view/pending.ts](../packages/rules/src/view/pending.ts)
- [packages/rules/src/view/player.ts](../packages/rules/src/view/player.ts)
- [packages/rules/src/view/spectator.ts](../packages/rules/src/view/spectator.ts)

**server**

- [packages/server/src/commandResult.ts](../packages/server/src/commandResult.ts)
- [packages/server/src/eventDelivery.ts](../packages/server/src/eventDelivery.ts)
- [packages/server/src/openapi/generated/responses.json](../packages/server/src/openapi/generated/responses.json)
- [packages/server/src/tests/hardening.test.ts](../packages/server/src/tests/hardening.test.ts)
- [packages/server/src/tests/markerProjection.test.ts](../packages/server/src/tests/markerProjection.test.ts)
- [packages/server/src/tests/modes.test.ts](../packages/server/src/tests/modes.test.ts)
- [packages/server/src/tests/unit/eventDelivery.test.ts](../packages/server/src/tests/unit/eventDelivery.test.ts)
- [packages/server/src/tests/view.test.ts](../packages/server/src/tests/view.test.ts)
- [packages/server/src/tests/ws.smoke.ts](../packages/server/src/tests/ws.smoke.ts)
- [packages/server/src/ws.ts](../packages/server/src/ws.ts)

**web**

- [packages/web/src/components/EventLog.tsx](../packages/web/src/components/EventLog.tsx)
- [packages/web/src/features/sfx/sfxEventMapper.test.ts](../packages/web/src/features/sfx/sfxEventMapper.test.ts)
- [packages/web/src/features/sfx/sfxEventMapper.ts](../packages/web/src/features/sfx/sfxEventMapper.ts)
- [packages/web/src/features/vfx/vfxEventMapper.test.ts](../packages/web/src/features/vfx/vfxEventMapper.test.ts)
- [packages/web/src/features/vfx/vfxEventMapper.ts](../packages/web/src/features/vfx/vfxEventMapper.ts)
- [packages/web/src/features/vfx/vfxPreviewScenarios.ts](../packages/web/src/features/vfx/vfxPreviewScenarios.ts)
- [packages/web/src/features/vfx/vfxTypes.ts](../packages/web/src/features/vfx/vfxTypes.ts)
- [packages/web/src/game/effects/combatPlayback.test.ts](../packages/web/src/game/effects/combatPlayback.test.ts)
- [packages/web/src/game/effects/combatPlayback.ts](../packages/web/src/game/effects/combatPlayback.ts)
- [packages/web/src/game/effects/eventToEffects.test.ts](../packages/web/src/game/effects/eventToEffects.test.ts)
- [packages/web/src/game/effects/eventToEffects.ts](../packages/web/src/game/effects/eventToEffects.ts)
- [packages/web/src/game/effects/types.ts](../packages/web/src/game/effects/types.ts)
- [packages/web/src/game/effects/visualResolution.test.ts](../packages/web/src/game/effects/visualResolution.test.ts)
- [packages/web/src/game/effects/visualResolution.ts](../packages/web/src/game/effects/visualResolution.ts)
- [packages/web/src/i18n/eventMessages.ts](../packages/web/src/i18n/eventMessages.ts)
- [packages/web/src/i18n/i18n.test.ts](../packages/web/src/i18n/i18n.test.ts)
- [packages/web/src/modes/DraftScreen.tsx](../packages/web/src/modes/DraftScreen.tsx)
- [packages/web/src/store.ts](../packages/web/src/store.ts)

## 13. Privacy/serialization regressions

The new rules projectedEvents.test.ts suite covers:

- Owner/opponent/spectator stake placement JSON and complete unauthorized view JSON.
- Revealed stake triggers without stacked marker IDs/count.
- Owner-only Jack trap markers and pending placement context.
- Hassan private candidates/selection metadata, resulting events, assignment thresholds and per-target event-count privacy.
- Hidden multi-segment movement followed by reveal in one resolution.
- Public movement followed by stealth in one resolution.
- Dedicated last-known marker versus real hidden current cell.
- Nonserialized and removed internal authorization facts.
- Legacy positional events without facts failing closed.
- Public chain completion markers surviving projection.
- Public AoE and carpet geometry with hidden source/victim identities and filtered outcome maps.
- Recipient-specific pending AoE previews.
- Hidden incoming source identity/ability strings in an otherwise authorized defender roll, filtered queue indexes/maps, and private chain-source/count removal.
- Search failure and reaction-target privacy.
- Hidden death position protection and omission of unauthorized hidden deaths.
- New top-level and nested payload fields failing to auto-forward.
- Unknown runtime event omission and compile-time assertions for incomplete movement and illegal notice-field access.

Server eventDelivery.test.ts additionally verifies movement facts survive identification, IDs stay stable, hidden movement is omitted after later reveal, public movement survives later concealment, and no internal symbols reach recipient objects. Existing same-event-ID, stream/revision recovery, reconnect/dedupe, deferred-chain and gameplay snapshot suites remain active. Older malformed-redaction assertions were migrated to typed notices/omission while retaining the private-field checks. Gameplay golden comparisons remove only the internal symbol, retaining all previous gameplay expectations.

## 14. Verification

| Command / suite | Result |
| --- | --- |
| npm run -w rules test | passed |
| npm run test:server | 11 suite executions passed, including transport identity and replay correctness |
| npm run test:contract | 20 suite executions passed |
| npm run test:web | 511 tests passed, including Phase-2 presentation session/delivery tests |
| npm run -w web test:effects | 74 tests passed |
| npm run -w web test:sfx | 9 tests passed |
| npm run -w web test:vfx | 32 tests passed |
| Direct tsx execution of the eight existing memory WebSocket suites | passed: matchLifecycle, matchTypes, lobby, matchmaking.ws, authenticatedMultiplayer, ws.smoke, testRoom.ws, modes |
| npm run typecheck | passed, including server benchmark and smoke typechecks |
| npm run build | passed |

The root npm run test:ws wrapper could not start because TEST_DATABASE_URL is unset. Its eight memory-backed WebSocket suite files were run directly with tsx and all passed. Database-backed integration suites were not run. Response schemas were regenerated from the new public contract. Vite emits its existing large-chunk advisory; production build completes.

## 15. Deferred Phase-4 presentation data

Only presentation enrichment remains deferred: roll-result semantic events, authorized event-time source/target presentation anchors, ability-use correlation, movement provenance, and dedicated snare placement/trigger semantic events. The symbol-keyed recipient facts added here authorize privacy; they are not new presentation anchors or semantic effects. Phase 4 and Audio/VFX asset integration were not implemented.
