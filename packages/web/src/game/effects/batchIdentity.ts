import type { BoardEventBatch } from "./types";

/** Preview keys never enter the authoritative stream/revision domain. */
export function presentationBatchKey(batch: BoardEventBatch): string {
  return batch.previewId ?? `${batch.streamId ?? "local"}:${batch.revision}`;
}
