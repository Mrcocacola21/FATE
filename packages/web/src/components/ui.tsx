import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "special";

const toneClasses: Record<Tone, string> = {
  neutral:
    "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/45 dark:text-emerald-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-200",
  danger:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/45 dark:text-rose-200",
  info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/45 dark:text-sky-200",
  special:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800/70 dark:bg-violet-950/45 dark:text-violet-200",
};

export function PanelCard({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "aside" | "header";
}) {
  return <Tag className={`panel-card ${className}`}>{children}</Tag>;
}

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
      className={`flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-start ${className}`}
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
    <span className={`status-pill ${toneClasses[tone]} ${className}`}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
