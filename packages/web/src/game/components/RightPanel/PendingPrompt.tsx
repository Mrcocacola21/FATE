import type { FC, ReactNode } from "react";

interface PendingPromptProps {
  title: string;
  description: string;
  children?: ReactNode;
}

export const PendingPrompt: FC<PendingPromptProps> = ({ title, description, children }) => {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/70 dark:bg-amber-950/35">
      <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">{title}</div>
      <div className="mt-1 text-sm leading-5 text-amber-800 dark:text-amber-200">{description}</div>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
};
