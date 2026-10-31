import type { PlayerId, PlayerView, UnitState } from "rules";
import { getUnitVisualVariant, getUnitVisualVariantLabelKey } from "../../assets/unitVisuals";
import { radiusCellsToOverlay } from "./vfxGeometry";
import { hasCommanderSupport } from "./commanderSupport";

// Declaration order is the badge composition order: restrictions, bones, private
// knowledge, protections, forms, benefits, court effects. No source IDs/counts.
export const STATUS_VISUALS = {
  curse: {
    icon: "curse",
    tone: "curse",
    label: "persistentStatus.curse",
    effectId: "sansCurseStatus",
  },
  movementDisabled: { icon: "moveLock", tone: "negative", label: "persistentStatus.movementDisabled" },
  sansMoveLock: { icon: "moveLock", tone: "negative", label: "persistentStatus.sansMoveLock" },
  kaladinMoveLock: { icon: "moveLock", tone: "negative", label: "persistentStatus.kaladinMoveLock" },
  lokiMoveLock: { icon: "moveLock", tone: "negative", label: "persistentStatus.lokiMoveLock" },
  immobilized: { icon: "snare", tone: "negative", label: "board.wrappedInSnares" },
  blind: { icon: "blind", tone: "negative", label: "game.blind" },
  papyrusBlue: { tone: "blue", label: "game.blueBone", bone: "blue", source: "papyrus" },
  papyrusOrange: {
    tone: "orange",
    label: "game.orangeBone",
    bone: "orange",
    source: "papyrus",
  },
  sansBlue: {
    tone: "blue",
    label: "game.blueBone",
    bone: "blue",
    source: "sansBoneField",
  },
  sansOrange: {
    tone: "orange",
    label: "game.orangeBone",
    bone: "orange",
    source: "sansBoneField",
  },
  stealth: { icon: "hood", tone: "stealth", label: "board.stealth" },
  mark: { icon: "crosshair", tone: "mark", label: "board.assassinMark" },
  trackedMark: { icon: "crosshair", tone: "mark", label: "board.assassinMarkTracked" },
  bunker: { icon: "bunker", tone: "positive", label: "board.bunker", effectId: "bunkerStatus" },
  cleanSoul: {
    icon: "heart",
    tone: "positive",
    label: "persistentStatus.cleanSoul",
    effectId: "friskCleanSoul",
  },
  duolingoBerserker: {
    icon: "axe",
    tone: "positive",
    label: "persistentStatus.duolingoBerserker",
    effectId: "duolingoBerserker",
  },
  odinHuginn: {
    icon: "eye",
    tone: "positive",
    label: "persistentStatus.odinHuginn",
    effectId: "odinHuginn",
  },
  autoDefense: { icon: "shieldCheck", tone: "positive", label: "persistentStatus.autoDefense" },
  berserkDefense: { icon: "shieldBolt", tone: "positive", label: "persistentStatus.berserkDefense" },
  patience: { icon: "hourglass", tone: "positive", label: "persistentStatus.patience" },
  precision: { icon: "dagger", tone: "positive", label: "persistentStatus.precision" },
  form: { icon: "transform", tone: "neutral", label: "persistentStatus.form" },
  commanderAura: { icon: "banner", tone: "positive", label: "persistentStatus.commanderAura" },
  diagonalMove: { icon: "diagonal", tone: "positive", label: "persistentStatus.diagonalMove" },
  decreeMove: { icon: "scroll", tone: "positive", label: "persistentStatus.decreeMove" },
  mongolCharge: { icon: "charge", tone: "positive", label: "persistentStatus.mongolCharge" },
  boatmanMoves: { icon: "extraMove", tone: "positive", label: "persistentStatus.boatmanMoves" },
  boatCarry: { icon: "boat", tone: "neutral", label: "persistentStatus.boatCarry" },
  longBone: { icon: "longBone", tone: "neutral", label: "persistentStatus.longBone" },
  sorrowReady: { icon: "tear", tone: "positive", label: "persistentStatus.sorrowReady" },
  courtFlexible: { icon: "plus", tone: "positive", label: "persistentStatus.courtFlexible" },
  courtGlobalMove: { icon: "globalMove", tone: "positive", label: "persistentStatus.courtGlobalMove" },
  courtRestriction: { icon: "gavel", tone: "negative", label: "persistentStatus.courtRestriction" },
  courtCompensation: { icon: "coinPlus", tone: "positive", label: "persistentStatus.courtCompensation" },
  courtCosts: { icon: "coinMinus", tone: "negative", label: "persistentStatus.courtCosts" },
  stealthBlocked: { icon: "stealthBlocked", tone: "negative", label: "persistentStatus.stealthBlocked" },
  stasis: { icon: "pause", tone: "neutral", label: "persistentStatus.stasis" },
  king: { icon: "crown", tone: "neutral", label: "persistentStatus.king" },
} as const;

export type PersistentStatusKind = keyof typeof STATUS_VISUALS;
export interface PersistentUnitStatus {
  id: string;
  kind: PersistentStatusKind;
  labelKey: string;
}

/** Read only the current recipient's projected unit and permitted view context. */
export function resolveUnitStatuses(
  unit: UnitState,
  playerId: PlayerId | null,
  context?: Pick<PlayerView, "roundNumber" | "ruleDeclaration"> & Partial<Pick<PlayerView, "units">>,
): PersistentUnitStatus[] {
  if (!unit.isAlive) return [];
  const active = new Set<PersistentStatusKind>();
  const own = unit.owner === playerId;
  if (unit.chikatiloMarkStatus)
    active.add(unit.chikatiloMarkStatus.exactTrackingActive ? "trackedMark" : "mark");
  // An exactly detected hidden enemy is rendered as the existing safe ? token.
  // Do not decorate it with other current statuses or a stealth aura.
  if (unit.isStealthed && !own) return descriptors(unit.id, active);
  if (unit.sansLastAttackCurseSourceId) active.add("curse");
  if (unit.movementDisabledNextTurn) active.add("movementDisabled");
  if (unit.sansMoveLockArmed) active.add("sansMoveLock");
  if (unit.kaladinMoveLockSources?.length) active.add("kaladinMoveLock");
  if (unit.lokiMoveLockSources?.length) active.add("lokiMoveLock");
  if (unit.immobilizedUntilOwnTurnStart) active.add("immobilized");
  if (unit.blindUntilOwnTurnStart) active.add("blind");
  if (unit.papyrusBoneStatus)
    active.add(unit.papyrusBoneStatus.kind === "blue" ? "papyrusBlue" : "papyrusOrange");
  if (unit.sansBoneFieldStatus)
    active.add(unit.sansBoneFieldStatus.kind === "blue" ? "sansBlue" : "sansOrange");
  if (own && unit.isStealthed) active.add("stealth");
  if (unit.bunker?.active) active.add("bunker");
  if (unit.friskCleanSoulShield) active.add("cleanSoul");
  if (unit.heroId === "duolingo" && unit.duolingoBerserkerUnlocked) active.add("duolingoBerserker");
  if (unit.heroId === "odin" && own) active.add("odinHuginn");
  if (unit.asgoreBraveryAutoDefenseReady) active.add("autoDefense");
  if (own && (unit.charges?.berserkAutoDefense ?? 0) > 0) active.add("berserkDefense");
  if (own && unit.asgorePatienceStealthActive) active.add("patience");
  if (unit.friskPrecisionStrikeReady) active.add("precision");
  const variant = getUnitVisualVariant(unit);
  if (variant || unit.transformed || unit.gutsBerserkModeActive) active.add("form");
  if (hasCommanderSupport(unit, context?.units, playerId)) active.add("commanderAura");
  if (unit.genghisKhanDiagonalMoveActive) active.add("diagonalMove");
  if (unit.genghisKhanDecreeMovePending) active.add("decreeMove");
  if (unit.genghisKhanMongolChargeActive) active.add("mongolCharge");
  if ((unit.riverBoatmanExtraMoves ?? 0) > 0 || unit.riverBoatmanMovePending)
    active.add("boatmanMoves");
  if (own && unit.riverBoatCarryAllyId) active.add("boatCarry");
  if (unit.papyrusLongBoneMode) active.add("longBone");
  if (unit.donSorrowfulReactionAvailable) active.add("sorrowReady");
  if (unit.courtExtraFlexibleAction && !unit.courtExtraFlexibleAction.used)
    active.add("courtFlexible");
  if (unit.courtGlobalMoveOnce && !unit.courtGlobalMoveOnce.used) active.add("courtGlobalMove");
  if (unit.courtProceduralRestriction) active.add("courtRestriction");
  if (unit.courtDamageCompensation && !unit.courtDamageCompensation.used)
    active.add("courtCompensation");
  if (unit.courtCosts && !unit.courtCosts.used) active.add("courtCosts");
  if (unit.cannotStealthUntilRoundEnd !== undefined) active.add("stealthBlocked");
  if (unit.courtStasis) active.add("stasis");
  const rule = context?.ruleDeclaration;
  if (
    rule?.selectedRuleId === "chess_party" &&
    rule.ruleData.chessParty?.kings[unit.owner] === unit.id
  )
    active.add("king");
  const blockedUntil =
    rule?.selectedRuleId === "moon_game" ? rule.ruleData.moonGame?.noStealthUntilRoundEnd : null;
  if (blockedUntil != null && context && blockedUntil >= context.roundNumber)
    active.add("stealthBlocked");
  return descriptors(unit.id, active).map((status) =>
    status.kind === "form"
      ? { ...status, labelKey: getUnitVisualVariantLabelKey(variant) ?? status.labelKey }
      : status,
  );
}

function descriptors(unitId: string, active: Set<PersistentStatusKind>): PersistentUnitStatus[] {
  return (Object.keys(STATUS_VISUALS) as PersistentStatusKind[])
    .filter((kind) => active.has(kind))
    .map((kind) => ({ id: `${unitId}:${kind}`, kind, labelKey: STATUS_VISUALS[kind].label }));
}

export function resolvePersistentStatuses(view: PlayerView, playerId: PlayerId | null) {
  return Object.values(view.units)
    .filter((unit) => unit.isAlive && unit.position)
    .map((unit) => ({ unitId: unit.id, statuses: resolveUnitStatuses(unit, playerId, view) }))
    .filter((item) => item.statuses.length > 0);
}

export function resolvePersistentGroundStatuses(view: PlayerView) {
  const rule = view.ruleDeclaration;
  const crater = rule?.selectedRuleId === "moon_game" ? rule.ruleData.moonGame?.crater : null;
  if (!crater || view.roundNumber >= crater.expiresAtRoundStart) return [];
  return radiusCellsToOverlay(crater.center, crater.radius, view.boardSize).map((cell) => ({
    id: `moon:crater:${cell.col},${cell.row}`,
    kind: "crater" as const,
    cell,
  }));
}
