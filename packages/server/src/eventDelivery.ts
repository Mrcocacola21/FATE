import { randomUUID } from "node:crypto";
import {
  projectEventsForRecipient,
  type DeliveredGameEvent,
  type EventRecipient,
  type GameEvent,
  type GameState,
} from "rules";

/** Called once at acceptance, before journaling or recipient projection. */
export function identifyAcceptedEvents(events: GameEvent[]): DeliveredGameEvent[] {
  return events.map((event) => ({ ...event, eventId: randomUUID() }));
}

export function projectDeliveryEvents(
  state: GameState,
  events: DeliveredGameEvent[],
  recipient: EventRecipient,
): DeliveredGameEvent[] {
  return events.flatMap((event) =>
    // TODO(projected-events): rules currently types redacted payloads as GameEvent.
    // Keep that compatibility boundary here until the projection contract phase.
    projectEventsForRecipient(state, [event], recipient).map((projected) => ({
      ...projected,
      eventId: event.eventId,
    })),
  );
}
