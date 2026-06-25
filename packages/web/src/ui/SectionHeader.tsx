import type { ReactNode } from "react";

export function SectionHeader({
  kicker,
  title,
  description,
  action,
  className = "",
}: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-start ${className}`}
    >
      <div className="min-w-0">
        {kicker ? <div className="section-kicker">{kicker}</div> : null}
        <h2 className="section-title mt-1">{title}</h2>
        {description ? <div className="section-copy mt-1">{description}</div> : null}
      </div>
      {action ? <div className="w-full shrink-0 [&>*]:w-full sm:w-auto">{action}</div> : null}
    </div>
  );
}
