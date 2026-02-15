import type { FC } from "react";
import { ThemeToggle } from "../../components/ThemeToggle";

interface GameTopBarProps {
  roomId: string | null;
  role: string | null;
}

export const GameTopBar: FC<GameTopBarProps> = ({ roomId, role }) => {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs text-slate-500 dark:text-slate-300">
        Room: {roomId ?? "-"} | Role: {role ?? "-"}
      </div>
      <ThemeToggle />
    </div>
  );
};
