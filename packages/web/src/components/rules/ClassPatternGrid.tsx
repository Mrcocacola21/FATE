import type { CSSProperties, FC } from "react";
import { useI18n } from "../../i18n";
import { getClassLabel } from "../../i18n/displayMetadata";

type Cell = readonly [number, number];
const ORTHOGONAL: Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONAL: Cell[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const LINES: Cell[] = [...ORTHOGONAL, ...DIAGONAL];
const RADIUS = 2;

const scale = (directions: Cell[], distance: number): Cell[] =>
  directions.map(([dx, dy]) => [dx * distance, dy * distance] as const);
function ring(directions: Cell[], distance: number): Cell[] {
  return Array.from({ length: distance }, (_, step) => scale(directions, step + 1)).flat();
}
const adjacent = ring(LINES, 1);
const lines2 = ring(LINES, 2);
const orthogonal2 = ring(ORTHOGONAL, 2);
const square2: Cell[] = [];
for (let x = -RADIUS; x <= RADIUS; x++)
  for (let y = -RADIUS; y <= RADIUS; y++) if (x || y) square2.push([x, y]);

/** One diagram: cells reached, plus lines that keep going to the board edge. */
interface Variant {
  /** Die result this diagram is for; absent when the pattern needs no roll. */
  roll?: string;
  move: Cell[];
  attack: Cell[];
  moveRays?: Cell[];
  attackRays?: Cell[];
  /** The move reaches every empty cell of the board, not only this 5x5 window. */
  wholeBoard?: boolean;
}

/** Berserker's d6 arcs, as in rules/src/movement/rollMoves.ts (y grows north). */
const BERSERKER_ROLLS: Cell[][] = [
  [[0, 1], [1, 1], [-1, 1]],
  [[0, -1], [1, -1], [-1, -1]],
  [[-1, 0], [-1, 1], [-1, -1]],
  [[1, 0], [1, 1], [1, -1]],
  adjacent,
  [...adjacent, ...scale(LINES, 2)],
];

/**
 * Patterns follow the rulebook's Class Mechanics. Dice-based classes show their attack once,
 * then the move of every roll result; `span` lets those cards take a row of their own.
 */
const PATTERNS: ReadonlyArray<{ unitClass: string; variants: Variant[]; span?: string }> = [
  { unitClass: "spearman", variants: [{ move: adjacent, attack: lines2 }] },
  {
    unitClass: "rider",
    variants: [{ move: [...orthogonal2, ...DIAGONAL], moveRays: ORTHOGONAL, attack: adjacent }],
  },
  { unitClass: "knight", variants: [{ move: adjacent, attack: adjacent }] },
  { unitClass: "archer", variants: [{ move: adjacent, attack: lines2, attackRays: LINES }] },
  { unitClass: "assassin", variants: [{ move: lines2, attack: adjacent }] },
  {
    unitClass: "trickster",
    span: "col-span-full lg:col-span-3",
    variants: [
      { move: [], attack: square2 },
      { roll: "1–4", move: square2, attack: [] },
      { roll: "5–6", move: square2, attack: [], wholeBoard: true },
    ],
  },
  {
    unitClass: "berserker",
    span: "col-span-full",
    variants: [
      { move: [], attack: adjacent },
      ...BERSERKER_ROLLS.map((move, index) => ({ roll: String(index + 1), move, attack: [] })),
    ],
  },
];

const key = ([x, y]: Cell) => `${x},${y}`;
const windowCells: Cell[] = [];
for (let y = RADIUS; y >= -RADIUS; y--)
  for (let x = -RADIUS; x <= RADIUS; x++) windowCells.push([x, y]);

/** Screen angle of a direction whose y axis points north. */
const rayAngle = ([dx, dy]: Cell) => `${(Math.atan2(-dy, dx) * 180) / Math.PI}deg`;

const PatternCells: FC<{ variant: Variant; className: string; label?: string; attack?: boolean }> = ({
  variant,
  className,
  label,
  attack = true,
}) => {
  const moveCells = new Set(variant.move.map(key));
  const attackCells = new Set(attack ? variant.attack.map(key) : []);
  const rays = new Map<string, { kind: "move" | "attack"; direction: Cell }>();
  for (const direction of variant.moveRays ?? [])
    rays.set(key(scale([direction], RADIUS)[0]), { kind: "move", direction });
  if (attack)
    for (const direction of variant.attackRays ?? [])
      rays.set(key(scale([direction], RADIUS)[0]), { kind: "attack", direction });
  return (
    <span
      className={className}
      data-whole-board={variant.wholeBoard ? "true" : undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      {windowCells.map((cell) => {
        const id = key(cell);
        const ray = rays.get(id);
        return (
          <span
            key={id}
            className="class-pattern-cell"
            data-move={String(moveCells.has(id))}
            data-attack={String(attackCells.has(id))}
            data-self={String(cell[0] === 0 && cell[1] === 0)}
            data-ray={ray?.kind}
            style={ray ? ({ "--ray-angle": rayAngle(ray.direction) } as CSSProperties) : undefined}
          />
        );
      })}
    </span>
  );
};

/** Movement-only 5x5 preview of one class, used where a figure picks how to move. */
export const MovePatternMini: FC<{ unitClass: string }> = ({ unitClass }) => {
  const pattern = PATTERNS.find((entry) => entry.unitClass === unitClass);
  if (!pattern) return null;
  // A rolled move shows everything the die can allow: its last, widest result.
  const variant = pattern.variants[pattern.variants.length - 1];
  return <PatternCells variant={variant} className="class-pattern class-pattern--mini" attack={false} />;
};

export const ClassPatternGrid: FC = () => {
  const { t } = useI18n();
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      data-testid="class-pattern-grid"
    >
      {PATTERNS.map(({ unitClass, variants, span }) => {
        const label = getClassLabel(unitClass, t);
        const ariaLabel = `${label}: ${t("game.move")} / ${t("game.attack")}`;
        return (
          <figure
            key={unitClass}
            className={`panel-card-muted m-0 flex flex-col items-center gap-2 p-3${span ? ` ${span}` : ""}`}
          >
            {variants.length === 1 ? (
              <PatternCells variant={variants[0]} className="class-pattern" label={ariaLabel} />
            ) : (
              <div className="class-pattern-rolls" role="group" aria-label={ariaLabel}>
                {variants.map((variant) => (
                  <div key={variant.roll ?? "attack"} className="class-pattern-roll">
                    <PatternCells
                      variant={variant}
                      className="class-pattern class-pattern--roll"
                      label={variant.roll ? `${label}, d6 ${variant.roll}` : `${label}: ${t("game.attack")}`}
                    />
                    <span className="class-pattern-roll-label">
                      {variant.roll ? (
                        <span className="class-pattern-die">{variant.roll}</span>
                      ) : (
                        t("game.attack")
                      )}
                      {variant.wholeBoard ? t("rules.patternWholeBoard") : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <figcaption className="font-display text-sm font-semibold">{label}</figcaption>
          </figure>
        );
      })}
    </div>
  );
};
