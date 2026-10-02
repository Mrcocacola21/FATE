import React, { useState } from "react";

export function Avatar({
  username,
  displayName,
  avatarUrl,
  small = false,
}: {
  username: string;
  displayName?: string | null;
  avatarUrl: string | null;
  small?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  let safeUrl: string | null = null;
  try {
    if (avatarUrl && ["http:", "https:"].includes(new URL(avatarUrl).protocol)) safeUrl = avatarUrl;
  } catch {
    /* Fall back for invalid legacy URLs too. */
  }
  const name = displayName || username;
  const size = small ? "h-8 w-8 text-xs" : "h-20 w-20 text-2xl";
  return safeUrl && failedUrl !== safeUrl ? (
    <img
      className={`shrink-0 rounded-full object-cover ${size}`}
      src={safeUrl}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(safeUrl)}
    />
  ) : (
    <span
      role="img"
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-amber-500/20 font-bold ${size}`}
    >
      {Array.from(name).slice(0, 2).join("").toLocaleUpperCase()}
    </span>
  );
}
