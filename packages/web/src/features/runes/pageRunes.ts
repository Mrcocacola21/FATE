import { budget, flicker, glyph, layer, reduced, type RuneTone } from "./runeMagic";

/*
 * A whole page turning into runes and back. Leaving, letters of the page become runes where they
 * stood, in a sweep across the page, and the runes rise and hang over the window. The next page
 * takes those same runes: they fly onto its letters and the page is written out of them. Runes
 * nobody takes fade away.
 *
 * Kept light for weak machines: the letters are measured on the live page (already laid out) and
 * only those that become runes; one timer flickers every rune; nothing is blurred.
 */

interface Letter {
  x: number;
  y: number;
  size: number;
}
/** A page as it was a moment before it changed: a copy of it, where it stood and its letters. */
export interface PageSnapshot {
  copy: HTMLElement;
  rect: DOMRect;
  letters: Letter[];
}

const MAX_LETTERS = budget(240);
/** How long the runes of a page that left hang in the air, waiting for the next page. */
const HOVER_MS = 1700;
/** How long they wait at most while a match is being entered behind the veil. */
const HOLD_MS = 5000;

// The veil: a plain dark page under the runes while the next screen is being made, so nothing
// in between (a found match, a loading room) shows. The next page lifts it as it gathers.
let veilElement: HTMLElement | null = null;
let veilTimer: ReturnType<typeof setTimeout> | null = null;
export const veiled = () => !!veilElement?.isConnected;
export function raiseVeil(): void {
  if (reduced() || veiled()) return;
  veilElement = document.createElement("div");
  veilElement.className = "rune-veil";
  veilElement.setAttribute("aria-hidden", "true");
  document.body.append(veilElement);
  veilElement.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: "ease-out" });
  veilTimer = setTimeout(lowerVeil, HOLD_MS + 1500);
}
export function lowerVeil(): void {
  const element = veilElement;
  veilElement = null;
  if (veilTimer) clearTimeout(veilTimer);
  veilTimer = null;
  if (!element) return;
  element
    .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, delay: 250, fill: "forwards" })
    .finished.then(
      () => element.remove(),
      () => element.remove(),
    );
}

interface Floating {
  rune: HTMLElement;
  stop: () => void;
  drift: Letter;
  hover: Animation;
}
let pool: Floating[] = [];
let poolTimer: ReturnType<typeof setTimeout> | null = null;

/** Letters of an element on screen, evenly spread, at most `max`; only those are measured. */
function letters(element: Element, max = MAX_LETTERS): Letter[] {
  const nodes: Text[] = [];
  let total = 0;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const length = node.nodeValue?.length ?? 0;
    if (length && node.nodeValue!.trim() && node.parentElement) {
      nodes.push(node);
      total += length;
    }
  }
  // Every `stride`-th character is measured; spaces and letters off screen are skipped.
  const stride = Math.max(1, total / (max * 1.3));
  const found: Letter[] = [];
  const range = document.createRange();
  const height = window.innerHeight;
  let next = Math.random() * stride;
  let offset = 0;
  for (const node of nodes) {
    const text = node.nodeValue!;
    let size = 0;
    while (next < offset + text.length && found.length < max) {
      const i = Math.floor(next - offset);
      next += stride;
      if (!text[i]?.trim()) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (!rect.width || rect.bottom < 0 || rect.top > height) continue;
      size ||= Math.min(
        36,
        Math.max(11, parseFloat(getComputedStyle(node.parentElement!).fontSize) || 16),
      );
      found.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size });
    }
    offset += text.length;
    if (found.length >= max) break;
  }
  return found;
}

const place = (x: number, y: number) => `translate(${x}px, ${y}px) translate(-50%, -50%)`;

function rune(tone: RuneTone, size: number): HTMLElement {
  const element = document.createElement("span");
  element.className = `rune-glyph rune-glyph--${tone}`;
  element.textContent = glyph();
  element.style.fontSize = `${size}px`;
  layer().append(element);
  return element;
}

/** Copies a page now, before it changes or is taken away, so it can come apart afterwards. */
export function snapshotPage(element: Element | null | undefined): PageSnapshot | null {
  if (!element || reduced() || !(element instanceof HTMLElement)) return null;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  copy.removeAttribute("id");
  copy.querySelectorAll("[data-testid]").forEach((node) => node.removeAttribute("data-testid"));
  copy.removeAttribute("data-testid");
  copy.setAttribute("inert", "");
  copy.classList.add("rune-ghost");
  return { copy, rect, letters: letters(element) };
}

/** Runes nobody took fade away. */
function releasePool() {
  poolTimer = null;
  const leaving = pool;
  pool = [];
  for (const { rune: element, stop, drift } of leaving) {
    stop();
    element
      .animate([{ opacity: 0.85 }, { opacity: 0, transform: place(drift.x, drift.y - 30) }], {
        duration: 450,
        fill: "forwards",
      })
      .finished.then(
        () => element.remove(),
        () => element.remove(),
      );
  }
}

/** The page of a snapshot comes apart: its letters turn into runes, which rise and hang. */
export function dissolvePage(
  snapshot: PageSnapshot | null,
  tone: RuneTone = "violet",
  /** The runes wait longer for the next page: it is still being made (a match being entered). */
  { hold = false } = {},
): void {
  if (!snapshot || reduced()) return;
  const span = hold ? HOLD_MS : HOVER_MS;
  const { copy, rect } = snapshot;
  copy.classList.add("rune-ghost");
  Object.assign(copy.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    overflow: "hidden",
    contain: "strict",
  });
  layer().append(copy);
  // The page fades as its letters turn: the sweep crosses it in the same time.
  copy
    .animate([{ opacity: 1 }, { opacity: 0.5, offset: 0.35 }, { opacity: 0 }], {
      duration: 560,
      easing: "ease-in",
      fill: "forwards",
    })
    .finished.then(
      () => copy.remove(),
      () => copy.remove(),
    );
  const width = Math.max(1, window.innerWidth);
  for (const letter of snapshot.letters) {
    const element = rune(Math.random() < 0.18 ? "gold" : tone, letter.size * 1.1);
    const lift = {
      x: letter.x + (Math.random() - 0.5) * 120,
      y: letter.y - 40 - Math.random() * 110,
    };
    const drift = {
      x: lift.x + (Math.random() - 0.5) * 60,
      y: lift.y - 20 - Math.random() * 40,
      size: letter.size,
    };
    const hover = element.animate(
      [
        { transform: `${place(letter.x, letter.y)} scale(0.7)`, opacity: 0 },
        { transform: `${place(letter.x, letter.y)} scale(1.15)`, opacity: 1, offset: 240 / span },
        { transform: `${place(lift.x, lift.y)} rotate(25deg)`, opacity: 0.95, offset: 765 / span },
        { transform: `${place(drift.x, drift.y)} rotate(-15deg)`, opacity: 0.85 },
      ],
      {
        duration: span,
        delay: ((letter.x - rect.left) / width) * 380 + Math.random() * 80,
        easing: "ease-out",
        fill: "both",
      },
    );
    pool.push({ rune: element, stop: flicker(element), drift, hover });
  }
  if (poolTimer) clearTimeout(poolTimer);
  poolTimer = setTimeout(releasePool, span + 400);
}

const gathering = new WeakMap<Element, number>();
/**
 * A page is written out of runes: those still hanging from the page before fly onto its letters
 * (new ones come in from the edges of the window when there are not enough), and the page shows
 * through as they land.
 */
export function gatherPage(
  element: Element | null | undefined,
  { tone = "violet" as RuneTone } = {},
): void {
  if (!element || reduced() || !(element instanceof HTMLElement)) return;
  // React's development check mounts twice; the page is written once.
  const last = gathering.get(element);
  if (last && performance.now() - last < 800) return;
  gathering.set(element, performance.now());
  element.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], {
    duration: 1250,
    easing: "ease-out",
  });
  // A page that has just come apart hands over its runes in a moment, once it has been copied.
  queueMicrotask(() => {
    if (!element.isConnected) return;
    // After the page before has come apart (it may raise the veil in this same moment).
    lowerVeil();
    const targets = letters(element);
    const width = Math.max(1, window.innerWidth);
    // Where every taken rune is now is read in one go, before any of them is moved.
    const taken = pool.splice(0, targets.length);
    const starts = taken.map(({ rune: item }) => {
      const box = item.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    taken.forEach(({ stop }) => stop());
    // The rest of the pool, if any, is released as usual by its timer.
    targets.forEach((letter, index) => {
      const reused = taken[index];
      let item: HTMLElement;
      let from: { x: number; y: number };
      if (reused) {
        item = reused.rune;
        from = starts[index];
        reused.hover.cancel();
      } else {
        const angle = Math.random() * Math.PI * 2;
        const reach = Math.max(window.innerWidth, window.innerHeight) * 0.6;
        from = {
          x: window.innerWidth / 2 + Math.cos(angle) * reach,
          y: window.innerHeight / 2 + Math.sin(angle) * reach,
        };
        item = rune(index % 6 === 0 ? "gold" : tone, letter.size * 1.1);
      }
      item.style.fontSize = `${letter.size * 1.1}px`;
      const stop = flicker(item);
      const bend = {
        x: (from.x + letter.x) / 2 + (Math.random() - 0.5) * 160,
        y: (from.y + letter.y) / 2 - 40 - Math.random() * 90,
      };
      const done = () => {
        stop();
        item.remove();
      };
      item
        .animate(
          [
            { transform: place(from.x, from.y), opacity: reused ? 0.85 : 0 },
            {
              transform: `${place(bend.x, bend.y)} scale(1.15) rotate(20deg)`,
              opacity: 1,
              offset: 0.55,
            },
            { transform: `${place(letter.x, letter.y)} scale(1)`, opacity: 1, offset: 0.85 },
            { transform: `${place(letter.x, letter.y)} scale(0.6)`, opacity: 0 },
          ],
          {
            duration: 780,
            delay: (letter.x / width) * 240 + Math.random() * 100,
            easing: "cubic-bezier(.45,.05,.25,1)",
            fill: "both",
          },
        )
        .finished.then(done, done);
    });
  });
}
