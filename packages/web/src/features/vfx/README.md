# VFX Preview

Open `/vfx-preview` in local Vite development, or with `VITE_ENABLE_TEST_ROOM=true`.
The page renders the normal board and triggers VFX through the same event mapper,
queue, and `VfxLayer` used by live matches.

Run visual capture from the repo root:

```bash
npm run -w web test:vfx:visual
npm run -w web capture:vfx
```

Artifacts are written to `packages/web/test-results/vfx-visual/`.
`test:vfx:visual` captures PNG screenshots. `capture:vfx` also records WebM videos
and creates GIFs when `ffmpeg` is available.

Previewed effects:

- Search reveal and hidden reveal
- Chikatilo mark
- Lechy Storm
- Asgore Soul Parade and Fire Parade
- Guts Berserk AoE and muzzle flash
- Griffith/Femto and Mettaton transformations
- Loki chicken smoke
- River Person Boat and Tra-la-la transport
- Grozny phantasm portal and trace
- HEX shield

Skipped target-specific gameplay VFX remain skipped when projected events do not
carry safe public coordinates. The preview uses synthetic projected data only and
does not mutate gameplay state.
