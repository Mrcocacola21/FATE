import type { GameEvent } from "../model";

/** Transport metadata only. Rules actions continue to produce plain GameEvent[]. */
export type DeliveredGameEvent = GameEvent & { eventId: string };

export interface LiveEventBatch {
  streamId: string;
  revision: number;
  events: DeliveredGameEvent[];
}
