import type { ReactNode } from "react";

export function StatPill({
  label,
  value,
  tone = "neutral",
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "neutral" | "amber" | "emerald" | "sky" | "violet" | "rose";
  className?: string;
}) {
  return (
    <div className={`stat-pill stat-pill-${tone} ${className}`}>
      <span className="stat-pill-label">{label}</span>
      <span className="stat-pill-value">{value}</span>
    </div>
  );
}
