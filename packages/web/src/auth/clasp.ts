/**
 * The clasp of the book: a strap that wraps round the fore-edge from the back, and a ring at
 * its end that catches on a rune stud on the cover. Fastening plays as the cover settles shut;
 * unfastening plays before it opens.
 */

export const CLASP_FASTEN_MS = 560;
export const CLASP_UNFASTEN_MS = 420;

function parts(cover: HTMLElement) {
  return {
    strap: cover.querySelector<HTMLElement>(".auth-cover__strap"),
    ring: cover.querySelector<HTMLElement>(".auth-cover__ring"),
    stud: cover.querySelector<HTMLElement>(".auth-cover__stud"),
  };
}

const glow = (strength: number) =>
  `0 0 ${4 + strength * 10}px rgb(167 124 224 / ${0.35 + strength * 0.5}), 0 0 ${
    2 + strength * 24
  }px rgb(107 63 176 / ${0.25 + strength * 0.45})`;

/** The strap comes round the edge onto the cover and its ring snaps onto the stud. */
export function fastenClasp(cover: HTMLElement, delay: number): Animation[] {
  const { strap, ring, stud } = parts(cover);
  const running: Animation[] = [];
  if (strap)
    running.push(
      strap.animate(
        [
          { transform: "rotateY(-100deg)", opacity: 0 },
          { transform: "rotateY(-62deg)", opacity: 1, offset: 0.25 },
          { transform: "rotateY(5deg)", offset: 0.78 },
          { transform: "rotateY(0deg)", opacity: 1 },
        ],
        { duration: CLASP_FASTEN_MS, delay, easing: "ease-out", fill: "backwards" },
      ),
    );
  const snap = delay + CLASP_FASTEN_MS * 0.74;
  if (ring)
    running.push(
      ring.animate(
        [{ transform: "scale(1.3)" }, { transform: "scale(0.94)" }, { transform: "none" }],
        {
          duration: 220,
          delay: snap,
          easing: "ease-out",
          fill: "backwards",
        },
      ),
    );
  if (stud)
    running.push(
      stud.animate(
        [{ boxShadow: glow(0) }, { boxShadow: glow(1), offset: 0.25 }, { boxShadow: glow(0) }],
        { duration: 620, delay: snap },
      ),
    );
  return running;
}

/** The ring lifts off the stud and the strap folds back round the edge. Returns its length. */
export function unfastenClasp(cover: HTMLElement): number {
  const { strap, ring, stud } = parts(cover);
  stud?.animate(
    [{ boxShadow: glow(0) }, { boxShadow: glow(1), offset: 0.3 }, { boxShadow: glow(0) }],
    {
      duration: 420,
    },
  );
  ring?.animate([{ transform: "none" }, { transform: "scale(1.25)" }], {
    duration: 140,
    easing: "ease-out",
    fill: "forwards",
  });
  strap?.animate(
    [
      { transform: "rotateY(0deg)", opacity: 1 },
      { transform: "rotateY(-62deg)", opacity: 1, offset: 0.7 },
      { transform: "rotateY(-100deg)", opacity: 0 },
    ],
    { duration: CLASP_UNFASTEN_MS - 120, delay: 120, easing: "ease-in", fill: "forwards" },
  );
  return CLASP_UNFASTEN_MS;
}
