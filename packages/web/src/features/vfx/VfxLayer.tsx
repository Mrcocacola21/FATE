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
import { MOVEMENT_WAKE_FADE_MS, movementWakeSamples } from "./movementWake";
import { MELEE_RECOVERY_MS, meleeTraceMs, meleeFacingTransform } from "./meleeStrike";

interface VfxLayerProps {
  effects: QueuedBoardVfxRequest[];
  view: PlayerView;
  boardSize: number;
  cellSize: number;
  isFlipped: boolean;
  reducedMotion: boolean;
}

function vfxUnitAuthorized(view: PlayerView, effect: QueuedBoardVfxRequest): boolean {
  // Unit-attached cues lose authorization when the recipient no longer has a
  // current position. Explicit historical cell geometry has no unit attachment.
  if (effect.unitId && !view.units[effect.unitId]?.position) {
    // The authoritative snapshot can already contain a final death while the
    // shared playback is still showing the preceding hit. Only its committed
    // event cell survives; a live hidden unit or a following status never does.
    if (!(view.units[effect.unitId]?.isAlive === false && effect.anchorMode === "event" && effect.sourceCell)) return false;
  }
  return true;
}

export function vfxAnchor(view: PlayerView, effect: QueuedBoardVfxRequest): Coord | null {
  if (!vfxUnitAuthorized(view, effect)) return null;
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
  durationMs = effect.expiresAt - effect.startedAt,
}: {
  effect: QueuedBoardVfxRequest;
  definition: VfxDefinition;
  reducedMotion: boolean;
  timing: CSSProperties;
  durationMs?: number;
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
            durationMs={durationMs}
            opacity={effect.opacity}
            className="vfx-artwork"
            style={{
              ...timing,
              zIndex: index,
              ...(effect.tintHue !== undefined ? { filter: `hue-rotate(${effect.tintHue - 190}deg) saturate(.85) brightness(1.05)` } : {}),
              ...(effect.placement === "projectile" && definition.facingOffsetDeg
                ? { transform: `rotate(${definition.facingOffsetDeg}deg)`, transformOrigin: "50% 50%" } : {}),
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
  if (!vfxUnitAuthorized(view, effect)) return null;
  if (reducedMotion && definition.reducedMotion === "hide") return null;
  const durationMs = effect.expiresAt - effect.startedAt;
  const timing = {
    "--vfx-delay": `${effect.startedAt - mountedAt}ms`,
    "--vfx-duration": `${durationMs}ms`,
    "--vfx-opacity": effect.opacity ?? definition.opacity,
    animationDelay: `${effect.startedAt - mountedAt}ms`,
  } as CSSProperties;
  const layer =
    (effect.placement === "projectile" && definition.layer === "impact" ? "projectile" : definition.layer) ??
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
      data-vfx-tint={effect.tintHue}
      data-vfx-start={effect.startedAt}
      data-vfx-layer={layer}
      className={`vfx-geometry vfx-geometry-${shape} ${definition.staging ? `vfx-stage-${definition.staging}` : ""} ${reducedMotion ? "vfx-reduced" : ""}`}
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
      (effect.effectId === "gasterCannon" || definition.orientToTarget) && effect.targetCell
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
  const profile = definition.stagingProfile;
  if (definition.meleeSwing && effect.placement === "cell") {
    if (!effect.targetCell) return null;
    const route = lineBetweenCellsToCssTransform(anchor, effect.targetCell, boardSize, cellSize, isFlipped);
    const size = definition.defaultScaleCells * cellSize;
    const target = areaToBoardRect(effect.targetCell, 1, 1, boardSize, cellSize, isFlipped);
    const contact = effect.strikeContactMs ?? Math.max(1, durationMs - MELEE_RECOVERY_MS);
    const revealFrom = definition.meleeArtwork?.revealFrom ?? "bottomLeft";
    const artworkRotation = definition.meleeArtwork?.rotationDeg ?? 0;
    const strikeTiming = { ...timing, "--melee-contact": `${contact}ms`,
      "--melee-recovery": `${Math.max(0, durationMs - contact)}ms`,
      "--melee-draw": `${meleeTraceMs(contact)}ms`,
      "--melee-trace-delay": `${effect.startedAt - mountedAt + contact - meleeTraceMs(contact)}ms`,
      "--melee-start-clip": revealFrom === "topRight"
        ? "polygon(100% 0, 100% 0, 100% 0, 100% 0)" : "polygon(0 100%, 0 100%, 0 100%, 0 100%)",
      "--melee-half-clip": revealFrom === "topRight"
        ? "polygon(0 0, 100% 0, 100% 100%, 100% 100%)" : "polygon(0 0, 100% 100%, 100% 100%, 0 100%)" } as CSSProperties;
    return <span className="vfx-projectile-axis vfx-melee-axis" data-vfx-cue={effect.id} data-vfx-effect={effect.effectId}
      data-vfx-start={effect.startedAt} data-vfx-contact={effect.startedAt + contact} data-vfx-hit={effect.strikeHit} data-vfx-layer={layer}
      style={{ ...strikeTiming, left: target.left + cellSize / 2, top: target.top + cellSize / 2,
        width: 1, height: 1, transform: meleeFacingTransform(route.angleDeg), zIndex: BOARD_LAYERS[layer] }}>
      <span className={`vfx-melee-stroke ${effect.strikeHit === false ? "vfx-target-cut-miss" : "vfx-target-cut-hit"} ${reducedMotion ? "vfx-melee-reduced" : ""}`}
        data-vfx-melee-reveal={revealFrom}
        style={{ ...strikeTiming, animationDelay: undefined, transform: "scale(1, 1)", left: -size / 2,
          top: -size / 2, width: size, height: size }}>
        <span className="vfx-melee-art" data-vfx-melee-rotation={artworkRotation}
          style={{ left: 0, top: 0, width: size, height: size, transform: `rotate(${artworkRotation}deg)`, transformOrigin: "50% 50%" }}>
          <Artwork effect={effect} definition={definition} reducedMotion={reducedMotion} timing={timing} />
        </span>
      </span>
    </span>;
  }
  if (profile && definition.staging === "moveTrail" && effect.placement === "projectile" && effect.targetCell) {
    const route = lineBetweenCellsToCssTransform(anchor, effect.targetCell, boardSize, cellSize, isFlipped);
    const width = profile.trailWidth * cellSize * 0.65, height = profile.trailHeight * cellSize * 0.75;
    const travelDurationMs = effect.travelDurationMs ?? Math.max(1, durationMs - MOVEMENT_WAKE_FADE_MS);
    const samples = movementWakeSamples(route.width / cellSize, travelDurationMs);
    return <span className="vfx-projectile-axis vfx-movement-wake"
      data-vfx-cue={effect.id} data-vfx-effect={effect.effectId} data-vfx-start={effect.startedAt}
      data-vfx-layer="ground" data-vfx-travel-duration={travelDurationMs}
      style={{ ...timing, left: route.left, top: route.top + cellSize * 0.28,
        width: route.width, height, transform: route.transform, zIndex: BOARD_LAYERS.ground }}>
      {samples.map((sample, index) => {
        const fragmentTiming = { ...timing,
          "--vfx-duration": `${MOVEMENT_WAKE_FADE_MS}ms`,
          "--vfx-delay": `${effect.startedAt - mountedAt + sample.atMs}ms`,
          animationDelay: `${effect.startedAt - mountedAt + sample.atMs}ms`,
        } as CSSProperties;
        return <span key={index} className="vfx-wake-fragment" data-vfx-wake-sample={index}
          data-vfx-emission={sample.atMs}
          style={{ ...fragmentTiming, left: route.width * sample.fraction - width * 0.82,
            top: -height / 2, width, height }}>
          <Artwork effect={effect} definition={definition} reducedMotion={false}
            timing={fragmentTiming} durationMs={MOVEMENT_WAKE_FADE_MS} />
        </span>;
      })}
    </span>;
  }
  if (profile && (definition.staging === "deploy" || definition.staging === "moveArrive")) {
    const deploy = definition.staging === "deploy";
    const rect = areaToBoardRect(anchor, deploy ? profile.deployWidth : profile.arrivalWidth,
      deploy ? profile.deployHeight : profile.arrivalHeight, boardSize, cellSize, isFlipped);
    return wrap(effect.id, { ...rect, top: rect.top + cellSize * (deploy ? -0.04 : 0.22) }, "cell");
  }
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
    if (effect.segments?.length)
      return (
        <>
          {effect.segments.map((segment, index) =>
            line(segment.from, segment.to, `segment-${index}`),
          )}
        </>
      );
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
    {props.effects.filter(effect => !effect.uiAnchor && !(effect.unitId && vfxRegistry[effect.effectId].staging === "deploy")).map((effect) => (
      <Effect key={effect.id} {...props} effect={effect} />
    ))}
  </div>
);
