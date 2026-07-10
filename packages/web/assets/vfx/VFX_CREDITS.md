# FATE VFX Credits

Raw vendor archives were found at the repository root and extracted into `packages/web/assets/vfx/vendor/`.
Runtime code must import only curated files from `packages/web/src/assets/vfx/curated/`.

## Pipoya VFX WarpPortal

- Source folder: `packages/web/assets/vfx/vendor/pipoya-warp-portal/`
- License/usage notes: no separate README/LICENSE file was included in the archive.
- Used:
  - `192x192/pipo-gate01a192.png` -> `curated/pipoya-warp-portal/portal-red-strip.png`
  - `192x192/pipo-gate01c192.png` -> `curated/pipoya-warp-portal/portal-green-strip.png`
- Runtime mappings: Griffith/Femto transformation, Grozny phantasm movement, River Person Boat and Tra-la-la portal cues.
- Ignored: 480x480 sheets because they are multi-megabyte runtime assets; unused color variants because they did not add clear board readability.

## Kenney Particle Pack

- Source folder: `packages/web/assets/vfx/vendor/kenney-particle-pack/`
- License/usage notes: `License.txt` included, Creative Commons Zero (CC0).
- Used:
  - `PNG (Transparent)/fire_01.png` -> `curated/kenney-particle-pack/fire-burst.png`
  - `PNG (Transparent)/smoke_03.png` -> `curated/kenney-particle-pack/smoke-puff.png`
  - `PNG (Transparent)/magic_04.png` -> `curated/kenney-particle-pack/reveal-star.png`
  - `PNG (Transparent)/muzzle_03.png` -> `curated/kenney-particle-pack/muzzle-flash.png`
  - `PNG (Transparent)/spark_06.png` -> `curated/kenney-particle-pack/storm-bolt.png`
  - `PNG (Transparent)/trace_03.png` -> `curated/kenney-particle-pack/ricochet-trace.png`
- Runtime mappings: Fire Parade, Guts Berserk AoE, hidden reveal/Search, Guts ranged source flash, Lechy Storm, Grozny phantasm line trace.
- Ignored: black-background variants and duplicate particles; the transparent set is enough for board overlays.

## Particle Textures

- Source folder: `packages/web/assets/vfx/vendor/particle-textures/`
- License/usage notes: no separate README/LICENSE file was included in the archive.
- Used: none.
- Ignored: all files are 2048x2048 opaque textures; using them directly would add large runtime imports and would require blending/processing that is not needed for this pass.

## PIPOYA FREE VFX Mysterious Object

- Source folder: `packages/web/assets/vfx/vendor/pipoya-mysterious-object/`
- License/usage notes: no separate README/LICENSE file was included in the archive.
- Used:
  - `192x192/pipo-mapeffect021_192.png` -> `curated/pipoya-mysterious-object/mystic-mark-strip.png`
- Runtime mappings: Chikatilo mark and Asgore Soul Parade.
- Ignored: 480x480 sheets and object variants that did not clearly improve the current ability reads.

## Pipoya VFX HEXShield

- Source folder: `packages/web/assets/vfx/vendor/pipoya-hex-shield/`
- License/usage notes: no separate README/LICENSE file was included in the archive.
- Used:
  - `192x192/pipo-btleffect206_192.png` -> `curated/pipoya-hex-shield/hex-shield-strip.png`
- Runtime mappings: bunker entry and resolved defensive shield moments.
- Ignored: 480x480 sheets and alternate shield variants to keep runtime imports small.

## Intentionally skipped mappings

- Jebe Khan's Shooter ricochet: skipped because the currently projected resolution events do not safely identify the full ricochet chain without rules/server payload changes.
- Genghis Khan diagonal movement: skipped for final VFX because generic movement events do not carry a reliable public ability identity across all batches.
- Guts Crossbow/Cannon target impacts: limited to source muzzle VFX because the current public event stream does not safely identify a target-specific ability impact path.
- Target-specific hidden/private effects: skipped whenever the projected event or `PlayerView` does not expose a safe visible coordinate.
