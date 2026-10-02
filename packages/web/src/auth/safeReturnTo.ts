export function safeReturnTo(value: string | null | undefined): string {
  const unsafe = (text: string) =>
    Array.from(text).some((character) => character === "\\" || character.charCodeAt(0) <= 32);
  if (!value || !value.startsWith("/") || value.startsWith("//") || unsafe(value)) return "/";
  try {
    const parsed = new URL(value, "https://fate.invalid");
    const decoded = decodeURIComponent(parsed.pathname);
    if (
      parsed.origin !== "https://fate.invalid" ||
      decoded.startsWith("//") ||
      unsafe(decoded) ||
      ["/login", "/register"].includes(parsed.pathname.replace(/\/$/, ""))
    )
      return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
