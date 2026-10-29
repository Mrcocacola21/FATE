import type { UserEvent } from "../api/notificationApi";

type Listener = (event: UserEvent) => void;
const listeners = new Set<Listener>();

/** Pushed events for the signed-in player; the game store feeds them in from the socket. */
export const userEvents = {
  on(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  emit(event: UserEvent) {
    for (const listener of [...listeners]) listener(event);
  },
};
