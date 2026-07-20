import { useEffect, useState } from "react";

export const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

function readMatch(query: string) {
  return typeof window !== "undefined" && window.matchMedia(query).matches;
}

export function useIsMobile(query = MOBILE_MEDIA_QUERY) {
  const [isMobile, setIsMobile] = useState(() => readMatch(query));

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return isMobile;
}
