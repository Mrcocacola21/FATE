export function parseDiceQueue(value: string): number[] | null {
  const values = value
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);
  if (
    values.length > 100 ||
    values.some((item) => !Number.isInteger(item) || item < 1 || item > 6)
  ) {
    return null;
  }
  return values;
}

export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function downloadJson(filename: string, value: string) {
  const blob = new Blob([value], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function shouldShowTestRoomPanel(
  roomMode: "normal" | "test" | undefined,
  canControlTestRoom: boolean
): boolean {
  return roomMode === "test" && canControlTestRoom;
}
