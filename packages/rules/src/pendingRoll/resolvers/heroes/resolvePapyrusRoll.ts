import type {
  ApplyResult,
  GameState,
  PapyrusBoneType,
  PendingRoll,
  ResolveRollChoice,
} from "../../../model";
import { clearPendingRoll, replacePendingRoll } from "../../../core";
import {
  applyPapyrusBoneStatus,
  maybeRequestPapyrusBoneChoice,
} from "../../../actions/heroes/papyrus/state";
import { isPapyrus } from "../../../actions/heroes/papyrus/helpers";
import type { PapyrusBoneChoiceContext } from "../../types";

function parseBoneChoice(choice: ResolveRollChoice | undefined): PapyrusBoneType | null {
  if (!choice || typeof choice !== "object" || choice.type !== "papyrusBoneChoice") {
    return null;
  }
  return choice.boneType === "blue" || choice.boneType === "orange"
    ? choice.boneType
    : null;
}

function requestNextChoice(
  state: GameState,
  pending: PendingRoll,
  context: PapyrusBoneChoiceContext,
  startIndex: number
): ApplyResult {
  const papyrus = state.units[context.papyrusUnitId];
  if (!isPapyrus(papyrus) || !papyrus.isAlive || !papyrus.papyrusUnbelieverActive) {
    return maybeRequestPapyrusBoneChoice(clearPendingRoll(state));
  }

  for (let index = startIndex; index < context.targetIds.length; index += 1) {
    const targetId = context.targetIds[index];
    if (!state.units[targetId]?.isAlive) continue;
    return replacePendingRoll(
      state,
      pending.player,
      "papyrusBoneChoice",
      {
        ...context,
        targetUnitId: targetId,
        currentTargetIndex: index,
        targetIndex: index + 1,
      },
      papyrus.id
    );
  }

  return maybeRequestPapyrusBoneChoice(clearPendingRoll(state));
}

export function resolvePapyrusBoneChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const context = pending.context as unknown as PapyrusBoneChoiceContext;
  const boneType = parseBoneChoice(choice);
  if (!boneType || !context.availableBones?.includes(boneType)) {
    return {
      state,
      events: [],
      rejectionReason: "invalid_papyrus_bone_choice",
    };
  }

  const papyrus = state.units[context.papyrusUnitId];
  const target = state.units[context.targetUnitId];
  const currentIndex = context.currentTargetIndex ?? 0;
  if (
    !isPapyrus(papyrus) ||
    !papyrus.isAlive ||
    !papyrus.papyrusUnbelieverActive ||
    !target?.isAlive ||
    context.targetIds[currentIndex] !== target.id
  ) {
    return {
      state,
      events: [],
      rejectionReason: "invalid_papyrus_bone_target",
    };
  }

  const applied = applyPapyrusBoneStatus(
    clearPendingRoll(state),
    papyrus.id,
    target.id,
    boneType
  );
  const next = requestNextChoice(
    applied.state,
    pending,
    context,
    currentIndex + 1
  );
  return {
    state: next.state,
    events: [...applied.events, ...next.events],
  };
}
