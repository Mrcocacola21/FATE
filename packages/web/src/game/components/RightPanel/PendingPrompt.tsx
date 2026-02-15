import type { FC, ReactNode } from "react";

interface PendingPromptProps {
  title: string;
  description: string;
  children?: ReactNode;
}

export const PendingPrompt: FC<PendingPromptProps> = ({
  title,
  description,
  children,
}) => {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-3">
      <div className="text-xs font-semibold text-zinc-100">{title}</div>
      <div className="mt-1 text-xs text-zinc-300">{description}</div>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
};
