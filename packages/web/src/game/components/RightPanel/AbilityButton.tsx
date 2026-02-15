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
      className={`w-full rounded-lg px-2 py-2 text-left shadow-sm transition hover:shadow ${
        disabled
          ? "bg-zinc-800 text-zinc-400 cursor-not-allowed"
          : "bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
      }`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
