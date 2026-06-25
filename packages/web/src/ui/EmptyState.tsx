import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`empty-state ${className}`}>
      {icon ? <div className="empty-state-icon">{icon}</div> : null}
      <div className="mt-4 font-display text-base font-semibold text-primary">{title}</div>
      {description ? (
        <div className="mt-1 max-w-md text-sm leading-6 text-muted">{description}</div>
      ) : null}
    </div>
  );
}
