import type { PlayerId, PlayerView, UnitState } from "rules";
import { getUnitVisualVariant, getUnitVisualVariantLabelKey } from "../../assets/unitVisuals";
import { radiusCellsToOverlay } from "./vfxGeometry";

// Declaration order is the badge composition order: restrictions, bones, private
// knowledge, protections, forms, benefits, court effects. No source IDs/counts.
export const STATUS_VISUALS = {
  curse: {
    glyph: "C",
    tone: "curse",
    label: "persistentStatus.curse",
    effectId: "sansCurseStatus",
  },
  movementDisabled: { glyph: "MV", tone: "negative", label: "persistentStatus.movementDisabled" },
  sansMoveLock: { glyph: "SL", tone: "negative", label: "persistentStatus.sansMoveLock" },
  kaladinMoveLock: { glyph: "KL", tone: "negative", label: "persistentStatus.kaladinMoveLock" },
  lokiMoveLock: { glyph: "LL", tone: "negative", label: "persistentStatus.lokiMoveLock" },
  immobilized: { glyph: "WR", tone: "negative", label: "board.wrappedInSnares" },
  blind: { glyph: "BL", tone: "negative", label: "game.blind" },
  papyrusBlue: { glyph: "", tone: "blue", label: "game.blueBone", bone: "blue", source: "papyrus" },
  papyrusOrange: {
    glyph: "",
    tone: "orange",
    label: "game.orangeBone",
    bone: "orange",
    source: "papyrus",
  },
  sansBlue: {
    glyph: "",
    tone: "blue",
    label: "game.blueBone",
    bone: "blue",
    source: "sansBoneField",
  },
  sansOrange: {
    glyph: "",
    tone: "orange",
    label: "game.orangeBone",
    bone: "orange",
    source: "sansBoneField",
  },
  stealth: { glyph: "S", tone: "stealth", label: "board.stealth" },
  mark: { glyph: "M", tone: "mark", label: "board.assassinMark" },
  trackedMark: { glyph: "M", tone: "mark", label: "board.assassinMarkTracked" },
  bunker: { glyph: "B", tone: "positive", label: "board.bunker", effectId: "bunkerStatus" },
  cleanSoul: { glyph: "SH", tone: "positive", label: "persistentStatus.cleanSoul" },
  autoDefense: { glyph: "AD", tone: "positive", label: "persistentStatus.autoDefense" },
  berserkDefense: { glyph: "BD", tone: "positive", label: "persistentStatus.berserkDefense" },
  patience: { glyph: "P", tone: "positive", label: "persistentStatus.patience" },
  precision: { glyph: "PR", tone: "positive", label: "persistentStatus.precision" },
  form: { glyph: "F", tone: "neutral", label: "persistentStatus.form" },
  diagonalMove: { glyph: "DG", tone: "positive", label: "persistentStatus.diagonalMove" },
  decreeMove: { glyph: "DM", tone: "positive", label: "persistentStatus.decreeMove" },
  mongolCharge: { glyph: "MC", tone: "positive", label: "persistentStatus.mongolCharge" },
  boatmanMoves: { glyph: "+M", tone: "positive", label: "persistentStatus.boatmanMoves" },
  boatCarry: { glyph: "BT", tone: "neutral", label: "persistentStatus.boatCarry" },
  longBone: { glyph: "LB", tone: "neutral", label: "persistentStatus.longBone" },
  sorrowReady: { glyph: "SR", tone: "positive", label: "persistentStatus.sorrowReady" },
  courtFlexible: { glyph: "+A", tone: "positive", label: "persistentStatus.courtFlexible" },
  courtGlobalMove: { glyph: "GM", tone: "positive", label: "persistentStatus.courtGlobalMove" },
  courtRestriction: { glyph: "CR", tone: "negative", label: "persistentStatus.courtRestriction" },
  courtCompensation: { glyph: "+D", tone: "positive", label: "persistentStatus.courtCompensation" },
  courtCosts: { glyph: "-D", tone: "negative", label: "persistentStatus.courtCosts" },
  stealthBlocked: { glyph: "!S", tone: "negative", label: "persistentStatus.stealthBlocked" },
  stasis: { glyph: "ST", tone: "neutral", label: "persistentStatus.stasis" },
  king: { glyph: "K", tone: "neutral", label: "persistentStatus.king" },
} as const;

export type PersistentStatusKind = keyof typeof STATUS_VISUALS;
export interface PersistentUnitStatus {
  id: string;
  kind: PersistentStatusKind;
  labelKey: string;
}

/** Read only the recipient's current projected unit. Never resolve source units. */
export function resolveUnitStatuses(
  unit: UnitState,
  playerId: PlayerId | null,
  context?: Pick<PlayerView, "roundNumber" | "ruleDeclaration">,
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
  if (unit.asgoreBraveryAutoDefenseReady) active.add("autoDefense");
  if (own && (unit.charges?.berserkAutoDefense ?? 0) > 0) active.add("berserkDefense");
  if (own && unit.asgorePatienceStealthActive) active.add("patience");
  if (unit.friskPrecisionStrikeReady) active.add("precision");
  const variant = getUnitVisualVariant(unit);
  if (variant || unit.transformed || unit.gutsBerserkModeActive) active.add("form");
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
