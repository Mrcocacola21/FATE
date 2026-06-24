import type { FC, ReactNode } from "react";

interface AbilityMenuProps {
  title: string;
  children: ReactNode;
}

export const AbilityMenu: FC<AbilityMenuProps> = ({ title, children }) => {
  return (
    <div className="panel-card-muted p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-200">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
};
