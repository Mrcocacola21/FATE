import { useEffect } from "react";
import { sfxPlayer } from "../sfx/sfxPlayer";
import { getMusicVolume, loadSoundSettings, subscribeSoundSettings } from "../sfx/SoundControls";
import { MenuMusic } from "./menuMusic";

const MAIN_THEME = new URL("../../assets/music/main-theme.mp3", import.meta.url).href;

let music: MenuMusic | null = null;

/**
 * Plays the main theme on menu screens and fades it out in battle. It follows the shared mute and
 * volume, and starts on the player's first click or key press, as browsers require.
 */
export function MenuMusicPlayer({ wanted }: { wanted: boolean }) {
  useEffect(() => {
    if (typeof Audio === "undefined") return;
    const player = (music = new MenuMusic(MAIN_THEME));
    loadSoundSettings();
    const followSettings = () => player.setLevel(sfxPlayer.isMuted(), getMusicVolume());
    followSettings();
    const unsubscribe = subscribeSoundSettings(followSettings);
    const unlock = () => {
      player.unlock();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const onVisibility = () => player.setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVisibility);
      player.dispose();
      if (music === player) music = null;
    };
  }, []);

  useEffect(() => {
    music?.setWanted(wanted);
  }, [wanted]);

  return null;
}
