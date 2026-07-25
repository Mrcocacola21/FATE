import type { FC } from "react";

interface SnaredOverlayProps {
  label: string;
}

/**
 * A scalable rope layer for units immobilized by Jack's snare.
 * It is decorative and never participates in board hit testing.
 */
export const SnaredOverlay: FC<SnaredOverlayProps> = ({ label }) => (
  <span
    className="snared-overlay pointer-events-none absolute inset-0 z-20"
    role="img"
    aria-label={label}
    title={label}
    data-unit-overlay="snared"
  >
    <svg
      className="h-full w-full overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <g className="snared-overlay__ropes">
        <path className="snared-overlay__rope-shadow" d="M-7 31 C24 17 70 48 108 29" />
        <path className="snared-overlay__rope" d="M-7 31 C24 17 70 48 108 29" />
        <path className="snared-overlay__rope-highlight" d="M-7 29 C24 15 70 46 108 27" />

        <path className="snared-overlay__rope-shadow" d="M-8 62 C25 43 67 77 108 55" />
        <path className="snared-overlay__rope" d="M-8 62 C25 43 67 77 108 55" />
        <path className="snared-overlay__rope-highlight" d="M-8 60 C25 41 67 75 108 53" />

        <path className="snared-overlay__rope-shadow" d="M18 -8 C34 24 43 66 29 108" />
        <path className="snared-overlay__rope" d="M18 -8 C34 24 43 66 29 108" />
        <path className="snared-overlay__rope-highlight" d="M16 -8 C32 24 41 66 27 108" />

        <path className="snared-overlay__rope-shadow" d="M78 -8 C61 27 57 66 74 108" />
        <path className="snared-overlay__rope" d="M78 -8 C61 27 57 66 74 108" />
        <path className="snared-overlay__rope-highlight" d="M76 -8 C59 27 55 66 72 108" />
      </g>
      <g className="snared-overlay__knot" transform="translate(50 50)">
        <ellipse cx="-5" cy="0" rx="9" ry="6" transform="rotate(-24)" />
        <ellipse cx="7" cy="1" rx="9" ry="6" transform="rotate(28)" />
        <circle cx="1" cy="1" r="5" />
      </g>
    </svg>
  </span>
);
