# Core VFX infrastructure (Phase 6)

The existing React DOM/CSS renderer remains authoritative for web presentation.
No rendering engine, dependency, Zustand store, artwork conversion, rules metadata,
or server/gameplay contract was added.

## Runtime pipeline

```text
ProjectedGameEvent -> vfxEventMapper -> BoardVfxRequest -> enqueueBoardVfx
  -> QueuedBoardVfxRequest -> vfxRegistry -> VfxLayer / Effect
  -> geometry wrapper -> Artwork -> VfxSprite -> DOM + CSS
```

`BoardEffectsLayer` retains procedural feedback and floating outcomes. It shares
`cellToBoardPoint`, `cellToBoardRect`, and `lineBetweenCellsToCssTransform` with
`VfxLayer`. Preview requests enter the queue directly, without live ingress,
`PresentationSession`, stream/revision/event identities, or event dedupe.

## Added runtime definitions

Paths below are relative to `src/assets/vfx/`. All generated source frames were
verified as 128x128 using the actual PNG headers; existing PIPOYA strips retain
their own verified 192x192 metadata. Definitions are explicit TypeScript.
Documentation/provenance manifests are never imported into the runtime.

| ID           | Asset(s)                                                                 | Type / frames   | Derived FPS / duration                 | Placement / geometry                                  | Layer      |
| ------------ | ------------------------------------------------------------------------ | --------------- | -------------------------------------- | ----------------------------------------------------- | ---------- |
| combatHit    | combat/combat_hit_light.png                                              | strip / 7       | 23.33 / 300ms                          | cell / 1x1                                            | impact     |
| combatMiss   | combat/combat_miss.png                                                   | strip / 7       | 23.33 / 300ms                          | cell / 1x1                                            | impact     |
| unitDeath    | combat/unit_death.png                                                    | strip / 12      | 23.08 / 520ms                          | cell / 1x1                                            | impact     |
| statusSmall  | status/status_small.png                                                  | static / 1      | no animation / 650ms preview lifetime  | cell / 1x1                                            | status     |
| doraImpact   | heroes/grand-kaiser/dora_impact_primary.png + dora_impact_accent.png     | strip / 28 each | 24.35 / 1150ms                         | area / 3x3                                            | impact     |
| carpetImpact | heroes/grand-kaiser/carpet_impact_primary.png + carpet_impact_accent.png | strip / 32 each | 20 / 1600ms                            | area / 5x5                                            | ground     |
| gasterBeam   | heroes/sans/gaster_beam_primary.png + gaster_beam_accent.png             | strip / 20 each | 23.53 / 850ms                          | ray / endpoint or board boundary, 0.35-cell thickness | projectile |
| bunkerStatus | heroes/grand-kaiser/bunker_status.png                                    | static / 1      | no animation / 1000ms preview lifetime | unit / 1x1                                            | status     |
| fireball     | heroes/asgore/fireball.png                                               | strip / 17, frame 1 only | static ember / 400ms travel           | projectile / 0.65-cell sprite, source to target       | projectile |
| fireballCast | heroes/asgore/fireball.png                                               | frames 0–1      | 16 / 125ms                            | event-time source cell                              | projectile |
| fireballImpact | heroes/asgore/fireball.png                                             | strip / 17      | 24.29 / 700ms, confirmed hit only       | event-time target cell / 0.85 cells                  | impact |
| fireParade   | heroes/asgore/fire_parade_primary.png + fire_parade_accent.png             | strip / 29 each | 24.17 / 1200ms                        | radius-two area / 5x5, clipped at board edge          | ground |
| soulParade   | heroes/asgore/soul_parade.png                                            | strip / 22      | 24.44 / 900ms                         | event-time source cell / 1.2 cells                   | status |

The original infrastructure catalog has been extended with Phase-11 runtime
slices and Asgore signatures. Live mappings reuse the common presentation plan;
AoE requests include the full event radius dimensions.

## Frame playback, timing and cleanup

`durationMs` is authoritative. Requests can override it; the queue normalizes the
lifetime and every sprite receives `expiresAt - startedAt`. FPS is derived as
`activeFrameCount * 1000 / durationMs`; conflicting stored FPS was removed.

`spritePlayback` sizes a horizontal sheet to `sourceFrames * 100%` by `100%`.
For N active frames it uses `steps(N - 1, end)` for
`durationMs * (N - 1) / N`, then holds the exact final frame for the remaining
`durationMs / N`. Each frame gets one equal interval, there is no interpolation,
wraparound, blank overshoot, or neighboring active frame. One-frame slices stay
static. Inclusive `startFrame`/`endFrame` can select a range without changing the
full source sheet dimensions.

The geometry wrapper owns the opacity envelope, placement and rotation. The
inner strip owns only frame stepping. Area styling cannot replace strip playback.
A mount-fixed signed delay catches up late cues and remains unchanged on resize.
Replays use a fresh debug cue key, which remounts both layers at frame zero.
Queue expiry removes the entire concept, and existing session reset/timer cleanup
continues to apply to gameplay. Preview timers also clean up on unmount.

## Composition

`VfxDefinition.layers` is an ordered array of `VfxArtwork` objects with explicit
`primary`/`accent` roles. A request creates one geometry wrapper with both sprites.
They receive the same duration, delay, cue identity, geometry and cleanup lifetime.
Primary has local z=0 and accent z=1. Preview may filter a role for inspection;
production does not emit independent layer requests. Dedupe tracks one cue.

## Geometry, orientation and clipping

Queued requests retain cloned logical coordinates, never frozen pixels.
`cellToBoardPoint` is the canonical P1/P2 conversion: P1 rows increase upwards;
P2 reverses columns and rows. `cellToBoardRect` and line geometry use that same
conversion. `BoardEffectsLayer` no longer duplicates this math.

- Cell/unit: center a cell-relative sprite using `areaToBoardRect`. Default unit
  placement uses the frozen event `sourceCell`. Only explicit
  `anchorMode: "followUnit"` reads the current authorized projected position;
  missing positions are skipped. This is status capability, not a persistent
  status lifecycle in the one-shot queue.
- Area: center + `widthCells`/`heightCells` yields the full 1x1, 3x3 or 5x5 rectangle,
  including negative/off-board coordinates. `vfx-board-root` clips to the actual
  9x9 grid with `overflow: hidden`. It is offset by the existing coordinate gutter
  exactly once. Artwork never shrinks to the in-bounds cell subset.
- Sparse areas: explicit cell sets without rectangle dimensions render per-cell
  sprites, avoiding a misleading stretched bounding box. Masks can be added later.
- Ray: source + direction intersects the literal logical board boundary;
  `rayToEdge: false` uses the target endpoint instead. Units are irrelevant to
  geometry. Thickness is `beamThicknessCells * cellSize`. The wrapper rotates,
  while `VfxSprite` animates one coherent beam instead of tiling the sheet.
- Beam source viewport: both Gaster layers crop the authored 128x128 frame to
  `{ left: 12, top: 48, width: 104, height: 32 }` through DOM sizing/clipping. This
  removes transparent padding so the visible core reaches the ray boundary and
  keeps readable cell-relative thickness; source PNGs remain untouched.
- Path: ordered confirmed cells produce canonical adjacent segments. Existing
  procedural transport previews retain fixed endpoint portals. No movement path
  is reconstructed by the renderer from unit state or distance.
- Projectile: canonical source/target line supplies rotation and travel distance;
  a CSS translation wrapper carries a cell-relative static/strip sprite. Fireball
  is a technical full-strip preview. Its gather/travel/hit/miss slices remain
  unspecified because numeric semantic phase boundaries are not established.

`useBoardFit`/ResizeObserver drives the same grid and VFX metrics in production and
preview. Cell and board widths update together; removed dimension transitions
previously caused transient flex shrink and effect drift during resize. Resizing
or flipping changes geometry without changing cue IDs, start times or delays.

## Board layer ownership

`BOARD_LAYERS` owns numeric order and supplies matching CSS variables to `Board`.
The board isolates blending; row/cell/overlay roots do not trap positioned children
in competing stacking contexts. Composition blends stay inside the board.

```text
board background (0)
  < ground (5)
  < unit content (10)
  < status (20)
  < movement / projectile / beam (30)
  < impact (40)
  < decorative overlay (45)
  < HP / floating outcomes / status badges (50)
  < selection / target / pending decision / focus outlines (60)
  < application menus and modals
```

Legacy definitions without a layer default to ground for areas, movement for
paths/lines, and impact otherwise. Decorative roots, sprites, projectiles and
outlines use `pointer-events: none`; live cell handlers remain available.

## Reduced motion

Generated strips show a representative middle frame with no stepping. Projectiles
stop travel and retain the static source feedback with a short opacity envelope.
Geometry and composition remain unchanged. Existing `hide`/`short` policies and
procedural portal fallbacks remain supported. The existing system preference hook
is used, with an additional preview checkbox. No new accessibility subsystem.

## Preview and verification

Open `/vfx-preview` in Vite development, or with `VITE_ENABLE_TEST_ROOM=true`.
Select any registry entry and Play / Replay. Controls include P1/P2, board width,
center/left/right/top/bottom/corner anchors, horizontal/vertical/diagonal/reverse
board-edge/target rays, primary/accent/composite and reduced motion. The ray and
projectile source is deliberately noncentral `{ col: 1, row: 2 }`. Metadata shows
paths, types, frames, derived timing, geometry and layer. Real board selection,
HP, valid targets and a last-click output exercise tactical readability and input.
Legacy scenario buttons still use the event mapper with synthetic data, then
enter the local preview queue directly; no live delivery identity is mutated.

```bash
npm run -w web test:vfx
npm run -w web test:effects
npm run -w web test:sfx
npm run test:web
npm run build
npm run -w web test:vfx:infrastructure
```

The new browser smoke starts its own local Vite server, uses installed Edge (or
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`), and writes screenshots plus observations to
`packages/web/test-results/vfx-infrastructure/`. Set `VFX_PREVIEW_URL` to use an
already-running server. It creates no GIF/video or modified artwork. Existing
`test:vfx:visual` and `capture:vfx` tooling remains available.

Focused infrastructure tests cover real PNG dimensions, frame stepping/equal
intervals/final frame, slices, composition order/timing/dedupe/cleanup, replay,
P1/P2 cell/ray geometry, all edges at 1x1/3x3/5x5, ray thickness, resize without
remount/restart, frozen coordinate copies, explicit unit follow, projectiles,
pointer transparency, layer order, reduced motion and preview identity isolation.

Browser checks exercise 24 area cases (two sizes, six anchors, both orientations),
10 ray cases, every generated core asset, all composition modes, all 28 Dora frame
positions, grid/gutter alignment, resize, click-through, reduced motion and expiry.
Visual review used actual headless-browser PNG captures at paused animation times:
Dora center/left crop and composition, Carpet P2 corner crop, Gaster P1 diagonal
and P2 reverse edge, Fireball travel and reduced-motion Dora. Automated frame
checks establish stepping; this review does not claim a human watched a full
real-time animation or a live match. Fireball is deliberately small and contains
mixed authored phases; Phase 11 uses conservative runtime slices described below.

## Phase boundary

Phases 7–11 now integrate generic combat, Kaiser/Vlad, Sans and Asgore. See
[the Phase 11 report](../../../../../docs/phase-11-asgore-pack.md) for authoritative
triggers, conservative Fireball slices, audio ownership and verification.
Deferred: River Person / Boat / Tralala Pack, remaining heroes, persistent status
VFX, and final preload/performance/polish. Normal browser VFX loading remains in
use; the library is not eagerly decoded. Do not automatically start the next phase.

## Completion evidence and file inventory

Final checks performed on 2026-10-07:

| Check                                    | Result                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run -w web test:vfx`                | 50/50 passed                                                                    |
| `npm run -w web test:effects`            | 94/94 passed                                                                    |
| `npm run -w web test:sfx`                | 38/38 passed                                                                    |
| `npm run test:web`                       | 560/560 tests passed; both web suite executions passed                          |
| `npm run build`                          | Rules/server builds, web typecheck and Vite production build passed             |
| ESLint on changed TypeScript/TSX         | Passed with zero warnings                                                       |
| `npm run -w web test:vfx:infrastructure` | Passed, including both projectile orientations and system/manual reduced motion |

The production build retains its large-chunk warning; this phase adds no dependency.
Rules/server test suites were not run because no shared contract changed.

Created:

- `packages/web/src/features/vfx/vfxInfrastructure.test.tsx` ? 18 focused infrastructure tests.
- `packages/web/scripts/vfx-infrastructure-smoke.mjs` ? repeatable real-browser checks and captures.

Modified:

- `packages/web/package.json` ? browser infrastructure test command.
- `packages/web/src/components/Board.tsx` ? isolated debug cues, common layer variables, readable selection/HP layers, synchronized resize.
- `packages/web/src/styles.css` ? independent geometry envelope/frame stepping, ray clipping, projectile travel, board ordering and reduced motion.
- `packages/web/src/features/vfx/vfxTypes.ts` ? semantic geometry, composition inspection and explicit anchor modes.
- `packages/web/src/features/vfx/vfxRegistry.ts` ? nine curated generated definitions, composition, source-frame metadata/crop and layer ownership.
- `packages/web/src/features/vfx/VfxSprite.tsx` ? testable discrete playback and slices.
- `packages/web/src/features/vfx/VfxLayer.tsx` ? shared geometry, synchronized artwork and event/follow anchor distinction.
- `packages/web/src/features/vfx/vfxGeometry.ts` ? full footprint and literal board-edge ray helpers.
- `packages/web/src/features/vfx/vfxEventMapper.ts` ? full logical AoE dimensions for existing mappings.
- `packages/web/src/features/vfx/vfxQueue.ts` ? snapshot coordinate objects and preserve static reduced-motion lifetime.
- `packages/web/src/features/vfx/vfxPreviewScenarios.ts` ? local runtime preview requests and representative core IDs.
- `packages/web/src/pages/VfxPreviewPage.tsx` ? runtime inspector/controls and local cleanup/replay.
- `packages/web/src/game/effects/BoardEffectsLayer.tsx` ? reuse canonical geometry and common layer constants.
- `packages/web/src/features/vfx/VfxLayer.test.tsx` ? explicit status-follow semantics in the existing follow test.
- `packages/web/src/features/vfx/vfxRegistry.test.ts` ? handle optional artwork for procedural definitions.
- `packages/web/src/features/vfx/vfxPreviewScenarios.test.ts` ? coverage accounts for runtime-only previews alongside legacy scenarios.
- `packages/web/src/features/vfx/README.md` ? architecture, asset catalog, playback/geometry contracts, verification and phase boundary.

No gameplay mechanics, rules/server source, source PNGs, manifests, or audio implementation changed.

## Phase 15 final QA

The current-state report is [FINAL_PRESENTATION_QA.md](../../../../../docs/assets/FINAL_PRESENTATION_QA.md), with evidence in [PHASE15_MEASUREMENTS.json](../../../../../docs/assets/PHASE15_MEASUREMENTS.json). Earlier phase sections describe their historical scope.

`presentationPreload` warms five core VFX definitions, then the recipient's projected roster. Heavy composites/rays take high priority in the shared four-job audio/image queue. First sound variants are warmed; additional variants and rare forms remain lazy. `ImagePreloader` deduplicates URLs, calls `decode()`, reports pending/ready/failed state and estimates the **full** raster's RGBA pixels. Core/active-roster references are protected; obsolete roster references are released. The 32 MiB cache budget is soft for pinned assets and does not measure GPU or browser-wide memory.

The preview uses the runtime registry and adds actual light/dark controls, image readiness, queue/voice/cache counters, and responsive board sizing. Visibility disables one-shots while current state and persistent statuses continue to reconcile. Audio timers allow at most 500 ms of dispatch lateness; asset completion never reschedules missed audio or restarts a sprite.

Repeat from the repository root:

```powershell
npm run -w web test:presentation:assets
npm run -w web test:phase15:e2e
npm run -w web test:vfx:infrastructure
# After building with the intended VITE_API_URL and VITE_WS_URL:
npm run -w web test:presentation:production
```

Production smoke checks the built shell and all registered media URLs, including inline PNGs and legacy MPEG files. The preview route remains gated in production. Local browser fixtures do not constitute subjective listening, a complete manual match, physical mobile testing, or OS-level tab suspension testing.
