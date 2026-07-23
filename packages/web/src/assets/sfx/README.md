# Hero SFX

SFX live under `common/<ui|combat|movement|status>/` or
`heroes/<heroId>/<basic|abilities|phantasms|transformations|statuses>/`.
Every hero directory uses the exact rules ID (for example `grand-kaiser` and
`elCidCompeador`, not display-name variants).

Use lower camel case for file names and registry keys. Ability and phantasm
files should normally use their exact rules ability ID:

```text
heroes/loki/phantasms/lokiLaught.mp3
heroes/jackRipper/abilities/jackRipperSnares.mp3
heroes/papyrus/statuses/orangeBone.mp3
heroes/grand-kaiser/abilities/kaiserDora.mp3
heroes/grand-kaiser/transformations/transform.mp3
```

Prefer `.mp3` for longer/compressed audio, keep `.ogg` when it is already the
source format, and use `.wav` only for small impacts where its size is
acceptable. Do not convert audio just to change its extension.

To add a sound:

1. Put the file in the matching hero/category directory.
2. Explicitly import it in `registry.ts`; never import a path that does not exist.
3. Add it to `heroSfx` under the exact hero ID and event/ability key.
4. For a shared fallback, register the same key in `commonSfx`.

`getHeroSfx(heroId, category, key)` first checks the hero entry, then the
matching common category. Event mapping can additionally use generic common
keys such as `ability`, `phantasm`, `transform`, or `applied`. If nothing is
registered, it returns `undefined` and playback silently skips the sound.
