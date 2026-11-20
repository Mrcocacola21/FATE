import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { sfxPlayer } from "./sfxPlayer";
import { prepareAudioFromGesture } from "./uiSfx";

const STORAGE_KEY = "fate.sfx";
const settingsChanged = new Set<() => void>();
let loaded = false;
/** Music has its own level; effects use the sound player's volume. Mute silences both. */
let musicVolume = 0.8;

export function getMusicVolume(): number {
  return musicVolume;
}

function clampLevel(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

export function loadSoundSettings(): void {
  if (loaded) return;
  try {
    if (typeof localStorage === "undefined") return;
    loaded = true;
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof value?.muted === "boolean") sfxPlayer.setMuted(value.muted);
    if (typeof value?.volume === "number" && Number.isFinite(value.volume))
      sfxPlayer.setVolume(value.volume);
    if (typeof value?.musicVolume === "number" && Number.isFinite(value.musicVolume))
      musicVolume = clampLevel(value.musicVolume);
  } catch {
    loaded = true;
    /* Storage may be disabled or corrupt. */
  }
}

/** Notifies when the player changes mute or volume, so other audio (music) can follow. */
export function subscribeSoundSettings(listener: () => void): () => void {
  settingsChanged.add(listener);
  return () => {
    settingsChanged.delete(listener);
  };
}

function save(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        muted: sfxPlayer.isMuted(),
        volume: sfxPlayer.getVolume(),
        musicVolume,
      }),
    );
  } catch {
    /* Sound settings still work without storage. */
  }
  for (const notify of settingsChanged) notify();
}

/** Mute plus separate music and effects levels, in the settings drawer shared by shell and match. */
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
  const slider = (id: string, label: string, value: number, onChange: (value: number) => void) => (
    <label className="sound-level" htmlFor={id}>
      <span className="sound-level__name">{label}</span>
      <input
        id={id}
        type="range"
        min="0"
        max="1"
        step="0.05"
        className="sound-level__range accent-amber-500"
        value={value}
        disabled={sfxPlayer.isMuted()}
        onChange={(event) => {
          prepareAudioFromGesture();
          onChange(Number(event.target.value));
          save();
        }}
      />
      <span className="sound-level__value" aria-hidden="true">
        {Math.round(value * 100)}%
      </span>
    </label>
  );
  return (
    <div className="sound-controls" data-testid="sound-controls">
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
      {slider("sound-music-volume", t("audio.music"), musicVolume, (value) => {
        musicVolume = clampLevel(value);
      })}
      {slider("sound-effects-volume", t("audio.effects"), sfxPlayer.getVolume(), (value) =>
        sfxPlayer.setVolume(value),
      )}
    </div>
  );
}
