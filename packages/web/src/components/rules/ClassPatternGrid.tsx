import type { FC } from "react";
import { useI18n } from "../../i18n";
import { getClassLabel } from "../../i18n/displayMetadata";

type Cell = readonly [number, number];
const LINES: Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const RADIUS = 2;

function ring(distance: number): Cell[] {
  return LINES.flatMap(([dx, dy]) =>
    Array.from({ length: distance }, (_, step) => [dx * (step + 1), dy * (step + 1)] as const),
  );
}
const adjacent = ring(1);
const lines2 = ring(2);
const orthogonal2: Cell[] = [
  [1, 0],
  [2, 0],
  [-1, 0],
  [-2, 0],
  [0, 1],
  [0, 2],
  [0, -1],
  [0, -2],
];
const diagonal1: Cell[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const square2: Cell[] = [];
for (let x = -RADIUS; x <= RADIUS; x++)
  for (let y = -RADIUS; y <= RADIUS; y++) if (x || y) square2.push([x, y]);

/** Patterns follow the rulebook's Class Mechanics; dice-based moves show their widest result. */
const PATTERNS: ReadonlyArray<{ unitClass: string; move: Cell[]; attack: Cell[] }> = [
  { unitClass: "spearman", move: adjacent, attack: lines2 },
  { unitClass: "rider", move: [...orthogonal2, ...diagonal1], attack: adjacent },
  { unitClass: "knight", move: adjacent, attack: adjacent },
  { unitClass: "archer", move: adjacent, attack: lines2 },
  { unitClass: "trickster", move: square2, attack: square2 },
  { unitClass: "assassin", move: lines2, attack: adjacent },
  {
    unitClass: "berserker",
    move: [...adjacent, [2, 0], [-2, 0], [0, 2], [0, -2]],
    attack: adjacent,
  },
];

const key = ([x, y]: Cell) => `${x},${y}`;

/** Movement-only 5x5 preview of one class, used where a figure picks how to move. */
export const MovePatternMini: FC<{ unitClass: string }> = ({ unitClass }) => {
  const pattern = PATTERNS.find((entry) => entry.unitClass === unitClass);
  if (!pattern) return null;
  const moveCells = new Set(pattern.move.map(key));
  const cells: Cell[] = [];
  for (let y = RADIUS; y >= -RADIUS; y--)
    for (let x = -RADIUS; x <= RADIUS; x++) cells.push([x, y]);
  return (
    <span className="class-pattern class-pattern--mini" aria-hidden="true">
      {cells.map((cell) => {
        const id = key(cell);
        return (
          <span
            key={id}
            className="class-pattern-cell"
            data-move={String(moveCells.has(id))}
            data-attack="false"
            data-self={String(cell[0] === 0 && cell[1] === 0)}
          />
        );
      })}
    </span>
  );
};

export const ClassPatternGrid: FC = () => {
  const { t } = useI18n();
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      data-testid="class-pattern-grid"
    >
      {PATTERNS.map(({ unitClass, move, attack }) => {
        const moveCells = new Set(move.map(key));
        const attackCells = new Set(attack.map(key));
        const cells: Cell[] = [];
        for (let y = RADIUS; y >= -RADIUS; y--)
          for (let x = -RADIUS; x <= RADIUS; x++) cells.push([x, y]);
        const label = getClassLabel(unitClass, t);
        return (
          <figure
            key={unitClass}
            className="panel-card-muted m-0 flex flex-col items-center gap-2 p-3"
          >
            <div
              className="class-pattern"
              role="img"
              aria-label={`${label}: ${t("game.move")} / ${t("game.attack")}`}
            >
              {cells.map((cell) => {
                const id = key(cell);
                const self = cell[0] === 0 && cell[1] === 0;
                return (
                  <span
                    key={id}
                    className="class-pattern-cell"
                    data-move={String(moveCells.has(id))}
                    data-attack={String(attackCells.has(id))}
                    data-self={String(self)}
                  />
                );
              })}
            </div>
            <figcaption className="font-display text-sm font-semibold">{label}</figcaption>
          </figure>
        );
      })}
    </div>
  );
};
