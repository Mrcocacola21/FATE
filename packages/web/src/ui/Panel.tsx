import type { ElementType, ReactNode } from "react";

export type PanelVariant = "default" | "muted" | "hud" | "arcane" | "parchment";

const variantClasses: Record<PanelVariant, string> = {
  default: "panel-card",
  muted: "panel-card-muted",
  hud: "panel-card panel-hud",
  arcane: "panel-card panel-arcane",
  parchment: "panel-card panel-parchment",
};

export function Panel({
  children,
  className = "",
  as: Tag = "section",
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  variant?: PanelVariant;
}) {
  return <Tag className={`${variantClasses[variant]} ${className}`}>{children}</Tag>;
}
