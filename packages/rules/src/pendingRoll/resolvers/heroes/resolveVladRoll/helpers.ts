import type { Coord, ResolveRollChoice } from "../../../../model";

export function parseCoordChoice(
  choice: ResolveRollChoice | undefined
): Coord | undefined {
  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type: string; to?: Coord })
      : undefined;
  return payload?.to;
}

export function coordKey(coord: Coord): string {
  return `${coord.col},${coord.row}`;
}
