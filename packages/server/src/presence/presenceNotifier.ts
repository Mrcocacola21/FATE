import type { FastifyBaseLogger } from "fastify";
import type { UserChannel } from "../realtime/userEvents";
import type { PresenceService, PresenceSubject } from "./presenceService";

export const PRESENCE_SWEEP_MS = 2000;

/** The player's visibility choice and friends, read only when their status really changed. */
export type PresenceAudienceLookup = (
  userId: string,
) => Promise<{ subject: PresenceSubject; friendIds: string[] } | null>;

/**
 * Pushes status changes to online friends. Rooms change in many places, so instead of hooking
 * each one the notifier compares every connected player's status with the last one it saw, on a
 * short timer and right away when a connection opens or closes. The database is read only for
 * players whose status actually changed.
 */
export class PresenceNotifier {
  private readonly seen = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly presence: PresenceService,
    private readonly channel: UserChannel & { onlineUserIds(): Iterable<string> },
    private readonly audience: PresenceAudienceLookup,
    private readonly log?: FastifyBaseLogger,
  ) {}

  start(intervalMs = PRESENCE_SWEEP_MS) {
    this.timer ??= setInterval(() => this.sweep(), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Compares statuses and returns the players whose friends were told; awaited only in tests. */
  sweep(): Promise<string[]> {
    const activities = this.presence.activities();
    const changed: string[] = [];
    const candidates = new Set([...this.channel.onlineUserIds(), ...this.seen.keys()]);
    for (const userId of candidates) {
      const online = this.channel.isOnline(userId);
      const busy = online ? activities.get(userId) : undefined;
      const signature = online ? JSON.stringify(busy ?? "online") : "offline";
      if (this.seen.get(userId) === signature) continue;
      if (online) this.seen.set(userId, signature);
      else this.seen.delete(userId);
      changed.push(userId);
    }
    return Promise.all(changed.map((userId) => this.announce(userId))).then(() => changed);
  }

  private async announce(userId: string) {
    try {
      const found = await this.audience(userId);
      if (!found || found.subject.presenceVisibility === "NOBODY") return;
      const friends = found.friendIds.filter((id) => this.channel.isOnline(id));
      if (!friends.length) return;
      // "Last seen" is written in parallel with this push, so offline means "just now".
      const online = this.channel.isOnline(userId);
      const presence = this.presence.presenceFor(
        { ...found.subject, lastSeenAt: online ? found.subject.lastSeenAt : new Date() },
        "friend",
      );
      for (const friendId of friends)
        this.channel.send(friendId, { type: "presence", userId, presence });
    } catch (error) {
      this.log?.debug({ event: "presence_push_failed", err: error }, "Could not push a status");
    }
  }
}
