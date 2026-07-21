import { useEffect, useState } from "react";

export const MOBILE_BREAKPOINT = 768;
export const DESKTOP_BREAKPOINT = 1024;
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

export type ViewportLayout = "mobile" | "tablet" | "desktop";

export function getViewportLayout(width: number): ViewportLayout {
  if (width < MOBILE_BREAKPOINT) return "mobile";
  if (width < DESKTOP_BREAKPOINT) return "tablet";
  return "desktop";
}

export function isMobileViewport(width: number, breakpoint = MOBILE_BREAKPOINT) {
  return width < breakpoint;
}

function readIsMobile(breakpoint: number) {
  return typeof window !== "undefined" && isMobileViewport(window.innerWidth, breakpoint);
}

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(() => readIsMobile(breakpoint));

  useEffect(() => {
    if (typeof window === "undefined") return;

    const query =
      breakpoint === MOBILE_BREAKPOINT ? MOBILE_MEDIA_QUERY : `(max-width: ${breakpoint - 1}px)`;
    const media = typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
    const update = () => setIsMobile(readIsMobile(breakpoint));

    update();
    window.addEventListener("resize", update);

    if (media?.addEventListener) {
      media.addEventListener("change", update);
    } else {
      media?.addListener?.(update);
    }

    return () => {
      window.removeEventListener("resize", update);
      if (media?.removeEventListener) {
        media.removeEventListener("change", update);
      } else {
        media?.removeListener?.(update);
      }
    };
  }, [breakpoint]);

  return isMobile;
}
