import type { Coord, PlayerId, PlayerView } from "rules";
import { TRICKSTER_AOE_ID, TRICKSTER_AOE_RADIUS, getMaxHp } from "../rulesHints";
import type { FC } from "react";
import { HpBar } from "./HpBar";

interface BoardProps {
  view: PlayerView;
  playerId: PlayerId | null;
  selectedUnitId: string | null;
  highlightedCells: Record<string, "place" | "move" | "attack">;
  hoveredAbilityId?: string | null;
  disabled?: boolean;
  onSelectUnit: (unitId: string | null) => void;
  onCellClick: (col: number, row: number) => void;
}

function getUnitLabel(unitClass: string): string {
  return unitClass.charAt(0).toUpperCase();
}

function getClassMarker(unitClass: string): string | null {
  if (unitClass === "assassin") return "D";
  if (unitClass === "archer") return "B";
  return null;
}

function getHighlightClass(kind: "place" | "move" | "attack") {
  switch (kind) {
    case "place":
      return "bg-emerald-300/35";
    case "move":
      return "bg-sky-300/35";
    case "attack":
      return "bg-rose-300/40";
    default:
      return "";
  }
}

function getAoEHighlightClass(kind: "aoe" | "aoeDisabled") {
  return kind === "aoe" ? "bg-amber-400/25" : "bg-slate-400/20";
}

function coordKey(coord: Coord): string {
  return `${coord.col},${coord.row}`;
}

export const Board: FC<BoardProps> = ({
  view,
  playerId,
  selectedUnitId,
  highlightedCells,
  hoveredAbilityId,
  disabled = false,
  onSelectUnit,
  onCellClick,
}) => {
  const size = view.boardSize ?? 9;
  const maxIndex = size - 1;
  const isFlipped = playerId === "P2";
  const toViewCoord = (coord: Coord): Coord =>
    isFlipped
      ? { col: maxIndex - coord.col, row: maxIndex - coord.row }
      : coord;
  const toGameCoord = (coord: Coord): Coord =>
    isFlipped
      ? { col: maxIndex - coord.col, row: maxIndex - coord.row }
      : coord;

  const unitsByPos = new Map<
    string,
    { id: string; owner: PlayerId; class: string; isStealthed: boolean }
  >();
  const lastKnownByPos = new Map<string, number>();
  const viewHighlights: Record<string, "place" | "move" | "attack"> = {};
  const aoeHighlights = new Map<string, "aoe" | "aoeDisabled">();

  for (const unit of Object.values(view.units)) {
    if (!unit.position) continue;
    const viewPos = toViewCoord(unit.position);
    unitsByPos.set(coordKey(viewPos), {
      id: unit.id,
      owner: unit.owner,
      class: unit.class,
      isStealthed: unit.isStealthed,
    });
  }
  for (const coord of Object.values(view.lastKnownPositions ?? {})) {
    const viewPos = toViewCoord(coord);
    const key = coordKey(viewPos);
    lastKnownByPos.set(key, (lastKnownByPos.get(key) ?? 0) + 1);
  }
  for (const [key, kind] of Object.entries(highlightedCells)) {
    const [colRaw, rowRaw] = key.split(",");
    const col = Number(colRaw);
    const row = Number(rowRaw);
    if (Number.isNaN(col) || Number.isNaN(row)) continue;
    const viewPos = toViewCoord({ col, row });
    viewHighlights[coordKey(viewPos)] = kind;
  }

  const selectedUnit =
    selectedUnitId && view.units[selectedUnitId]
      ? view.units[selectedUnitId]
      : null;
  const isMyTurn = playerId ? view.currentPlayer === playerId : false;
  const isActive = selectedUnit ? view.activeUnitId === selectedUnit.id : false;
  const abilityAvailable = selectedUnit?.class === "trickster";
  const economy = selectedUnit?.turn ?? {
    moveUsed: false,
    attackUsed: false,
    actionUsed: false,
    stealthUsed: false,
  };
  const abilityEnabled =
    !disabled &&
    isMyTurn &&
    isActive &&
    abilityAvailable &&
    selectedUnit?.owner === playerId &&
    !economy.attackUsed &&
    !economy.actionUsed;

  if (
    hoveredAbilityId === TRICKSTER_AOE_ID &&
    isMyTurn &&
    abilityAvailable &&
    selectedUnit?.position
  ) {
    const kind: "aoe" | "aoeDisabled" = abilityEnabled ? "aoe" : "aoeDisabled";
    for (
      let dc = -TRICKSTER_AOE_RADIUS;
      dc <= TRICKSTER_AOE_RADIUS;
      dc += 1
    ) {
      for (
        let dr = -TRICKSTER_AOE_RADIUS;
        dr <= TRICKSTER_AOE_RADIUS;
        dr += 1
      ) {
        const col = selectedUnit.position.col + dc;
        const row = selectedUnit.position.row + dr;
        if (col < 0 || row < 0 || col >= size || row >= size) continue;
        const viewPos = toViewCoord({ col, row });
        aoeHighlights.set(coordKey(viewPos), kind);
      }
    }
  }

  const rows = [] as JSX.Element[];

  for (let row = size - 1; row >= 0; row -= 1) {
    const cells: JSX.Element[] = [];
    for (let col = 0; col < size; col += 1) {
      const viewCoord = { col, row };
      const gameCoord = toGameCoord(viewCoord);
      const key = coordKey(viewCoord);
      const unit = unitsByPos.get(key);
      const isSelected = unit?.id === selectedUnitId;
      const isDark = (row + col) % 2 === 1;
      const highlightKind = viewHighlights[key];
      const aoeKind = aoeHighlights.get(key);

      const cellClasses = [
        "relative",
        "w-12",
        "h-12",
        "border",
        "border-slate-200",
        "flex",
        "items-center",
        "justify-center",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
        isDark ? "bg-amber-100" : "bg-white",
        isSelected ? "ring-2 ring-teal-500" : "",
      ].join(" ");

      let content: JSX.Element | null = null;
      const lastKnownCount = lastKnownByPos.get(key) ?? 0;

      if (unit) {
        const isFriendly = playerId ? unit.owner === playerId : unit.owner === "P1";
        const isHiddenEnemy = !isFriendly && unit.isStealthed;
        const marker = getClassMarker(unit.class);

        const badgeClasses = [
          "relative",
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
            {!isHiddenEnemy && marker && (
              <span className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-[9px] font-bold text-slate-700 shadow">
                {marker}
              </span>
            )}
          </div>
        );
      } else if (lastKnownCount > 0) {
        const label = lastKnownCount > 1 ? `?${lastKnownCount}` : "?";
        content = (
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-slate-400 text-xs font-semibold text-slate-500">
            {label}
          </div>
        );
      }

      cells.push(
        <div
          key={key}
          className={cellClasses}
          onClick={() => {
            if (disabled) return;
            if (unit && playerId && unit.owner === playerId) {
              onSelectUnit(unit.id);
              return;
            }
            onCellClick(gameCoord.col, gameCoord.row);
          }}
        >
          {highlightKind && (
            <div
              className={`pointer-events-none absolute inset-1 rounded ${getHighlightClass(
                highlightKind
              )}`}
            />
          )}
          {aoeKind && (
            <div
              className={`pointer-events-none absolute inset-1 rounded ${getAoEHighlightClass(
                aoeKind
              )}`}
            />
          )}
          {content}
          {unit && (
            <div className="pointer-events-none absolute bottom-1 left-1 right-1 z-10 flex justify-center">
              <HpBar
                current={view.units[unit.id]?.hp ?? 0}
                max={getMaxHp(unit.class)}
                showText={playerId ? unit.owner === playerId : false}
                className="w-10"
              />
            </div>
          )}
        </div>
      );
    }
    const rowLabel = isFlipped ? maxIndex - row : row;
    rows.push(
      <div key={`row-${row}`} className="flex">
        <div className="flex h-12 w-8 items-center justify-center text-xs font-semibold text-slate-500">
          {rowLabel}
        </div>
        {cells}
      </div>
    );
  }

  const colLabels = Array.from({ length: size }, (_, idx) =>
    String.fromCharCode(65 + idx)
  );
  if (isFlipped) {
    colLabels.reverse();
  }

  return (
    <div className="inline-block">
      <div className="flex">
        <div className="h-8 w-8" />
        {colLabels.map((label, index) => (
          <div
            key={`col-${label}-${index}`}
            className="flex h-8 w-12 items-center justify-center text-xs font-semibold text-slate-500"
          >
            {label}
          </div>
        ))}
      </div>
      {rows}
    </div>
  );
};
