export function formatCharge(current: number, max: number | null): string {
  return max === null ? `${current}` : `${current}/${max}`;
}
