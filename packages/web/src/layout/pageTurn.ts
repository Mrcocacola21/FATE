/**
 * Page turn between sidebar sections: the top-left corner of the page lifts and the sheet
 * peels away diagonally towards the bottom right, showing the next page underneath. Going back
 * up the menu plays the same peel in reverse, with the earlier page laid back over the current.
 *
 * The geometry is a flat fold: the lifted corner C sits somewhere on a curve, the fold line is
 * the perpendicular bisector between the page corner and C, the page keeps the side away from
 * the corner, and the folded flap is the corner side mirrored across the fold line.
 */

import { scheduleUiSfx } from "../features/sfx/uiSfx";

export type Point = readonly [number, number];
export interface Fold {
  /** A point on the fold line. */
  mid: Point;
  /** Unit normal of the fold line, pointing from the page corner towards the lifted corner. */
  normal: Point;
}
export type TurnDirection = "forward" | "backward";

export const PAGE_TURN_MS = 520;
/**
 * Stacking of the turn's layers: above the sidebar (30) and below the floating mini-chat,
 * notifications and rules (60), so those stay on top of the book while a page turns.
 */
const Z = { under: 1, landing: 35, live: 45, top: 50 } as const;
/** At most this many in-between sections riffle past, so a long jump stays short. */
export const MAX_RIFFLE = 3;

/** Sections between `from` and `to` in the order they turn, nearest the destination last. */
export function riffleBetween(from: number, to: number): number[] {
  if (from < 0 || to < 0 || Math.abs(to - from) < 2) return [];
  const step = to > from ? 1 : -1;
  const between: number[] = [];
  for (let index = from + step; index !== to; index += step) between.push(index);
  return between.slice(-MAX_RIFFLE);
}

/** One sheet takes the whole time; a riffle shortens each sheet and staggers them. */
export function turnSchedule(sheets: number) {
  if (sheets <= 1) return { duration: PAGE_TURN_MS, stagger: 0, total: PAGE_TURN_MS };
  const duration = Math.round(PAGE_TURN_MS * 0.75);
  const stagger = Math.round(PAGE_TURN_MS * 0.24);
  return { duration, stagger, total: duration + stagger * (sheets - 1) };
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** The page corner that lifts: the top left. */
const pageCorner = (): Point => [0, 0];

/** Where the lifted top-left corner is at `progress` (0 flat, 1 gone past the bottom right). */
export function liftedCorner(width: number, height: number, progress: number): Point {
  const t = Math.min(1, Math.max(0.002, easeInOut(Math.min(1, Math.max(0, progress)))));
  // A quadratic curve: down first, then sweeping right well past the page.
  const start = pageCorner();
  const control: Point = [width * 0.7, height * 0.95];
  const end: Point = [width * 2.7, height * 2.6];
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  return [a * start[0] + b * control[0] + c * end[0], a * start[1] + b * control[1] + c * end[1]];
}

export function foldAt(width: number, height: number, progress: number): Fold {
  const corner = pageCorner();
  const lifted = liftedCorner(width, height, progress);
  const dx = lifted[0] - corner[0];
  const dy = lifted[1] - corner[1];
  const length = Math.hypot(dx, dy) || 1;
  return {
    mid: [(corner[0] + lifted[0]) / 2, (corner[1] + lifted[1]) / 2],
    normal: [dx / length, dy / length],
  };
}

/**
 * The part of the `width` × `height` rectangle on one side of the fold: "page" is what stays
 * flat, "flap" is the lifted corner before it is mirrored.
 */
export function foldPolygon(
  width: number,
  height: number,
  fold: Fold,
  part: "page" | "flap",
): Point[] {
  const corners: Point[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const sign = part === "page" ? 1 : -1;
  const side = (p: Point) =>
    sign * ((p[0] - fold.mid[0]) * fold.normal[0] + (p[1] - fold.mid[1]) * fold.normal[1]);
  const result: Point[] = [];
  corners.forEach((a, index) => {
    const b = corners[(index + 1) % corners.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) result.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  });
  return result;
}

/** CSS `matrix()` arguments that mirror the plane across the fold line. */
export function mirrorMatrix(fold: Fold): [number, number, number, number, number, number] {
  const [nx, ny] = fold.normal;
  const d = 2 * (fold.mid[0] * nx + fold.mid[1] * ny);
  return [1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * ny, 1 - 2 * ny * ny, d * nx, d * ny];
}

/** Down the menu turns forward; up the menu brings the earlier page back. */
export function turnDirection(from: number, to: number): TurnDirection {
  return from >= 0 && to >= 0 && to < from ? "backward" : "forward";
}

const polygonCss = (points: Point[], dx = 0, dy = 0) =>
  points.length
    ? `polygon(${points.map(([x, y]) => `${(x + dx).toFixed(1)}px ${(y + dy).toFixed(1)}px`).join(",")})`
    : "polygon(0 0, 0 0, 0 0)";

/** A menu section, for the sheets a jump riffles past: its title and, once visited, its page. */
export interface TurnSection {
  title: string;
  /** The chapter's name in the running head, such as "Chapter V". */
  chapter?: string;
  page?: HTMLElement | null;
}

export interface PageSnapshot {
  clone: HTMLElement;
  rect: DOMRect;
  from: number;
  to: number;
  /** Every menu section, in menu order. */
  sections: TurnSection[];
  at: number;
}

/** Copies a page (canvases included) so it can still be shown after the router replaces it. */
export function clonePage(main: HTMLElement): HTMLElement {
  const clone = main.cloneNode(true) as HTMLElement;
  // A copy taken mid-turn must not keep the turn's clipping on it.
  clone.removeAttribute("style");
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  const sources = main.querySelectorAll("canvas");
  clone.querySelectorAll("canvas").forEach((canvas, index) => {
    try {
      canvas.getContext("2d")?.drawImage(sources[index], 0, 0);
    } catch {
      /* A tainted or empty canvas stays blank on the copy. */
    }
  });
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("inert", "");
  return clone;
}

/** Copies the page being left, before the router replaces it. */
export function capturePage(
  main: HTMLElement,
  from: number,
  to: number,
  sections: TurnSection[] = [],
): PageSnapshot {
  return {
    clone: clonePage(main),
    rect: main.getBoundingClientRect(),
    from,
    to,
    sections,
    at: performance.now(),
  };
}

function layer(className: string, css: Partial<CSSStyleDeclaration> = {}) {
  const element = document.createElement("div");
  element.className = className;
  Object.assign(element.style, css);
  return element;
}

const CORNER =
  '<path d="M2 42V10a8 8 0 0 1 8-8h32"/><path d="M9 34V17a8 8 0 0 1 8-8h17" opacity=".55"/>' +
  '<circle cx="10" cy="10" r="2.8"/><path d="M20 2v4M2 20h4"/>';

/**
 * A section not opened yet has no page to show, so the riffle shows its chapter opening: the
 * grimoire leaf with its frame and running head, the chapter and title in the middle and a
 * faint seal behind them, like the first page of a chapter in the book.
 */
function chapterSheet(section: TurnSection) {
  const sheet = layer("grimoire-sheet page-turn__sheet page-turn__chapter");
  const decor = layer("grimoire-sheet__decor");
  decor.append(
    layer("grimoire-sheet__gutter"),
    layer("grimoire-sheet__frame"),
    ...["tl", "tr", "bl", "br"].map((corner) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", `grimoire-sheet__corner grimoire-sheet__corner--${corner}`);
      svg.setAttribute("viewBox", "0 0 44 44");
      svg.innerHTML = CORNER;
      return svg;
    }),
    layer("grimoire-sheet__ribbon"),
  );
  const text = (className: string, value: string) => {
    const element = document.createElement("p");
    element.className = className;
    element.textContent = value;
    return element;
  };
  if (section.chapter)
    decor.append(text("grimoire-sheet__head", `${section.chapter} · ${section.title}`));
  const body = layer("page-turn__chapter-body");
  if (section.chapter) body.append(text("page-turn__chapter-number", section.chapter));
  body.append(text("page-turn__title", section.title), layer("page-turn__chapter-ornament"));
  sheet.append(decor, layer("page-turn__seal"), body);
  sheet.setAttribute("aria-hidden", "true");
  return sheet;
}

/** The sheet for a section skipped over, and how far its top sits from the frame's top. */
function sectionSheet(section: TurnSection, top: number, width: number): [HTMLElement, number] {
  if (!section.page) return [chapterSheet(section), 0];
  const copy = section.page.cloneNode(true) as HTMLElement;
  Object.assign(copy.style, {
    position: "absolute",
    top: `${top}px`,
    left: "0px",
    width: `${width}px`,
    margin: "0",
  });
  copy.classList.add("page-turn__sheet");
  return [copy, -top];
}

interface Leaf {
  pose(progress: number): void;
}

/**
 * Plays the turn over the freshly rendered page and returns a function that ends it at once.
 * Forward peels the old page off the new one, with the sections in between riffling after it;
 * backward lays those sections and then the new page back over the old one.
 */
export function playPageTurn(main: HTMLElement, snapshot: PageSnapshot): () => void {
  const direction = turnDirection(snapshot.from, snapshot.to);
  const rect = main.getBoundingClientRect();
  const width = rect.width;
  const height = window.innerHeight;
  const reach = Math.hypot(width, height) * 2;
  const frames: HTMLElement[] = [];
  const frame = (z: number) => {
    const holder = layer("page-turn__frame", {
      left: `${rect.left}px`,
      width: `${width}px`,
      height: `${height}px`,
      zIndex: String(z),
    });
    frames.push(holder);
    return holder;
  };

  /** One turning sheet: the sheet (or the live page), its flap and the shadow it throws. */
  const leaf = (z: number, turning: HTMLElement, offsetY: number, own = true): Leaf => {
    const holder = frame(z);
    const shadow = layer("page-turn__shadow", { width: "120px", height: `${reach}px` });
    const flap = layer("page-turn__flap", { width: `${width}px`, height: `${height}px` });
    const gloss = layer("page-turn__gloss", { width: "160px", height: `${reach}px` });
    flap.append(gloss);
    if (own) holder.append(turning);
    holder.append(shadow, flap);
    return {
      pose(progress) {
        const fold = foldAt(width, height, progress);
        turning.style.clipPath = polygonCss(foldPolygon(width, height, fold, "page"), 0, offsetY);
        flap.style.clipPath = polygonCss(foldPolygon(width, height, fold, "flap"));
        flap.style.transform = `matrix(${mirrorMatrix(fold)
          .map((value) => value.toFixed(5))
          .join(",")})`;
        const angle = (Math.atan2(fold.normal[1], fold.normal[0]) * 180) / Math.PI;
        for (const [band, size] of [
          [shadow, 120],
          [gloss, 160],
        ] as const) {
          band.style.left = `${fold.mid[0] - size / 2}px`;
          band.style.top = `${fold.mid[1] - reach / 2}px`;
          band.style.transform = `rotate(${angle}deg)`;
        }
        const moving = progress > 0 && progress < 1;
        shadow.style.opacity = moving ? Math.min(1, (1 - progress) * 3).toFixed(3) : "0";
        flap.style.visibility = moving ? "visible" : "hidden";
      },
    };
  };

  const old = snapshot.clone;
  Object.assign(old.style, {
    position: "absolute",
    top: `${snapshot.rect.top}px`,
    left: "0px",
    width: `${snapshot.rect.width}px`,
    margin: "0",
  });
  old.classList.add("page-turn__sheet");
  const between = riffleBetween(snapshot.from, snapshot.to).map((index) =>
    sectionSheet(snapshot.sections[index] ?? { title: "" }, rect.top, width),
  );
  const saved = {
    position: main.style.position,
    zIndex: main.style.zIndex,
    clipPath: main.style.clipPath,
    background: main.style.background,
    minHeight: main.style.minHeight,
  };
  const leaves: Leaf[] = [];
  if (direction === "forward") {
    // Top to bottom: the old page, then each skipped section; the new page waits in place.
    leaves.push(leaf(Z.top + between.length, old, -snapshot.rect.top));
    between.forEach(([sheet, offsetY], index) =>
      leaves.push(leaf(Z.top - 1 + between.length - index, sheet, offsetY)),
    );
  } else {
    // The old page waits underneath; the skipped sections land on it one by one and the live
    // page lands last, on a solid sheet of paper so nothing shows through it.
    frame(Z.under).append(old);
    between.forEach(([sheet, offsetY], index) =>
      leaves.push(leaf(Z.landing + index, sheet, offsetY)),
    );
    Object.assign(main.style, {
      position: "relative",
      zIndex: String(Z.live),
      background: "rgb(var(--fate-bg))",
      minHeight: "100dvh",
    });
    leaves.push(leaf(Z.top, main, -rect.top, false));
  }
  document.body.append(...frames);
  document.documentElement.dataset.pageTurning = "";

  const schedule = turnSchedule(leaves.length);
  const [from, to] = direction === "forward" ? [0, 1] : [1, 0];
  const poseAll = (elapsed: number) =>
    leaves.forEach((sheet, index) => {
      const t = Math.min(1, Math.max(0, (elapsed - index * schedule.stagger) / schedule.duration));
      sheet.pose(from + (to - from) * t);
    });

  // Each sheet rustles as it lifts, so a riffle past three sections sounds like three pages.
  const rustles = leaves.map((_, index) => scheduleUiSfx("pageTurn", index * schedule.stagger));

  let raf = 0;
  let done = false;
  // Hidden tabs pause animation frames; the timer still clears the layers off the new page.
  const fallback = window.setTimeout(() => finish(), schedule.total + 250);
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(fallback);
    rustles.forEach((cancel) => cancel());
    frames.forEach((holder) => holder.remove());
    Object.assign(main.style, saved);
    delete document.documentElement.dataset.pageTurning;
  };
  const started = performance.now();
  poseAll(0);
  const step = (now: number) => {
    const elapsed = now - started;
    poseAll(elapsed);
    if (elapsed < schedule.total) raf = requestAnimationFrame(step);
    else finish();
  };
  raf = requestAnimationFrame(step);
  return finish;
}
