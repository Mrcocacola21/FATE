import { SOUND_REGISTRY, type SoundCategory, type SoundKey } from "../../assets/sfx/registry";
import { sfxPlayer, type SfxPlayer } from "./sfxPlayer";

/** Only the explicit core registry; never glob the hero library. */
export function preloadCoreSounds(
  category: SoundCategory,
  player: SfxPlayer = sfxPlayer,
): Promise<void> {
  const keys = (Object.keys(SOUND_REGISTRY) as SoundKey[]).filter(
    (key) => SOUND_REGISTRY[key].category === category && SOUND_REGISTRY[key].preload === "core",
  );
  return Promise.all(keys.map((key) => player.preload(key))).then(() => undefined);
}

/** Small Sans pack, warmed only when projected Sans/curse state needs it.
 * Playback never waits for decoding or replays a cue that missed its deadline. */
export function preloadSansSounds(player: Pick<SfxPlayer, "preload"> = sfxPlayer): Promise<void> {
  const keys = (Object.keys(SOUND_REGISTRY) as SoundKey[]).filter((key) =>
    key.startsWith("hero.sans."),
  );
  return Promise.all(keys.map((key) => player.preload(key))).then(() => undefined);
}
