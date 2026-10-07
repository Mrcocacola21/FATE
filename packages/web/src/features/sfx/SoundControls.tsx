import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { sfxPlayer } from "./sfxPlayer";
import { prepareAudioFromGesture } from "./uiSfx";

const STORAGE_KEY = "fate.sfx";
const settingsChanged = new Set<() => void>();
let loaded = false;

export function loadSoundSettings(): void {
  if (loaded) return;
  try {
    if (typeof localStorage === "undefined") return;
    loaded = true;
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof value?.muted === "boolean") sfxPlayer.setMuted(value.muted);
    if (typeof value?.volume === "number" && Number.isFinite(value.volume))
      sfxPlayer.setVolume(value.volume);
  } catch {
    loaded = true;
    /* Storage may be disabled or corrupt. */
  }
}

function save(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ muted: sfxPlayer.isMuted(), volume: sfxPlayer.getVolume() }),
    );
  } catch {
    /* Sound settings still work without storage. */
  }
  for (const notify of settingsChanged) notify();
}

/** Small control shared by existing shell settings and the in-match toolbar. */
export function SoundControls() {
  const { t } = useI18n();
  const [, update] = useState(0);
  useEffect(() => {
    loadSoundSettings();
    update((value) => value + 1);
    const notify = () => update((value) => value + 1);
    settingsChanged.add(notify);
    return () => {
      settingsChanged.delete(notify);
    };
  }, []);
  return (
    <div className="inline-flex items-center gap-2" data-testid="sound-controls">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-label={t("audio.mute")}
        aria-pressed={sfxPlayer.isMuted()}
        onClick={() => {
          prepareAudioFromGesture();
          sfxPlayer.setMuted(!sfxPlayer.isMuted());
          save();
        }}
      >
        {t(sfxPlayer.isMuted() ? "audio.muted" : "audio.sound")}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        className="w-20 accent-amber-500"
        aria-label={t("audio.volume")}
        value={sfxPlayer.getVolume()}
        onChange={(event) => {
          prepareAudioFromGesture();
          sfxPlayer.setVolume(Number(event.target.value));
          save();
        }}
      />
    </div>
  );
}
