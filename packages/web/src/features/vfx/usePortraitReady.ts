import { useEffect, useState } from "react";
import { imagePreloader } from "./imagePreload";

/** Optional VFX must never precede the portrait they introduce. No phase restart. */
export function usePortraitReady(src: string | undefined): boolean {
  const ready = !src || typeof Image === "undefined" || imagePreloader.status(src) === "ready";
  const [decoded, setDecoded] = useState({ src, ready });
  useEffect(() => {
    if (!src) return;
    let current = true;
    void imagePreloader.load(src, "unit portrait", "high").then(image => {
      if (current) setDecoded({ src, ready: Boolean(image) });
    });
    return () => { current = false; };
  }, [src]);
  return ready || (decoded.src === src && decoded.ready);
}
