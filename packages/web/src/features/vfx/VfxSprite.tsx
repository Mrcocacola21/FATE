import type { CSSProperties, FC } from "react";
import { PortalEffect } from "./PortalEffect";
import type { VfxArtwork, VfxDefinition } from "./vfxRegistry";

export function spritePlayback(art: VfxArtwork, durationMs: number, reducedMotion = false) {
  const frames = art.frames ?? 1;
  const start = art.startFrame ?? 0;
  const end = art.endFrame ?? frames - 1;
  const count = end - start + 1;
  const position = (frame: number) => `${frames === 1 ? 0 : (frame * 100) / (frames - 1)}%`;
  return {
    frames,
    count,
    fps: (count * 1000) / durationMs,
    // N-1 discrete advances then hold frame N-1 for its full frame interval.
    steppingDurationMs: (durationMs * (count - 1)) / count,
    style: {
      backgroundImage: `url(${art.asset ?? ""})`,
      backgroundSize: `${frames * 100}% 100%`,
      backgroundPositionX: position(reducedMotion ? start + Math.floor((count - 1) / 2) : end),
      "--vfx-frame-start": position(start),
      "--vfx-frame-end": position(end),
      animationName: reducedMotion || count === 1 ? "none" : "vfx-sprite-frame",
      animationTimingFunction: `steps(${Math.max(1, count - 1)}, end)`,
      animationDuration: `${(durationMs * (count - 1)) / count}ms`,
      animationFillMode: "both",
      animationIterationCount: 1,
    } as CSSProperties,
  };
}

interface VfxSpriteProps {
  definition: VfxDefinition;
  artwork?: VfxArtwork;
  className?: string;
  style?: CSSProperties;
  reducedMotion?: boolean;
  opacity?: number;
  durationMs?: number;
}

export const VfxSprite: FC<VfxSpriteProps> = ({
  definition,
  artwork = definition,
  className = "",
  style,
  reducedMotion = false,
  opacity,
  durationMs = definition.durationMs,
}) => {
  const spriteStyle = {
    "--vfx-duration": `${durationMs}ms`,
    "--vfx-opacity": opacity ?? definition.opacity,
    mixBlendMode: artwork.blendMode ?? definition.blendMode,
    ...style,
  } as CSSProperties;
  if (artwork.assetType === "proceduralPortal")
    return (
      <PortalEffect
        effectId={definition.id}
        className={className}
        style={spriteStyle}
        durationMs={durationMs}
        reducedMotion={reducedMotion}
        opacity={opacity ?? definition.opacity}
        blendMode={definition.blendMode}
      />
    );
  if (artwork.assetType === "spriteStrip")
    return (
      <span
        className={`vfx-sprite vfx-sprite-strip vfx-${definition.id} ${reducedMotion ? "vfx-reduced" : ""} ${className}`}
        data-vfx-frames={artwork.frames}
        style={{ ...spriteStyle, ...spritePlayback(artwork, durationMs, reducedMotion).style }}
      />
    );
  return (
    <img
      className={`vfx-sprite ${artwork.assetType === "static" ? "vfx-sprite-static" : "vfx-sprite-particle"} vfx-${definition.id} ${reducedMotion ? "vfx-reduced" : ""} ${className}`}
      src={artwork.asset ?? ""}
      alt=""
      draggable={false}
      style={spriteStyle}
    />
  );
};
