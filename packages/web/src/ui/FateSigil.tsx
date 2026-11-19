/**
 * The FATE logo drawn as a vector seal (after public/android-chrome-512x512.png): an outer ring
 * open at four points with a dot at each, an inner ring, the triangle reaching past the outer
 * ring and the crescent at the heart. It takes `currentColor`,
 * so the cover can gild it. CSS masks use the same drawing (app-shell.css, grimoire-sheet.css).
 */
export function FateSigil({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true">
      <circle
        cx="256"
        cy="242"
        r="192"
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeDasharray="253.6 48"
        strokeDashoffset="-24"
      />
      <circle cx="256" cy="242" r="144" fill="none" stroke="currentColor" strokeWidth="12" />
      <path d="M256 52L436 352L76 352Z" fill="none" stroke="currentColor" strokeWidth="13" />
      <circle cx="256" cy="30" r="16" fill="currentColor" />
      <circle cx="256" cy="434" r="16" fill="currentColor" />
      <circle cx="64" cy="242" r="16" fill="currentColor" />
      <circle cx="448" cy="242" r="16" fill="currentColor" />
      {/* A true crescent: the outer arc round the left, back along the inner arc. */}
      <path fill="currentColor" d="M263.7 164.8A82 82 0 1 0 333.9 250.6A64 64 0 1 1 263.7 164.8Z" />
    </svg>
  );
}
