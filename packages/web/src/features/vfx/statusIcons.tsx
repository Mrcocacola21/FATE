/**
 * Status badge glyphs on a 16×16 grid. Badges are 12px on the board, so every icon stays a
 * single bold silhouette. Statuses that mean the same thing to the player share an icon;
 * their localized titles still tell them apart.
 */
const SHIELD = "M8 1.8l5 2v4.4c0 3-2 5-5 6-3-1-5-3-5-6V3.8Z";
const EYE = "M1.8 8S4.3 3.8 8 3.8 14.2 8 14.2 8 11.7 12.2 8 12.2 1.8 8 1.8 8Z";
const COIN = "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Z";

const STATUS_ICON_PATHS = {
  moveLock: "M2 8h7M6 5l3 3-3 3M12.8 3v10",
  snare: "M3 3l10 10M13 3 3 13M8 2v12M2 8h12",
  blind: `${EYE}M3 13.5 13 2.5`,
  curse: "M8 8.2a1.8 1.8 0 1 1 1.8 1.8 3.9 3.9 0 1 1 3-6.4",
  stealthBlocked: "M3.5 13c0-6 1.8-10 4.5-10s4.5 4 4.5 10M2 14.5 14 1.5",
  gavel: "M6 2.5l5 5M8.5 1.5 13 6M8.3 6.3 2.5 12.5M9 14h5",
  coinMinus: `${COIN}M5.3 8h5.4`,
  coinPlus: `${COIN}M5.3 8h5.4M8 5.3v5.4`,
  hood: "M3.5 13.5c0-6.5 1.8-11 4.5-11s4.5 4.5 4.5 11M6 8.5h4",
  crosshair: "M8 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM8 1v3M8 12v3M1 8h3M12 8h3",
  bunker: "M2 13.5V9a6 6 0 0 1 12 0v4.5ZM5.5 13.5V10.5h5v3",
  heart:
    "M8 13.8S2.8 10.6 2.8 6.4a2.7 2.7 0 0 1 5.2-1 2.7 2.7 0 0 1 5.2 1C13.2 10.6 8 13.8 8 13.8Z",
  shieldCheck: `${SHIELD}M5.3 8l2 2 3.4-3.8`,
  shieldBolt: `${SHIELD}M9.2 4.5 6.5 8.5h3l-2.7 3.3`,
  axe: "M3.5 14.5 10.5 3M8 2c3.5 0 6 2.3 6 5.5-3 0-5.3-1.3-6-3.5",
  eye: `${EYE}M8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z`,
  hourglass: "M4 2h8M4 14h8M5 2c0 3.5 6 5 6 12M11 2c0 3.5-6 5-6 12",
  dagger: "M8 1.5v8.5M5 10h6M8 10v4.5",
  diagonal: "M3 13 13 3M6.5 3H13v6.5",
  scroll: "M4 2.5h8.5V12a2 2 0 0 1-2 2H5M6.5 6H10M6.5 9H10",
  charge: "M3 3l5 5-5 5M8 3l5 5-5 5",
  extraMove: "M1.5 9H9M6 6l3 3-3 3M12.5 2v5M10 4.5h5",
  tear: "M8 1.8c3.2 4.2 4.3 6.2 4.3 8a4.3 4.3 0 0 1-8.6 0c0-1.8 1.1-3.8 4.3-8Z",
  plus: "M8 2.5v11M2.5 8h11",
  globalMove: "M8 1.5v13M1.5 8h13M6 3.5l2-2 2 2M6 12.5l2 2 2-2M3.5 6l-2 2 2 2M12.5 6l2 2-2 2",
  transform:
    "M3 6.5a5 5 0 0 1 9-2.5M12.8 1.5V4.8H9.5M13 9.5a5 5 0 0 1-9 2.5M3.2 14.5V11.2H6.5",
  boat: "M2 9.5h12l-2 4H4ZM8 9.5V2.5l4 4.5",
  longBone:
    "M4.5 11.5 11.5 4.5M11.5 4.5a1.7 1.7 0 1 1 2-2 1.7 1.7 0 1 1-2 2ZM4.5 11.5a1.7 1.7 0 1 0-2 2 1.7 1.7 0 1 0 2-2Z",
  pause: "M5.5 3.5v9M10.5 3.5v9",
  crown: "M2 12.5V5l3 3 3-5 3 5 3-3v7.5Z",
  banner: "M4 14V2m0 0h8l-2 3 2 3H4",
} as const;

export type StatusIconName = keyof typeof STATUS_ICON_PATHS;

export function StatusIcon({ name }: { name: StatusIconName }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={STATUS_ICON_PATHS[name]} />
    </svg>
  );
}

/** An enemy's last known position: the hood from the stealth badge inside a dashed ring. */
export function HiddenFigureMarker({ count, size }: { count: number; size: number }) {
  return (
    <div
      className="hidden-figure-marker"
      data-last-known-count={count}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 56 56" aria-hidden="true" fill="none">
        <circle
          className="hidden-figure-marker__ring"
          cx="28"
          cy="28"
          r="26"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 5"
        />
        <path
          d="M14 46c0-20 6-32 14-32s14 12 14 32Z"
          fill="#5b21b6"
          stroke="#c4b5fd"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M22 28c2-4 10-4 12 0-2 5-10 5-12 0Z" fill="#0b0c0f" />
      </svg>
      {count > 1 && <span className="hidden-figure-marker__count">{count}</span>}
    </div>
  );
}
