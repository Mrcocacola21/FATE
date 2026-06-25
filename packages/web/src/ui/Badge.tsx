import type { ReactNode } from "react";

export type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "special"
  | "passive"
  | "active"
  | "impulse"
  | "phantasm"
  | "ownerP1"
  | "ownerP2";

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "badge-neutral",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
  info: "badge-info",
  special: "badge-special",
  passive: "badge-passive",
  active: "badge-active",
  impulse: "badge-impulse",
  phantasm: "badge-phantasm",
  ownerP1: "badge-owner-p1",
  ownerP2: "badge-owner-p2",
};

export function Badge({
  children,
  variant = "neutral",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={`status-pill ${variantClasses[variant]} ${className}`}>
      {dot ? (
        <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
      ) : null}
      {children}
    </span>
  );
}
