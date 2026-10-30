import type { MatchAction } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import { DRAFT_SEQUENCE, type DraftEvent } from "rules";
import { deserializeReplayAction } from "./deserializeAction";

export type ReplayDraftEvent = DraftEvent & {
  /** The revision whose command produced this event. */
  revision: number;
  /** Ban, pick and skipped-ban events are numbered draft steps; privilege choices are not. */
  step?: number;
  round?: 1 | 2;
};
export interface ReplayDraft {
  /** Drafts recorded before draft privileges: P1 first, one round of bans. */
  legacy: boolean;
  startRevision: number;
  events: ReplayDraftEvent[];
}
type DraftRow = Pick<MatchAction, "matchId" | "revision" | "actorSeat" | "actionType" | "actionPayload">;

/** Presentation history only. A journal that does not read cleanly yields null; reconstruction reports the fault. */
export function buildReplayDraft(rows: readonly DraftRow[]): ReplayDraft | null {
  const start = rows[0];
  if (!start || start.actionType !== "draftStarted") return null;
  let history: DraftEvent[] = [];
  const events: ReplayDraftEvent[] = [];
  try {
    for (const row of rows) {
      const next = deserializeReplayAction(row).setup?.draftHistory;
      if (!next || !isDeepStrictEqual(next.slice(0, history.length), history)) return null;
      for (const event of next.slice(history.length)) events.push({ ...event, revision: row.revision });
      history = next;
    }
  } catch {
    return null;
  }
  const legacy = history[0]?.type === "ban";
  let step = 0;
  for (const event of events) {
    if (event.type !== "ban" && event.type !== "pick" && event.type !== "banSkipped") continue;
    step += 1;
    event.step = step;
    if (event.type !== "pick") event.round = legacy ? 1 : DRAFT_SEQUENCE[step - 1]?.round ?? 1;
  }
  return { legacy, startRevision: start.revision, events };
}
