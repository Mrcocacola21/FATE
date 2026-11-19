/**
 * Rune magic: the moments of a match (an offered match, the lobby, the draft roll, a pick, the
 * battle) are written on the page by glowing runes that fly in, tumble through glyphs and settle
 * into words, or that leave a thing and stream to where it goes.
 *
 * React owns the page, so nothing here changes it. The runes live in one fixed layer over the
 * window; a word that is "written" is only veiled (by a data attribute) while its runes fly to
 * its letters, then unveiled with a glow where they land. Every effect is decoration: it never
 * delays or blocks the game, and with reduced motion it does nothing.
 */

const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ✶✧☽☉♄♃☿";
export type RuneTone = "violet" | "gold";

export const reduced = () =>
  typeof window === "undefined" ||
  typeof document === "undefined" ||
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
export const glyph = () => RUNES[Math.floor(Math.random() * RUNES.length)];

/** A weaker machine (few cores or little memory) gets fewer runes in each spell. */
const weak =
  typeof navigator !== "undefined" &&
  ((navigator.hardwareConcurrency ?? 8) <= 4 ||
    ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4);
export const budget = (count: number) => Math.max(1, Math.round(weak ? count * 0.55 : count));

// One timer flickers every rune in the air, a third of them on each tick, instead of a timer
// for each rune.
const flickering = new Set<HTMLElement>();
let ticker: ReturnType<typeof setInterval> | null = null;
let tick = 0;
export function flicker(rune: HTMLElement): () => void {
  flickering.add(rune);
  ticker ??= setInterval(() => {
    tick++;
    let index = 0;
    for (const item of flickering) {
      if (!item.isConnected) flickering.delete(item);
      else if ((index++ + tick) % 3 === 0) item.textContent = glyph();
    }
    if (!flickering.size && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }, 90);
  return () => flickering.delete(rune);
}

let host: HTMLElement | null = null;
export function layer(): HTMLElement {
  if (host?.isConnected) return host;
  host = document.createElement("div");
  host.className = "rune-layer";
  host.setAttribute("aria-hidden", "true");
  document.body.append(host);
  return host;
}

interface Point {
  x: number;
  y: number;
}
const middle = (rect: DOMRect): Point => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});
const at = (p: Point) => `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;

/** One rune flying from `from` to `to` along an arc, flickering through glyphs on the way. */
function fly(
  from: Point,
  to: Point,
  {
    tone = "violet",
    size = 22,
    delay = 0,
    duration = 850,
    land = "shrink" as "shrink" | "fade" | "stay",
    arc = 1,
  } = {},
): Promise<void> {
  const rune = document.createElement("span");
  rune.className = `rune-glyph rune-glyph--${tone}`;
  rune.textContent = glyph();
  rune.style.fontSize = `${size}px`;
  rune.style.transform = at(from);
  rune.style.opacity = "0";
  layer().append(rune);
  const bend: Point = {
    x: (from.x + to.x) / 2 + (Math.random() - 0.5) * 220 * arc,
    y: (from.y + to.y) / 2 - (60 + Math.random() * 120) * arc,
  };
  const stopFlicker = flicker(rune);
  const end =
    land === "shrink"
      ? { transform: `${at(to)} scale(0.3)`, opacity: 0.2 }
      : land === "fade"
        ? {
            transform: `${at(to)} scale(0.9) rotate(${(Math.random() - 0.5) * 300}deg)`,
            opacity: 0,
          }
        : { transform: `${at(to)} scale(1)`, opacity: 1 };
  const animation = rune.animate(
    [
      { transform: `${at(from)} scale(0.5) rotate(-80deg)`, opacity: 0 },
      { transform: `${at(bend)} scale(1.15) rotate(30deg)`, opacity: 1, offset: 0.55 },
      end,
    ],
    { duration, delay, easing: "cubic-bezier(.45,.05,.25,1)", fill: "both" },
  );
  const finish = () => {
    stopFlicker();
    rune.remove();
  };
  return animation.finished.then(finish, finish);
}

/** Where each visible letter of an element sits on screen. */
function letterPoints(element: Element): Point[] {
  const points: Point[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    for (let i = 0; i < text.length; i++) {
      if (!text[i].trim()) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width) points.push(middle(rect));
    }
  }
  return points;
}

/**
 * Writes an element with runes: it is veiled, runes gather from `from` (or from all over the
 * window) to each of its letters, and it is unveiled with a glow as they land.
 */
export function writeWithRunes(
  element: Element | null | undefined,
  {
    from,
    tone = "violet",
    stagger = 26,
    duration = 850,
  }: { from?: Point | Element | null; tone?: RuneTone; stagger?: number; duration?: number } = {},
): Promise<void> {
  if (!element || reduced() || !(element instanceof HTMLElement)) return Promise.resolve();
  const points = letterPoints(element).slice(0, budget(60));
  if (!points.length) return Promise.resolve();
  const origin = from instanceof Element ? middle(from.getBoundingClientRect()) : from;
  const size = Math.min(48, Math.max(14, parseFloat(getComputedStyle(element).fontSize) || 20));
  element.dataset.runeVeil = "";
  const flights = points.map((to, i) =>
    fly(
      origin
        ? { x: origin.x + (Math.random() - 0.5) * 80, y: origin.y + (Math.random() - 0.5) * 80 }
        : { x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight },
      to,
      { tone, size, delay: i * stagger, duration, land: "shrink" },
    ),
  );
  return Promise.all(flights).then(() => {
    delete element.dataset.runeVeil;
    element.animate(
      [
        { filter: "brightness(1.7) drop-shadow(0 0 10px rgb(167 124 224 / 0.9))" },
        { filter: "none" },
      ],
      { duration: 650 },
    );
  });
}

/** Runes leave an element (it stays as it is) and stream to a target. */
export function streamRunes(
  from: Element | null | undefined,
  to: Element | null | undefined,
  {
    tone = "gold",
    count = 14,
    duration = 900,
  }: { tone?: RuneTone; count?: number; duration?: number } = {},
): Promise<void> {
  if (!from || !to || reduced()) return Promise.resolve();
  const a = from.getBoundingClientRect();
  const b = middle(to.getBoundingClientRect());
  const flights = Array.from({ length: budget(count) }, (_, i) =>
    fly(
      { x: a.left + Math.random() * a.width, y: a.top + Math.random() * a.height },
      { x: b.x + (Math.random() - 0.5) * 14, y: b.y + (Math.random() - 0.5) * 14 },
      { tone, size: 18, delay: i * 40, duration, land: "shrink" },
    ),
  );
  return Promise.all(flights).then(() => glow(to, tone));
}

/** A thing is conjured where it stands: a small whirl of runes gathers into it. */
export function conjure(
  element: Element | null | undefined,
  {
    tone = "violet",
    count = 8,
    delay = 0,
  }: { tone?: RuneTone; count?: number; delay?: number } = {},
): Promise<void> {
  if (!element || reduced()) return Promise.resolve();
  const centre = middle(element.getBoundingClientRect());
  const reach = Math.max(50, element.getBoundingClientRect().width);
  const flights = Array.from({ length: budget(count) }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const d = reach * (0.8 + Math.random() * 0.5);
    return fly({ x: centre.x + Math.cos(angle) * d, y: centre.y + Math.sin(angle) * d }, centre, {
      tone,
      size: 18,
      delay: delay + i * 25,
      duration: 520,
      arc: 0.3,
    });
  });
  return Promise.all(flights).then(() => glow(element, tone));
}

/** A thing burns away into runes that drift up (it stays as it is; the page decides its look). */
export function burnAway(
  element: Element | null | undefined,
  tone: RuneTone = "violet",
): Promise<void> {
  if (!element || reduced()) return Promise.resolve();
  const r = element.getBoundingClientRect();
  return Promise.all(
    Array.from({ length: 10 }, (_, i) => {
      const from = { x: r.left + Math.random() * r.width, y: r.top + Math.random() * r.height };
      return fly(
        from,
        { x: from.x + (Math.random() - 0.5) * 120, y: from.y - 90 - Math.random() * 90 },
        {
          tone,
          size: 18,
          delay: i * 30,
          duration: 800,
          land: "fade",
          arc: 0.2,
        },
      );
    }),
  ).then(() => undefined);
}

/** A ring of runes turning around an element for as long as it is needed. */
export function magicCircle(
  element: Element | null | undefined,
  { tone = "violet" as RuneTone, padding = 26 } = {},
): () => void {
  if (!element || reduced()) return () => undefined;
  const rect = element.getBoundingClientRect();
  const radius = Math.max(rect.width, rect.height) / 2 + padding;
  const ring = document.createElement("div");
  ring.className = `rune-circle rune-circle--${tone}`;
  Object.assign(ring.style, {
    left: `${rect.left + rect.width / 2 - radius}px`,
    top: `${rect.top + rect.height / 2 - radius}px`,
    width: `${radius * 2}px`,
    height: `${radius * 2}px`,
  });
  const count = Math.max(12, Math.round(radius / 7));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const rune = document.createElement("span");
    rune.className = `rune-glyph rune-glyph--${tone}`;
    rune.textContent = glyph();
    rune.style.transform = `translate(${radius + Math.cos(a) * radius}px, ${radius + Math.sin(a) * radius}px) translate(-50%, -50%)`;
    rune.style.animationDelay = `${i * 30}ms`;
    ring.append(rune);
  }
  layer().append(ring);
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    ring
      .animate([{ opacity: 1 }, { opacity: 0, transform: "scale(1.25)" }], {
        duration: 450,
        fill: "forwards",
      })
      .finished.then(
        () => ring.remove(),
        () => ring.remove(),
      );
  };
}

/** A short flare on something that has just received magic. */
export function glow(element: Element | null | undefined, tone: RuneTone = "violet"): void {
  if (!element || reduced() || typeof (element as HTMLElement).animate !== "function") return;
  const colour = tone === "gold" ? "rgb(222 190 132 / 0.95)" : "rgb(167 124 224 / 0.95)";
  (element as HTMLElement).animate(
    [{ filter: `brightness(1.6) drop-shadow(0 0 14px ${colour})` }, { filter: "none" }],
    { duration: 700 },
  );
}

/** A word written in the middle of the window, then gathered up into a target (the page head). */
export async function proclaim(
  text: string,
  { into, tone = "gold" }: { into?: Element | null; tone?: RuneTone } = {},
) {
  if (reduced() || typeof document === "undefined") return;
  const banner = document.createElement("div");
  banner.className = "rune-proclaim";
  banner.textContent = text;
  layer().append(banner);
  await writeWithRunes(banner, {
    from: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    tone,
    stagger: 40,
  });
  await new Promise((resolve) => window.setTimeout(resolve, 650));
  const from = middle(banner.getBoundingClientRect());
  const to = into ? middle(into.getBoundingClientRect()) : { x: from.x, y: from.y - 120 };
  await banner
    .animate(
      [
        { transform: "translate(-50%, -50%)", opacity: 1 },
        {
          transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(0.25)`,
          opacity: 0,
        },
      ],
      { duration: 700, easing: "cubic-bezier(.45,.05,.25,1)", fill: "forwards" },
    )
    .finished.catch(() => undefined);
  banner.remove();
  if (into) glow(into, tone);
}

/** Points along the edge of a box, for runes to gather on or leave from. */
function edgePoints(rect: DOMRect, count: number): Point[] {
  const points: Point[] = [];
  const perimeter = 2 * (rect.width + rect.height);
  for (let i = 0; i < count; i++) {
    let d = (i / count) * perimeter + Math.random() * 12;
    if (d < rect.width) points.push({ x: rect.left + d, y: rect.top });
    else if ((d -= rect.width) < rect.height) points.push({ x: rect.right, y: rect.top + d });
    else if ((d -= rect.height) < rect.width) points.push({ x: rect.right - d, y: rect.bottom });
    else points.push({ x: rect.left, y: rect.bottom - (d - rect.width) });
  }
  return points;
}
const onScreen = (rect: DOMRect) =>
  rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;

/**
 * A block of the page is leaving: a copy of it stays where it was and comes apart into runes,
 * its words and its edges rising as glyphs while the copy fades. The block itself is untouched,
 * so this can run as it is taken off the page.
 */
export function dissolveBlock(
  element: Element | null | undefined,
  tone: RuneTone = "violet",
  /** Where it stood, if it has already been taken off the page. */
  at?: DOMRect,
): void {
  if (!element || reduced() || !(element instanceof HTMLElement)) return;
  const rect = at ?? element.getBoundingClientRect();
  if (!onScreen(rect)) return;
  const ghost = element.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  ghost.removeAttribute("id");
  ghost.classList.add("rune-ghost");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
  });
  layer().append(ghost);
  const sources = [
    ...letterPoints(ghost)
      .filter((_, i) => i % 2 === 0)
      .slice(0, budget(50)),
    ...edgePoints(rect, budget(18)),
  ];
  sources.forEach((from, i) => {
    void fly(
      from,
      { x: from.x + (Math.random() - 0.5) * 140, y: from.y - 70 - Math.random() * 150 },
      {
        tone: i % 5 === 0 ? "gold" : tone,
        size: 16 + Math.random() * 8,
        delay: Math.random() * 260,
        duration: 900,
        land: "fade",
        arc: 0.25,
      },
    );
  });
  ghost
    .animate([{ opacity: 1 }, { opacity: 0.6, offset: 0.3 }, { opacity: 0 }], {
      duration: 650,
      easing: "ease-in",
      fill: "forwards",
    })
    .finished.then(
      () => ghost.remove(),
      () => ghost.remove(),
    );
}

const gathered = new WeakMap<Element, number>();
/**
 * A block arrives on the page: runes gather from around it onto its edges and its headings, and
 * the block comes up out of them.
 */
export function gatherBlock(
  element: Element | null | undefined,
  { delay = 0, tone = "violet" as RuneTone } = {},
): void {
  if (!element || reduced() || !(element instanceof HTMLElement)) return;
  // React's development check mounts twice; the block is gathered once.
  const last = gathered.get(element);
  if (last && performance.now() - last < 600) return;
  gathered.set(element, performance.now());
  const rect = element.getBoundingClientRect();
  if (!onScreen(rect)) return;
  const headings = Array.from(element.querySelectorAll("h1, h2, h3, .section-kicker")).slice(0, 3);
  const targets = [
    ...edgePoints(rect, budget(22)),
    ...headings.flatMap((h) => letterPoints(h)).slice(0, budget(36)),
  ];
  const reach = Math.max(120, Math.min(rect.width, rect.height) * 0.6);
  targets.forEach((to, i) => {
    const angle = Math.random() * Math.PI * 2;
    void fly({ x: to.x + Math.cos(angle) * reach, y: to.y + Math.sin(angle) * reach }, to, {
      tone: i % 6 === 0 ? "gold" : tone,
      size: 15 + Math.random() * 7,
      delay: delay + Math.random() * 280,
      duration: 700,
      arc: 0.35,
    });
  });
  element.animate(
    [
      { opacity: 0, transform: "translateY(4px)" },
      { opacity: 0.4, offset: 0.5 },
      { opacity: 1, transform: "none" },
    ],
    { duration: 800, delay: delay + 280, easing: "ease-out", fill: "backwards" },
  );
}
