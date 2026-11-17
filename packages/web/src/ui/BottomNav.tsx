import type { ReactNode } from "react";

export interface BottomNavItem<T extends string> {
  value: T;
  label: string;
  glyph: ReactNode;
  badge?: { count: number; label: string };
}

export function BottomNav<T extends string>({
  value,
  items,
  onChange,
  ariaLabel,
}: {
  value: T | null;
  items: BottomNavItem<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <nav
      className="mobile-bottom-nav"
      aria-label={ariaLabel}
      data-layer="bottom-nav"
      data-testid="mobile-bottom-nav"
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className="mobile-bottom-nav-item"
          aria-current={value === item.value ? "page" : undefined}
          aria-pressed={value === item.value}
          data-panel={item.value}
          onClick={() => onChange(item.value)}
        >
          <span className="mobile-bottom-nav-glyph text-base leading-none" aria-hidden="true">
            {item.glyph}
          </span>
          {item.badge && item.badge.count > 0 ? (
            <span className="nav-count mobile-bottom-nav-count" aria-label={item.badge.label}>
              {item.badge.count}
            </span>
          ) : null}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
