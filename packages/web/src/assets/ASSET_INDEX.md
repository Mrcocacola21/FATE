# FATE Asset Index

Organized 2026-10-06. Integration through Phase 15 is audited in [FINAL_PRESENTATION_QA.md](../../../../docs/assets/FINAL_PRESENTATION_QA.md), with current counts and measurements in [PHASE15_MEASUREMENTS.json](../../../../docs/assets/PHASE15_MEASUREMENTS.json). Historical phase documents describe their original scope; preserved files are not necessarily registered, fetched, or decoded.

Audio retains the existing `sfx/common/<category>` and `sfx/heroes/<exactHeroId>/<category>` convention and lowerCamelCase names. VFX uses exact hero IDs and lowercase snake_case filenames. Existing paths and source quality are preserved.

Each VFX folder includes a documentation manifest with frame sizes, count, timing, geometry, phases and visibility. Strips play left to right. Primary/accent pairs stay together and use matching frame counts.

Visibility: **OWNER ONLY**, **PUBLIC AFTER REVEAL**, **PUBLIC**, **LOCAL UI ONLY**. PUBLIC always means recipient-authorized payload and positions; a redacted event type alone grants no permission.

Source archives, temporary extraction files, generation requests and review previews were removed from the repository after SHA-256 verification of every pack asset against its organized runtime copy. Retained metadata and coverage documentation are in `docs/assets/`. See [audit](../../../../docs/assets/INGESTION_AUDIT.md), [ability coverage](../../../../docs/assets/HERO_COVERAGE.md), and [spec comparison](../../../../docs/assets/SPEC_COMPARISON.md).

## Audio

The six semantic core keys and seventeen WAV variants are documented in
[Core Audio Infrastructure](../../../../docs/assets/CORE_AUDIO.md). UI preparation
starts after interaction; match preparation starts when the board mounts. Hero
audio and movement audio are not registered yet.

## VFX

### Shared VFX aliases

- `VFX_STEALTH_ENTER` and `VFX_STEALTH_REVEAL` both use `vfx/status/stealth_enter.png`; supplied PNG bytes are identical. Their visibility and event conditions remain separate entries in the manifest.

## Preserved existing audio

- [sfx/heroes/asgore/basic/attack.wav](sfx/heroes/asgore/basic/attack.wav) — Legacy asgore basic attack.wav; original path and bytes preserved.
- [sfx/heroes/asgore/basic/died.wav](sfx/heroes/asgore/basic/died.wav) — Legacy asgore basic died.wav; original path and bytes preserved.
- [sfx/heroes/chikatilo/abilities/decoy.mp3](sfx/heroes/chikatilo/abilities/decoy.mp3) — Legacy chikatilo abilities decoy.mp3; original path and bytes preserved.
- [sfx/heroes/chikatilo/abilities/KillerMark.mp3](sfx/heroes/chikatilo/abilities/KillerMark.mp3) — Legacy chikatilo abilities KillerMark.mp3; original path and bytes preserved.
- [sfx/heroes/chikatilo/phantasms/FalseTrailExplosion.mp3](sfx/heroes/chikatilo/phantasms/FalseTrailExplosion.mp3) — Legacy chikatilo phantasms FalseTrailExplosion.mp3; original path and bytes preserved.
- [sfx/heroes/elCidCompeador/basic/attack.wav](sfx/heroes/elCidCompeador/basic/attack.wav) — Legacy elCidCompeador basic attack.wav; original path and bytes preserved.
- [sfx/heroes/frisk/abilities/PowerOfFriendship.mp3](sfx/heroes/frisk/abilities/PowerOfFriendship.mp3) — Legacy frisk abilities PowerOfFriendship.mp3; original path and bytes preserved.
- [sfx/heroes/frisk/basic/died.wav](sfx/heroes/frisk/basic/died.wav) — Legacy frisk basic died.wav; original path and bytes preserved.
- [sfx/heroes/grand-kaiser/abilities/Dora.wav](sfx/heroes/grand-kaiser/abilities/Dora.wav) — Legacy grand-kaiser abilities Dora.wav; original path and bytes preserved.
- [sfx/heroes/grand-kaiser/basic/attack.mp3](sfx/heroes/grand-kaiser/basic/attack.mp3) — Legacy grand-kaiser basic attack.mp3; original path and bytes preserved.
- [sfx/heroes/grand-kaiser/transformations/EngineeringMiracle.mp3](sfx/heroes/grand-kaiser/transformations/EngineeringMiracle.mp3) — Legacy grand-kaiser transformations EngineeringMiracle.mp3; original path and bytes preserved.
- [sfx/heroes/hassan/abilities/TrueEnemy.mp3](sfx/heroes/hassan/abilities/TrueEnemy.mp3) — Legacy hassan abilities TrueEnemy.mp3; original path and bytes preserved.
- [sfx/heroes/jackRipper/phantasms/HolyMotherOfSlaughter.mp3](sfx/heroes/jackRipper/phantasms/HolyMotherOfSlaughter.mp3) — Legacy jackRipper phantasms HolyMotherOfSlaughter.mp3; original path and bytes preserved.
- [sfx/heroes/kaneki/basic/deployed.mp3](sfx/heroes/kaneki/basic/deployed.mp3) — Legacy kaneki basic deployed.mp3; original path and bytes preserved.
- [sfx/heroes/kaneki/transformations/Scolopendra.mp3](sfx/heroes/kaneki/transformations/Scolopendra.mp3) — Legacy kaneki transformations Scolopendra.mp3; original path and bytes preserved.
- [sfx/heroes/lechy/abilities/ConfuseTerrain.mp3.mpeg](sfx/heroes/lechy/abilities/ConfuseTerrain.mp3.mpeg) — Legacy lechy abilities ConfuseTerrain.mp3.mpeg; original path and bytes preserved.
- [sfx/heroes/lechy/abilities/GuideTraveler.mp3.mpeg](sfx/heroes/lechy/abilities/GuideTraveler.mp3.mpeg) — Legacy lechy abilities GuideTraveler.mp3.mpeg; original path and bytes preserved.
- [sfx/heroes/lechy/phantasms/StormSound1.mp3](sfx/heroes/lechy/phantasms/StormSound1.mp3) — Legacy lechy phantasms StormSound1.mp3; original path and bytes preserved.
- [sfx/heroes/lechy/phantasms/StormSound2.mp3](sfx/heroes/lechy/phantasms/StormSound2.mp3) — Legacy lechy phantasms StormSound2.mp3; original path and bytes preserved.
- [sfx/heroes/loki/abilities/mindcontrol.mp3](sfx/heroes/loki/abilities/mindcontrol.mp3) — Legacy loki abilities mindcontrol.mp3; original path and bytes preserved.
- [sfx/heroes/luche/basic/attack.mp3](sfx/heroes/luche/basic/attack.mp3) — Legacy luche basic attack.mp3; original path and bytes preserved.
- [sfx/heroes/mettaton/basic/died.wav](sfx/heroes/mettaton/basic/died.wav) — Legacy mettaton basic died.wav; original path and bytes preserved.
- [sfx/heroes/riverPerson/basic/died.wav](sfx/heroes/riverPerson/basic/died.wav) — Legacy riverPerson basic died.wav; original path and bytes preserved.
- [sfx/heroes/sans/basic/died.wav](sfx/heroes/sans/basic/died.wav) — Legacy sans basic died.wav; original path and bytes preserved.
- [sfx/heroes/undyne/abilities/energy_spear.wav](sfx/heroes/undyne/abilities/energy_spear.wav) — Legacy undyne abilities energy spear.wav; original path and bytes preserved.
- [sfx/heroes/undyne/abilities/throw_spear.wav](sfx/heroes/undyne/abilities/throw_spear.wav) — Legacy undyne abilities throw spear.wav; original path and bytes preserved.
- [sfx/heroes/undyne/basic/attack.wav](sfx/heroes/undyne/basic/attack.wav) — Legacy undyne basic attack.wav; original path and bytes preserved.
- [sfx/heroes/undyne/basic/died.wav](sfx/heroes/undyne/basic/died.wav) — Legacy undyne basic died.wav; original path and bytes preserved.
- [sfx/heroes/vladTepes/basic/attack.mp3](sfx/heroes/vladTepes/basic/attack.mp3) — Legacy vladTepes basic attack.mp3; original path and bytes preserved.

## Preserved existing VFX

- [vfx/curated/kenney-particle-pack/fire-burst.png](vfx/curated/kenney-particle-pack/fire-burst.png) — Shared fire burst / snare explosion / AoE fallback.
- [vfx/curated/kenney-particle-pack/muzzle-flash.png](vfx/curated/kenney-particle-pack/muzzle-flash.png) — Shared muzzle flash.
- [vfx/curated/kenney-particle-pack/reveal-star.png](vfx/curated/kenney-particle-pack/reveal-star.png) — Search and reveal accent.
- [vfx/curated/kenney-particle-pack/ricochet-trace.png](vfx/curated/kenney-particle-pack/ricochet-trace.png) — Ricochet and path trace.
- [vfx/curated/kenney-particle-pack/smoke-puff.png](vfx/curated/kenney-particle-pack/smoke-puff.png) — Smoke, stealth and reveal fallback.
- [vfx/curated/kenney-particle-pack/storm-bolt.png](vfx/curated/kenney-particle-pack/storm-bolt.png) — Storm lightning accent.
- [vfx/curated/pipoya-hex-shield/hex-shield-strip.png](vfx/curated/pipoya-hex-shield/hex-shield-strip.png) — Animated shield / bunker fallback.
- [vfx/curated/pipoya-mysterious-object/mystic-mark-strip.png](vfx/curated/pipoya-mysterious-object/mystic-mark-strip.png) — Animated mark / Soul Parade fallback.
- [vfx/curated/pipoya-warp-portal/portal-green-strip.png](vfx/curated/pipoya-warp-portal/portal-green-strip.png) — Portal animation source.
- [vfx/curated/pipoya-warp-portal/portal-red-strip.png](vfx/curated/pipoya-warp-portal/portal-red-strip.png) — Portal animation source.

Vendor source art remains at `packages/web/assets/vfx/vendor/` with [original credits](../../assets/vfx/VFX_CREDITS.md). It contains 539 PNGs, 30 GIFs and 37 PSD authoring files; none was moved or duplicated. CSS/DOM/SVG targeting, reaction prompts, HP labels, status pills, death animation and game results remain existing code presentations; no extra bitmap is commissioned for these.
