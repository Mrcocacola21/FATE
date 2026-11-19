/**
 * Turning between sign-in and sign-up re-inks the cover instead of swapping it: the old words
 * burn away letter by letter in a gilt flare and drift up as ash, then the new words seep in
 * from blurred ink, left to right, while the cover eases to the new form's height.
 *
 * React owns the form, so nothing here touches its nodes. Each effect plays on a copy laid
 * on the cover over the form, with its text split into letters; the form itself is
 * only hidden (by a data attribute) until the ink has set, and then the copy is removed. The
 * copy is laid out exactly like the form, so taking it away changes nothing on screen.
 */

export const BURN_MS = 520;
const INK_MS = 1100;
const RESIZE_MS = 420;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A copy of the form laid exactly over it, its words split into letters. It is pinned to the
 * cover at the form's place when it is made: the hidden form underneath changes size when the
 * route changes and would drag anything inside it along.
 */
function overlay(plate: HTMLElement, cover: HTMLElement) {
  const copy = plate.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".auth-reink").forEach((node) => node.remove());
  copy.classList.add("auth-reink");
  copy.removeAttribute("data-reink");
  copy.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  const letters: HTMLElement[] = [];
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
  for (const text of texts) {
    const value = text.nodeValue ?? "";
    if (!value.trim()) continue;
    // One wrapper per run of text: in a grid or flex parent (labels, the button) a run of bare
    // spans would each become an item of its own and break the layout.
    const pieces = document.createElement("span");
    // Words stay whole so lines break where they do in the form; letters are what animate.
    for (const part of value.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        pieces.append(part);
        continue;
      }
      const word = document.createElement("span");
      word.className = "auth-reink__word";
      for (const char of Array.from(part)) {
        const letter = document.createElement("span");
        letter.className = "auth-reink__letter";
        letter.textContent = char;
        letters.push(letter);
        word.append(letter);
      }
      pieces.append(word);
    }
    text.replaceWith(pieces);
  }
  Object.assign(copy.style, {
    left: `${plate.offsetLeft}px`,
    top: `${plate.offsetTop}px`,
    width: `${plate.offsetWidth}px`,
  });
  cover.append(copy);
  return { copy, letters };
}

/** Each letter's place along the sweep, 0 at the first letter and 1 at the last, plus jitter. */
const sweep = (letters: HTMLElement[], index: number, jitter: number) =>
  Math.min(
    1,
    Math.max(0, index / Math.max(1, letters.length - 1) + (Math.random() - 0.5) * jitter),
  );

/** The turn still on the cover, if any: a new turn settles it at once before starting. */
let active: Reink | null = null;

export interface Reink {
  /** Call once the new form is on the cover: its words are written in after the burn. */
  inkIn(): void;
  cancel(): void;
}

/** Burns the words off the cover. The form stays hidden until `inkIn` has written the new one. */
export function burnOut(plate: HTMLElement): Reink | null {
  const cover = plate.closest<HTMLElement>(".auth-cover");
  if (!cover || prefersReducedMotion() || typeof plate.animate !== "function") return null;
  // Turning again before the last turn has set: put the cover back at rest first, so the new
  // turn starts from the real form at its real size, and the old one cannot undo the new.
  active?.cancel();
  const burnt = overlay(plate, cover);
  burnt.copy.classList.add("auth-reink--burning");
  plate.dataset.reink = "";
  // The cover and the hidden form both keep their size while the words burn: the new form
  // arrives underneath straight away, and left to itself it would push the seal beside it.
  const height = cover.offsetHeight;
  const formHeight = plate.offsetHeight;
  const hold = () => {
    cover.style.height = `${height}px`;
    plate.style.height = `${formHeight}px`;
    plate.style.overflow = "hidden";
  };
  const release = () => {
    cover.style.height = "";
    plate.style.height = "";
    plate.style.overflow = "";
  };
  hold();
  const started = performance.now();
  const running: Animation[] = [];
  let done = false;
  burnt.letters.forEach((letter, index) => {
    const at = sweep(burnt.letters, index, 0.35) * (BURN_MS * 0.45);
    running.push(
      letter.animate(
        [
          { opacity: 1 },
          {
            opacity: 1,
            color: "#ffe2a6",
            textShadow: "0 0 6px rgb(255 196 120 / 0.9), 0 0 14px rgb(167 124 224 / 0.6)",
            offset: 0.3,
          },
          {
            opacity: 0,
            color: "#a77ce0",
            transform: "translateY(-8px) scale(0.85)",
            filter: "blur(3px)",
          },
        ],
        { duration: BURN_MS * 0.55, delay: at, easing: "ease-in", fill: "forwards" },
      ),
    );
  });
  // Lines, fields and the button are not ink: they dim away under the burning words.
  burnt.copy.querySelectorAll<HTMLElement>(".field-control, .btn").forEach((part) =>
    running.push(
      part.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: BURN_MS * 0.6,
        delay: BURN_MS * 0.3,
        fill: "forwards",
      }),
    ),
  );
  let written: HTMLElement | null = null;
  const finish = () => {
    if (done) return;
    done = true;
    if (active === handle) active = null;
    running.forEach((animation) => animation.cancel());
    burnt.copy.remove();
    written?.remove();
    release();
    delete plate.dataset.reink;
  };
  // If the new page never arrives, the form comes back on its own.
  const fallback = window.setTimeout(finish, BURN_MS + INK_MS + RESIZE_MS + 800);
  const handle: Reink = {
    inkIn() {
      const wait = Math.max(0, BURN_MS - (performance.now() - started));
      window.setTimeout(() => {
        if (done) return;
        burnt.copy.remove();
        // The cover eases to the new form's size while it is bare, and only then is the new
        // form written in: nothing written ever slides as the cover grows or shrinks.
        // The form grows or shrinks with the cover, so the seal beside it glides along.
        release();
        const target = cover.offsetHeight;
        const formTarget = plate.offsetHeight;
        if (target === height && formTarget === formHeight) return writeIn();
        hold();
        const timing = { duration: RESIZE_MS, easing: "cubic-bezier(0.3, 0, 0.2, 1)" };
        const resize = cover.animate(
          [{ height: `${height}px` }, { height: `${target}px` }],
          timing,
        );
        running.push(
          resize,
          plate.animate([{ height: `${formHeight}px` }, { height: `${formTarget}px` }], timing),
        );
        void resize.finished.then(
          () => {
            if (done) return;
            release();
            writeIn();
          },
          () => undefined,
        );
      }, wait);
      const writeIn = () => {
        const ink = overlay(plate, cover);
        written = ink.copy;
        // Ink seeps in: each letter darkens out of a soft blur, slowly enough to read as
        // writing, the sweep running left to right with a little unevenness.
        ink.letters.forEach((letter, index) => {
          const at = sweep(ink.letters, index, 0.08) * (INK_MS * 0.5);
          running.push(
            letter.animate(
              [
                { opacity: 0, filter: "blur(6px)", color: "#ffe2a6" },
                {
                  opacity: 0.55,
                  filter: "blur(2.5px)",
                  color: "#ffe2a6",
                  textShadow: "0 0 8px rgb(167 124 224 / 0.75)",
                  offset: 0.4,
                },
                {
                  opacity: 1,
                  filter: "blur(0px)",
                  textShadow: "0 0 4px rgb(255 196 120 / 0.35)",
                  offset: 0.75,
                },
                { opacity: 1, filter: "blur(0px)" },
              ],
              { duration: INK_MS * 0.5, delay: at, easing: "ease-out", fill: "backwards" },
            ),
          );
        });
        ink.copy.querySelectorAll<HTMLElement>(".field-control, .btn").forEach((part) =>
          running.push(
            part.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: INK_MS * 0.45,
              delay: INK_MS * 0.25,
              easing: "ease-out",
              fill: "backwards",
            }),
          ),
        );
        window.setTimeout(() => {
          window.clearTimeout(fallback);
          finish();
        }, INK_MS + 40);
      };
    },
    cancel() {
      window.clearTimeout(fallback);
      finish();
    },
  };
  active = handle;
  return handle;
}
