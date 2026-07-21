import type { CSSProperties, FC } from "react";
import type { Coord, PlayerView } from "rules";
import {
  cellToBoardPoint,
  cellsToBoundingBox,
  lineBetweenCellsToCssTransform,
  pathCellsToSegments,
} from "./vfxGeometry";
import { vfxRegistry, type VfxDefinition } from "./vfxRegistry";
import { VfxSprite } from "./VfxSprite";
import type { QueuedBoardVfxRequest } from "./vfxTypes";

interface VfxLayerProps {
  effects: QueuedBoardVfxRequest[];
  view: PlayerView;
  boardSize: number;
  cellSize: number;
  isFlipped: boolean;
  reducedMotion: boolean;
}

type VfxStyle = CSSProperties & {
  "--vfx-delay"?: string;
  "--vfx-duration"?: string;
};

function effectTimingStyle(effect: QueuedBoardVfxRequest): VfxStyle {
  return {
    "--vfx-delay": `${Math.max(0, effect.startedAt - Date.now())}ms`,
    "--vfx-duration": `${Math.max(100, effect.expiresAt - effect.startedAt)}ms`,
  };
}

function unitCoord(view: PlayerView, effect: QueuedBoardVfxRequest): Coord | null {
  if (effect.placement === "unit" && effect.unitId) {
    const current = view.units[effect.unitId]?.position;
    if (current) return current;
  }
  if (effect.sourceCell) return effect.sourceCell;
  if (!effect.unitId) return null;
  return view.units[effect.unitId]?.position ?? null;
}

function centeredSpriteStyle(params: {
  coord: Coord;
  boardSize: number;
  cellSize: number;
  isFlipped: boolean;
  scaleCells: number;
  timing: VfxStyle;
}): CSSProperties {
  const center = cellToBoardPoint(
    params.coord,
    params.boardSize,
    params.cellSize,
    params.isFlipped,
  );
  const size = params.cellSize * params.scaleCells;
  return {
    left: center.x - size / 2,
    top: center.y - size / 2,
    width: size,
    height: size,
    ...params.timing,
  };
}

export const VfxLayer: FC<VfxLayerProps> = ({
  effects,
  view,
  boardSize,
  cellSize,
  isFlipped,
  reducedMotion,
}) => {
  return (
    <div
      className={`pointer-events-none absolute left-0 top-0 z-40 overflow-hidden ${
        reducedMotion ? "vfx-layer-reduced-motion" : ""
      }`}
      style={{ width: boardSize * cellSize, height: boardSize * cellSize }}
      aria-hidden="true"
    >
      {effects.map((effect) => {
        const definition = vfxRegistry[effect.effectId] as VfxDefinition;
        const timing = effectTimingStyle(effect);
        const scaleCells = effect.scaleCells ?? definition.defaultScaleCells;

        if (effect.placement === "line" && effect.sourceCell && effect.targetCell) {
          const line = lineBetweenCellsToCssTransform(
            effect.sourceCell,
            effect.targetCell,
            boardSize,
            cellSize,
            isFlipped,
          );
          return (
            <span
              key={effect.id}
              className={`vfx-line vfx-line-${effect.effectId}`}
              style={{
                left: line.left,
                top: line.top,
                width: line.width,
                transform: line.transform,
                backgroundImage: definition.asset ? `url(${definition.asset})` : undefined,
                ...timing,
              }}
            />
          );
        }

        if (effect.placement === "path" && effect.path && effect.path.length > 1) {
          const segments =
            definition.assetType === "proceduralPortal"
              ? []
              : pathCellsToSegments(effect.path).slice(0, 10);
          const first = effect.path[0];
          const last = effect.path[effect.path.length - 1];
          return (
            <span key={effect.id}>
              {segments.map((segment, index) => {
                const line = lineBetweenCellsToCssTransform(
                  segment.from,
                  segment.to,
                  boardSize,
                  cellSize,
                  isFlipped,
                );
                return (
                  <span
                    key={`${effect.id}-segment-${index}`}
                    className={`vfx-line vfx-line-${effect.effectId}`}
                    style={{
                      left: line.left,
                      top: line.top,
                      width: line.width,
                      transform: line.transform,
                      backgroundImage: definition.asset ? `url(${definition.asset})` : undefined,
                      ...timing,
                    }}
                  />
                );
              })}
              {[first, last].map((coord, index) => (
                <VfxSprite
                  key={`${effect.id}-endpoint-${index}`}
                  definition={definition}
                  reducedMotion={reducedMotion}
                  opacity={effect.opacity}
                  style={centeredSpriteStyle({
                    coord,
                    boardSize,
                    cellSize,
                    isFlipped,
                    scaleCells,
                    timing,
                  })}
                />
              ))}
            </span>
          );
        }

        if (effect.placement === "area" && effect.cells && effect.cells.length > 0) {
          const rect = cellsToBoundingBox(effect.cells, boardSize, cellSize, isFlipped);
          if (!rect) return null;
          return (
            <VfxSprite
              key={effect.id}
              definition={definition}
              reducedMotion={reducedMotion}
              opacity={effect.opacity}
              className="vfx-area"
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                ...timing,
              }}
            />
          );
        }

        const coord = unitCoord(view, effect);
        if (!coord) return null;
        return (
          <VfxSprite
            key={effect.id}
            definition={definition}
            reducedMotion={reducedMotion}
            opacity={effect.opacity}
            style={centeredSpriteStyle({
              coord,
              boardSize,
              cellSize,
              isFlipped,
              scaleCells,
              timing,
            })}
          />
        );
      })}
    </div>
  );
};
