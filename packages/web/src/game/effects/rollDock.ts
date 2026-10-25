import { useEffect, useLayoutEffect, useState } from "react";

/**
 * Minimal desktop layout: the board column header is the home of roll indicators, so they never
 * cover the top bar or the zoom controls. The header carries `data-roll-dock`; the slot between the
 * title and the zoom controls carries `data-roll-dock-slot`. Classic and phone layouts have neither.
 */
export const ROLL_DOCK_SELECTOR = "[data-roll-dock]";
export const ROLL_DOCK_SLOT_SELECTOR = "[data-roll-dock-slot]";

export function findRollDockSlot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(ROLL_DOCK_SLOT_SELECTOR);
}

export interface RollDockAnchor {
  /** Bottom edge of the board header: the result plate hangs from here over the board. */
  top: number;
  left: number;
  width: number;
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useRollDockAnchor(enabled: boolean): RollDockAnchor | null {
  const [anchor, setAnchor] = useState<RollDockAnchor | null>(null);
  useIsomorphicLayoutEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const dock = document.querySelector<HTMLElement>(ROLL_DOCK_SELECTOR);
    if (!dock) {
      setAnchor(null);
      return;
    }
    const measure = () => {
      const rect = dock.getBoundingClientRect();
      setAnchor({ top: rect.bottom, left: rect.left, width: rect.width });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [enabled]);
  return enabled ? anchor : null;
}
