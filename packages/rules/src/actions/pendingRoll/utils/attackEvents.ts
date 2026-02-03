import type { GameEvent } from "../../../model";

export function findAttackResolved(
  events: GameEvent[],
  attackerId: string,
  defenderId: string
): Extract<GameEvent, { type: "attackResolved" }> | undefined {
  return events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attackerId &&
      event.defenderId === defenderId
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
}
