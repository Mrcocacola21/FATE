import { useState, type CSSProperties, type FC } from "react";
import type { Coord, PlayerView } from "rules";
import {
  areaToBoardRect,
  lineBetweenCellsToCssTransform,
  pathCellsToSegments,
  rayToBoardEdge,
} from "./vfxGeometry";
import { BOARD_LAYERS, vfxRegistry, type VfxDefinition } from "./vfxRegistry";
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

export function vfxAnchor(view: PlayerView, effect: QueuedBoardVfxRequest): Coord | null {
  // Unit-attached cues lose authorization when the recipient no longer has a
  // current position. Explicit historical cell geometry has no unit attachment.
  if (effect.unitId && !view.units[effect.unitId]?.position) return null;
  if (effect.anchorMode === "followUnit") {
    return effect.unitId ? (view.units[effect.unitId]?.position ?? null) : null;
  }
  return effect.sourceCell ?? null;
}

function Artwork({
  effect,
  definition,
  reducedMotion,
  timing,
}: {
  effect: QueuedBoardVfxRequest;
  definition: VfxDefinition;
  reducedMotion: boolean;
  timing: CSSProperties;
}) {
  const layers = definition.layers ?? [{ ...definition, role: "primary" as const }];
  return (
    <>
      {layers.map((art, index) =>
        effect.composition && effect.composition !== art.role ? null : (
          <VfxSprite
            key={art.role}
            definition={definition}
            artwork={art}
            reducedMotion={reducedMotion}
            durationMs={effect.expiresAt - effect.startedAt}
            opacity={effect.opacity}
            className="vfx-artwork"
            style={{
              ...timing,
              zIndex: index,
              ...(art.frameCrop
                ? {
                    left: `${(-art.frameCrop.left * 100) / art.frameCrop.width}%`,
                    top: `${(-art.frameCrop.top * 100) / art.frameCrop.height}%`,
                    width: `${((art.frameWidth ?? art.frameCrop.width) * 100) / art.frameCrop.width}%`,
                    height: `${((art.frameHeight ?? art.frameCrop.height) * 100) / art.frameCrop.height}%`,
                  }
                : {}),
            }}
          />
        ),
      )}
    </>
  );
}

function Effect({
  effect,
  view,
  boardSize,
  cellSize,
  isFlipped,
  reducedMotion,
}: VfxLayerProps & {
  effect: QueuedBoardVfxRequest;
}) {
  const definition = vfxRegistry[effect.effectId];
  // Fixed per mount: rerenders/resizes never restart or shift playback. Late mounts catch up.
  const [mountedAt] = useState(() => Date.now());
  if (!definition) return null;
  if (reducedMotion && definition.reducedMotion === "hide") return null;
  const durationMs = effect.expiresAt - effect.startedAt;
  const timing = {
    "--vfx-delay": `${effect.startedAt - mountedAt}ms`,
    "--vfx-duration": `${durationMs}ms`,
    "--vfx-opacity": effect.opacity ?? definition.opacity,
    animationDelay: `${effect.startedAt - mountedAt}ms`,
  } as CSSProperties;
  const layer =
    definition.layer ??
    (effect.placement === "area"
      ? "ground"
      : effect.placement === "path" || effect.placement === "line"
        ? "movement"
        : "impact");
  const wrap = (key: string, style: CSSProperties, shape = effect.placement) => (
    <span
      key={key}
      data-vfx-cue={effect.id}
      data-vfx-effect={effect.effectId}
      data-vfx-start={effect.startedAt}
      data-vfx-layer={layer}
      className={`vfx-geometry vfx-geometry-${shape} ${reducedMotion ? "vfx-reduced" : ""}`}
      style={{ ...style, ...timing, zIndex: BOARD_LAYERS[layer] }}
    >
      <Artwork
        effect={effect}
        definition={definition}
        reducedMotion={reducedMotion}
        timing={timing}
      />
    </span>
  );
  const centered = (cell: Coord, key: string) => {
    const rect = areaToBoardRect(
      cell,
      effect.scaleCells ?? definition.defaultScaleCells,
      effect.scaleCells ?? definition.defaultScaleCells,
      boardSize,
      cellSize,
      isFlipped,
    );
    const facing =
      effect.effectId === "gasterCannon" && effect.targetCell
        ? lineBetweenCellsToCssTransform(cell, effect.targetCell, boardSize, cellSize, isFlipped)
        : null;
    const attachment = definition.anchorPoint ?? { x: 0.5, y: 0.5 };
    return wrap(key, {
      ...rect,
      left: rect.left + rect.width * (0.5 - attachment.x),
      top: rect.top + rect.height * (0.5 - attachment.y),
      ...(facing
        ? {
            transform: `rotate(${facing.angleDeg + (definition.facingOffsetDeg ?? 0)}deg)`,
            transformOrigin: `${attachment.x * 100}% ${attachment.y * 100}%`,
          }
        : {}),
    });
  };
  const line = (from: Coord, to: Coord, key: string) => {
    const geometry = lineBetweenCellsToCssTransform(from, to, boardSize, cellSize, isFlipped);
    const height = cellSize * (definition.beamThicknessCells ?? 0.18);
    return wrap(
      key,
      {
        left: geometry.left,
        top: geometry.top - height / 2,
        width: geometry.width,
        height,
        transform: geometry.transform,
        transformOrigin: "0 50%",
      },
      "line",
    );
  };
  if (effect.placement === "path") {
    if (!effect.path?.length) return null;
    const segments =
      definition.assetType === "proceduralPortal" ? [] : pathCellsToSegments(effect.path);
    return (
      <>
        {segments.map((segment, index) => line(segment.from, segment.to, `segment-${index}`))}
        {centered(effect.path[0], "first")}
        {centered(effect.path[effect.path.length - 1], "last")}
      </>
    );
  }
  const anchor = vfxAnchor(view, effect);
  if (!anchor) return null;
  if (effect.placement === "area") {
    const width = effect.widthCells ?? definition.widthCells;
    const height = effect.heightCells ?? definition.heightCells ?? width;
    if (width && height)
      return wrap(
        effect.id,
        areaToBoardRect(anchor, width, height, boardSize, cellSize, isFlipped),
      );
    // Explicit cell sets may be sparse: never stretch artwork over their bounding box.
    return <>{effect.cells?.map((cell, index) => centered(cell, `cell-${index}`))}</>;
  }
  if (effect.placement === "ray" || effect.placement === "line") {
    const direction =
      effect.direction ??
      (effect.targetCell
        ? {
            col: effect.targetCell.col - anchor.col,
            row: effect.targetCell.row - anchor.row,
          }
        : null);
    if (effect.placement === "ray" && effect.rayToEdge !== false && direction) {
      const geometry = rayToBoardEdge(anchor, direction, boardSize, cellSize, isFlipped);
      if (!geometry) return null;
      const height = cellSize * (definition.beamThicknessCells ?? 0.35);
      return wrap(effect.id, {
        left: geometry.left,
        top: geometry.top - height / 2,
        width: geometry.width,
        height,
        transform: geometry.transform,
        transformOrigin: "0 50%",
      });
    }
    return effect.targetCell ? line(anchor, effect.targetCell, effect.id) : null;
  }
  if (effect.placement === "projectile") {
    if (!effect.targetCell) return null;
    const geometry = lineBetweenCellsToCssTransform(
      anchor,
      effect.targetCell,
      boardSize,
      cellSize,
      isFlipped,
    );
    const size = cellSize * (effect.scaleCells ?? definition.defaultScaleCells);
    return (
      <span
        className="vfx-projectile-axis"
        style={{
          left: geometry.left,
          top: geometry.top,
          transform: geometry.transform,
          zIndex: BOARD_LAYERS[layer],
        }}
      >
        {wrap(effect.id, {
          left: -size / 2,
          top: -size / 2,
          width: size,
          height: size,
          "--vfx-travel": `${geometry.width}px`,
        } as CSSProperties)}
      </span>
    );
  }
  return centered(anchor, effect.id);
}

export const VfxLayer: FC<VfxLayerProps> = (props) => (
  <div
    className={`vfx-board-root pointer-events-none absolute left-0 top-0 overflow-hidden ${props.reducedMotion ? "vfx-layer-reduced-motion" : ""}`}
    style={{
      width: props.boardSize * props.cellSize,
      height: props.boardSize * props.cellSize,
      pointerEvents: "none",
    }}
    aria-hidden="true"
  >
    {props.effects.map((effect) => (
      <Effect key={effect.id} {...props} effect={effect} />
    ))}
  </div>
);
