# Phase 14 — Persistent Status VFX

## Audit before implementation

The source is the existing `PlayerView` (also returned by `makeSpectatorView`).
“Visible” below means a living unit included with a current position in that
recipient's projection. Hidden enemies are absent, except rules-authorized exact
tracking/detection. Last-known positions are separate historical markers. Public
unit fields do not authorize publishing private source metadata through badges.

| State field | Target / polarity | Owner / opponent / spectator visibility | Authoritative lifetime | Existing presentation / asset | Existing event feedback / prior coverage | Phase 14 presentation |
| --- | --- | --- | --- | --- | --- | --- |
| `bunker.active` | Kaiser / positive | Visible unit | `ownTurnsInBunker`; rules exit at own-turn start after 3 | B badge and `vfx/heroes/grand-kaiser/bunker_status.png` | `bunkerEntered`, `bunkerExited`; Phase 9 | Static perimeter and B badge, following token |
| `sansLastAttackCurseSourceId` | Cursed target / negative | Visible unit | Until HP reaches 1 or final death; rules tick guard | No persistent board marker; `vfx/heroes/sans/curse_status.png` exists | `sansLastAttackApplied/Tick/Removed`; Phase 10 | Static curse perimeter and C badge; no source ID |
| `isStealthed` / `stealthDuration` / `stealthTurnsLeft` | Hidden unit / neutral | Owner; enemy exact detection is a safe ? token; spectator omits hidden units | Own-turn starts; False Trail exempt | S badge, owner token; last-known ? separate | `stealthEntered`, `stealthRevealed`; Phases 7–13 | Owner-only stealth accent; no aura on historical or enemy ? token |
| `movementDisabledNextTurn` | Target / negative | Visible unit | Rules consume at next own-turn start | Action availability only | Sans joke / Soul Parade / forest results | Explicit MV badge, never inferred from spent move slot |
| `sansMoveLockArmed` | Joke target / negative | Visible unit | First relevant move spend | Action denial | `sansBadassJokeApplied`, `sansMoveDenied`; Phase 10 | Separate movement-lock badge |
| `kaladinMoveLockSources`, `lokiMoveLockSources` | Entangled target / negative | Visible unit | Rules prune source relationships | Action denial | Fifth Ideal / Entangle; Phase 13 | Separate badges without sources or stack counts |
| `immobilizedUntilOwnTurnStart` | Snared target / negative | Visible unit, independently of trap visibility | Rules-owned release | `SnaredOverlay` ropes | `snareTriggered`; Phase 8 | Reuse ropes and add compact WR badge |
| `blindUntilOwnTurnStart`, `blindExpiresAfterOwnTurn` | Target / negative | Visible unit | Own-turn ordinal | BL corner badge | Blind attack results; Phase 13 | BL in common row |
| `papyrusBoneStatus` | Target / negative | Visible unit | `expiresOnSourceOwnTurn` | Bone SVG/badge and perimeter | `papyrusBoneApplied/Punished`; Phase 13 | Preserve bone SVG/colour, separate from Sans field bone |
| `sansBoneFieldStatus` | Current field-affected unit / negative | Visible unit | `turnNumber` and rules processing | Bone SVG/badge and perimeter | `sansBoneFieldApplied/Punished`; Phase 10 | Preserve bone SVG/colour; no invented area around source |
| `arenaId=boneField`, `boneFieldTurnsLeft` | Whole board / negative | All recipients | Authoritative remaining global turns | `fields/bone.jpg`, per-cell tint | `sansBoneFieldActivated`; Phase 10 | Retain whole-board background and correct current-state tint |
| `arenaId=storm`, `arenaEffects[effectId=storm]` | Whole board / negative | All; source IDs filtered by projection | `remaining`, `durationUnit=turn` | `fields/storm.jpg` | `lechyStormStarted`, `arenaEffectTick/Ended`; Phase 13 | Retain background; immediate current-state removal |
| `forestMarkers` / legacy `forestMarker` | Ground cell + forest aura / positive | All projected recipients | Rules remove marker | Existing forest PNG, radius aura | Lechy forest; Phase 13 | Retain authorized cell/radius markers |
| `stakeMarkers` | Ground cells / negative | Owner own hidden + revealed; opponent/spectator revealed only | Rules-owned marker removal | Existing stake PNG + state badge; projection dedupes cells | `stakePlaced/Triggered`; Phases 8–9 | Retain aggregate marker, never infer hidden stack count |
| `jackTraps` | Ground cells / negative | Owner only; opponent/spectator empty | Triggered trap retained privately but stops being ground marker | Existing trap PNG + badge | `snarePlaced/Triggered`; Phase 8 | Retain owner-only untriggered markers |
| `chikatiloMarkStatus` | Marked target / negative | Marker owner's projected target only; spectator/target owner receive no mark | Mark persists; exact tracking starts on Chikatilo turn, expires after target turn | M badge, tracking ? token | `chikatiloMarkApplied`; Phase 13 | Common M badge; exact-tracking badge on safe ? token without other hidden statuses |
| `transformed`, `heroId=femto`, `gutsBerserkModeActive`, `duolingoBerserkerUnlocked`, `kanekiCentipedeUnlocked`, `mettatonExUnlocked/NeoUnlocked`, `papyrusUnbelieverActive`, `sansUnbelieverUnlocked`, `undyneImmortalActive`, `friskPacifismDisabled`, `lokiChickenSources` | Current forms / mixed | Visible unit | Rules-owned boolean/source relationships | Existing variant token registry | Existing transformation/ability/chicken semantic cues; Phases 10–13 | Current variant token + labelled form badge; silent hydration |
| `friskCleanSoulShield`, `asgoreBraveryAutoDefenseReady` | Unit / positive | Visible unit, no secret count | Rules consume on defense | Ability controls | Existing defense/ability cues | Shield / automatic-defense ready badge |
| `friskPrecisionStrikeReady` | Frisk / positive | Visible unit | Rules consume next strike | Ability controls | Existing Genocide cues | Precision-ready badge |
| `asgorePatienceStealthActive` | Asgore / positive | Owner during stealth | Rules-owned stealth lifetime | Owner token / S badge | Soul Parade / stealth cues | Owner patience badge alongside stealth |
| `genghisKhanDiagonalMoveActive`, `genghisKhanDecreeMovePending`, `genghisKhanMongolChargeActive` | Genghis / positive | Visible unit | Rules consume/reset turn benefits | Action controls | Decree/charge; Phase 13 | Independent compact benefit badges |
| `riverBoatmanExtraMoves` / legacy `riverBoatmanMovePending` | River / positive | Visible unit | Authoritative turn resource | Movement controls | `riverBoatmanGranted`; Phase 12 | Active extra-move badge, no count guessed |
| `riverBoatCarryAllyId` | Carrier/passenger relation / neutral | Owner relation only; public projection strips ID | Pending boat resolution | Existing token attachment playback | Boat pickup/drop; Phase 12 | Carrier active badge; no passenger ID disclosure |
| `papyrusLongBoneMode`, `papyrusLineAxis` | Papyrus / neutral | Visible unit | Mode toggle / selection | Existing mode controls | Long Bone cast; Phase 13 | Long Bone badge, retain axis controls |
| `donSorrowfulReactionAvailable` | Don / positive | Visible unit | Rules consume reaction | Existing reaction controls | Sorrowful Image; Phase 13 | Ready badge |
| `courtExtraFlexibleAction`, `courtGlobalMoveOnce`, `courtDamageCompensation`, `courtCosts` | Court target / positive or negative | Visible unit | `expiresAtRoundEnd`, `used` | Court/action controls | Existing rule-declaration/combat events | Available benefit/cost badges; no wall-clock expiry |
| `courtProceduralRestriction`, `cannotStealthUntilRoundEnd` | Court target / negative | Visible unit | `expiresAtRoundEnd` / authoritative round endpoint | Court/action controls | Existing rule declarations | Restriction / stealth-block badge |
| `courtStasis` | Off-board target / neutral | Authorized unit; hidden dead return positions stripped | `expiresAtRoundEnd`, rules return position | Court pending UI | Existing rule declarations | Selected-unit status summary only; no return-position aura |
| `ruleDeclaration.ruleData.moonGame.crater` | Ground square / negative | Public projected ground area | `expiresAtRoundStart` compared with authoritative round | Existing rule status text; no PNG | Moon crater declaration events | Per-cell quiet boundary using existing board geometry |
| `moonGame.noStealthUntilRoundEnd`, `reverseTurnOrderUntilRoundEnd` | Match / negative or neutral | Public | Authoritative round endpoint | Existing rule status text | Moon declaration events | Retain rule text; blocked stealth entry badge on visible units |
| `ruleData.chessParty.kings` | Selected kings / neutral | Public ID, current unit position only if projected | Match | Existing rule text | King setup declaration | Crown badge on authorized unit |
| `charges.berserkAutoDefense` | Unit / positive | Only owner badge; existing charge controls retain counts | Rules consume/recharge | Existing defense counter | Existing defense events | Ready badge without exact count |

Except for the owner-only automatic-defense-ready indicator, `charges`,
`cooldowns`, Mettaton rating and ability unlock/use counters remain in
their existing authoritative ability/summary UI. They are resources, not a new
board aura for every ability. `sansPendingDeath` remains the existing pending
decision pipeline: HP zero is not final death. Action-spent flags, tick guards,
own-turn ordinals, historical attacked/hit IDs, Tyrant movement snapshots, Jack
known HP, Chikatilo target lists/False Trail IDs, guide target, deferred Don origin,
and pending choices are bookkeeping/private intent, not independent statuses.
No new visual is inferred from these records.

## Final architecture

`Projected current state → typed status resolver → persistent renderer`

`ProjectedGameEvent → existing presentation scheduler → finite entry/tick/exit SFX/VFX`

Persistent IDs are unit ID + typed status kind. No mutable status store, finite
VFX queue, audio hook, timer, event ID, source lookup or local duration arithmetic
belongs in the persistent renderer. Existing ground markers/backgrounds already
serve this role and are retained. Unit placement follows the existing visual
movement coordinates; status activation/permission/lifetime comes from current
authorized units. Removing authorization drops the visual synchronously.

The inventory above is item 1 of the requested final report. The sections below
cover items 2–21.

### 2. Current state and fresh events

`persistentStatuses.ts` resolves a closed set of typed status kinds from the
current projected unit. `UnitStatusVfx.tsx` renders them with stable
`unitId:statusKind` keys. The existing `VfxSprite`, registry, board layers and
`cellToBoardRect` handle artwork and placement; existing Board ground rendering
handles hazards and fields. Moon crater cells use the same shared geometry.

The renderer has no audio hooks, effects, status timers or mutable store. It
does not enqueue persistent statuses as finite VFX requests. Fresh events still
pass through the existing presentation session, event mappers, scheduler and
SFX/VFX hooks. Hydration supplies current visuals without generating events,
which is why reconnect remains silent.

Board's legacy state-diff transformation flashes, bone-expiration flashes and
delayed field removal were removed. Current token variants now read current
authorized unit metadata while the existing combat playback retains ownership
of position interpolation, HP and death presentation.

Source metadata is deliberately excluded from descriptors. Existing projected
records may authorize `chikatiloMarkStatus.sourceUnitId`, Papyrus's
`sourceUnitId`, Sans's curse source, or lock source arrays. The new UI neither
looks up those units nor copies their identities/counts into DOM attributes,
tooltips or positional effects. A badge's `data-bone-source` identifies the
status family only, never a source unit. Hidden source positions are irrelevant
to rendering an authorized condition on its target.

### 3. Kaiser Bunker

`bunker.active` renders the existing static Bunker image as a restrained
perimeter plus a green B badge. Both follow the token's presentation coordinates
during movement and reconcile to its current projected cell. A snapshot with
Bunker active renders immediately without entry feedback.

The existing `bunkerEntered` and `bunkerExited` cues remain event-driven and
deduplicated. Rules still increment `ownTurnsInBunker` at Kaiser's own-turn
starts and exit when the prior count is at least 3, at the fourth start. Attacks
and transformations retain their existing rules-owned exit paths. The web
client displays active state without calculating a remaining-turn count.

### 4. Sans Last Attack curse

`sansLastAttackCurseSourceId` renders `sansCurseStatus` around the authorized
target, with a purple C badge. The source is not displayed.
`sansLastAttackApplied`, `sansLastAttackTick` and `sansLastAttackRemoved` retain
their existing finite feedback. A tick never manufactures an apply cue.

Damage and the 1 HP floor remain in rules (`Math.max(1, unit.hp - 1)`), including
the authoritative tick guard and curse removal. There is no web damage loop.
Reconnecting to a cursed target restores the indicator without apply or
historical tick feedback.

### 5. Stealth

An owner's currently hidden unit retains its token and HP display, with the
existing safe token treatment, an S badge and a quiet dashed perimeter. Asgore's
owner-visible patience state has its own badge.

Opponent and spectator renderers only see authorized projected units. A unit
missing from current projection, or an alive unit with no current position,
cannot be revived by an older visual playback snapshot. Last-known ? markers
remain separate historical markers, with no current aura attached. For an
enemy whose exact position is specifically authorized through tracking, the
existing safe ? token may carry its authorized Chikatilo tracking badge; other
hidden conditions and stealth accents are suppressed.

Current visibility changes restore/remove the token and status visuals. The
existing successful `stealthEntered` / `stealthRevealed` event handling owns
one-shot feedback; a visible reconnect snapshot creates no reveal cue. Failed
stealth handling and event projection are unchanged.

### 6. Movement disabled, wrapped and blind

`movementDisabledNextTurn` produces MV. `sansMoveLockArmed`,
`kaladinMoveLockSources` and `lokiMoveLockSources` produce independent SL, KL and
LL restrictions without source names or stack counts. Spent movement/action
slots do not create these statuses.

`immobilizedUntilOwnTurnStart` reuses `SnaredOverlay` ropes and adds WR. It never
replays a snare trigger on mount. `blindUntilOwnTurnStart` retains BL. Removal
comes from authoritative state, with no local turn countdown.

### 7. Hazards

Existing Board stake/snare/forest markers are retained. The owner sees projected
own hidden Vlad stakes and untriggered Jack snares; other recipients see only
revealed stakes and receive no private snares. Existing aggregate stake markers
do not reveal hidden stack sizes. Triggered snares stop being ground markers,
while an authorized victim's immobilization is independent of trap visibility.

Placement and trigger sounds remain fresh-event feedback. Neither reconnect nor
ground-marker mounting triggers them. No live raw `GameState` is consulted by
the persistent rendering path.

### 8. Bone fields and arena effects

Papyrus and Sans bone records are resolved independently and retain their blue
or orange SVG badges. If both apply, both can appear; the established effective
Sans precedence for the token perimeter and compatibility marker is retained.
Existing detail-panel descriptions and punishment/event presentation remain.

The implemented whole-board Sans bone field uses its existing background and
cell tint. Lechy storm uses its existing arena background; forest markers retain
their projected positions and radius. Field visuals disappear with current
state rather than lingering for a local fade timer. No new source-centered
field radius or periodic damage animation is invented.

### 9. Other implemented states

Coverage includes private Chikatilo marks/tracking; current Kaiser Engineering
Miracle, Femto, Guts Berserk, Duolingo Berserker, Kaneki Centipede, Mettaton EX/NEO,
Papyrus/Sans Unbeliever, Undyne Undying, Frisk Genocide and Loki Chicken forms;
Frisk Clean Soul/precision; Asgore automatic defense/patience; owner automatic
defense readiness; Genghis movement/decree/charge benefits; River extra moves and
owner carrier state; Papyrus Long Bone; Don's available reaction; Court benefits,
costs, restrictions and stasis; Moon crater/stealth restriction; and Chess kings.

Current form art uses the existing variant registry and a localized form badge.
Transformation entry feedback remains semantic-event-driven. Court stasis has
an authorized selected-unit summary rather than an aura at its return position.
Moon's match-wide reverse-order state retains existing rule text. Resource
counts, private target intentions and historical snapshots retain the existing
controls described after the inventory; they are not fabricated new statuses.

### 10. Composition, geometry and accessibility

The documented ground/status/selection/outcome layers are reused. Static aura
art has a transparent center, badges occupy a compact wrapping row at the top,
and HP bars, token faces, selection and decision feedback stay readable. Normal
stacks show separate badges. Very large stacks have a +N aggregate with every
remaining localized description in accessibility text; the selected-unit
summary can show full labels. Cell accessibility labels include all conditions.

Unit placement uses the same fractional playback coordinates and P1/P2
geometry as the token. Ground markers remain cell anchored. All added overlays
ignore pointer input. New persistent artwork is static even in normal mode;
reduced motion preserves all status information. Complete CSS class names are
present in source so Tailwind retains the badge colors in the production build.

### 11. Lifetime

React has no duration counter or expiry callback for these visuals. Rules-owned
state determines activation/removal, including own-turn and round-end statuses.
Moon crater's projected `expiresAtRoundStart` is compared with projected
`roundNumber` because rules may retain the inactive crater record; global Moon
stealth restriction uses the same authoritative round information. No browser
clock participates.

Static registry definitions still contain `durationMs` for ordinary one-shot
previews. The persistent renderer never uses that duration to remove a status.
HP zero alone does not remove a living pre-death unit's indicators. Final
`isAlive=false` removes status anchors while the existing event-driven death
presentation can finish.

### 12. Hydration, reconnect and session changes

Initial and reconnect snapshots immediately resolve their authorized current
statuses. Identical snapshots preserve stable React identities and do not
restart effects. Role, room and stream changes use the existing presentation
session reset; descriptors are recalculated from the new view and recipient.
Private marks, stealth and hazards drop immediately when permission is lost.
There are no status callbacks, loops or timers that can recreate stale visuals.
The selected-unit panel also resolves its selection from current projected units;
an older selected object cannot restore removed private fields or a hidden unit.

Live `roomState` revision R may render a status before `actionResult` revision R
arrives. The unchanged ingress/session logic still accepts that fresh event once;
status mounting adds no second cue. This ordering is tested through the actual
presentation session and Board hooks.

### 13. Audio

Persistent rendering is silent. Existing mute/volume and playback-session
policies continue to apply to fresh one-shots. Event-driven cues include:

- Bunker: `bunkerEntered` / `bunkerExited`, using
  `hero.grand-kaiser.statuses.bunker.enter` / `.exit`.
- Curse: `sansLastAttackApplied` / `Tick` / `Removed`, using
  `hero.sans.abilities.sansLastAttack.apply` / `.tick` / `.remove`.
- Existing stealth entry/reveal, `stakePlaced` / `stakeTriggered`,
  `snarePlaced` / `snareTriggered`, Papyrus/Sans bone application/punishment,
  Sans field activation, Lechy start/results, and transformation/ability cues
  retain their existing event mappers and registered audio policy. This phase
  adds no new sounds or ambient loops.

### 14. Assets and runtime registry

- Reused `packages/web/src/assets/vfx/heroes/grand-kaiser/bunker_status.png`:
  existing `bunkerStatus` definition, static 128 × 128, one frame, unit anchor,
  status layer, normal blend, static reduced-motion policy.
- Newly registered existing
  `packages/web/src/assets/vfx/heroes/sans/curse_status.png`:
  `sansCurseStatus` with the same static geometry/placement policy.
- Existing bone SVG, `SnaredOverlay`, unit variant art, stakes/snares/forest PNGs
  and bone/storm board backgrounds are reused without new bitmap files.

The two static definitions have 1000 ms one-shot preview metadata. Persistent
CSS disables animation and renders them indefinitely while authorized state is
active. No asset download, generation or duplicate preload system was added.

### 15. Files created

- `docs/phase-14-persistent-status-vfx.md` — inventory and final report.
- `packages/web/src/features/vfx/persistentStatuses.ts` — typed state resolvers.
- `packages/web/src/features/vfx/UnitStatusVfx.tsx` — persistent unit rendering
  and reusable badges.
- `packages/web/src/features/vfx/UnitStatusVfx.test.tsx` — lifecycle/privacy tests.
- `packages/web/src/features/vfx/persistentStatusPreview.ts` — synthetic debug
  snapshots; live state never passes through this fixture builder.
- `packages/web/scripts/phase14-fixtures.ts` — Node-side real recipient
  projections for browser verification.
- `packages/web/scripts/phase14-smoke.mjs` — local automated browser smoke.

### 16. Files modified

- `packages/web/src/components/Board.tsx` — current-state token/status
  integration, stale visibility guard, crater cells and removal of legacy
  state-diff feedback/delayed field cleanup.
- `packages/web/src/features/vfx/vfxTypes.ts`, `vfxRegistry.ts`,
  `vfxPreviewScenarios.ts` — curse status definition/type/preview coverage.
- `packages/web/src/game/components/RightPanel/sections/BattleUnitSummary.tsx`
  — additional authorized conditions, retaining existing detailed status UI.
- `packages/web/src/i18n/locales/en.ts`, `uk.ts` — localized status labels.
- `packages/web/src/pages/VfxPreviewPage.tsx` — snapshot/recipient controls,
  including status-free, bone-field and storm fixtures.
- `packages/web/src/styles.css` — compact badges, static perimeters and crater
  ground styling.
- `packages/web/package.json` — `test:phase14:e2e` command.

Rules, server, shared projection contracts and gameplay mechanics are unchanged.

### 17. Tests added

Ten tests cover snapshot restoration without transient effects; actual
owner/opponent/spectator projection serialization; exact tracking privacy;
movement-spent versus disabled and typed/localized status coverage; stable
identities and fractional geometry in both orientations; pre-death/final-death,
stasis and permission cleanup (including a stale selected-unit panel); silent
ground fields and stake deduplication;
Moon/Chess authoritative rule state; extreme-stack accessible descriptions; and
full Board hydration/live-event/session-reset behavior.

The Board integration test asserts one fresh same-revision Bunker entry, duplicate
suppression, silent state-only changes, one exit, one curse tick without apply,
and role/room/stream cleanup. Existing effect/SFX/VFX suites retain fresh reveal,
transformation, bone, arena, hazard and death-event coverage.

### 18. Test results

All completed successfully:

| Command | Result |
| --- | --- |
| `npm run -w web test:effects` | 214 passed |
| `npm run -w web test:vfx` | 60 passed |
| `npm run -w web test:sfx` | 38 passed |
| `npm run -w web test:i18n` | 5 passed |
| `npm run test:web` | 680 passed; both suite executions successful |
| `npm run -w web test:phase14:e2e` | Automated Edge smoke passed; no browser errors |
| `npm run build` | Rules/server compilation and web production build passed |

The full web run includes asset/marker and projection-adjacent presentation
checks. Rules/server test suites were not required by the task's conditional
contract-change requirement because their source and contracts are untouched.
No tests were removed or weakened. Build and test logs, browser fixture output,
screenshots and smoke results are local ignored verification artifacts.

### 19. Browser verification actually performed

Automated headless Edge rendered real rules-projected fixtures through Board.
It checked silent hydration/reconnect and stable nodes; one Bunker entry/exit
and curse tick with duplicate suppression; owner/P2/spectator privacy for
stealth, private marks and hazards; current-state removal; moving-token/aura
alignment over five animation frames; pre-death and final-death cleanup; bone
and storm fields; P2 orientation; a 390 × 700 mobile viewport; reduced-motion
styles, production-scanned badge colors and click-through input. No browser
runtime errors were observed. P1, P2, spectator and mobile screenshots were
generated, with desktop/mobile screenshots visually reviewed.

Artifacts are under `packages/web/test-results/phase14/browser/`:
`P1.png`, `P2.png`, `spectator.png`, `mobile-reduced.png`, `results.json` and
the generated harness/fixtures. They are not production sources.

This was an automated fixture smoke test and screenshot review. No manually
played local two-account/WebSocket match or audible audio listening check was
performed. Audio scheduling was instrumented without playing actual sound.

### 20. Remaining gaps and limits

No projection enrichment was needed for implemented status indicators. Recipient
restrictions still intentionally withhold hidden units, trap coordinates,
private marks/relations and exact resource counts. There is no new duration
countdown when it would require inference.

Movement locks, protection/readiness, Court benefits/restrictions and Moon
crater have no newly registered dedicated raster status artwork; compact
localized badges, existing ropes and quiet CSS ground boundaries provide their
implemented presentation. No missing hero assets were fabricated. Private
Hassan assignment intent remains existing authorized ability UI, not a target
aura. Historical Tyrant movement profiles remain existing movement controls.

Extreme stacks use accessible overflow rather than displaying an unlimited
number of tiny icons. Verification does not replace a real multi-client network
stress test, hardware/mobile-device run or audible mix review. Those checks
remain appropriate for the next phase.

### 21. Next roadmap phase

**PHASE 15 — Polish, Preloading & Final Stress Test.**

Phase 15 has not been started.
