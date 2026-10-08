import { useEffect, useState } from "react";
import { sfxPlayer } from "../../features/sfx/sfxPlayer";

export function presentationIsVisible(): boolean {
  return typeof document === "undefined" || !document.hidden;
}
/** Hidden deliveries still update authoritative state; one-shots are consumed silently. */
export function usePresentationVisibility(): boolean {
  const [visible, setVisible] = useState(presentationIsVisible);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => {
      if (!presentationIsVisible()) sfxPlayer.stopGameplay();
      setVisible(presentationIsVisible());
    };
    document.addEventListener("visibilitychange", update);
    update();
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}
