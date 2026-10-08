import type { AbilityUseContext, ApplyResult, GameEvent, GameState } from "../model";
import { EVENT_VISIBILITY, movementVisibility } from "../model/events/visibility";

export function commitAbilityUse(state: GameState, unitId: string, abilityId: string) {
  const counter = (state.abilityUseCounter ?? 0) + 1;
  const unit = state.units[unitId];
  const privateCommit = ["hassanAssasinOrder", "hassanTrueEnemy", "chikatiloAssassinMark"].includes(
    abilityId,
  );
  const use: AbilityUseContext = {
    abilityId,
    abilityUseId: `ability-use-${counter}`,
    abilitySourceUnitId: unitId,
    ...(unit?.position
      ? {
          abilitySourceCell: { ...unit.position },
          abilitySourceRecipients: privateCommit
            ? [unit.owner]
            : movementVisibility(state, unitId, unit.position).recipients,
        }
      : { abilitySourceRecipients: unit ? [unit.owner] : [] }),
  };
  return { state: { ...state, abilityUseCounter: counter }, use };
}

function sourceId(context: Record<string, unknown>): string | undefined {
  for (const key of [
    "abilitySourceUnitId",
    "controllerUnitId",
    "attackerId",
    "casterId",
    "unitId",
    "riverId",
    "asgoreId",
    "lokiId",
    "friskId",
    "gutsId",
    "hassanId",
    "groznyId",
    "sourceUnitId",
  ])
    if (typeof context[key] === "string") return context[key] as string;
  return undefined;
}

export function getAbilityUseContext(
  value: AbilityUseContext | null | undefined,
): AbilityUseContext | undefined {
  if (!value?.abilityUseId) return undefined;
  return {
    abilityId: value.abilityId,
    abilityUseId: value.abilityUseId,
    abilitySourceUnitId: value.abilitySourceUnitId,
    abilitySourceCell: value.abilitySourceCell && { ...value.abilitySourceCell },
    abilitySourceRecipients: value.abilitySourceRecipients,
  };
}

/**
 * Preserve operation lineage at the existing action boundary. Legacy handlers
 * already express commitment via abilityUsed; they allocate here. Cost-based
 * handlers allocate at commitAbilityCost. No unit "last used ability" is read.
 */
export function correlateAbilityResult(before: GameState, result: ApplyResult): ApplyResult {
  if (result.rejectionReason) return result;
  let state = result.state;
  const incoming = getAbilityUseContext(before.pendingRoll);
  const uses = [
    incoming,
    getAbilityUseContext(before.pendingAoE),
    getAbilityUseContext(before.pendingReactionMovement),
  ].filter((use): use is AbilityUseContext => !!use);
  const inheritedIds = new Set(uses.map((use) => use.abilityUseId));
  const committedIds = new Set<string>();
  const events = result.events.map((event): GameEvent => {
    if (event.type !== "abilityUsed") return event;
    if (event.abilityUseId) {
      if (!inheritedIds.has(event.abilityUseId)) committedIds.add(event.abilityUseId);
      const unit = before.units[event.unitId] ?? state.units[event.unitId];
      uses.unshift({
        abilityId: event.abilityId,
        abilityUseId: event.abilityUseId,
        abilitySourceUnitId: event.unitId,
        abilitySourceCell: event.sourceCell
          ? { ...event.sourceCell }
          : unit?.position
            ? { ...unit.position }
            : undefined,
        abilitySourceRecipients: event[EVENT_VISIBILITY]?.abilityRecipients,
      });
      const cell = event.sourceCell ?? unit?.position;
      return cell
        ? {
            ...event,
            sourceCell: { ...cell },
            [EVENT_VISIBILITY]: {
              ...(event[EVENT_VISIBILITY] ?? { recipients: [] }),
              sourceCellRecipients:
                event[EVENT_VISIBILITY]?.sourceCellRecipients ??
                event[EVENT_VISIBILITY]?.abilityRecipients ??
                [],
            },
          }
        : event;
    }
    // In these handlers costs have already committed. Allocate exactly once.
    const committed = commitAbilityUse(
      { ...before, abilityUseCounter: state.abilityUseCounter },
      event.unitId,
      event.abilityId,
    );
    state = { ...state, abilityUseCounter: committed.state.abilityUseCounter };
    uses.unshift(committed.use);
    committedIds.add(committed.use.abilityUseId!);
    return {
      ...event,
      abilityUseId: committed.use.abilityUseId,
      ...(committed.use.abilitySourceCell ? { sourceCell: committed.use.abilitySourceCell } : {}),
      [EVENT_VISIBILITY]: {
        recipients: committed.use.abilitySourceRecipients ?? [],
        abilityRecipients: committed.use.abilitySourceRecipients,
        sourceCellRecipients: committed.use.abilitySourceRecipients,
      },
    };
  });

  const findUse = (
    id?: string,
    abilityId?: string,
    fallback = false,
  ): AbilityUseContext | undefined =>
    uses.find(
      (use) =>
        (!id || use.abilitySourceUnitId === id) && (!abilityId || use.abilityId === abilityId),
    ) ??
    (fallback && incoming && (!abilityId || incoming.abilityId === abilityId)
      ? incoming
      : undefined);

  const pending = state.pendingRoll;
  if (pending && pending !== before.pendingRoll) {
    const id = sourceId(pending.context);
    const abilityId =
      typeof pending.context.sourceAbilityId === "string"
        ? pending.context.sourceAbilityId
        : typeof pending.context.abilityId === "string"
          ? pending.context.abilityId
          : undefined;
    // Newly committed uses may start a new operation. An older use follows only
    // its own explicit context or the same pending resolver family.
    const family = (kind: string) =>
      kind
        .replace(/^(kaiserCarpetStrike|carpetStrike).*/, "carpetStrike")
        .replace(
          /^(riverBoat|riverTraLaLa|asgoreSoulParade|loki|friskWarmWords|jebeKhansShooter|femtoDivineMove).*/,
          "$1",
        )
        .replace(/_(attackerRoll|defenderRoll|berserkerDefenseChoice)$/, "")
        .replace(
          /^(berserkerDefenseChoice|odinMuninnDefenseChoice|pureBloodRedirectChoice|chikatiloDecoyChoice|asgoreBraveryDefenseChoice|friskSubstitutionChoice)$/,
          "attack",
        );
    const candidates = uses.filter(
      (use) =>
        committedIds.has(use.abilityUseId!) ||
        (!!abilityId && use.abilityId === abilityId) ||
        family(pending.kind) === family(before.pendingRoll?.kind ?? ""),
    );
    const use =
      (pending.abilityUseId
        ? uses.find((use) => use.abilityUseId === pending.abilityUseId)
        : (id || abilityId) &&
          candidates.find(
            (use) =>
              (!id || use.abilitySourceUnitId === id) &&
              (!abilityId || use.abilityId === abilityId),
          )) ??
      (pending.kind === "reactionChoice" || pending.kind === "reactionDropChoice"
        ? getAbilityUseContext(state.pendingReactionMovement)
        : undefined);
    if (use)
      state = {
        ...state,
        pendingRoll: { ...pending, ...use, context: { ...pending.context, ...use } },
      };
  }
  if (state.pendingAoE && !state.pendingAoE.abilityUseId) {
    const use = findUse(state.pendingAoE.casterId, state.pendingAoE.abilityId);
    if (use)
      state = {
        ...state,
        pendingAoE: { ...state.pendingAoE, ...use, abilityId: state.pendingAoE.abilityId },
      };
  }
  if (state.pendingReactionMovement && !state.pendingReactionMovement.abilityUseId) {
    const use = findUse(state.pendingReactionMovement.controllerUnitId);
    if (use)
      state = { ...state, pendingReactionMovement: { ...state.pendingReactionMovement, ...use } };
  }
  if (state.pendingCombatQueue.length) {
    state = {
      ...state,
      pendingCombatQueue: state.pendingCombatQueue.map((entry) => {
        const use = entry.abilityUseId
          ? undefined
          : findUse(entry.attackerId, entry.sourceAbilityId);
        return use ? { ...entry, ...use } : entry;
      }),
    };
  }

  const correlated = events.map((event): GameEvent => {
    if (event.type === "abilityUsed" || event.abilityUseId) return event;
    let use: AbilityUseContext | undefined;
    switch (event.type) {
      case "attackResolved":
        use = findUse(
          event.attackerId,
          event.abilityId,
          before.pendingRoll?.context.attackerId === event.attackerId,
        );
        break;
      case "aoeResolved":
        use = findUse(event.sourceUnitId, event.abilityId);
        break;
      case "unitDied": {
        // Direct aggregate damage can emit death before its final summary.
        // Preserve that resolution's identity for presentation ordering.
        const aggregate = events.find(
          (candidate) =>
            candidate.type === "aoeResolved" &&
            candidate.sourceUnitId === event.killerId &&
            (candidate.damageByUnitId?.[event.unitId] ?? 0) > 0,
        );
        if (aggregate?.type === "aoeResolved")
          use = findUse(aggregate.sourceUnitId, aggregate.abilityId);
        break;
      }
      case "rollResolved":
        use = incoming ?? findUse(event.unitId);
        break;
      case "unitMoved":
        use =
          event.provenance.kind === "tralala"
            ? findUse(undefined, "riverTraLaLa")
            : event.provenance.kind === "boat"
              ? findUse(undefined, "riverBoat")
              : event.provenance.kind === "normal" || event.provenance.kind === "rider"
                ? undefined
                : event.provenance.kind === "ability"
                  ? findUse(undefined, event.provenance.abilityId)
                  : event.provenance.kind === "forced"
                    ? undefined
                    : findUse(event.unitId);
        break;
      case "snarePlaced":
        use = findUse(event.sourceUnitId, event.abilityId);
        break;
      case "riverBoatPickup":
      case "riverBoatDisembarked":
      case "riverBoatResolved":
      case "riverBoatDisembarkFailed":
      case "riverTraLaLaResolved":
        use = findUse(event.riverId, event.abilityId, true);
        break;
      case "reactionOpportunity":
      case "reactionChoiceResolved":
      case "reactionMovementResumed":
      case "reactionMovementEnded":
        use =
          getAbilityUseContext(before.pendingReactionMovement) ??
          getAbilityUseContext(state.pendingReactionMovement);
        break;
      case "carpetStrikeTriggered":
      case "carpetStrikeCenter":
      case "carpetStrikeAttackRolled":
        use = findUse(event.unitId, event.abilityId, true);
        break;
      case "asgoreSoulParadeResolved":
        use = findUse(event.asgoreId, event.abilityId, true);
        break;
      case "unitHealed":
        use = event.sourceAbilityId ? findUse(undefined, event.sourceAbilityId) : undefined;
        break;
      case "lokiChickenApplied":
      case "lokiChickenGroupApplied":
        use = findUse(event.lokiId, event.abilityId, true);
        break;
      case "controlledAttackDeclared":
        use = findUse(event.controllerUnitId, event.abilityId, true);
        break;
      case "lechyStormStarted":
        use = findUse(event.sourceUnitId, event.abilityId);
        break;
      default:
        break;
    }
    const enriched: GameEvent = use
      ? {
          ...event,
          ...(use.abilityId ? { abilityId: event.abilityId ?? use.abilityId } : {}),
          abilityUseId: use.abilityUseId,
          [EVENT_VISIBILITY]: {
            ...(event[EVENT_VISIBILITY] ?? { recipients: [] }),
            abilityRecipients: use.abilitySourceRecipients ?? [],
          },
        }
      : event;
    if (enriched.type === "aoeResolved" && !enriched.sourceCell) {
      const cell = use?.abilitySourceCell ?? before.units[enriched.sourceUnitId]?.position;
      if (cell)
        return {
          ...enriched,
          sourceCell: { ...cell },
          [EVENT_VISIBILITY]: {
            ...(enriched[EVENT_VISIBILITY] ?? { recipients: [] }),
            sourceCellRecipients:
              use?.abilitySourceRecipients ??
              movementVisibility(before, enriched.sourceUnitId, cell).recipients,
          },
        };
    }
    return enriched;
  });
  return { ...result, state, events: correlated };
}
