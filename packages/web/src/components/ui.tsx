import type { ReactNode } from "react";
import { Badge, type BadgeVariant, Panel, SectionHeader } from "../ui";

type Tone = Extract<
  BadgeVariant,
  "neutral" | "success" | "warning" | "danger" | "info" | "special"
>;

export const PanelCard = Panel;
export { SectionHeader };

export function StatusBadge({
  children,
  tone = "neutral",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <Badge variant={tone} dot={dot} className={className}>
      {children}
    </Badge>
  );
}
