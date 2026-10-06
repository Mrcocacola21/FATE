import { randomUUID } from "node:crypto";
import {
  projectEventsForRecipient,
  type DeliveredGameEvent,
  type EventRecipient,
  type GameEvent,
  type GameState,
} from "rules";

export type AuthoritativeDeliveredGameEvent = GameEvent & { eventId: string };

/** Called once at acceptance, before journaling or recipient projection. */
export function identifyAcceptedEvents(events: GameEvent[]): AuthoritativeDeliveredGameEvent[] {
  return events.map((event) => ({ ...event, eventId: randomUUID() }));
}

export function projectDeliveryEvents(
  state: GameState,
  events: AuthoritativeDeliveredGameEvent[],
  recipient: EventRecipient,
): DeliveredGameEvent[] {
  return events.flatMap((event) =>
    projectEventsForRecipient(state, [event], recipient).map((projected) => ({
      ...projected,
      eventId: event.eventId,
    })),
  );
}
