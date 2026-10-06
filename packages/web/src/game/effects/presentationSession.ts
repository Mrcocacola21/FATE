import type { LiveEventBatch, PlayerView } from "rules";
import type { BoardEventBatch } from "./types";

export const MAX_PREBASELINE_BATCHES = 64;
export const MAX_PRESENTATION_BATCHES = 128;
export const MAX_RECENT_EVENT_IDS = 1024;
export const MAX_PRESENTATION_AGE_MS = 15_000;

/** Invalidated synchronously, before React commits the presentation reset. */
export interface PresentationToken {
  cancelled: boolean;
}
type Binding = { roomId: string | null; recipient: string | null };
type Snapshot = Binding & { streamId: string; revision: number; view?: PlayerView };
type Diagnostic = (reason: string, metadata: Record<string, unknown>) => void;

/** Transport authorization only; deferred events belong to the downstream scheduler. */
export class PresentationSession {
  hydration: "awaitingBaseline" | "live" = "awaitingBaseline";
  streamId: string | null = null;
  baselineRevision = -1;
  highestReceivedRevision = -1;
  generation = 0;
  token: PresentationToken = { cancelled: false };
  private binding: Binding = { roomId: null, recipient: null };
  private buffered: BoardEventBatch[] = [];
  private receivedEventIds = new Set<string>();

  constructor(private readonly diagnose?: Diagnostic) {}
  get key(): string {
    return JSON.stringify([
      this.binding.roomId,
      this.streamId,
      this.binding.recipient,
      this.generation,
    ]);
  }
  get recentEventCount(): number {
    return this.receivedEventIds.size;
  }
  get bufferedBatchCount(): number {
    return this.buffered.length;
  }

  begin(binding: Binding): void {
    this.token.cancelled = true;
    this.token = { cancelled: false };
    this.generation += 1;
    this.binding = binding;
    this.hydration = "awaitingBaseline";
    this.streamId = null;
    this.baselineRevision = -1;
    this.highestReceivedRevision = -1;
    this.buffered = [];
    this.receivedEventIds.clear();
    this.diagnose?.("session reset", { ...binding, generation: this.generation });
  }

  snapshot(snapshot: Snapshot): BoardEventBatch[] {
    if (!snapshot.streamId || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0)
      return [];
    if (
      snapshot.roomId !== this.binding.roomId ||
      snapshot.recipient !== this.binding.recipient ||
      (this.hydration === "live" && snapshot.streamId !== this.streamId)
    )
      this.begin(snapshot);
    // Normal live snapshots update persistent state, never delivery watermarks.
    if (this.hydration === "live") return [];
    this.binding = { roomId: snapshot.roomId, recipient: snapshot.recipient };
    this.streamId = snapshot.streamId;
    this.baselineRevision = snapshot.revision;
    this.highestReceivedRevision = snapshot.revision;
    this.hydration = "live";
    this.diagnose?.("baseline established", {
      ...this.binding,
      streamId: this.streamId,
      revision: snapshot.revision,
    });
    const buffered = this.buffered.sort((a, b) => a.revision - b.revision);
    this.buffered = [];
    return buffered.flatMap((batch) =>
      this.accept({ ...batch, view: batch.view ?? snapshot.view }),
    );
  }

  receive(batch: LiveEventBatch, binding: Binding, view?: PlayerView): BoardEventBatch[] {
    if (
      binding.roomId !== this.binding.roomId ||
      binding.recipient !== this.binding.recipient ||
      !batch.streamId ||
      !Number.isSafeInteger(batch.revision) ||
      batch.revision < 0
    )
      return [];
    const incoming: BoardEventBatch = {
      ...batch,
      view,
      presentationToken: this.token,
      receivedAt: Date.now(),
    };
    if (this.hydration === "awaitingBaseline") {
      this.buffered.push(incoming);
      this.buffered = this.buffered.slice(-MAX_PREBASELINE_BATCHES);
      return [];
    }
    return this.accept(incoming);
  }

  private accept(batch: BoardEventBatch): BoardEventBatch[] {
    if (batch.streamId !== this.streamId) {
      this.diagnose?.("stale stream ignored", { streamId: batch.streamId });
      return [];
    }
    // WebSocket delivery is ordered. Gaps are valid; late lower revisions never
    // replay after IDs age out. This records receipt, not completed presentation.
    if (batch.revision <= this.highestReceivedRevision) {
      this.diagnose?.("duplicate or historical batch ignored", { revision: batch.revision });
      return [];
    }
    this.highestReceivedRevision = batch.revision;
    const events = batch.events.filter((event) => {
      if (!event.eventId) return false;
      if (this.receivedEventIds.has(event.eventId)) {
        this.diagnose?.("duplicate event ignored", { eventId: event.eventId });
        return false;
      }
      this.receivedEventIds.add(event.eventId);
      return true;
    });
    for (const id of this.receivedEventIds) {
      if (this.receivedEventIds.size <= MAX_RECENT_EVENT_IDS) break;
      this.receivedEventIds.delete(id);
    }
    // Empty batches can still reconcile legacy pending presentation state.
    return [{ ...batch, events, presentationToken: this.token }];
  }
}

export function presentationBatchIsCurrent(batch: BoardEventBatch): boolean {
  return !batch.presentationToken?.cancelled;
}
export function presentationBatchHasExpired(batch: BoardEventBatch, now = Date.now()): boolean {
  return batch.receivedAt !== undefined && now - batch.receivedAt > MAX_PRESENTATION_AGE_MS;
}
