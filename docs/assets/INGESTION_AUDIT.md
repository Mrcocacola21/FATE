# Asset ingestion audit

Date: 2026-10-06 (Europe/Kiev). Scope: organization, source validation and availability audit only. No source code, rules, server protocol, registry, rendering or playback changes; no installations; no commit.

## Result

- Sound: 156 WAVs / 117 commissioned concepts; 156 added, 0 duplicates skipped.
- VFX: 155 production PNGs / 121 raster concepts; 154 added, 1 duplicate skipped. Seven JPG review previews were excluded from game-file counts and removed from the repository during cleanup.
- Filename/content conflicts: 0. All old files, including legacy duplicate paths, remain unchanged. Existing aliases are not newly generated duplicates.
- 29 active sound files and 10 curated VFX files preserved. Full vendor tree preserved: 539 PNGs, 30 GIFs, 37 PSDs and accompanying credits/project/readme files.
- Both source ZIP archives were removed from the repository during cleanup after verifying all pack assets against their runtime copies; original SHA-256 values remain below and in the ingestion manifest.

## Verification and limits

- Independently parsed and decoded every pack WAV: 48000 Hz, 24-bit PCM, mono/stereo; durations 0.089–1.605 seconds. No completely silent source or full-scale clipped sample. PCM analysis measured actual duration, peak and RMS; no re-encoding.
- FFprobe + FFmpeg identified and decoded all 29 existing clips, including two MP3 files with .mp3.mpeg suffix. All twelve existing WAVs are 44100 Hz, 16-bit; retain sources without artificial upsampling.
- Independently decoded every generated PNG and verified RGBA, actual transparency, nonempty content, declared sheet dimensions and all frame counts. Frames are 128x128; maximum sheet width 4096. Primary/accent pairs have equal dimensions and counts. No missing interior frame; transparent first/last frames are intentional fade endpoints.
- Viewed overview samples of all 155 sheets (first/middle/last frames). No obvious watermark, embedded label, opaque giant background or corruption observed. This is lightweight procedural stylized art; differing signatures/style alone are not grounds for regeneration.
- Byte-hash duplicate detection covered active assets/public and vendor roots. Only new duplicate: stealth enter/reveal PNGs, both assigned to one canonical strip. Nearly named primary/accent layers and sound variants have different bytes and are preserved.
- No listening audition was performed. Filename/manifest/spec/code evidence determines sonic purpose; PCM/decode checks determine technical validity. Artistic fit, perceived loudness, browser playback, projected-event scheduling and final gameplay readability need later integration review.
- Availability coverage is not gameplay integration coverage. Existing sound registry is empty; these additions deliberately do not register/import assets. Frame timing/direction, geometry composition and authorizations still belong to future rendering work.

## Naming and geometry decisions

- Preserve existing sound root and documented lowerCamelCase; no parallel audio tree. Keep useful 48k/24-bit masters as supplied.
- VFX hero aliases map to canonical IDs: kaiser→grand-kaiser, vlad→vladTepes, genghis→genghisKhan, jack→jackRipper, river→riverPerson, don→donKihote, artemis→artemida, elcid→elCidCompeador. False Trail explosion goes to chikatilo. No invented hero folders.
- Strip frame order and source pixels remain unchanged. Original manifest is preserved verbatim under source-packs; each permanent VFX folder has adapted documentation metadata with canonical filenames.
- Static status atlases/glyphs remain single-frame source textures; existing status pills and blue/orange bone UI provide semantic distinction. Composite atlases are reference source art, not a claim of separately addressable runtime icons.
- Original pack READMEs and CSV/JSON manifests are retained outside src/assets as format, provenance and integration documentation. Their pack-relative paths and generation request names describe the original delivery. One-time generation summaries, QA dumps and preview JPGs were removed from the repository during cleanup; detailed validation remains in this audit and asset_ingestion_manifest.json.

## Hidden-information contract

Use only recipient-projected events and authorized PlayerView. Read rules/view/events.ts and server/ws.ts broadcast projection. Never infer a hidden cell from an event type or draw/sound secret target selection. Stake/snare placement, Hassan selections and Chikatilo mark are OWNER ONLY. Actual revealed trap trigger is PUBLIC AFTER REVEAL. Public visible combat may use PUBLIC assets. Targeting, invalid action, dice-choice prompts and secret HP feedback are LOCAL UI ONLY or OWNER ONLY. No hidden last-known sound, spatial panning, hidden victim count/timing cues or automatic reveal from owning an asset.

## Existing WAV technical mismatches (preserved)

| Path | Rate / depth | Channels | Duration s |
| --- | --- | --- | --- |
| `packages/web/src/assets/sfx/heroes/asgore/basic/attack.wav` | 44100 Hz / 16-bit | 2 | 0.500680 |
| `packages/web/src/assets/sfx/heroes/asgore/basic/died.wav` | 44100 Hz / 16-bit | 2 | 1.714286 |
| `packages/web/src/assets/sfx/heroes/elCidCompeador/basic/attack.wav` | 44100 Hz / 16-bit | 2 | 0.766259 |
| `packages/web/src/assets/sfx/heroes/frisk/basic/died.wav` | 44100 Hz / 16-bit | 1 | 0.710068 |
| `packages/web/src/assets/sfx/heroes/grand-kaiser/abilities/Dora.wav` | 44100 Hz / 16-bit | 2 | 5.000000 |
| `packages/web/src/assets/sfx/heroes/mettaton/basic/died.wav` | 44100 Hz / 16-bit | 2 | 1.714286 |
| `packages/web/src/assets/sfx/heroes/riverPerson/basic/died.wav` | 44100 Hz / 16-bit | 2 | 1.714286 |
| `packages/web/src/assets/sfx/heroes/sans/basic/died.wav` | 44100 Hz / 16-bit | 2 | 1.714286 |
| `packages/web/src/assets/sfx/heroes/undyne/abilities/energy_spear.wav` | 44100 Hz / 16-bit | 2 | 0.500680 |
| `packages/web/src/assets/sfx/heroes/undyne/abilities/throw_spear.wav` | 44100 Hz / 16-bit | 2 | 0.660317 |
| `packages/web/src/assets/sfx/heroes/undyne/basic/attack.wav` | 44100 Hz / 16-bit | 2 | 0.536961 |
| `packages/web/src/assets/sfx/heroes/undyne/basic/died.wav` | 44100 Hz / 16-bit | 2 | 1.714286 |

Longer legacy clips are also preserved: Dismemberment 8.540s, Scolopendra 8.893s, Guide Traveler 7.344s, Storm candidates 12.624s/13.392s. Review duration/use by listening rather than reject a multi-stage signature or ambience candidate from its duration alone.

Dora is a valid 5-second legacy signature; review firing/impact timing by listening before integration. Its duration and legacy format alone do not warrant regeneration. Existing exact duplicate death paths and attack/energy_spear aliases are preserved because deleting established paths could break later manual mappings.

## Original archive checksums

- `FATE_Sound_Pack_48k24_Full.zip`: `e6307c18e30c3717c72de0638f49cae929054b84e4368a9b23fbc0568dc7afbe`
- `FATE_VFX_Pack_v1.zip`: `097025234c084ca8af4547e4df31166fc942b6030ca3e4773e1d8e7ee0d9400a`

Detailed original→canonical mapping and quality values: asset_ingestion_manifest.json. Previous request classifications: SPEC_COMPARISON.md. Current implemented abilities and shared reuse: HERO_COVERAGE.md. The temporary missing-only output reported no missing assets and was removed from the repository during cleanup.

## Ingestion verification

Verified SHA-256 for all 754 pre-existing asset/document files and both source ZIP archives after organization. Verified all 311 pack source mappings, permanent VFX manifest paths/checksums and index links. git status --short shows only intended untracked asset/document additions plus the four pre-existing user inputs; git diff is empty. No commit was made.

## Repository cleanup

On 2026-10-06, all 156 WAV and 155 PNG archive entries were independently compared by SHA-256 with their canonical runtime destinations. The stealth enter/reveal alias accounts for 155 source PNGs mapping to 154 distinct runtime files. All 311 extracted WAV/PNG files also matched preserved assets. Original pack READMEs and manifests matched the retained documentation copies.

After verification, both source ZIPs, `.tmp/asset-ingestion-20261006`, the three root generation/audit request TXT files, `docs/assets/previews`, and the one-time source-pack generation summary and QA reports were moved outside the repository to `C:/codes/FATE-cleanup-20261006/`. Automatic approval review rejected permanent deletion with `blocked by policy`; the move preserves a recovery copy while removing these materials from the worktree.

Historical source paths in the ingestion manifest and inventories remain provenance records, not runtime dependencies. Runtime assets, vendor/source artwork, permanent VFX manifests, coverage documentation and `asset_integration_plan.md` are retained. No Audio/VFX integration or gameplay changes were made.
