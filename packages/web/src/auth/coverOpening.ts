/**
 * Opening the book: after sign-in, and on the way back to the game. It is the closing played
 * backwards. A copy of the whole cover screen is laid over the window, so the router can put
 * the app underneath at once; on the copy the clasp comes undone, the cover swings open from
 * left to right on its spine, and the book comes forward until its page lies exactly where the
 * app's page is. Then the copy fades and the app is there.
 *
 * Sign-in lays the copy ready, hidden, before the request (`prepareCoverOpening`); if sign-in
 * fails the copy is dropped and the form shows the error.
 */

import { playUiSfx } from "../features/sfx/uiSfx";
import { unfastenClasp } from "./clasp";

export const COVER_OPEN_MS = 1150;
const COME_FORWARD_MS = 1050;
const FADE_MS = 380;
/** How far the book sinks back while it opens, before it comes forward. */
const PULL_BACK = 0.93;
const LEAN_DEG = 11;

export interface CoverOpening {
  play(): void;
  cancel(): void;
}

const noop: CoverOpening = { play() {}, cancel() {} };

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Where the app's page will be: its content area, cut to what is on screen. */
function appPage() {
  const content = document.querySelector<HTMLElement>("#app-content");
  const rect = content?.getBoundingClientRect();
  if (!rect || !rect.width) return { left: 0, top: 0, width: window.innerWidth };
  return { left: rect.left, top: Math.max(0, rect.top), width: rect.width };
}

export function prepareCoverOpening(): CoverOpening {
  if (typeof document === "undefined") return noop;
  const original = document.querySelector<HTMLElement>(".auth-stage");
  if (!original?.querySelector("[data-auth-cover]")) return noop;
  try {
    const rect = original.getBoundingClientRect();
    const scene = original.cloneNode(true) as HTMLElement;
    scene.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    scene.querySelectorAll(".auth-reink").forEach((node) => node.remove());
    scene.querySelector("[data-reink]")?.removeAttribute("data-reink");
    scene.setAttribute("aria-hidden", "true");
    scene.inert = true;
    scene.classList.add("auth-opening");
    // Inline, so the stage's own layout rules cannot take the copy out of the window.
    Object.assign(scene.style, {
      position: "fixed",
      zIndex: "90",
      margin: "0",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${Math.max(rect.height, window.innerHeight)}px`,
      visibility: "hidden",
    });
    document.body.append(scene);
    const book = scene.querySelector<HTMLElement>(".auth-book");
    const leaf = scene.querySelector<HTMLElement>(".auth-book__leaf");
    const cover = scene.querySelector<HTMLElement>(".auth-cover");
    const page = scene.querySelector<HTMLElement>(".auth-book__page");
    const board = scene.querySelector<HTMLElement>(".auth-book__board");
    const tilt = scene.querySelector<HTMLElement>(".auth-book__tilt");
    let done = false;
    const timers: number[] = [];
    const remove = () => {
      if (done) return;
      done = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      scene.remove();
    };
    return {
      play() {
        if (done) return;
        scene.style.visibility = "visible";
        if (
          prefersReducedMotion() ||
          typeof scene.animate !== "function" ||
          !book ||
          !leaf ||
          !cover ||
          !page
        ) {
          timers.push(window.setTimeout(remove, 120));
          return;
        }
        // Where everything is at rest: the flight to the app's page is reckoned from here, not
        // from the book as it leans and sinks.
        const from = book.getBoundingClientRect();
        const sheet = page.getBoundingClientRect();
        const unfastened = unfastenClasp(cover);
        // The way back to the game is not part of the book: it leaves as the book opens.
        scene
          .querySelector<HTMLElement>(".auth-stage__bar")
          ?.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 220,
            fill: "forwards",
          });
        // Like the closing: the book sinks back a little and leans away, as a book does on a
        // table when you open it; it rights itself again as it comes forward to the page.
        const forward = unfastened + COVER_OPEN_MS * 0.72;
        const sunk = `translate(${(from.width * (1 - PULL_BACK)) / 2}px, ${
          (from.height * (1 - PULL_BACK)) / 3
        }px) scale(${PULL_BACK})`;
        book.animate([{ transform: "translate(0px, 0px) scale(1)" }, { transform: sunk }], {
          duration: unfastened + COVER_OPEN_MS * 0.55,
          easing: "cubic-bezier(0.45, 0, 0.55, 1)",
          fill: "forwards",
        });
        const total = forward + COME_FORWARD_MS;
        const leaned = { transform: `rotateX(${LEAN_DEG}deg)`, filter: "brightness(0.93)" };
        tilt?.animate(
          [
            {
              transform: "rotateX(0deg)",
              filter: "brightness(1)",
              easing: "cubic-bezier(0.45, 0, 0.55, 1)",
            },
            { ...leaned, offset: (unfastened + COVER_OPEN_MS * 0.5) / total },
            { ...leaned, offset: forward / total, easing: "cubic-bezier(0.4, 0, 0.3, 1)" },
            { transform: "rotateX(0deg)", filter: "brightness(1)" },
          ],
          { duration: total, fill: "forwards" },
        );
        // The cover creaks open as it lifts off the clasp.
        timers.push(window.setTimeout(() => playUiSfx("bookOpen"), unfastened));
        leaf.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(172deg)" }], {
          duration: COVER_OPEN_MS,
          delay: unfastened,
          easing: "cubic-bezier(0.55, 0.05, 0.25, 1)",
          fill: "forwards",
        });
        // The book comes forward once the cover is nearly open: by then the app is underneath,
        // so the page can fly exactly to where the app's page is.
        timers.push(
          window.setTimeout(() => {
            if (done) return;
            const to = appPage();
            const scale = to.width / Math.max(1, sheet.width);
            const x = to.left - from.left - (sheet.left - from.left) * scale;
            const y = to.top - from.top - (sheet.top - from.top) * scale;
            book.animate(
              [{ transform: sunk }, { transform: `translate(${x}px, ${y}px) scale(${scale})` }],
              {
                duration: COME_FORWARD_MS,
                easing: "cubic-bezier(0.5, 0, 0.2, 1)",
                fill: "forwards",
              },
            );
            board?.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: COME_FORWARD_MS * 0.5,
              delay: COME_FORWARD_MS * 0.2,
              fill: "forwards",
            });
            const fade = scene.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: FADE_MS,
              delay: COME_FORWARD_MS - FADE_MS * 0.4,
              fill: "forwards",
            });
            fade.onfinish = remove;
          }, forward),
        );
        // The book settles onto the page as its flight slows to a stop.
        timers.push(
          window.setTimeout(() => playUiSfx("bookPlace"), forward + COME_FORWARD_MS * 0.9),
        );
        // Hidden tabs pause animations; the copy still leaves the page.
        timers.push(window.setTimeout(remove, forward + COME_FORWARD_MS + FADE_MS + 900));
      },
      cancel: remove,
    };
  } catch {
    return noop;
  }
}
