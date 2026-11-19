import { useLayoutEffect, type RefObject } from "react";
import { dissolveBlock, gatherBlock, type RuneTone } from "./runeMagic";
import { dissolvePage, gatherPage, snapshotPage, veiled } from "./pageRunes";

/**
 * Blocks that come and go in runes: when the element mounts, its blocks (the element itself, or
 * those inside it matching `selector`) gather out of runes; when it unmounts, they come apart
 * into runes where they stood.
 */
export function useRuneBlock(
  ref: RefObject<HTMLElement | null>,
  {
    selector,
    gather = true,
    dissolve = true,
    tone = "violet",
    when,
  }: {
    selector?: string;
    gather?: boolean;
    dissolve?: boolean;
    tone?: RuneTone;
    /** Come apart only when this holds as the element leaves (for example: entering a match). */
    when?: () => boolean;
  } = {},
) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const blocks = (): Element[] =>
      selector ? Array.from(root.querySelectorAll(selector)) : [root];
    if (gather) blocks().forEach((block, index) => gatherBlock(block, { delay: index * 90, tone }));
    return () => {
      if (!dissolve || (when && !when())) return;
      // The copies are made now, while the blocks are still on the page; React's development
      // check unmounts without removing anything, and then nothing comes apart.
      const leaving = blocks();
      const rects = leaving.map((block) => block.getBoundingClientRect());
      queueMicrotask(() => {
        if (root.isConnected) return;
        leaving.forEach((block, index) => {
          if (rects[index].width) dissolveBlock(block, tone, rects[index]);
        });
      });
    };
    // Mount and unmount only: the blocks of one screen come and go with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * A whole page that is written out of runes when it appears and comes apart into them when it
 * goes; the runes it leaves behind are taken by the next page.
 */
export function useRunePage(
  ref: RefObject<HTMLElement | null>,
  { tone = "violet" as RuneTone } = {},
) {
  useLayoutEffect(() => {
    const page = ref.current;
    if (!page) return;
    gatherPage(page, { tone });
    return () => {
      if (veiled()) return;
      const snapshot = snapshotPage(page);
      queueMicrotask(() => {
        if (!page.isConnected) dissolvePage(snapshot, tone);
      });
    };
    // Mount and unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
