import type { GameState, PlayerId } from "rules";
import type { FC } from "react";

interface BoardProps {
  view: GameState;
  playerId: PlayerId;
  selectedUnitId: string | null;
  onSelectUnit: (unitId: string | null) => void;
  onCellClick: (col: number, row: number) => void;
}

function getUnitLabel(unitClass: string): string {
  return unitClass.charAt(0).toUpperCase();
}

export const Board: FC<BoardProps> = ({
  view,
  playerId,
  selectedUnitId,
  onSelectUnit,
  onCellClick,
}) => {
  const size = view.boardSize ?? 9;
  const unitsByPos = new Map<
    string,
    { id: string; owner: PlayerId; class: string; isStealthed: boolean }
  >();

  for (const unit of Object.values(view.units)) {
    if (!unit.position) continue;
    unitsByPos.set(`${unit.position.col},${unit.position.row}`, {
      id: unit.id,
      owner: unit.owner,
      class: unit.class,
      isStealthed: unit.isStealthed,
    });
  }

  const rows = [] as JSX.Element[];

  for (let row = size - 1; row >= 0; row -= 1) {
    const cells: JSX.Element[] = [];
    for (let col = 0; col < size; col += 1) {
      const key = `${col},${row}`;
      const unit = unitsByPos.get(key);
      const isSelected = unit?.id === selectedUnitId;
      const isDark = (row + col) % 2 === 1;

      const cellClasses = [
        "w-12",
        "h-12",
        "border",
        "border-slate-200",
        "flex",
        "items-center",
        "justify-center",
        "cursor-pointer",
        isDark ? "bg-amber-100" : "bg-white",
        isSelected ? "ring-2 ring-teal-500" : "",
      ].join(" ");

      let content: JSX.Element | null = null;
      if (unit) {
        const isFriendly = unit.owner === playerId;
        const isHiddenEnemy = !isFriendly && unit.isStealthed;

        const badgeClasses = [
          "w-8",
          "h-8",
          "rounded-full",
          "flex",
          "items-center",
          "justify-center",
          "text-xs",
          "font-semibold",
          "shadow",
          isFriendly ? "bg-emerald-500 text-white" : "bg-rose-500 text-white",
        ].join(" ");

        content = (
          <div className={badgeClasses}>
            {isHiddenEnemy ? "?" : getUnitLabel(unit.class)}
          </div>
        );
      }

      cells.push(
        <div
          key={key}
          className={cellClasses}
          onClick={() => {
            if (unit && unit.owner === playerId) {
              onSelectUnit(unit.id);
              return;
            }
            onCellClick(col, row);
          }}
        >
          {content}
        </div>
      );
    }
    rows.push(
      <div key={`row-${row}`} className="flex">
        {cells}
      </div>
    );
  }

  return <div className="inline-block">{rows}</div>;
};
