import type { FC, ReactNode } from "react";

interface AbilityMenuProps {
  title: string;
  children: ReactNode;
}

export const AbilityMenu: FC<AbilityMenuProps> = ({ title, children }) => {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-3">
      <div className="mb-2 text-xs font-semibold text-zinc-100">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
};
