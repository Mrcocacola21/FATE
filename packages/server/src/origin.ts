function isLocalDevOrigin(origin: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/.test(
    origin
  );
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const allow = new Set(
    [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      process.env.WEB_ORIGIN,
    ].filter(Boolean) as string[]
  );
  if (allow.has(origin)) return true;
  if (isLocalDevOrigin(origin)) return true;
  return /^https:\/\/.*\.vercel\.app$/.test(origin);
}
