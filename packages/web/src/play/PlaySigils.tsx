/** Gold line sigils of the Play page: one per way to start a battle, and the difficulty seals. */

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function RatedSigil() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" {...line}>
      <path d="M6 22 4.5 10l6.5 5L16 6l5 9 6.5-5L26 22Z" />
      <path d="M6.5 26h19" />
      <circle cx="16" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CasualSigil() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" {...line}>
      <path d="M6 5l14 14M5 5h4l13 13" />
      <path d="M26 5L12 19M27 5h-4L10 18" />
      <path d="M17.5 21.5l4 4M21.5 17.5l4 4M14.5 21.5l-4 4M10.5 17.5l-4 4" />
      <path d="M24 26.5l2.5-2.5M8 26.5 5.5 24" />
    </svg>
  );
}

export function BotSigil() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" {...line}>
      <path d="M16 3.5 28.5 26h-25Z" />
      <path d="M9 19.5c4.2-5 9.8-5 14 0-4.2 5-9.8 5-14 0Z" />
      <circle cx="16" cy="19.5" r="2.2" />
    </svg>
  );
}

export type BotDifficulty = "apprentice" | "sorcerer" | "archmage";
export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ["apprentice", "sorcerer", "archmage"];

/** A star whose ray count grows with the difficulty: four, six, then eight. */
function starPath(rays: number, outer: number, inner: number): string {
  const points: string[] = [];
  for (let i = 0; i < rays * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / rays - Math.PI / 2;
    points.push(`${(32 + r * Math.cos(a)).toFixed(2)},${(32 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

const RAYS: Record<BotDifficulty, number> = { apprentice: 4, sorcerer: 6, archmage: 8 };

/** A wax seal stamped with the difficulty's star. */
export function DifficultySeal({ level }: { level: BotDifficulty }) {
  const rays = RAYS[level];
  return (
    <svg className="difficulty-seal" viewBox="0 0 64 64" data-level={level} aria-hidden="true">
      <path
        className="difficulty-seal__wax"
        d="M32 3c5 0 7 3 11 4s8 0 10.5 4 1 7.5 3 11 5 6 5 10-3 6.5-5 10-.5 7.5-3 11-6.5 3-10.5 4-6 4-11 4-7-3-11-4-8 0-10.5-4-1-7.5-3-11S3 36 3 32s3-6.5 5-10 .5-7.5 3-11 6.5-3 10.5-4S27 3 32 3Z"
      />
      <circle className="difficulty-seal__ring" cx="32" cy="32" r="21" />
      <path className="difficulty-seal__star" d={starPath(rays, 15, rays === 4 ? 4.5 : 6)} />
      {level === "archmage" && <circle className="difficulty-seal__ring" cx="32" cy="32" r="6" />}
      {level !== "apprentice" && (
        <circle
          className="difficulty-seal__dot"
          cx="32"
          cy="32"
          r={level === "archmage" ? 2.2 : 2}
        />
      )}
    </svg>
  );
}
