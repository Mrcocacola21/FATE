import type { KeyboardEvent, ReactNode } from "react";

export interface SegmentTab<T extends string> {
  value: T;
  label: string;
  /** A sigil drawn above the label (the «plates» look). */
  icon?: ReactNode;
  /** A short line under the label (the «plates» look). */
  caption?: string;
  /** Overrides the default `${idPrefix}-${value}` element id. */
  id?: string;
  testId?: string;
}

/**
 * The page-level tab rail of the «Гримуар» style: a sunken plate whose selected tab is raised
 * and gilded. One look for format tabs, leaderboard status and Figure Set sections.
 * Arrow keys (mirrored in RTL), Home and End move the selection with a roving tab stop.
 */
export function SegmentTabs<T extends string>({
  value,
  items,
  onChange,
  ariaLabel,
  idPrefix,
  controls,
  disabled = false,
  stretch = false,
  className = "",
  testId,
}: {
  value: T;
  items: ReadonlyArray<SegmentTab<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Prefix for each tab's id, so a tabpanel can point back with aria-labelledby. */
  idPrefix: string;
  /** Id of the tabpanel the tabs drive. */
  controls?: string;
  disabled?: boolean;
  /** Tabs share the full width of the rail (phones, narrow cards). */
  stretch?: boolean;
  className?: string;
  testId?: string;
}) {
  const tabId = (item: SegmentTab<T>) => item.id ?? `${idPrefix}-${item.value}`;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl =
      typeof getComputedStyle === "function" &&
      getComputedStyle(event.currentTarget).direction === "rtl";
    const step =
      event.key === "ArrowRight" ? (rtl ? -1 : 1) : event.key === "ArrowLeft" ? (rtl ? 1 : -1) : 0;
    let next: number;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (step) next = (index + step + items.length) % items.length;
    else return;
    event.preventDefault();
    const item = items[next];
    onChange(item.value);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[id="${tabId(item)}"]`)
      ?.focus();
  };

  return (
    <div
      className={`segment-tabs ${className}`}
      role="tablist"
      aria-label={ariaLabel}
      data-stretch={stretch || undefined}
      data-testid={testId}
    >
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={tabId(item)}
            data-testid={item.testId}
            aria-selected={selected}
            aria-controls={controls}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.icon || item.caption ? (
              <>
                {item.icon && (
                  <span className="segment-tabs__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                <span className="segment-tabs__label">{item.label}</span>
                {item.caption && <span className="segment-tabs__caption">{item.caption}</span>}
              </>
            ) : (
              item.label
            )}
          </button>
        );
      })}
    </div>
  );
}
