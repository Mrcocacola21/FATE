import type { FC, ReactNode } from "react";

interface AbilityButtonProps {
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children: ReactNode;
}

export const AbilityButton: FC<AbilityButtonProps> = ({
  disabled = false,
  title,
  onClick,
  children,
}) => {
  return (
    <button
      type="button"
      className={`min-h-10 w-full rounded-xl border px-3 py-2.5 text-left text-sm font-semibold shadow-sm transition focus-visible:ring-4 focus-visible:ring-sky-500/15 ${
        disabled
          ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
          : "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-900/70 dark:bg-sky-950/35 dark:text-sky-100 dark:hover:bg-sky-950/55"
      }`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
