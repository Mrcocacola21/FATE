export function Tabs<T extends string>({
  value,
  items,
  onChange,
  ariaLabel,
  className = "",
}: {
  value: T;
  items: Array<{ value: T; label: string; badge?: { count: number; label: string } }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={`tabs-rail scroll-panel ${className}`} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className="tab-control"
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.badge && item.badge.count > 0 ? (
            <span className="nav-count tab-control__count" aria-label={item.badge.label}>
              {item.badge.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
