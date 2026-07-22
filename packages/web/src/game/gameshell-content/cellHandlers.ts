import type { Dispatch, SetStateAction } from "react";
import type {
  Coord,
  GameAction,
  PapyrusLineAxis,
  PlayerId,
  PlayerView,
} from "rules";
import type { ActionMode } from "../../store";
import type { TargetingMode } from "../selectionState";
import {
  ASGORE_FIRE_PARADE_ID,
  ASGORE_FIREBALL_ID,
  CHIKATILO_ASSASSIN_MARK_ID,
  ARTEMIS_MOON_INSIGHT_ID,
  ARTEMIS_SILVER_SICKLE_ID,
  DON_SORROWFUL_ID,
  DON_WINDMILLS_ID,
  DUOLINGO_PUSH_NOTIFICATION_ID,
  EL_CID_DEMON_DUELIST_ID,
  EL_CID_TISONA_ID,
  GROZNY_INVADE_TIME_ID,
  GUTS_ARBALET_ID,
  GUTS_CANNON_ID,
  HASSAN_TRUE_ENEMY_ID,
  JACK_HOLY_MOTHER_ID,
  JACK_SNARES_ID,
  JEBE_HAIL_OF_ARROWS_ID,
  JEBE_KHANS_SHOOTER_ID,
  KAISER_DORA_ID,
  LUCHE_DIVINE_RAY_ID,
  KALADIN_FIFTH_ID,
  LECHY_GUIDE_TRAVELER_ID,
  METTATON_LASER_ID,
  METTATON_POPPINS_ID,
  ODIN_SLEIPNIR_ID,
  ZORO_ONI_GIRI_ID,
  PAPYRUS_COOL_GUY_ID,
  SANS_GASTER_BLASTER_ID,
  UNDYNE_ENERGY_SPEAR_ID,
  UNDYNE_SPEAR_THROW_ID,
} from "../../rulesHints";
import { coordKey, getUnitAt, isCoordInList } from "./helpers";
import { getDonMadnessDirectionForCell } from "../targeting/donMadnessDirection";

interface MoveOptionsState {
  unitId: string;
  legalTo: Coord[];
  mode?: string;
  modes?: string[];
  roll?: number | null;
}

type GroznyTyrantAttackCellOption = {
  targetId: string;
  mode: "normal" | "invadeTime";
  position: Coord;
};

export interface CellClickContext {
  view: PlayerView | null;
  playerId: PlayerId | null;
  joined: boolean;
  isSpectator: boolean;
  hasBlockingRoll: boolean;
  boardSelectionPending: boolean;
  isStakePlacement: boolean;
  stakeLegalKeys: Set<string>;
  stakeLimit: number;
  setStakeSelections: Dispatch<SetStateAction<Coord[]>>;
  isIntimidateChoice: boolean;
  intimidateKeys: Set<string>;
  pendingRoll: PlayerView["pendingRoll"] | null;
  isForestTarget: boolean;
  forestTargetKeys: Set<string>;
  isForestMoveDestination: boolean;
  forestMoveDestinationKeys: Set<string>;
  isFemtoDivineMoveDestination: boolean;
  femtoDivineMoveKeys: Set<string>;
  isOdinSleipnirDestination: boolean;
  odinSleipnirKeys: Set<string>;
  isChargedImpulseTargetChoice: boolean;
  chargedImpulseTargetKeys: Set<string>;
  isRiverBoatCarryChoice: boolean;
  riverBoatCarryOptionIds: string[];
  isRiverBoatDestinationChoice: boolean;
  riverBoatDestinationKeys: Set<string>;
  isRiverBoatDropDestination: boolean;
  riverBoatDropDestinationKeys: Set<string>;
  isRiverTraLaLaTargetChoice: boolean;
  riverTraLaLaTargetIds: string[];
  isRiverTraLaLaDestinationChoice: boolean;
  riverTraLaLaDestinationKeys: Set<string>;
  isRiverTraLaLaDropDestinationChoice: boolean;
  riverTraLaLaDropDestinationKeys: Set<string>;
  isChikatiloPlacement: boolean;
  chikatiloPlacementKeys: Set<string>;
  isGroznyTyrantAllyChoice: boolean;
  groznyTyrantAllyOptionIds: string[];
  isGroznyTyrantAttackCellChoice: boolean;
  groznyTyrantAttackCellOptions: GroznyTyrantAttackCellOption[];
  groznyTyrantAttackCellKeys: Set<string>;
  isGuideTravelerPlacement: boolean;
  guideTravelerPlacementKeys: Set<string>;
  isJebeKhansShooterTargetChoice: boolean;
  jebeKhansShooterTargetIds: string[];
  isHassanTrueEnemyTargetChoice: boolean;
  hassanTrueEnemyTargetIds: string[];
  isAsgoreSoulParadePatienceTargetChoice: boolean;
  asgorePatienceTargetIds: string[];
  isAsgoreSoulParadePerseveranceTargetChoice: boolean;
  asgorePerseveranceTargetIds: string[];
  isAsgoreSoulParadeJusticeTargetChoice: boolean;
  asgoreJusticeTargetIds: string[];
  isAsgoreSoulParadeIntegrityDestination: boolean;
  asgoreIntegrityDestinationKeys: Set<string>;
  isFriskPacifismHugsTargetChoice: boolean;
  friskPacifismHugsTargetIds: string[];
  isFriskWarmWordsTargetChoice: boolean;
  friskWarmWordsTargetIds: string[];
  isFriskPrecisionStrikeTargetChoice: boolean;
  friskPrecisionStrikeTargetIds: string[];
  isLokiChickenTargetChoice: boolean;
  lokiChickenTargetIds: string[];
  isLokiMindControlEnemyChoice: boolean;
  lokiMindControlEnemyIds: string[];
  isLokiMindControlTargetChoice: boolean;
  lokiMindControlTargetIds: string[];
  isHassanAssassinOrderSelection: boolean;
  hassanAssassinOrderEligibleIds: string[];
  setHassanAssassinOrderSelections: Dispatch<SetStateAction<string[]>>;
  actionMode: ActionMode;
  targetingMode: TargetingMode | null;
  placeUnitId: string | null;
  legalPlacementCoords: Coord[];
  sendGameAction: (action: GameAction) => void;
  setActionMode: (mode: ActionMode) => void;
  setPlaceUnitId: (unitId: string | null) => void;
  selectedUnitId: string | null;
  newHeroAbilityTargetId: string | null;
  setNewHeroAbilityTargetId: (unitId: string | null) => void;
  zoroAttackTargetIds: string[];
  setZoroAttackTargetIds: Dispatch<SetStateAction<string[]>>;
  legalMoveCoords: Coord[];
  setMoveOptions: (options: MoveOptionsState | null) => void;
  invadeTimeKeys: Set<string>;
  legalAttackTargets: string[];
  gutsRangedTargetIds: string[];
  asgoreFireballTargetIds: string[];
  undyneSpearThrowTargetIds: string[];
  hassanTrueEnemyCandidateIds: string[];
  guideTravelerTargetIds: string[];
  papyrusLongBoneAttackTargetIds: string[];
  assassinMarkTargetIds: string[];
  doraTargetKeys: Set<string>;
  artemidaLineTargetKeys: Set<string>;
  mettatonLineTargetKeys: Set<string>;
  undyneEnergySpearTargetKeys: Set<string>;
  jebeHailTargetKeys: Set<string>;
  kaladinFifthTargetKeys: Set<string>;
  tisonaTargetKeys: Set<string>;
  papyrusLineAxis: PapyrusLineAxis;
  sendAction: (action: GameAction) => void;
}

interface PlacementCellClickContext {
  actionMode: ActionMode;
  placeUnitId: string | null;
  legalPlacementCoords: Coord[];
  sendGameAction: (action: GameAction) => void;
  setActionMode: (mode: ActionMode) => void;
  setPlaceUnitId: (unitId: string | null) => void;
}

export function handlePlacementCellClick(
  context: PlacementCellClickContext,
  position: Coord,
): boolean {
  if (context.actionMode !== "place" || !context.placeUnitId) return false;
  if (!isCoordInList(context.legalPlacementCoords, position.col, position.row)) return true;

  context.sendGameAction({
    type: "placeUnit",
    unitId: context.placeUnitId,
    position,
  });
  context.setActionMode(null);
  context.setPlaceUnitId(null);
  return true;
}

interface UnitTargetClickParams {
  view: PlayerView;
  col: number;
  row: number;
  validTargetIds: readonly string[];
  submit: (targetId: string) => void;
}

export function submitUnitTargetClick({
  view,
  col,
  row,
  validTargetIds,
  submit,
}: UnitTargetClickParams): boolean {
  const target = getUnitAt(view, col, row);
  if (!target || !validTargetIds.includes(target.id)) return false;
  submit(target.id);
  return true;
}

export function createCellClickHandler(context: CellClickContext) {
  const {
    view,
    playerId,
    joined,
    isSpectator,
    hasBlockingRoll,
    boardSelectionPending,
    isStakePlacement,
    stakeLegalKeys,
    stakeLimit,
    setStakeSelections,
    isIntimidateChoice,
    intimidateKeys,
    pendingRoll,
    isForestTarget,
    forestTargetKeys,
    isForestMoveDestination,
    forestMoveDestinationKeys,
    isFemtoDivineMoveDestination,
    femtoDivineMoveKeys,
    isOdinSleipnirDestination,
    odinSleipnirKeys,
    isChargedImpulseTargetChoice,
    chargedImpulseTargetKeys,
    isRiverBoatCarryChoice,
    riverBoatCarryOptionIds,
    isRiverBoatDestinationChoice,
    riverBoatDestinationKeys,
    isRiverBoatDropDestination,
    riverBoatDropDestinationKeys,
    isRiverTraLaLaTargetChoice,
    riverTraLaLaTargetIds,
    isRiverTraLaLaDestinationChoice,
    riverTraLaLaDestinationKeys,
    isRiverTraLaLaDropDestinationChoice,
    riverTraLaLaDropDestinationKeys,
    isChikatiloPlacement,
    chikatiloPlacementKeys,
    isGroznyTyrantAllyChoice,
    groznyTyrantAllyOptionIds,
    isGroznyTyrantAttackCellChoice,
    groznyTyrantAttackCellOptions,
    groznyTyrantAttackCellKeys,
    isGuideTravelerPlacement,
    guideTravelerPlacementKeys,
    isJebeKhansShooterTargetChoice,
    jebeKhansShooterTargetIds,
    isHassanTrueEnemyTargetChoice,
    hassanTrueEnemyTargetIds,
    isAsgoreSoulParadePatienceTargetChoice,
    asgorePatienceTargetIds,
    isAsgoreSoulParadePerseveranceTargetChoice,
    asgorePerseveranceTargetIds,
    isAsgoreSoulParadeJusticeTargetChoice,
    asgoreJusticeTargetIds,
    isAsgoreSoulParadeIntegrityDestination,
    asgoreIntegrityDestinationKeys,
    isFriskPacifismHugsTargetChoice,
    friskPacifismHugsTargetIds,
    isFriskWarmWordsTargetChoice,
    friskWarmWordsTargetIds,
    isFriskPrecisionStrikeTargetChoice,
    friskPrecisionStrikeTargetIds,
    isLokiChickenTargetChoice,
    lokiChickenTargetIds,
    isLokiMindControlEnemyChoice,
    lokiMindControlEnemyIds,
    isLokiMindControlTargetChoice,
    lokiMindControlTargetIds,
    isHassanAssassinOrderSelection,
    hassanAssassinOrderEligibleIds,
    setHassanAssassinOrderSelections,
    actionMode,
    targetingMode,
    placeUnitId,
    legalPlacementCoords,
    sendGameAction,
    setActionMode,
    setPlaceUnitId,
    selectedUnitId,
    newHeroAbilityTargetId,
    setNewHeroAbilityTargetId,
    zoroAttackTargetIds,
    setZoroAttackTargetIds,
    legalMoveCoords,
    setMoveOptions,
    invadeTimeKeys,
    legalAttackTargets,
    gutsRangedTargetIds,
    asgoreFireballTargetIds,
    undyneSpearThrowTargetIds,
    hassanTrueEnemyCandidateIds,
    guideTravelerTargetIds,
    papyrusLongBoneAttackTargetIds,
    assassinMarkTargetIds,
    doraTargetKeys,
    artemidaLineTargetKeys,
    mettatonLineTargetKeys,
    undyneEnergySpearTargetKeys,
    jebeHailTargetKeys,
    kaladinFifthTargetKeys,
    tisonaTargetKeys,
    papyrusLineAxis,
    sendAction,
  } = context;

  return (col: number, row: number) => {
    if (
      !view ||
      !playerId ||
      !joined ||
      isSpectator ||
      (hasBlockingRoll && !boardSelectionPending)
    ) {
      return;
    }
    if (view.phase === "lobby") return;

    if (isStakePlacement) {
      const key = coordKey({ col, row });
      if (!stakeLegalKeys.has(key)) return;
      setStakeSelections((prev) => {
        const exists = prev.some((c) => coordKey(c) === key);
        if (exists) {
          return prev.filter((c) => coordKey(c) !== key);
        }
        if (prev.length >= stakeLimit) return prev;
        return [...prev, { col, row }];
      });
      return;
    }

    if (isIntimidateChoice) {
      const key = coordKey({ col, row });
      if (!intimidateKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "intimidatePush", to: { col, row } },
      } as unknown as GameAction);
      return;
    }

    if (isForestTarget) {
      const key = coordKey({ col, row });
      if (!forestTargetKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "forestTarget", center: { col, row } },
      } as GameAction);
      return;
    }

    if (isForestMoveDestination) {
      const key = coordKey({ col, row });
      if (!forestMoveDestinationKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "forestMoveDestination", position: { col, row } },
      } as GameAction);
      return;
    }

    if (isFemtoDivineMoveDestination) {
      const key = coordKey({ col, row });
      if (!femtoDivineMoveKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "femtoDivineMoveDestination", position: { col, row } },
      } as GameAction);
      return;
    }

    if (isOdinSleipnirDestination) {
      const key = coordKey({ col, row });
      if (!odinSleipnirKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: {
          type: "odinSleipnirDestination",
          position: { col, row },
        },
      } as unknown as GameAction);
      return;
    }

    if (isChargedImpulseTargetChoice) {
      const key = coordKey({ col, row });
      if (!chargedImpulseTargetKeys.has(key) || !pendingRoll) return;
      const pendingKind = String(pendingRoll.kind);
      const madnessDirection = pendingKind === "donMadDelusionDirection"
        ? getDonMadnessDirectionForCell(
            (pendingRoll.context ?? {}) as Record<string, unknown>,
            { col, row },
          )
        : null;
      if (pendingKind === "donMadDelusionDirection" && !madnessDirection) return;
      const choice = pendingKind === "donWindmillsRepositionChoice"
        ? { type: "donWindmillsReposition", destination: { col, row } }
        : pendingKind === "donSorrowfulMoveChoice"
          ? { type: "donSorrowfulMove", destination: { col, row } }
          : pendingKind === "donMadDelusionDirection"
            ? {
                type: "donMadDelusionDirection",
                direction: madnessDirection!,
              }
          : {
              type: "chargedImpulseTarget",
              position: { col, row },
              axis: papyrusLineAxis,
            };
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice,
      } as unknown as GameAction);
      return;
    }

    if (isRiverBoatCarryChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!riverBoatCarryOptionIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "hassanTrueEnemyTarget", targetId: target.id },
      } as GameAction);
      return;
    }

    if (isRiverBoatDestinationChoice) {
      const key = coordKey({ col, row });
      if (!riverBoatDestinationKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "forestMoveDestination", position: { col, row } },
      } as GameAction);
      return;
    }

    if (isRiverBoatDropDestination) {
      const key = coordKey({ col, row });
      if (!riverBoatDropDestinationKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "forestMoveDestination", position: { col, row } },
      } as GameAction);
      return;
    }

    if (isRiverTraLaLaTargetChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!riverTraLaLaTargetIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "hassanTrueEnemyTarget", targetId: target.id },
      } as GameAction);
      return;
    }

    if (isRiverTraLaLaDestinationChoice) {
      const key = coordKey({ col, row });
      if (!riverTraLaLaDestinationKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "forestMoveDestination", position: { col, row } },
      } as GameAction);
      return;
    }

    if (isRiverTraLaLaDropDestinationChoice) {
      const key = coordKey({ col, row });
      if (!riverTraLaLaDropDestinationKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "forestMoveDestination", position: { col, row } },
      } as GameAction);
      return;
    }

    if (isChikatiloPlacement) {
      const key = coordKey({ col, row });
      if (!chikatiloPlacementKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "chikatiloPlace", position: { col, row } },
      } as GameAction);
      return;
    }

    if (isGroznyTyrantAllyChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!groznyTyrantAllyOptionIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "groznyTyrantAlly", targetId: target.id },
      } as GameAction);
      return;
    }

    if (isGroznyTyrantAttackCellChoice) {
      const key = coordKey({ col, row });
      if (!groznyTyrantAttackCellKeys.has(key) || !pendingRoll) return;
      const selected = groznyTyrantAttackCellOptions.find(
        (option) => coordKey(option.position) === key
      );
      if (!selected) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: {
          type: "groznyTyrantAttackCell",
          mode: selected.mode,
          targetId: selected.targetId,
          position: selected.position,
        },
      } as GameAction);
      return;
    }

    if (isGuideTravelerPlacement) {
      const key = coordKey({ col, row });
      if (!guideTravelerPlacementKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "lechyGuideTravelerPlace", position: { col, row } },
      } as GameAction);
      return;
    }

    if (isJebeKhansShooterTargetChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!jebeKhansShooterTargetIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "jebeKhansShooterTarget", targetId: target.id },
      } as GameAction);
      return;
    }

    if (isHassanTrueEnemyTargetChoice) {
      if (!pendingRoll) return;
      submitUnitTargetClick({
        view,
        col,
        row,
        validTargetIds: hassanTrueEnemyTargetIds,
        submit: (targetId) =>
          sendAction({
            type: "resolvePendingRoll",
            pendingRollId: pendingRoll.id,
            player: playerId,
            choice: { type: "hassanTrueEnemyTarget", targetId },
          }),
      });
      return;
    }

    if (isAsgoreSoulParadePatienceTargetChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!asgorePatienceTargetIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "asgoreSoulParadePatienceTarget", targetId: target.id },
      } as GameAction);
      return;
    }

    if (isAsgoreSoulParadePerseveranceTargetChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!asgorePerseveranceTargetIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: {
          type: "asgoreSoulParadePerseveranceTarget",
          targetId: target.id,
        },
      } as GameAction);
      return;
    }

    if (isAsgoreSoulParadeJusticeTargetChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!asgoreJusticeTargetIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "asgoreSoulParadeJusticeTarget", targetId: target.id },
      } as GameAction);
      return;
    }

    if (isAsgoreSoulParadeIntegrityDestination) {
      const key = coordKey({ col, row });
      if (!asgoreIntegrityDestinationKeys.has(key) || !pendingRoll) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: {
          type: "asgoreSoulParadeIntegrityDestination",
          position: { col, row },
        },
      } as GameAction);
      return;
    }

    if (isFriskPacifismHugsTargetChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!friskPacifismHugsTargetIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "friskPacifismHugsTarget", targetId: target.id },
      } as GameAction);
      return;
    }

    if (isFriskWarmWordsTargetChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!friskWarmWordsTargetIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "friskWarmWordsTarget", targetId: target.id },
      } as GameAction);
      return;
    }

    if (isFriskPrecisionStrikeTargetChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!friskPrecisionStrikeTargetIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "friskPrecisionStrikeTarget", targetId: target.id },
      } as GameAction);
      return;
    }

    if (isLokiChickenTargetChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!lokiChickenTargetIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "lokiChickenTarget", targetId: target.id },
      } as GameAction);
      return;
    }

    if (isLokiMindControlEnemyChoice) {
      if (!pendingRoll) return;
      submitUnitTargetClick({
        view,
        col,
        row,
        validTargetIds: lokiMindControlEnemyIds,
        submit: (targetId) =>
          sendAction({
            type: "resolvePendingRoll",
            pendingRollId: pendingRoll.id,
            player: playerId,
            choice: { type: "lokiMindControlEnemy", targetId },
          }),
      });
      return;
    }

    if (isLokiMindControlTargetChoice) {
      if (!pendingRoll) return;
      submitUnitTargetClick({
        view,
        col,
        row,
        validTargetIds: lokiMindControlTargetIds,
        submit: (targetId) =>
          sendAction({
            type: "resolvePendingRoll",
            pendingRollId: pendingRoll.id,
            player: playerId,
            choice: { type: "lokiMindControlTarget", targetId },
          }),
      });
      return;
    }

    if (isHassanAssassinOrderSelection) {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!hassanAssassinOrderEligibleIds.includes(target.id)) return;
      setHassanAssassinOrderSelections((prev) => {
        const exists = prev.includes(target.id);
        if (exists) {
          return prev.filter((id) => id !== target.id);
        }
        if (prev.length >= 2) return prev;
        return [...prev, target.id];
      });
      return;
    }

    if (
      handlePlacementCellClick(
        {
          actionMode,
          placeUnitId,
          legalPlacementCoords,
          sendGameAction,
          setActionMode,
          setPlaceUnitId,
        },
        { col, row },
      )
    ) {
      return;
    }

    if (!selectedUnitId) return;

    if (actionMode === "duolingoPush" || actionMode === "zoroOniGiri") {
      const abilityId = actionMode === "duolingoPush"
        ? DUOLINGO_PUSH_NOTIFICATION_ID
        : ZORO_ONI_GIRI_ID;
      const targeting = view.abilitiesByUnitId?.[selectedUnitId]?.find((ability) => ability.id === abilityId)?.targeting;
      if (!newHeroAbilityTargetId) {
        const target = getUnitAt(view, col, row);
        if (!target?.isAlive || !target.position || !targeting?.targetIds?.includes(target.id)) return;
        setNewHeroAbilityTargetId(target.id);
        return;
      }
      const destinations = targeting?.destinationsByTargetId?.[newHeroAbilityTargetId] ?? [];
      if (!isCoordInList(destinations, col, row)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId,
        payload: {
          targetId: newHeroAbilityTargetId,
          destination: { col, row },
          ...(targetingMode?.useSource ? { source: targetingMode.useSource } : {}),
        },
      });
      setNewHeroAbilityTargetId(null);
      setActionMode(null);
      return;
    }

    if (
      actionMode === "donWindmills" ||
      actionMode === "jackHolyMother"
    ) {
      const target = getUnitAt(view, col, row);
      const source = view.units[selectedUnitId];
      if (!target?.isAlive || !target.position || !source?.position || target.owner === source.owner) return;
      if (actionMode === "jackHolyMother" && !legalAttackTargets.includes(target.id)) return;
      if (actionMode === "donWindmills") {
        if (!target.heroId) return;
        const colDelta = Math.abs(target.position.col - source.position.col);
        const rowDelta = Math.abs(target.position.row - source.position.row);
        if (colDelta !== 0 && rowDelta !== 0 && colDelta !== rowDelta) return;
        if (source.blindUntilOwnTurnStart && Math.max(colDelta, rowDelta) > 1) return;
      }
      const abilityId =
        actionMode === "donWindmills"
              ? DON_WINDMILLS_ID
              : JACK_HOLY_MOTHER_ID;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId,
        payload: { targetId: target.id },
      });
      setActionMode(null);
      return;
    }

    if (
      actionMode === "lucheLightRay" ||
      actionMode === "donReaction" ||
      actionMode === "jackTrap" ||
      actionMode === "artemisMoonInsight" ||
      actionMode === "artemisSilverSickle"
    ) {
      if (actionMode === "lucheLightRay") {
        const legalCells = view.abilitiesByUnitId?.[selectedUnitId]
          ?.find((ability) => ability.id === LUCHE_DIVINE_RAY_ID)
          ?.targeting?.cells ?? [];
        if (!isCoordInList(legalCells, col, row)) return;
      }
      if (
        (actionMode === "artemisMoonInsight" || actionMode === "artemisSilverSickle") &&
        !artemidaLineTargetKeys.has(coordKey({ col, row }))
      ) return;
      const source = view.units[selectedUnitId];
      if (
        source?.position &&
        source.blindUntilOwnTurnStart &&
        (actionMode === "lucheLightRay" ||
          actionMode === "artemisMoonInsight" ||
          actionMode === "artemisSilverSickle") &&
        Math.max(Math.abs(col - source.position.col), Math.abs(row - source.position.row)) > 1
      ) return;
      const abilityId =
        actionMode === "lucheLightRay"
          ? LUCHE_DIVINE_RAY_ID
          : actionMode === "donReaction"
            ? DON_SORROWFUL_ID
            : actionMode === "jackTrap"
              ? JACK_SNARES_ID
              : actionMode === "artemisMoonInsight"
                ? ARTEMIS_MOON_INSIGHT_ID
                : ARTEMIS_SILVER_SICKLE_ID;
      const payloadKey =
        actionMode === "donReaction"
          ? "destination"
          : actionMode === "jackTrap"
            ? "position"
            : actionMode === "artemisMoonInsight"
              ? "center"
              : "target";
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId,
        payload: {
          [payloadKey]: { col, row },
          ...(actionMode === "lucheLightRay" && targetingMode?.useSource
            ? { source: targetingMode.useSource }
            : {}),
        },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "move") {
      if (!isCoordInList(legalMoveCoords, col, row)) return;
      sendGameAction({
        type: "move",
        unitId: selectedUnitId,
        to: { col, row },
      });
      setActionMode(null);
      setMoveOptions(null);
      return;
    }

    if (actionMode === "invadeTime") {
      if (!invadeTimeKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: GROZNY_INVADE_TIME_ID,
        payload: { to: { col, row } },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "odinSleipnir") {
      if (!invadeTimeKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: ODIN_SLEIPNIR_ID,
        payload: { to: { col, row } },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "papyrusCoolGuy") {
      const source = view.units[selectedUnitId];
      if (
        source?.position &&
        source.blindUntilOwnTurnStart &&
        Math.max(Math.abs(col - source.position.col), Math.abs(row - source.position.row)) > 1
      ) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: PAPYRUS_COOL_GUY_ID,
        payload: { target: { col, row }, axis: papyrusLineAxis },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "jebeKhansShooter") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!legalAttackTargets.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: JEBE_KHANS_SHOOTER_ID,
        payload: { targetId: target.id },
      });
      return;
    }

    if (actionMode === "gutsArbalet") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!gutsRangedTargetIds.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: GUTS_ARBALET_ID,
        payload: { targetId: target.id },
      });
      return;
    }

    if (actionMode === "gutsCannon") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!gutsRangedTargetIds.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: GUTS_CANNON_ID,
        payload: { targetId: target.id },
      });
      return;
    }

    if (actionMode === "asgoreFireball") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!asgoreFireballTargetIds.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: ASGORE_FIREBALL_ID,
        payload: { targetId: target.id },
      });
      return;
    }

    if (actionMode === "asgoreFireParade") {
      const source = view.units[selectedUnitId];
      if (!source?.position) return;
      if (source.position.col !== col || source.position.row !== row) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: ASGORE_FIRE_PARADE_ID,
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "undyneSpearThrow") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!undyneSpearThrowTargetIds.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: UNDYNE_SPEAR_THROW_ID,
        payload: { targetId: target.id },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "undyneEnergySpear") {
      const key = coordKey({ col, row });
      if (!undyneEnergySpearTargetKeys.has(key)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: UNDYNE_ENERGY_SPEAR_ID,
        payload: {
          target: { col, row },
          axis: papyrusLineAxis === "col" ? "col" : "row",
        },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "hassanTrueEnemy") {
      submitUnitTargetClick({
        view,
        col,
        row,
        validTargetIds: hassanTrueEnemyCandidateIds,
        submit: (targetId) =>
          sendGameAction({
            type: "useAbility",
            unitId: selectedUnitId,
            abilityId: HASSAN_TRUE_ENEMY_ID,
            payload: { forcedAttackerId: targetId },
          }),
      });
      return;
    }

    if (actionMode === "guideTraveler") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!guideTravelerTargetIds.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: LECHY_GUIDE_TRAVELER_ID,
        payload: { targetId: target.id },
      });
      setActionMode("move");
      return;
    }

    if (actionMode === "attack") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      const targetIds =
        papyrusLongBoneAttackTargetIds.length > 0
          ? papyrusLongBoneAttackTargetIds
          : legalAttackTargets;
      if (!targetIds.includes(target.id)) return;
      const attacker = view.units[selectedUnitId];
      if (attacker?.heroId === "zoro") {
        const firstTargetId = zoroAttackTargetIds[0];
        if (!firstTargetId) {
          setZoroAttackTargetIds([target.id]);
          return;
        }
        const defenderIds =
          firstTargetId === target.id
            ? [target.id]
            : [firstTargetId, target.id];
        sendGameAction({
          type: "attack",
          attackerId: selectedUnitId,
          defenderId: defenderIds[0],
          defenderIds,
        });
        setZoroAttackTargetIds([]);
        return;
      }
      sendGameAction({
        type: "attack",
        attackerId: selectedUnitId,
        defenderId: target.id,
      });
      return;
    }

    if (actionMode === "assassinMark") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!assassinMarkTargetIds.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: CHIKATILO_ASSASSIN_MARK_ID,
        payload: { targetId: target.id },
      });
      return;
    }

    if (actionMode === "demonDuelist") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!legalAttackTargets.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: EL_CID_DEMON_DUELIST_ID,
        payload: { targetId: target.id },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "dora") {
      if (!doraTargetKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: KAISER_DORA_ID,
        payload: { center: { col, row } },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "mettatonPoppins") {
      if (!mettatonLineTargetKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: METTATON_POPPINS_ID,
        payload: { center: { col, row } },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "mettatonLaser") {
      if (!mettatonLineTargetKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: METTATON_LASER_ID,
        payload: { target: { col, row } },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "sansGasterBlaster") {
      if (!mettatonLineTargetKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: SANS_GASTER_BLASTER_ID,
        payload: { target: { col, row } },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "jebeHailOfArrows") {
      if (!jebeHailTargetKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: JEBE_HAIL_OF_ARROWS_ID,
        payload: { center: { col, row } },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "kaladinFifth") {
      if (!kaladinFifthTargetKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: KALADIN_FIFTH_ID,
        payload: { center: { col, row } },
      });
      setActionMode(null);
      return;
    }

    if (actionMode === "tisona") {
      if (!tisonaTargetKeys.has(coordKey({ col, row }))) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: EL_CID_TISONA_ID,
        payload: { target: { col, row } },
      });
      setActionMode(null);
      return;
    }
  };
}

interface CellHoverContext {
  actionMode: ActionMode;
  isForestTarget: boolean;
  doraTargetKeys: Set<string>;
  artemidaLineTargetKeys: Set<string>;
  isArtemidaMoonInsightChoice: boolean;
  chargedImpulseTargetKeys: Set<string>;
  mettatonLineTargetKeys: Set<string>;
  undyneEnergySpearTargetKeys: Set<string>;
  jebeHailTargetKeys: Set<string>;
  kaladinFifthTargetKeys: Set<string>;
  tisonaTargetKeys: Set<string>;
  forestTargetKeys: Set<string>;
  setDoraPreviewCenter: Dispatch<SetStateAction<Coord | null>>;
  setArtemidaPreviewTarget: Dispatch<SetStateAction<Coord | null>>;
  setMettatonPoppinsPreviewCenter: Dispatch<SetStateAction<Coord | null>>;
  setMettatonLaserPreviewTarget: Dispatch<SetStateAction<Coord | null>>;
  setSansGasterBlasterPreviewTarget: Dispatch<SetStateAction<Coord | null>>;
  setUndyneEnergySpearPreviewTarget: Dispatch<SetStateAction<Coord | null>>;
  setJebeHailPreviewCenter: Dispatch<SetStateAction<Coord | null>>;
  setKaladinFifthPreviewCenter: Dispatch<SetStateAction<Coord | null>>;
  setTisonaPreviewCoord: Dispatch<SetStateAction<Coord | null>>;
  setForestPreviewCenter: Dispatch<SetStateAction<Coord | null>>;
  setNewHeroAbilityPreviewCell: Dispatch<SetStateAction<Coord | null>>;
}

export function createCellHoverHandler(context: CellHoverContext) {
  const {
    actionMode,
    isForestTarget,
    doraTargetKeys,
    artemidaLineTargetKeys,
    isArtemidaMoonInsightChoice,
    chargedImpulseTargetKeys,
    mettatonLineTargetKeys,
    undyneEnergySpearTargetKeys,
    jebeHailTargetKeys,
    kaladinFifthTargetKeys,
    tisonaTargetKeys,
    forestTargetKeys,
    setDoraPreviewCenter,
    setArtemidaPreviewTarget,
    setMettatonPoppinsPreviewCenter,
    setMettatonLaserPreviewTarget,
    setSansGasterBlasterPreviewTarget,
    setUndyneEnergySpearPreviewTarget,
    setJebeHailPreviewCenter,
    setKaladinFifthPreviewCenter,
    setTisonaPreviewCoord,
    setForestPreviewCenter,
    setNewHeroAbilityPreviewCell,
  } = context;

  return (coord: Coord | null) => {
    if (
      actionMode === "duolingoPush" ||
      actionMode === "zoroOniGiri" ||
      actionMode === "lucheLightRay"
    ) {
      setNewHeroAbilityPreviewCell(coord);
      return;
    }
    if (
      actionMode === "artemisMoonInsight" ||
      actionMode === "artemisSilverSickle" ||
      isArtemidaMoonInsightChoice
    ) {
      if (!coord) {
        setArtemidaPreviewTarget(null);
        return;
      }
      const legalKeys = isArtemidaMoonInsightChoice
        ? chargedImpulseTargetKeys
        : artemidaLineTargetKeys;
      setArtemidaPreviewTarget(legalKeys.has(coordKey(coord)) ? coord : null);
      return;
    }

    if (actionMode === "dora") {
      if (!coord) {
        setDoraPreviewCenter(null);
        return;
      }
      const key = coordKey(coord);
      setDoraPreviewCenter(doraTargetKeys.has(key) ? coord : null);
      return;
    }

    if (actionMode === "mettatonPoppins") {
      if (!coord) {
        setMettatonPoppinsPreviewCenter(null);
        return;
      }
      const key = coordKey(coord);
      setMettatonPoppinsPreviewCenter(
        mettatonLineTargetKeys.has(key) ? coord : null
      );
      return;
    }

    if (actionMode === "mettatonLaser") {
      if (!coord) {
        setMettatonLaserPreviewTarget(null);
        return;
      }
      const key = coordKey(coord);
      setMettatonLaserPreviewTarget(
        mettatonLineTargetKeys.has(key) ? coord : null
      );
      return;
    }

    if (actionMode === "sansGasterBlaster") {
      if (!coord) {
        setSansGasterBlasterPreviewTarget(null);
        return;
      }
      const key = coordKey(coord);
      setSansGasterBlasterPreviewTarget(
        mettatonLineTargetKeys.has(key) ? coord : null
      );
      return;
    }

    if (actionMode === "undyneEnergySpear") {
      if (!coord) {
        setUndyneEnergySpearPreviewTarget(null);
        return;
      }
      const key = coordKey(coord);
      setUndyneEnergySpearPreviewTarget(
        undyneEnergySpearTargetKeys.has(key) ? coord : null
      );
      return;
    }

    if (actionMode === "jebeHailOfArrows") {
      if (!coord) {
        setJebeHailPreviewCenter(null);
        return;
      }
      const key = coordKey(coord);
      setJebeHailPreviewCenter(jebeHailTargetKeys.has(key) ? coord : null);
      return;
    }

    if (actionMode === "kaladinFifth") {
      if (!coord) {
        setKaladinFifthPreviewCenter(null);
        return;
      }
      const key = coordKey(coord);
      setKaladinFifthPreviewCenter(kaladinFifthTargetKeys.has(key) ? coord : null);
      return;
    }

    if (actionMode === "tisona") {
      if (!coord) {
        setTisonaPreviewCoord(null);
        return;
      }
      const key = coordKey(coord);
      setTisonaPreviewCoord(tisonaTargetKeys.has(key) ? coord : null);
      return;
    }

    if (isForestTarget) {
      if (!coord) {
        setForestPreviewCenter(null);
        return;
      }
      const key = coordKey(coord);
      setForestPreviewCenter(forestTargetKeys.has(key) ? coord : null);
    }
  };
}
