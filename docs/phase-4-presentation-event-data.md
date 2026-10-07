# Phase 4: Missing Presentation Event Data

Implemented in the existing GameEvent -> ProjectedGameEvent -> actionResult pipeline. No new transport, event bus, assets, audio playback, or VFX behavior. Existing damage, costs, legality, stealth, hazards, reactions, and RNG formulas are retained.

## 1. Roll event model

The authoritative variant is:

```ts
{
  type: "rollResolved";
  rollId: string;
  rollKind: RollKind;
  rollerPlayerId: PlayerId;
  unitId?: string;
  rollIndex: number;
  dice: number[];
  sides: number;
  total: number;
  abilityId?: string;
  abilityUseId?: AbilityUseId;
  chainId?: string;
  visualBatchId?: string;
  isChainComplete?: boolean;
  deferVisuals?: boolean;
}
```

The event records explicit authoritative draws during a validated pending resolution. It covers attacker/defender dice, individual tie-break requests, shared AoE attacks, Carpet Strike 2d9/2d6, movement d6, stealth, Search, initiative, Court/Moon rolls, Forest movement checks, and implemented hero manual draws. Loki's random Spin selection records its existing uniform indexed draw using the candidate count as the number of sides; target selection itself does not consume another draw.

Wrong pending IDs/players, invalid choices, Attack/Pass decisions, targeting, confirmations, and automatic defense without dice generate no fictitious result. Incidental automatic hazard/collision RNG continues to use its existing specialized events.

A local RNG wrapper accounts for explicitly recorded manual draws without changing their values or order. Shared attacker evidence is emitted once, when the draw occurs. Each defender and each tie-break request has its own rollId. rollIndex distinguishes multiple actual draws in one request.

Visibility is explicit: visible unit rolls use event-time authorization; stealth and Spin preparation are owner-only; initiative and public rule rolls are public. Search preserves the prior filtered-detail policy: failed draws against unknown hidden candidates are internal only. Projected Search results omit rollIndex so gaps cannot reveal hidden draw counts.

Initiative and Carpet compatibility events remain because they communicate initiative state or area geometry. They now reference the same rollId. rollResolved is the generic dice-result signal; compatibility events are additional gameplay context, not a second independent draw.

## 2. Identity domains

| Identity | Owner and meaning |
| --- | --- |
| eventId | Server delivery identity; dedupe and duplicate broadcast safety. |
| revision | Server accepted-action ordering within a stream. |
| chainId / visualBatchId | Existing combat/presentation grouping and completion. |
| rollId | One validated pending/manual request. |
| abilityUseId | Rules identity of one committed ability use. |

No movementId or combatUseId was added. Existing movement endpoints and abilityUseId provide the required semantics. Base attacks keep their existing combat grouping and receive no fabricated ability identity.

## 3. Ability-use correlation

commitAbilityUse increments the persisted abilityUseCounter and creates ability-use-N. It uses no UUID, clock, or random draw. commitAbilityCost creates the identity only after validation and successful cost commitment. Legacy cost handlers already signal commitment through abilityUsed; the existing action boundary attaches their identity once. Forest commits when nine stakes are consumed; Carpet Strike commits when its three charges are spent.

Opening an ability menu or choosing a tentative target/destination allocates nothing. Boat/Tralala commit at the existing final-choice/cost point.

AbilityUseContext carries abilityId, abilityUseId, and internal frozen origin/authorization through pending rolls, nested contexts, AoE state, combat queues, and reaction movement. Continuations retain the original ID. Reaction attacks explicitly inherit their originating movement context. Independent passives, new abilities, and unrelated result events do not inherit a previous use merely because the actor or action batch is the same.

## 4. Fireball

A representative committed chain is:

```text
abilityUsed   abilityId=asgoreFireball abilityUseId=ability-use-1
rollResolved  abilityId=asgoreFireball abilityUseId=ability-use-1 rollId=roll-1
rollResolved  abilityId=asgoreFireball abilityUseId=ability-use-1 rollId=roll-2
attackResolved abilityId=asgoreFireball abilityUseId=ability-use-1
```

Each delivered event receives its own server eventId. chainId remains a separate combat grouping. A later base attack has neither the Fireball abilityId nor this abilityUseId. Repeated tie-breaks retain the same committed use while receiving separate rollIds.

## 5. AoE and line attacks

Dora, Forest, Gaster Blaster, Trickster AoE, Carpet Strike, and the existing queued ability flows carry one committed use through their shared attacker draw, individual defender results, and final aoeResolved. No per-defender use ID is allocated.

Existing center/radius geometry is retained. Gaster uses the implemented full ray: frozen sourceCell plus selected center gives its direction, and the board boundary defines the end. Units do not obstruct that ray. No hidden caster origin is added to an unauthorized recipient's public area geometry.

## 6. Event-time anchors

| Event | Frozen geometry |
| --- | --- |
| attackResolved | sourceCell and targetCell; target includes an actual redirect. Nullable for non-board sources. |
| aoeResolved | Authorized sourceCell, plus copied existing center. |
| unitDied | deathCell captured before removal, including Sans deferred death and drain/removal branches. |
| unitMoved | Copied from/to endpoints. |
| intimidateResolved | Copied from/to and explicit forced cause. |
| riverBoatResolved / riverTraLaLaResolved | Copied actual carrier/drop destinations. |
| Carpet Strike events | Copied existing center geometry. |
| snarePlaced / snareTriggered | Copied committed placement/actual entry cell. |

Anchor authorization is captured before subsequent reveal/hide transitions, including hidden attacks resolved through automatic defense. Source and target permissions are independent. Projection does not derive missing anchors from current positions or lastKnownPositions. Death helpers without a knowledge map conservatively keep hidden death anchors owner-only.

## 7. Movement provenance

```ts
type MovementProvenance =
  | { kind: "normal" }
  | { kind: "rider" }
  | { kind: "teleport" }
  | { kind: "boat" }
  | { kind: "tralala" }
  | { kind: "forced"; cause:
      "intimidatingStare" | "hiddenCollision" | "court" |
      "moonSwap" | "donWindmills" }
  | { kind: "ability"; abilityId: string };
```

Normal and Rider mechanics set their corresponding kinds. Trickster movement and Sleipnir set teleport from the actual movement mode. Boat and Tralala set their transport kind for all emitted carrier/passenger steps and drops. Forced collision, Court, Moon swap, and Windmills identify the actual displacement cause. Other distinct ability movement names the implemented ability, including Divine Move, Guide Traveler, Tyrant, Integrity, Push Notification, Oni Giri, and Don's movement reactions.

Intimidating Stare keeps its existing specialized displacement event with forced provenance. Adding another unitMoved would change event-driven snare behavior, so its existing gameplay event boundary is retained. Long Rider movement remains rider; short Trickster movement remains teleport. No distance heuristic was added.

Projected ability provenance may omit its nested abilityId when the source identity is unauthorized; its kind remains explicit.

## 8. Boat / Tralala

All actual unitMoved steps carry boat or tralala provenance and the committed transport use. Planned paths stay in authoritative pending state. Events contain only reached steps. Stakes, reaction pauses, deaths, interrupted disembarkation, and final drops continue through the current mechanics. Later reaction dice/results retain the originating Tralala ID. Final result events expose actual destinations rather than requiring current-state path reconstruction.

## 9. Jack snares

```ts
{ type: "snarePlaced"; owner: PlayerId; sourceUnitId: string; cell: Coord;
  abilityId?: string; abilityUseId?: AbilityUseId; }
{ type: "snareTriggered"; unitId: string; cell: Coord; immobilized: true; }
```

Placement emits only after successful commitment and projects only to the owner. Opponents and spectators receive no placement cell. Trigger emits at actual entry, once per existing trap/target trigger rule, using the entry event's authorization. It contains no trap ID, other trap locations, or placement history. Immobilization, reveal, persistence, cleanup, and repeat-trigger prevention retain their existing rules.

## 10. Persistence / compatibility

Snapshot V1 now accepts optional abilityUseCounter and typed correlation/origin fields in pendingRoll, pendingCombatQueue, pendingAoE, and pendingReactionMovement. Nested JSON contexts already preserve continuation data. The serializer/restorer preserves exact IDs and RNG state; restore allocates nothing.

Old V1 snapshots without new fields remain valid. The next newly committed use starts from counter zero when no counter exists. An old in-flight action with no recoverable use identity stays on the legacy uncorrelated path; no past ID is fabricated. Historical events missing event-time facts receive no guessed anchors.

## 11. Projection and client contracts

The explicit payload copier and exhaustive recipient projector whitelist new variants and fields. Frozen authorization facts use the existing internal symbol mechanism and never enter JSON. Origins/recipient lists are stripped recursively from pending views; ProjectedPendingRoll also omits those internal fields from the public type and generated response contract. abilityUseCounter is excluded from player/spectator views.

ProjectedGameEvent explicitly supports independently redacted attack anchors and attacker identity, projected movement provenance, and omitted private Search indexes. Hidden use IDs and newly propagated ability identities are removed when unauthorized. Public blast geometry remains independent of caster visibility. Snare placement is owner-only and trigger projection cannot reveal untriggered traps.

Web ingress preserves the new event data with existing eventId dedupe, silent reconnect baselines, and stream/role resets. New roll/snare events currently produce no new effects. Existing preview/test fixtures were updated to the required provenance contract only. Generated server OpenAPI response schemas were refreshed.

## 12. Files changed

### rules

- `packages/rules/src/actions/abilityCosts.ts`
- `packages/rules/src/actions/armyActions.ts`
- `packages/rules/src/actions/heroes/asgore/fireball.ts`
- `packages/rules/src/actions/heroes/chikatilo/postAction.ts`
- `packages/rules/src/actions/heroes/chikatilo/setup.ts`
- `packages/rules/src/actions/heroes/griffith.ts`
- `packages/rules/src/actions/heroes/grozny/movement.ts`
- `packages/rules/src/actions/heroes/guts/berserk.ts`
- `packages/rules/src/actions/heroes/kaiser/carpetStrike.ts`
- `packages/rules/src/actions/heroes/lechy/guideTraveler.ts`
- `packages/rules/src/actions/heroes/lechy/storm.ts`
- `packages/rules/src/actions/heroes/newBatch.ts`
- `packages/rules/src/actions/heroes/newBatchPost.ts`
- `packages/rules/src/actions/heroes/odin.ts`
- `packages/rules/src/actions/heroes/riverPerson/boatman.ts`
- `packages/rules/src/actions/heroes/sans/curses.ts`
- `packages/rules/src/actions/heroes/undyneHelpers.ts`
- `packages/rules/src/actions/heroes/vlad.ts`
- `packages/rules/src/actions/movementActions/forestResolvers.ts`
- `packages/rules/src/actions/movementActions/move.ts`
- `packages/rules/src/actions/movementActions/reactions.ts`
- `packages/rules/src/actions/registry.ts`
- `packages/rules/src/actions/types.ts`
- `packages/rules/src/aoe.ts`
- `packages/rules/src/combat/resolveAttack.ts`
- `packages/rules/src/combat/stateAutoDefense.ts`
- `packages/rules/src/core/combat/combatCtx.ts`
- `packages/rules/src/core/events/combatEvents/tacticalEvents.ts`
- `packages/rules/src/core/events/combatEvents/unitEvents.ts`
- `packages/rules/src/core/rolls/rollUtils.ts`
- `packages/rules/src/death.ts`
- `packages/rules/src/jackSnares.ts`
- `packages/rules/src/model/events/core.ts`
- `packages/rules/src/model/events/index.ts`
- `packages/rules/src/model/events/projected.ts`
- `packages/rules/src/model/events/visibility.ts`
- `packages/rules/src/model/index.ts`
- `packages/rules/src/model/reactions.ts`
- `packages/rules/src/model/roll.ts`
- `packages/rules/src/model/state.ts`
- `packages/rules/src/pendingRoll/resolvePendingRoll/index.ts`
- `packages/rules/src/pendingRoll/resolvers/core/resolveAttackRoll/resolveAttacker.ts`
- `packages/rules/src/pendingRoll/resolvers/core/resolveAttackRoll/resolveDefender.ts`
- `packages/rules/src/pendingRoll/resolvers/core/resolveInitiativeRoll.ts`
- `packages/rules/src/pendingRoll/resolvers/core/resolveMoveOptionsRoll.ts`
- `packages/rules/src/pendingRoll/resolvers/core/resolveStealthRoll.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveAsgoreRoll/choices.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveAsgoreRoll/roll.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveBunkerRoll.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveCarpetStrikeRoll/center.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveCarpetStrikeRoll/defender.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveChikatiloRoll/explosionRolls.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveDoraRoll/rolls.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveElCidRoll/defender.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveElCidRoll/kolada.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveElCidRoll/tisona.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveForestRoll/rolls.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveFriskRoll/pacifism.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveJebeRoll/aoeRolls.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveJebeRoll/shooter.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveLokiRoll/menu.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveTricksterRoll.ts`
- `packages/rules/src/pendingRoll/types.ts`
- `packages/rules/src/ruleDeclarations/index.ts`
- `packages/rules/src/stealth/collision.ts`
- `packages/rules/src/tests/core/projectedEvents.test.ts`
- `packages/rules/src/tests/core/snapshots.test.ts`
- `packages/rules/src/tests/heroes/jack.test.ts`
- `packages/rules/src/tests/heroes/newPlayableBatch.test.ts`
- `packages/rules/src/tests/heroes/reactionMovement.test.ts`
- `packages/rules/src/tests/heroes/vladTepes.test.ts`
- `packages/rules/src/tests/index.ts`
- `packages/rules/src/view/eventPayload.ts`
- `packages/rules/src/view/events.ts`
- `packages/rules/src/view/pending.ts`
- `packages/rules/src/view/player.ts`
- `packages/rules/src/view/spectator.ts`
- `packages/rules/src/core/abilityUse.ts`
- `packages/rules/src/model/semantic.ts`
- `packages/rules/src/pendingRoll/manualRoll.ts`
- `packages/rules/src/tests/core/presentationSemantics.test.ts`

### server

- `packages/server/src/openapi/generated/responses.json`
- `packages/server/src/persistence/snapshotStateV1.ts`
- `packages/server/src/tests/hardening.test.ts`
- `packages/server/src/tests/matchSnapshot.test.ts`
- `packages/server/src/tests/unit/eventDelivery.test.ts`
- `packages/server/src/tests/view.test.ts`

### web

- `packages/web/src/features/vfx/vfxEventMapper.test.ts`
- `packages/web/src/features/vfx/vfxPreviewScenarios.ts`
- `packages/web/src/game/effects/eventToEffects.test.ts`
- `packages/web/src/game/effects/presentationSession.test.ts`

## 13. Tests added / strengthened

- Rules presentationSemantics: normal attack and tie-break evidence, Fireball identity and frozen anchors, shared Dora/Gaster/Trickster draws, Forest/Carpet correlation and 2d9, auto-dodge without fake dice, private stealth/Search, hidden source/death anchors, explicit movement classification, interrupted Boat/Tralala reached steps, snare privacy/once-only trigger, pending-origin scrubbing, and independent-use isolation.
- Existing reaction tests now verify Tralala identity through both manual combat phases. Intimidate tests verify explicit forced provenance. Golden snapshots include the new semantic events/anchors without removing existing gameplay assertions.
- Server snapshots: real Fireball serialization/restoration before attacker, defender, and both tie-break commands; exact IDs/counter/RNG continuation; typed fields round-trip in every continuation container; old V1 fields remain optional.
- Server eventDelivery: separate delivery IDs for distinct rolls sharing a committed ability/chain; prior delivery/recovery/privacy regressions retained.
- Web presentationSession: distinct delivery IDs preserve both dice events sharing a use ID, preserve provenance/snare fields, dedupe rebroadcasts, and suppress reconnect history. Effects tests verify new roll/snare variants introduce no presentation behavior.

## 14. Validation results

| Check | Result |
| --- | --- |
| npm run -w rules test | Passed complete rules suite, including new semantics and existing gameplay/privacy/golden tests. |
| npm run -w server test | Passed complete server suite, including persistence, recovery, replay, authenticated multiplayer, WS, hardening, and OpenAPI. |
| Server focused snapshots/view rerun after final changes | Passed. |
| Server eventDelivery unit suite | 8/8 passed. |
| npm run test:web | 513/513 passed. |
| npm run -w web test:effects | 76/76 passed. |
| npm run -w web test:sfx | 9/9 passed. |
| npm run -w web test:vfx | 32/32 passed. |
| npm run build | Passed rules/server compilation, response-schema generation, web typecheck, and production Vite build. |
| git diff --check | Passed. |

An overloaded parallel run initially exceeded the existing server startup-test timeout. The later complete server run passed without changing those tests or timeouts. The build retains existing non-fatal Vite CJS, Browserslist age, and chunk-size notices. Live PostgreSQL integration suites were not required or run by the default server suite.

## 15. Remaining gaps

No known blocker remains in the requested Phase 4 semantic scope. Legacy saved actions without correlation cannot acquire a historical use ID safely. Unauthorized anchors and hidden source identity remain intentionally absent. Persistent hazards keep their existing gameplay-specific events; this phase does not add a new cross-turn effect-lifecycle protocol. Audio/VFX implementation belongs to later work and was not started.
