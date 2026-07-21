import type { CSSProperties, FC } from "react";
import { PortalEffect } from "./PortalEffect";
import type { VfxDefinition } from "./vfxRegistry";

type VfxSpriteStyle = CSSProperties & {
  "--vfx-duration"?: string;
  "--vfx-frames"?: number;
  "--vfx-frame-steps"?: number;
  "--vfx-opacity"?: number;
};

interface VfxSpriteProps {
  definition: VfxDefinition;
  className?: string;
  style?: CSSProperties;
  reducedMotion?: boolean;
  opacity?: number;
}

export const VfxSprite: FC<VfxSpriteProps> = ({
  definition,
  className = "",
  style,
  reducedMotion = false,
  opacity,
}) => {
  const spriteStyle: VfxSpriteStyle = {
    "--vfx-duration": `${definition.durationMs}ms`,
    "--vfx-frames": definition.frames,
    "--vfx-opacity": opacity ?? definition.opacity,
    mixBlendMode: definition.blendMode,
    ...style,
  };

  if (definition.assetType === "proceduralPortal") {
    return (
      <PortalEffect
        effectId={definition.id}
        className={className}
        style={spriteStyle}
        durationMs={definition.durationMs}
        reducedMotion={reducedMotion}
        opacity={opacity ?? definition.opacity}
        blendMode={definition.blendMode}
      />
    );
  }

  if (definition.assetType === "spriteStrip") {
    const frameCount = definition.frames ?? 1;
    const stripStyle: VfxSpriteStyle = {
      ...spriteStyle,
      "--vfx-frame-steps": Math.max(1, frameCount - 1),
      backgroundImage: `url(${definition.asset ?? ""})`,
      backgroundSize: `${frameCount * 100}% 100%`,
    };
    return (
      <span
        className={`vfx-sprite vfx-sprite-strip vfx-${definition.id} ${
          reducedMotion ? "vfx-reduced" : ""
        } ${className}`}
        style={stripStyle}
      />
    );
  }

  return (
    <img
      className={`vfx-sprite vfx-sprite-particle vfx-${definition.id} ${
        reducedMotion ? "vfx-reduced" : ""
      } ${className}`}
      src={definition.asset ?? ""}
      alt=""
      draggable={false}
      style={spriteStyle}
    />
  );
};
