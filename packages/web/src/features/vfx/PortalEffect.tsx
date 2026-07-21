import type { CSSProperties, FC } from "react";
import type { VfxEffectId } from "./vfxTypes";

type PortalEffectStyle = CSSProperties & {
  "--vfx-delay"?: string;
  "--vfx-duration"?: string;
  "--vfx-opacity"?: number;
  "--portal-particle-angle"?: string;
  "--portal-particle-delay"?: string;
};

interface PortalEffectProps {
  effectId: VfxEffectId;
  className?: string;
  style?: CSSProperties;
  durationMs: number;
  reducedMotion?: boolean;
  opacity: number;
  blendMode?: "normal" | "screen" | "plus-lighter";
}

const PARTICLE_ANGLES = [8, 68, 126, 188, 247, 306];

/** A centered, procedural portal that opens and closes without positional movement. */
export const PortalEffect: FC<PortalEffectProps> = ({
  effectId,
  className = "",
  style,
  durationMs,
  reducedMotion = false,
  opacity,
  blendMode,
}) => {
  const portalStyle: PortalEffectStyle = {
    "--vfx-delay": "0ms",
    "--vfx-duration": `${durationMs}ms`,
    "--vfx-opacity": opacity,
    mixBlendMode: blendMode,
    ...style,
  };

  return (
    <span
      data-testid="portal-effect"
      data-portal-effect={effectId}
      className={`portal-effect portal-effect-${effectId} ${
        reducedMotion ? "portal-effect-reduced" : ""
      } ${className}`}
      style={portalStyle}
      aria-hidden="true"
    >
      <span className="portal-effect-glow" />
      <span className="portal-effect-spark" />
      <span className="portal-effect-inner" />
      <span className="portal-effect-core" />
      <span className="portal-effect-runes" />
      <span className="portal-effect-ring" />
      {PARTICLE_ANGLES.map((angle, index) => (
        <span
          key={angle}
          className="portal-effect-particle"
          style={
            {
              "--portal-particle-angle": `${angle}deg`,
              "--portal-particle-delay": `${index * 18}ms`,
            } as PortalEffectStyle
          }
        />
      ))}
    </span>
  );
};
