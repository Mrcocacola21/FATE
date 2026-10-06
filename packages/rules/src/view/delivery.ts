import type { ProjectedGameEvent } from "../model";

/** Transport metadata only. Rules actions continue to produce authoritative GameEvent[]. */
export type DeliveredGameEvent = ProjectedGameEvent & { eventId: string };

export interface LiveEventBatch {
  streamId: string;
  revision: number;
  events: DeliveredGameEvent[];
}
