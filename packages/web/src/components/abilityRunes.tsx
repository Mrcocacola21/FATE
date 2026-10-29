import type { ReactNode } from "react";

/**
 * Rune glyphs for the grimoire diamonds: one per ability, plus the core actions.
 * Every glyph is drawn on a 24×24 grid with the stroke of the surrounding <svg>
 * (currentColor, 1.7 wide, round caps); filled details set fill="currentColor" themselves.
 * Shared mechanics share a rune on purpose: every "+1 max HP" is the same heart, every
 * Commander the same banner, every borrowed class trait that class's sigil with a plus.
 */

const HEART = "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z";
const PLUS = "M19.5 2.5v4M17.5 4.5h4";

function polygon(points: Array<[number, number]>): string {
  return `M${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}Z`;
}

function hexagon(cx: number, cy: number, r: number): string {
  return polygon(
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }),
  );
}

function star(cx: number, cy: number, outer: number, inner: number, points: number): string {
  return polygon(
    Array.from({ length: points * 2 }, (_, i) => {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / points) * i - Math.PI / 2;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }),
  );
}

function spiral(cx: number, cy: number, outer: number, turns: number): string {
  const steps = Math.round(turns * 28);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const r = 0.8 + t * (outer - 0.8);
    return `${i === 0 ? "M" : "L"}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join("");
}

function rays(cx: number, cy: number, from: number, to: number, count: number, turn = 0): string {
  return Array.from({ length: count }, (_, i) => {
    const a = ((Math.PI * 2) / count) * i + turn;
    const x1 = cx + from * Math.cos(a);
    const y1 = cy + from * Math.sin(a);
    const x2 = cx + to * Math.cos(a);
    const y2 = cy + to * Math.sin(a);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }).join("");
}

const dot = (cx: number, cy: number, r = 1.1) => (
  <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
);

// ---- Shared families ----

const hp = (bars: number) => (
  <>
    <path d={HEART} />
    <path
      d={
        bars === 1
          ? "M12 10.5v5"
          : bars === 2
            ? "M10.3 10.5v4.5M13.7 10.5v4.5"
            : "M9.3 10.5v3.5M12 10.5v5.5M14.7 10.5v3.5"
      }
    />
  </>
);

const god = (
  <>
    <ellipse cx="12" cy="4.3" rx="4.2" ry="1.5" />
    <g transform="translate(12 14.2) scale(0.78) translate(-12 -13)" strokeWidth={2.2}>
      <path d={HEART} />
    </g>
    <path d="M12 11.5v3" />
  </>
);

const commander = (
  <>
    <path d="M6 21V3" />
    <path d="M6 4h12l-3 4 3 4H6" />
    <path d="M4 21h4" />
  </>
);

const closedEye = "M4 10c3 4 13 4 16 0M7 13l-1.5 2M12 14.2V17M17 13l1.5 2";

const sigil = {
  axe: (
    <>
      <path d="M5 20L15 10" />
      <path d="M12 7l3-3c1.5 2.3 3.3 4.2 5 5l-3 3c-1-2-3-4-5-5z" />
    </>
  ),
  spear: (
    <>
      <path d="M4 20L15 9" />
      <path d="M15 9l.6-2.9L20 4l-2.1 4.4z" />
      <path d="M11 10.5l2.5 2.5" />
    </>
  ),
  horseshoe: (
    <>
      <path d="M7 20v-8a5 5 0 0 1 10 0v8" />
      <path d="M5 20h4M15 20h4" />
    </>
  ),
};

const withPlus = (glyph: ReactNode) => (
  <>
    {glyph}
    <path d={PLUS} />
  </>
);

const bone = (
  <>
    <path d="M8 8l8 8" strokeWidth={2.4} />
    <circle cx="6.4" cy="8.6" r="1.9" />
    <circle cx="8.6" cy="6.4" r="1.9" />
    <circle cx="15.4" cy="17.6" r="1.9" />
    <circle cx="17.6" cy="15.4" r="1.9" />
  </>
);

const skull = "M6.5 15.5V10a5.5 5.5 0 0 1 11 0v5.5L15.5 17v3h-7v-3z";

const raven = "M3 15c3 0 5-1 7-4l3-3.5c1-1 3-1 4 0l3 1.5-3 1c0 5-4 8-9 8l-2 3z";

const oath = (numeral: string) => (
  <>
    <path d="M4.5 7.5c3.5-4 11.5-4 15 0M4.5 16.5c3.5 4 11.5 4 15 0" />
    <path d={numeral} />
  </>
);

const FLAME =
  "M12 21c-3 0-4.6-2-4.6-4.6 0-3 2.5-4.2 3.4-8.2 1.4 2.5 1.4 4 .9 5.3 1.4-.7 1.8-1.8 1.8-3 1.8 1.8 3.1 3.7 3.1 5.9 0 2.6-1.6 4.6-4.6 4.6z";

/** The flame drawn with its base at (x, y), scaled by s. */
const flame = (x: number, y: number, s = 1) => (
  <path
    d={FLAME}
    transform={`translate(${x} ${y}) scale(${s}) translate(-12 -21)`}
    strokeWidth={1.7 / s}
  />
);

/** Core actions of the Controls tab and the turn economy. */
export const ACTION_RUNES = {
  move: <path d="M4.5 6.5 10 12l-5.5 5.5M12 6.5 17.5 12 12 17.5" />,
  attack: (
    <>
      <path d="M19.5 4.5 10 14M19.5 4.5H16M19.5 4.5V8" />
      <path d="M7 11l6 6M10 14l-4.2 4.2" />
      <circle cx="5" cy="19" r="1.2" />
    </>
  ),
  longBone: bone,
  searchMove: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="M14.8 14.8 20 20" />
    </>
  ),
  searchAction: (
    <>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6S18 18 12 18 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  stealth: <path d="M15 3.5a8.5 8.5 0 1 0 5.5 14.6A7.2 7.2 0 0 1 15 3.5z" />,
  endTurn: (
    <path d="M7 3.5h10M7 20.5h10M8 3.5c0 5 8 5.5 8 8.5s-8 3.5-8 8.5M16 3.5c0 5-8 5.5-8 8.5s8 3.5 8 8.5" />
  ),
  clear: <path d="M7 7l10 10M17 7 7 17" />,
  action: (
    <>
      <path d="M12 3v13M9 16h6M12 16v4" />
      <path d="M12 3l-1.6 3h3.2z" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type ActionRuneId = keyof typeof ACTION_RUNES;

/** One rune per ability id (rules ability ids), and per Loki trick. */
export const ABILITY_RUNES: Record<string, ReactNode> = {
  // Shared
  vladPolkovodets: commander,
  berserkAutoDefense: (
    <>
      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
      <path d="M13 7l-3 5h4l-3 5" />
    </>
  ),
  genghisKhanLegendOfTheSteppes: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
      {dot(12, 12, 1.6)}
    </>
  ),
  tricksterAoE: (
    <>
      <circle cx="12" cy="12" r="8" strokeDasharray="2.4 2.6" />
      <path d="M12 8.5l3.5 3.5-3.5 3.5L8.5 12z" />
    </>
  ),

  // Grand Kaiser
  kaiserBunker: (
    <>
      <path d="M3.5 18h17" />
      <path d="M6 18v-4a6 6 0 0 1 12 0v4" />
      <path d="M9.5 13.5h5" strokeWidth={2.2} />
    </>
  ),
  kaiserDora: (
    <>
      <path d="M4 16h12M6 16l2.5-3.5h5L16 16" />
      <path d="M11 12.5 20 5" strokeWidth={2.4} />
      <circle cx="7.5" cy="19" r="1.5" />
      <circle cx="13" cy="19" r="1.5" />
    </>
  ),
  kaiserCarpetStrike: (
    <>
      <path d="M6 3v3M12 2v2.5M18 3v3" />
      <circle cx="6" cy="9.5" r="2" />
      <circle cx="12" cy="7.5" r="2" />
      <circle cx="18" cy="9.5" r="2" />
      <path d="M3 20h18M7 17l-1 3M12 15.5V20M17 17l1 3" />
    </>
  ),
  kaiserEngineeringMiracle: (
    <>
      <circle cx="12" cy="12" r="5.5" />
      <path d={rays(12, 12, 5.5, 8.5, 8, Math.PI / 8)} />
      <path d="M13 9l-2 3h2.2l-2 3" />
    </>
  ),

  // Genghis Khan
  genghisKhanTough: hp(1),
  genghisKhanKhansDecree: (
    <>
      <path d="M5 19 17 7M17 7h-6M17 7v6" />
      <path d="M3.5 6.5l1.5-3 2 2 2-2 1.5 3z" />
    </>
  ),
  genghisKhanMongolCharge: <path d="M3 6.5 8 12l-5 5.5M9 6.5l5 5.5-5 5.5M15 6.5l5 5.5-5 5.5" />,

  // Andrei Chikatilo
  chikatiloTough: hp(1),
  chikatiloFalseTrail: (
    <>
      <ellipse cx="7.5" cy="16.5" rx="2.3" ry="3.4" />
      <path d="M5.6 11.6h.01M7.5 11h.01M9.4 11.6h.01" strokeWidth={2.2} />
      <ellipse cx="16.5" cy="8.5" rx="2.3" ry="3.4" strokeDasharray="1.8 1.8" />
      <path d="M14.6 3.6h.01M16.5 3h.01M18.4 3.6h.01" strokeWidth={2.2} />
      <path d="M10.5 19.5c3 0 4-3 4.5-5.5" strokeDasharray="1 2" />
    </>
  ),
  chikatiloAssassinMark: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  chikatiloDecoy: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <circle cx="16" cy="8.5" r="3" strokeDasharray="1.8 1.8" />
      <path d="M3.5 20c0-3.5 2.4-6 5.5-6s5.5 2.5 5.5 6" />
      <path d="M17 14c2.6.4 4 2.8 4 6" strokeDasharray="1.8 1.8" />
    </>
  ),
  falseTrailTrap: (
    <>
      <path d="M4 14h16" />
      <path d="M5 14l2-4 2 4 2-4 2 4 2-4 2 4 2-4" />
      <path d="M4 14c0 4 4 6 8 6s8-2 8-6" />
    </>
  ),
  falseTrailExplosion: <path d={star(12, 12, 9, 4, 8)} />,

  // Ivan Grozny
  groznyGiant: hp(3),
  groznyInvadeTime: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3.5 2" />
      <path d="M2.5 4.5l3 3M21.5 4.5l-3 3" />
    </>
  ),
  groznyTyrant: (
    <>
      <path d="M4 17l1-9 4 4 3-6 3 6 4-4 1 9z" />
      <path d="M4 20.5h16" />
      {dot(12, 14, 1.3)}
    </>
  ),

  // El Cid
  elCidLongLived: hp(2),
  elCidCompeadorTisona: (
    <>
      <path d="M12 3v12M9 15h6M12 15v5" />
      <path d="M3 9h5M16 9h5M5 7l-2 2 2 2M19 7l2 2-2 2" />
    </>
  ),
  elCidCompeadorKolada: (
    <>
      <path d="M5 8.5a8 8 0 0 1 14 0M19 15.5a8 8 0 0 1-14 0" />
      <path d="M19 8.5h-3.5M19 8.5V5M5 15.5h3.5M5 15.5V19" />
      <path d="M12 7.5v7M10 12.5h4" />
    </>
  ),
  elCidCompeadorDemonDuelist: (
    <>
      <path d="M4 4l11 11M20 4 9 15" />
      <path d="M12.5 17.5l5-5M6.5 12.5l5 5" />
      <path d="M16 16l3.5 3.5M8 16l-3.5 3.5" />
    </>
  ),

  // Lechy
  lechyGiant: hp(3),
  lechyNaturalStealth: (
    <>
      <path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14z" />
      <path d="M5 19l9-9" />
    </>
  ),
  lechyGuideTraveler: (
    <>
      <path d="M9 7.5h6l1 3v7l-1 2H9l-1-2v-7z" />
      <path d="M12 4v3.5M10 4h4" />
      <path d="M12 16.5c-1.2-.8-1.4-2.2 0-3.7 1.4 1.5 1.2 2.9 0 3.7z" />
    </>
  ),
  lechyConfuseTerrain: <path d={spiral(12, 12, 9, 2.6)} />,
  lechyStorm: (
    <>
      <path d="M7 14.5a3.8 3.8 0 0 1-.4-7.6 5.3 5.3 0 0 1 10.1 1.2 3.2 3.2 0 0 1 .3 6.4z" />
      <path d="M12.5 14.5l-2 3.5h3l-2 3.5" />
    </>
  ),

  // Vlad III Tepes
  vladLongLived: hp(2),
  vladIntimidate: (
    <>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6S18 18 12 18 2.5 12 2.5 12z" />
      <path d="M12 8.5c-1 1.2-1 5.8 0 7 1-1.2 1-5.8 0-7z" fill="currentColor" />
    </>
  ),
  vladStakes: (
    <>
      <path d="M3 20.5h18" />
      <path d="M5 20.5 6.5 9 8 20.5M10.5 20.5 12 5l1.5 15.5M16 20.5 17.5 9 19 20.5" />
    </>
  ),
  vladForest: (
    <>
      <path d="M2.5 20.5h19" />
      <path d="M4 20.5 5 12l1 8.5M8 20.5 9 8l1 12.5M14 20.5 15 8l1 12.5M18 20.5l1-8.5 1 8.5" />
      <path d="M11 4.5l1-2.5 1 2.5-1 16z" />
      <circle cx="12" cy="9" r="1.6" />
    </>
  ),

  // Artemis
  artemidaGod: god,
  artemidaAccurateArrow: (
    <>
      <circle cx="14" cy="10" r="6.5" />
      <circle cx="14" cy="10" r="3" />
      <path d="M3.5 20.5 14 10" />
      <path d="M3.5 20.5 3 17.5M3.5 20.5l3 .5M5.5 18.5 5 15.5M5.5 18.5l3 .5" />
    </>
  ),
  artemidaMoonlightShot: (
    <>
      <path d="M14.5 4a8 8 0 1 0 5.5 13 6.5 6.5 0 0 1-5.5-13z" />
      <path d={star(17.5, 5.5, 2.4, 0.9, 4)} fill="currentColor" stroke="none" />
    </>
  ),
  artemidaSilverCrescent: (
    <>
      <path d="M9.5 15C5.5 9.5 10 3 18.5 3.5c-6 2-8.5 6-6.5 10.5z" />
      <path d="M9.5 15l-4.5 5.5" strokeWidth={2.2} />
    </>
  ),
  artemidaNatureMovement: (
    <path d="M12 21v-9M12 12 8 8V3.5M8 8 4.5 6M8 5.5l-2-2M12 12l4-4V3.5M16 8l3.5-2M16 5.5l2-2M9.5 21h5" />
  ),
  artemidaStealth: <path d={closedEye} />,

  // Asgore
  asgoreGiant: hp(3),
  asgoreFireball: (
    <>
      {flame(13, 20.5, 1.15)}
      <path d="M3 13h3M4 17h3M3.5 9h3" />
    </>
  ),
  asgoreFireParade: (
    <>
      {flame(12, 15, 0.95)}
      {flame(5.5, 21, 0.6)}
      {flame(18.5, 21, 0.6)}
    </>
  ),
  asgoreSoulParade: (
    <>
      <circle cx="12" cy="12" r="9" strokeDasharray="1.2 3" />
      <g transform="translate(12 13) scale(0.55) translate(-12 -13)" strokeWidth={3}>
        <path d={HEART} />
      </g>
      {dot(12, 3, 1.2)}
      {dot(21, 12, 1.2)}
      {dot(3, 12, 1.2)}
    </>
  ),

  // Don Quixote
  donKihoteHardy: hp(1),
  donKihoteSorrowfulCountenance: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 16.5c2-2 5-2 7 0M8 9.5l2.5 1M16 9.5l-2.5 1" />
      <path d="M15.5 12.5c.8 1.2.8 2 0 2.6-.8-.6-.8-1.4 0-2.6z" fill="currentColor" />
    </>
  ),
  donKihoteWindmills: (
    <>
      <path d="M9.5 21 11 10h2l1.5 11z" />
      <path d="M8 21h8" />
      <path
        d={polygon([
          [12, 9],
          [6.6, 5.6],
          [3.5, 2.5],
          [5.6, 6.6],
        ])}
      />
      <path
        d={polygon([
          [12, 9],
          [17.4, 5.6],
          [20.5, 2.5],
          [18.4, 6.6],
        ])}
      />
      <path d="M12 9 5.5 14.5M12 9l6.5 5.5" />
      <circle cx="12" cy="9" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  donKihoteMadness: (
    <>
      <path d="M3.5 20.5 14 10" strokeWidth={2.2} />
      <path d="M3.5 20.5l1-3 2 2z" fill="currentColor" />
      <path d={rays(17.5, 6.5, 1.8, 4.5, 8)} />
    </>
  ),

  // Duolingo
  duolingoLongLived: hp(2),
  duolingoBerserker: (
    <>
      <path d="M6.5 3.5v10M12 3.5v10M17.5 3.5v10" strokeWidth={2.4} />
      {dot(6.5, 18.5, 1.4)}
      {dot(12, 18.5, 1.4)}
      {dot(17.5, 18.5, 1.4)}
    </>
  ),
  duolingoPushNotification: (
    <>
      <path d="M5.5 17h11l-1.5-2v-4.5a4 4 0 0 0-8 0V15z" />
      <path d="M9.5 20h3" />
      <circle cx="17.5" cy="6.5" r="2.6" fill="currentColor" stroke="none" />
    </>
  ),
  duolingoSkipClasses: (
    <>
      <path d="M3.5 6c3-1 6-1 8.5 1 2.5-2 5.5-2 8.5-1v12c-3-1-6-1-8.5 1-2.5-2-5.5-2-8.5-1z" />
      <path d="M12 7v12" />
      <path d="M5.5 9.5l3.5 3.5M9 9.5 5.5 13" />
    </>
  ),
  duolingoStrick: (
    <>
      {flame(12, 21, 1.2)}
      <path d="M10 16.5l1.6 1.6 2.9-3.2" />
    </>
  ),

  // Frisk
  friskTough: hp(1),
  friskGenocide: (
    <>
      <path d="M4 20l3-3" strokeWidth={2.4} />
      <path d="M7 17 18.5 5.5c1 2.5 0 5-2 6.5L10 18z" />
      <path d="M6 15l3 3" />
    </>
  ),
  friskOnePath: (
    <>
      <path d={HEART} />
      <path d="M12 7.4 10.5 11l3 2.2-2 3.3L12 20" />
    </>
  ),
  friskPacifism: (
    <>
      <path d="M4 20C8.5 15.5 13 11 20 4" />
      <path d="M9 14.8c-2.2 0-3.4-1.2-3.4-3.4 2.2 0 3.4 1.2 3.4 3.4z" />
      <path d="M12.2 11.6c0-2.2 1.2-3.4 3.4-3.4 0 2.2-1.2 3.4-3.4 3.4z" />
      <path d="M13.8 10c-2.2 0-3.4-1.2-3.4-3.4 2.2 0 3.4 1.2 3.4 3.4z" />
      <path d="M8.4 15.6c0 2.2 1.2 3.4 3.4 3.4 0-2.2-1.2-3.4-3.4-3.4z" />
    </>
  ),
  friskCleanSoul: <path d={star(12, 12.5, 9, 3.8, 5)} />,

  // Griffith & Femto
  griffithWretchedMan: (
    <>
      <path d="M12 21.5v-3M8.5 18.5h7" />
      <path d="M10.5 18.5v-6l1.5-1.5 1.5 2v5.5" />
      <path d="M13.5 9.5l1.6-1.6V3.5L14 2l-1.4 1.4v4.2z" />
      <path d="M9 9.5l2 1M16.5 11.5l-2-.5" />
    </>
  ),
  griffithFemtoRebirth: (
    <>
      <path d="M12 3c4 0 6.5 6 6.5 10a6.5 6.5 0 0 1-13 0C5.5 9 8 3 12 3z" />
      <path d="M9 12l1.8.6M15 12l-1.8.6M10 16.5c1.3.8 2.7.8 4 0" />
    </>
  ),
  femtoGodHp: god,
  femtoMultiBerserkSpear: (
    <>
      <path d="M5 20 15 10" />
      <path d="M12 7l3-3c1.5 2.3 3.3 4.2 5 5l-3 3c-1-2-3-4-5-5z" />
      <path d="M19 20 6.5 7.5" />
      <path d="M6.5 7.5 3.5 6.6 4.2 3.8 7.2 4.6z" />
    </>
  ),
  femtoDivineMove: (
    <>
      <path d="M12 15C9 9.5 5 8 2 9.5c1 3.5 4.5 5.5 10 5.5z" />
      <path d="M12 15c3-5.5 7-7 10-5.5-1 3.5-4.5 5.5-10 5.5z" />
      <path d="M5.5 11.5l1 2M8.5 11l.8 2.5M18.5 11.5l-1 2M15.5 11l-.8 2.5" />
      <path d="M12 15v6" />
      <path d={star(12, 5, 3.2, 1.1, 4)} fill="currentColor" stroke="none" />
    </>
  ),

  // Guts
  gutsLongLived: hp(2),
  gutsArbalet: (
    <>
      <path d="M4 9c4-4.5 12-4.5 16 0" />
      <path d="M4 9l8 4 8-4" />
      <path d="M12 3.5V21" />
      <path d="M10 18h4" />
    </>
  ),
  gutsCannon: (
    <>
      <path d="M3 9.5h12v5H3z" />
      <path d="M6 14.5v4h4" />
      <path d="M18 8.5l3-2M18 12h3.5M18 15.5l3 2" />
    </>
  ),
  gutsBerserkMode: (
    <>
      <path d="M4.5 4l3.5 4.5h8L19.5 4 18.5 12l-3 8h-7l-3-8z" />
      <path d="M8.5 12.5l2.5 1M15.5 12.5l-2.5 1M10 17h4" />
    </>
  ),
  gutsExitBerserk: (
    <>
      <path d="M4.5 4l3.5 4.5h8L19.5 4 18.5 12l-3 8h-7l-3-8z" />
      <path d="M3 21 21 3" />
    </>
  ),

  // Jack the Ripper
  jackRipperResilient: hp(1),
  jackRipperDismemberment: <path d="M4 5.5l3.5 13M8.5 4.5l3.5 14M13 4.5l3.5 14M17.5 5.5 21 18.5" />,
  jackRipperCoveringTracks: (
    <>
      <path d={star(12, 12, 9.5, 4.5, 8)} />
      {dot(12, 12, 1.6)}
    </>
  ),
  jackRipperSnares: (
    <>
      <path d="M3.5 13h17" />
      <path d="M5 13l1.9-4 1.9 4 1.9-4 1.9 4 1.9-4 1.9 4 1.9-4 1.6 4" />
      <path d="M3.5 13c0 4.5 4 7 8.5 7s8.5-2.5 8.5-7" />
    </>
  ),
  jackRipperSurgery: (
    <>
      <path d="M3.5 20.5 11 13" strokeWidth={2.4} />
      <path d="M11 13l7-8.5c1.6 2.2 1 5.4-2.6 7.9L13 14.8z" />
    </>
  ),

  // Jebe
  jebeDurable: hp(1),
  jebeKhansShooter: (
    <>
      <path d="M3 19l5-10 5 8 6-11" />
      <path d="M19 6h-3.5M19 6l.5 3.4" />
      {dot(8, 9, 1.2)}
      {dot(13, 17, 1.2)}
    </>
  ),
  jebeHailOfArrows: (
    <>
      <path d="M4 4l7 7M11 11H7.5M11 11V7.5" />
      <path d="M11 4l7 7M18 11h-3.5M18 11V7.5" />
      <path d="M7 13l7 7M14 20h-3.5M14 20v-3.5" />
    </>
  ),

  // Hassan-i Sabbah
  hassanTough: hp(1),
  hassanOneWithSand: (
    <>
      <path d="M2.5 17.5c3-3 6.5-3 9.5 0s6.5 3 9.5 0" />
      <path d="M5 13c2.5-2.4 5-2.4 7.5 0" />
      <path d="M8 6.5c2 2 6 2 8 0" />
    </>
  ),
  hassanTrueEnemy: (
    <>
      <path d="M5 4h14M8.5 4v4M15.5 4v4" />
      <path d="M8.5 8 11 13M15.5 8 13 13" strokeDasharray="1.6 1.6" />
      <circle cx="12" cy="14.5" r="2" />
      <path d="M12 16.5V21M9 18.5h6" />
    </>
  ),
  hassanAssasinOrder: (
    <>
      <path d="M12 3.5l9 16.5H3z" />
      <path d="M7.5 15.2c2.6-3 6.4-3 9 0-2.6 3-6.4 3-9 0z" />
      {dot(12, 15.2, 1.2)}
    </>
  ),

  // Kaladin — the five Oaths as numerals between the winds
  kaladinTough: hp(1),
  kaladinFirst: oath("M12 8.5v7M10.5 8.5h3M10.5 15.5h3"),
  kaladinSecond: oath("M10.5 8.5v7M13.5 8.5v7M9 8.5h6M9 15.5h6"),
  kaladinThird: oath("M9 8.5v7M12 8.5v7M15 8.5v7M7.5 8.5h9M7.5 15.5h9"),
  kaladinFourth: oath("M8 8.5v7M11 8.5l2.5 7 2.5-7"),
  kaladinFifth: (
    <>
      <path d="M4.5 7.5c3.5-4 11.5-4 15 0M4.5 16.5c3.5 4 11.5 4 15 0" />
      <path d="M9 8.5l3 7 3-7" />
      <path d="M2 12h3M19 12h3" />
    </>
  ),

  // Luche
  lucheLongLived: hp(2),
  lucheShine: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d={rays(12, 12, 6, 9.5, 8)} />
    </>
  ),
  lucheBurningSun: (
    <>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d={rays(12, 8.5, 5.5, 7.5, 8)} />
      <path d="M12 15.5v6M9.5 19l2.5 2.5 2.5-2.5" />
    </>
  ),
  lucheDivineRay: (
    <>
      <path d="M3 3l9 9M7 3l8 8M3 7l8 8" />
      <circle cx="17" cy="17" r="3.2" />
      {dot(17, 17, 1)}
    </>
  ),
  lucheSunGlory: (
    <>
      <circle cx="12" cy="13" r="3.5" />
      <path d={rays(12, 13, 5.5, 7.5, 6, Math.PI / 6)} />
      <path d="M8.5 4.5 10 2l2 1.6L14 2l1.5 2.5z" />
    </>
  ),

  // Kaneki
  kanekiGhoul: (
    <>
      <path d="M5 5.5c4-2 10-2 14 0V12c0 5-3 8.5-7 8.5S5 17 5 12z" />
      <circle cx="9" cy="10.5" r="1.8" fill="currentColor" stroke="none" />
      <path d="M13.5 10.5h3" />
      <path d="M8.5 15.5h7M10 14.5v2M12 14.5v2M14 14.5v2" />
    </>
  ),
  kanekiRcCells: (
    <>
      <path d={hexagon(8, 8.5, 4)} />
      <path d={hexagon(16, 8.5, 4)} />
      <path d={hexagon(12, 15.5, 4)} />
    </>
  ),
  kanekiRinkakuKagune: (
    <path d="M12 21c-1-4-6-5-7.5-12M12 21c0-5-3-9-1.5-16M12 21c0-5 3-9 1.5-16M12 21c1-4 6-5 7.5-12" />
  ),
  kanekiRegeneration: (
    <>
      <path d={hexagon(12, 12, 8)} />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  kanekiScolopendra: (
    <>
      <circle cx="5.5" cy="18.5" r="1.8" />
      <circle cx="9" cy="15" r="1.8" />
      <circle cx="12.5" cy="11.5" r="1.8" />
      <circle cx="16" cy="8" r="1.8" />
      <circle cx="19" cy="4.8" r="1.6" fill="currentColor" stroke="none" />
      <path d="M3.5 15.5 4.6 17M7 21.5l1-1.4M7 12l1.1 1.5M10.5 18l1-1.4M10.5 8.5l1.1 1.5M14 14.5l1-1.4M14 5l1.1 1.5M17.5 11l1-1.4" />
    </>
  ),

  // Loki and his tricks
  lokiGod: god,
  lokiNaturalStealth: (
    <>
      <path d="M7.5 10C5 7.5 5 4.5 7 2.5M16.5 10c2.5-2.5 2.5-5.5.5-7.5" />
      <path d="M4.5 13.5c3 3.5 12 3.5 15 0M8 16.5l-1.2 2M12 17.5V20M16 16.5l1.2 2" />
    </>
  ),
  lokiIllusoryDouble: (
    <>
      <path d="M3.5 9.5h9v9h-9z" />
      <path d="M11.5 5.5h9v9h-2" />
      {dot(8, 14, 1.3)}
      {dot(16, 10, 1.3)}
    </>
  ),
  lokiLaught: (
    <>
      <path d="M5 4.5h14V11a7 7 0 0 1-14 0z" />
      <path d="M8 9c1-1.2 2-1.2 3 0M13 9c1-1.2 2-1.2 3 0" />
      <path d="M8.5 13c2 3 5 3 7 0z" fill="currentColor" />
    </>
  ),
  againSomeNonsense: (
    <>
      <path d="M4 7h11v11H4z" />
      {dot(7, 10, 1.1)}
      {dot(12, 15, 1.1)}
      {dot(9.5, 12.5, 1.1)}
      <path d="M17.5 3.5c2 0 3 1.2 3 2.6s-1.5 2-2.3 2.8v1.2" />
      {dot(18.2, 13, 1)}
    </>
  ),
  chicken: (
    <>
      <path d="M8 21v-5a5 5 0 0 1 2-4L9 8a3.5 3.5 0 0 1 6.5-1.5L18 8l-2.5 1 1 3a5.5 5.5 0 0 1 .5 4v5z" />
      <path d="M11 5.5l-.5-2.5 2 1.5 1-2 .5 3" />
      {dot(12.5, 8.2, 0.9)}
    </>
  ),
  mindControl: (
    <>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6S18 18 12 18 2.5 12 2.5 12z" />
      <path d="M12 12a1 1 0 1 1 1 1 2 2 0 1 1-2-2 3 3 0 1 1 3 3" />
    </>
  ),
  spinTheDrum: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="7.5" r="1.7" />
      <circle cx="16.3" cy="13.4" r="1.7" />
      <circle cx="7.7" cy="13.4" r="1.7" />
      {dot(12, 12, 1)}
    </>
  ),
  greatLokiJoke: (
    <>
      <path d="M3.5 18l3.5-11 5 6 5-6 3.5 11z" />
      <path d="M3.5 21h17" />
      <circle cx="7" cy="5.5" r="1.4" />
      <circle cx="17" cy="5.5" r="1.4" />
      <circle cx="12" cy="11" r="1.2" />
    </>
  ),

  // Mettaton
  mettatonLongLiver: hp(2),
  mettatonRating: (
    <>
      <path d="M5 20v-5M10 20v-8M15 20v-11M20 20V5" strokeWidth={2.2} />
      <path d="M3 9l5-4 3 3 4-5" />
    </>
  ),
  mettatonLaser: (
    <>
      <path d="M2.5 9h5v6h-5z" />
      <path d="M7.5 12h13" strokeWidth={2.2} />
      <path d="M11 8.5l1.5 2M11 15.5l1.5-2M17 8.5l1.5 2M17 15.5l1.5-2" />
    </>
  ),
  mettatonPoppins: (
    <>
      <path d="M3 12a9 9 0 0 1 18 0c-1.5-1.2-3-1.2-4.5 0-1.5-1.2-3-1.2-4.5 0-1.5-1.2-3-1.2-4.5 0C6 10.8 4.5 10.8 3 12z" />
      <path d="M12 12v7a2 2 0 0 1-4 0" />
      <path d="M12 3V1.5" />
    </>
  ),
  mettatonWorkOnCamera: (
    <>
      <path d="M2.5 8h12v9h-12z" />
      <path d="M14.5 11 21 7.5v10L14.5 14" />
      <circle cx="8.5" cy="12.5" r="2.2" />
    </>
  ),
  mettatonEx: (
    <>
      <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" />
      <path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V21M8.5 21h7" />
    </>
  ),
  mettatonStagePhenomenon: (
    <>
      <path d="M9 3h6l4.5 15h-15z" />
      <ellipse cx="12" cy="19.5" rx="8" ry="1.8" />
      <path d={star(12, 11.5, 2.6, 1.1, 5)} fill="currentColor" stroke="none" />
    </>
  ),
  mettatonNeo: (
    <>
      <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" />
    </>
  ),
  mettatonRiderFeature: withPlus(sigil.horseshoe),
  mettatonBerserkerMulticlass: withPlus(sigil.axe),
  mettatonGrace: (
    <>
      <path d="M10 17.5V5l8-1.5v12" />
      <ellipse cx="7.5" cy="17.5" rx="2.5" ry="2" />
      <ellipse cx="15.5" cy="15.5" rx="2.5" ry="2" />
    </>
  ),
  mettatonFinalChord: (
    <>
      <path d="M3 9h3.5L12 4.5v15L6.5 15H3z" />
      <path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11M20 4a11 11 0 0 1 0 16" />
    </>
  ),

  // Odin
  odinGod: god,
  odinGungnir: (
    <>
      <path d="M12 21.5V9" />
      <path d="M12 2.5l2.6 6.5H9.4z" />
      <path d="M9.5 13.5l5-2M9.5 17l5-2" />
    </>
  ),
  odinHuginn: (
    <>
      <path d={raven} />
      {dot(15, 9.2, 1)}
    </>
  ),
  odinMuninn: (
    <>
      <path d={raven} />
      {dot(15, 9.2, 1)}
      <path d="M3.5 5.5l1.8 1.8L8.5 3.8" />
    </>
  ),
  odinSleipnir: (
    <>
      <path d="M7 20v-8a5 5 0 0 1 10 0v8" />
      <path d="M5 20h4M15 20h4" />
      {dot(7, 15, 0.9)}
      {dot(7, 11.5, 0.9)}
      {dot(9, 8, 0.9)}
      {dot(12, 7, 0.9)}
      {dot(15, 8, 0.9)}
      {dot(17, 11.5, 0.9)}
      {dot(17, 15, 0.9)}
      <path d="M12 2v2.5M5 4l1.5 1.5M19 4l-1.5 1.5" />
    </>
  ),

  // Papyrus
  papyrusLongLived: hp(2),
  papyrusBlueBone: bone,
  papyrusSpaghetti: (
    <>
      <path d="M3.5 12h17a8.5 8.5 0 0 1-17 0z" />
      <path d="M8 12c0-3 2-3.5 1.5-7M12 12c0-3-2-4 .5-7.5M16 12c0-3 2-3.5 1-7" />
    </>
  ),
  papyrusCoolGuy: (
    <>
      <path d="M2.5 9h19" />
      <path d="M4.5 9l1 5h4.5l1-5M13 9l1 5h4.5l1-5" />
      <path d="M6.5 11l1.5-1.2M15 11l1.5-1.2" />
    </>
  ),
  papyrusUnbeliever: (
    <>
      <path d={skull} />
      <path d="M8 9.5l3 1.2M16 9.5l-3 1.2" />
      {dot(9.5, 12, 1.1)}
      {dot(14.5, 12, 1.1)}
      <path d="M11 17v2M13 17v2" />
    </>
  ),
  papyrusOrangeBone: (
    <>
      {bone}
      <path d="M3 13h3M4 17h3" />
    </>
  ),
  papyrusLongBone: (
    <>
      <path d="M5 19 19 5" strokeWidth={2.4} />
      <circle cx="3.6" cy="18" r="1.5" />
      <circle cx="6" cy="20.4" r="1.5" />
      <path d="M19 5h-4M19 5v4" />
    </>
  ),
  papyrusOssified: (
    <>
      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
      <path d="M10 10l4 4" strokeWidth={2} />
      <circle cx="9" cy="10.3" r="1" />
      <circle cx="10.3" cy="9" r="1" />
      <circle cx="13.7" cy="15" r="1" />
      <circle cx="15" cy="13.7" r="1" />
    </>
  ),

  // River Person
  riverPersonTough: hp(1),
  riverBoat: (
    <>
      <path d="M3 13h18l-3 4.5H6z" />
      <path d="M9 13V5l6 8" />
      <path d="M2.5 21c2-1.2 4-1.2 6 0s4 1.2 6 0 4-1.2 6 0" />
    </>
  ),
  riverBoatman: (
    <>
      <path d="M4.5 19.5 16 8" strokeWidth={2.2} />
      <path d="M16 8l1-4.5 3.5 3.5z" />
      <path d="M2.5 21c2-1.2 4-1.2 6 0s4 1.2 6 0" />
    </>
  ),
  riverGuideOfSouls: (
    <>
      <path d="M5 21c0-9 2.5-17 7-17s7 8 7 17" />
      <path d="M8.5 21c0-5 1.5-9 3.5-9s3.5 4 3.5 9" />
      {dot(10.8, 15, 0.9)}
      {dot(13.2, 15, 0.9)}
    </>
  ),
  riverTraLaLa: (
    <>
      <path d="M8 16.5V5.5l9-2v11" />
      <ellipse cx="5.8" cy="16.5" rx="2.3" ry="1.9" />
      <ellipse cx="14.8" cy="14.5" rx="2.3" ry="1.9" />
      <path d="M2.5 21.5c2-1 4-1 6 0s4 1 6 0 4-1 6 0" />
    </>
  ),

  // Sans
  sansLongLiver: hp(2),
  sansGasterBlaster: (
    <>
      <path d="M3 6.5 9 4l3.5 3v3.5L9.5 12l3 3.5V19l-3.5 1.5L3 17z" />
      {dot(7, 8, 1.1)}
      <path d="M12.5 10.5h9M12.5 15.5h9" />
      <path d="M14 13h7.5" strokeDasharray="1.5 1.5" />
    </>
  ),
  sansBadassJoke: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M7 13c2 3.5 8 3.5 10 0zM7 13h10M10 13v2.3M14 13v2.3" />
      {dot(9, 9, 1.2)}
      <path d="M13.5 9h3" />
    </>
  ),
  sansSpearmanFeature: withPlus(sigil.spear),
  sansUnbeliever: (
    <>
      <path d={skull} />
      <circle cx="9.5" cy="11.5" r="1.8" />
      {dot(9.5, 11.5, 0.8)}
      {dot(14.5, 11.5, 1.1)}
      <path d="M10 17v2M12 17v2M14 17v2" />
    </>
  ),
  sansBoneField: (
    <>
      <path d="M2.5 20.5h19" />
      <path d="M6 20.5V11M12 20.5V6M18 20.5V9" strokeWidth={2} />
      <path d="M4.8 10.5h2.4M10.8 5.5h2.4M16.8 8.5h2.4" />
    </>
  ),
  sansSleep: <path d="M4 5h6l-6 7h6M13 11h7l-7 8h7" />,
  sansLastAttack: (
    <>
      <path d="M6 21V10a6 6 0 0 1 12 0v11z" />
      <path d="M4 21h16" />
      <path d="M12 10v6M9.5 12.5h5" />
    </>
  ),

  // Undyne
  undyneTough: hp(1),
  undyneSpearmanMulticlass: withPlus(sigil.spear),
  undyneSpearThrow: (
    <>
      <path d="M8 16 18 6" strokeWidth={2} />
      <path d="M18 6l.6-2.6L21 3l-.4 2.4z" />
      <path d="M3 13h4M4.5 17h4M6.5 20.5h4" />
    </>
  ),
  undyneEnergySpear: (
    <>
      <path d="M12 21V9" strokeWidth={2} />
      <path d="M12 2.5l2.6 6.5H9.4z" />
      <path d={star(5, 8, 2.6, 0.9, 4)} />
      <path d={star(19, 14, 2.6, 0.9, 4)} />
    </>
  ),
  undyneSwitchDirection: (
    <>
      <path d="M4 8.5h13M14 5.5l3 3-3 3" />
      <path d="M20 15.5H7M10 12.5l-3 3 3 3" />
    </>
  ),
  undyneUndying: (
    <>
      <g transform="translate(12 15) scale(0.78) translate(-12 -13)" strokeWidth={2.2}>
        <path d={HEART} />
      </g>
      <path d="M12 7c-1.3-1-1.5-2.4 0-4.5 1.5 2.1 1.3 3.5 0 4.5z" />
      <path d="M8 5.5c-.8-.6-.9-1.6 0-2.8.9 1.2.8 2.2 0 2.8zM16 5.5c-.8-.6-.9-1.6 0-2.8.9 1.2.8 2.2 0 2.8z" />
    </>
  ),

  // Zoro
  zoroCheatedDeath: (
    <>
      <path d={HEART} />
      <path d="M7.5 9.5l9 7" />
      <path d="M9 9.8l-.8 1.4M11.4 11.6l-.8 1.4M13.8 13.4l-.8 1.4" />
    </>
  ),
  zoro3SwordStyle: (
    <>
      <path d="M12 2.5V17M9.5 17h5M12 17v4.5" />
      <path d="M4 5l11 11M20 5 9 16" />
      <path d="M13.5 17.5 17 14M10.5 17.5 7 14" />
    </>
  ),
  zoroOniGiri: (
    <>
      <path d="M3.5 17C9 14 13.5 9.5 16.5 3.5" />
      <path d="M6 20.5c5.5-3 10-7.5 13-13.5" />
      <path d="M10 21.5c4-2.5 7.5-6 10.5-10.5" />
    </>
  ),
  zoroAsura: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="6" cy="6.5" r="1.8" />
      <circle cx="18" cy="6.5" r="1.8" />
      <path d={rays(12, 12, 5, 10, 9, -Math.PI / 2)} />
    </>
  ),
  zoroDetermination: <path d="M6 10l6-5 6 5M6 15l6-5 6 5M6 20l6-5 6 5" />,
};

function RuneSvg({ children }: { children: ReactNode }) {
  return (
    <svg
      className="rune-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function hasAbilityRune(abilityId: string): boolean {
  return Object.prototype.hasOwnProperty.call(ABILITY_RUNES, abilityId);
}

/** The glyph for an ability, or null when it has none (the caller falls back to the type rune). */
export function AbilityRuneGlyph({ abilityId }: { abilityId: string }) {
  if (!hasAbilityRune(abilityId)) return null;
  return <RuneSvg>{ABILITY_RUNES[abilityId]}</RuneSvg>;
}

export function ActionRuneGlyph({ action }: { action: ActionRuneId }) {
  return <RuneSvg>{ACTION_RUNES[action]}</RuneSvg>;
}
