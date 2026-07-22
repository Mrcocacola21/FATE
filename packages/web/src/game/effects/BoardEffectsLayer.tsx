import type { CSSProperties, FC } from "react";
import type { Coord, PlayerView } from "rules";
import type { Translate } from "../../i18n";
import type {
  BoardPreviewLine,
  EffectLabel,
  QueuedBoardEffect,
} from "./types";

interface BoardEffectsLayerProps {
  effects: QueuedBoardEffect[];
  previewLines?: readonly BoardPreviewLine[];
  view: PlayerView;
  boardSize: number;
  cellSize: number;
  isFlipped: boolean;
  reducedMotion: boolean;
  t: Translate;
}

type EffectStyle = CSSProperties & {
  "--effect-duration"?: string;
  "--effect-delay"?: string;
};

function effectStyle(effect: QueuedBoardEffect): EffectStyle {
  return {
    "--effect-duration": `${Math.max(100, effect.expiresAt - effect.startedAt)}ms`,
    "--effect-delay": `${Math.max(0, effect.startedAt - Date.now())}ms`,
  };
}

function labelText(label: EffectLabel, t: Translate): string {
  return t(`effects.${label}`);
}

function toViewCoord(coord: Coord, boardSize: number, isFlipped: boolean): Coord {
  const maxIndex = boardSize - 1;
  return isFlipped
    ? { col: maxIndex - coord.col, row: maxIndex - coord.row }
    : coord;
}

function cellTopLeft(
  coord: Coord,
  boardSize: number,
  cellSize: number,
  isFlipped: boolean,
) {
  const viewCoord = toViewCoord(coord, boardSize, isFlipped);
  return {
    left: viewCoord.col * cellSize,
    top: (boardSize - 1 - viewCoord.row) * cellSize,
  };
}

function cellCenter(
  coord: Coord,
  boardSize: number,
  cellSize: number,
  isFlipped: boolean,
) {
  const topLeft = cellTopLeft(coord, boardSize, cellSize, isFlipped);
  return {
    x: topLeft.left + cellSize / 2,
    y: topLeft.top + cellSize / 2,
  };
}

function Segment({
  from,
  to,
  boardSize,
  cellSize,
  isFlipped,
  className,
  style,
}: {
  from: Coord;
  to: Coord;
  boardSize: number;
  cellSize: number;
  isFlipped: boolean;
  className: string;
  style?: EffectStyle;
}) {
  const start = cellCenter(from, boardSize, cellSize, isFlipped);
  const end = cellCenter(to, boardSize, cellSize, isFlipped);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return (
    <span
      className="absolute origin-left"
      style={{
        left: start.x,
        top: start.y,
        width: length,
        transform: `rotate(${angle}deg)`,
      }}
    >
      <span className={className} style={style} />
    </span>
  );
}

export const BoardEffectsLayer: FC<BoardEffectsLayerProps> = ({
  effects,
  previewLines = [],
  view,
  boardSize,
  cellSize,
  isFlipped,
  reducedMotion,
  t,
}) => {
  return (
    <div
      className={`pointer-events-none absolute left-0 top-0 z-30 overflow-visible ${
        reducedMotion ? "board-effects-reduced-motion" : ""
      }`}
      style={{ width: boardSize * cellSize, height: boardSize * cellSize }}
      aria-hidden="true"
    >
      {previewLines.map((previewLine, index) => (
        <Segment
          key={`${previewLine.from.col},${previewLine.from.row}-${previewLine.to.col},${previewLine.to.row}-${index}`}
          from={previewLine.from}
          to={previewLine.to}
          boardSize={boardSize}
          cellSize={cellSize}
          isFlipped={isFlipped}
          className={`board-preview-beam board-preview-beam-${previewLine.tone}`}
        />
      ))}
      {effects.map((effect) => {
        const style = effectStyle(effect);
        switch (effect.kind) {
          case "cellPulse":
          case "areaHighlight":
            return effect.cells.map((coord, index) => {
              const position = cellTopLeft(coord, boardSize, cellSize, isFlipped);
              return (
                <span
                  key={`${effect.id}-${index}`}
                  className={`absolute rounded-lg ${
                    effect.kind === "cellPulse"
                      ? `board-effect-cell board-effect-cell-${effect.tone}`
                      : `board-effect-area board-effect-area-${effect.tone}`
                  }`}
                  style={{
                    ...position,
                    width: cellSize,
                    height: cellSize,
                    ...style,
                  }}
                />
              );
            });
          case "beam":
            return (
              <Segment
                key={effect.id}
                from={effect.from}
                to={effect.to}
                boardSize={boardSize}
                cellSize={cellSize}
                isFlipped={isFlipped}
                className={`board-effect-beam board-effect-beam-${effect.tone}`}
                style={style}
              />
            );
          case "movementTrail":
            return (
              <span key={effect.id}>
                {effect.path.slice(1).map((coord, index) => (
                  <Segment
                    key={`${effect.id}-segment-${index}`}
                    from={effect.path[index]}
                    to={coord}
                    boardSize={boardSize}
                    cellSize={cellSize}
                    isFlipped={isFlipped}
                    className={`board-effect-trail board-effect-trail-${
                      effect.tone ?? "move"
                    }`}
                    style={style}
                  />
                ))}
                {effect.path.map((coord, index) => {
                  const center = cellCenter(coord, boardSize, cellSize, isFlipped);
                  const dotSize = Math.max(5, Math.round(cellSize * 0.12));
                  return (
                    <span
                      key={`${effect.id}-dot-${index}`}
                      className={`absolute rounded-full board-effect-trail-dot board-effect-trail-${
                        effect.tone ?? "move"
                      }`}
                      style={{
                        left: center.x - dotSize / 2,
                        top: center.y - dotSize / 2,
                        width: dotSize,
                        height: dotSize,
                        ...style,
                      }}
                    />
                  );
                })}
              </span>
            );
          case "floatingText": {
            const center = cellCenter(effect.coord, boardSize, cellSize, isFlipped);
            return (
              <span
                key={effect.id}
                className={`board-effect-text board-effect-text-${effect.tone}`}
                style={{ left: center.x, top: center.y, ...style }}
              >
                {effect.text ?? (effect.label ? labelText(effect.label, t) : "")}
              </span>
            );
          }
          case "unitFlash": {
            const coord = effect.coord ?? view.units[effect.unitId]?.position;
            if (!coord) return null;
            const position = cellTopLeft(coord, boardSize, cellSize, isFlipped);
            const inset = Math.max(2, Math.round(cellSize * 0.08));
            return (
              <span
                key={effect.id}
                className={`absolute rounded-xl board-effect-unit board-effect-unit-${effect.tone}`}
                style={{
                  left: position.left + inset,
                  top: position.top + inset,
                  width: cellSize - inset * 2,
                  height: cellSize - inset * 2,
                  ...style,
                }}
              />
            );
          }
          case "boardPulse":
            return (
              <span
                key={effect.id}
                className={`absolute inset-0 rounded-xl board-effect-board board-effect-board-${effect.tone}`}
                style={style}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
};
