import type { Dispatch, SetStateAction } from "react";
import type { Coord, GameAction, PapyrusLineAxis, PlayerView } from "rules";
import type { ActionMode } from "../../store";
import {
  ASGORE_FIREBALL_ID,
  CHIKATILO_ASSASSIN_MARK_ID,
  EL_CID_DEMON_DUELIST_ID,
  EL_CID_TISONA_ID,
  GROZNY_INVADE_TIME_ID,
  GUTS_ARBALET_ID,
  GUTS_CANNON_ID,
  HASSAN_TRUE_ENEMY_ID,
  JEBE_HAIL_OF_ARROWS_ID,
  JEBE_KHANS_SHOOTER_ID,
  KAISER_DORA_ID,
  KALADIN_FIFTH_ID,
  LECHY_GUIDE_TRAVELER_ID,
  METTATON_LASER_ID,
  METTATON_POPPINS_ID,
  ODIN_SLEIPNIR_ID,
  PAPYRUS_COOL_GUY_ID,
} from "../../rulesHints";
import { coordKey, getUnitAt, isCoordInList } from "./helpers";

interface MoveOptionsState {
  unitId: string;
  legalTo: Coord[];
  mode?: string;
  modes?: string[];
  roll?: number | null;
}

export interface CellClickContext {
  view: PlayerView | null;
  playerId: string | null;
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
  isRiverBoatCarryChoice: boolean;
  riverBoatCarryOptionIds: string[];
  isRiverBoatDropDestination: boolean;
  riverBoatDropDestinationKeys: Set<string>;
  isRiverTraLaLaTargetChoice: boolean;
  riverTraLaLaTargetIds: string[];
  isRiverTraLaLaDestinationChoice: boolean;
  riverTraLaLaDestinationKeys: Set<string>;
  isChikatiloPlacement: boolean;
  chikatiloPlacementKeys: Set<string>;
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
  placeUnitId: string | null;
  legalPlacementCoords: Coord[];
  sendGameAction: (action: GameAction) => void;
  setActionMode: (mode: ActionMode) => void;
  setPlaceUnitId: (unitId: string | null) => void;
  selectedUnitId: string | null;
  legalMoveCoords: Coord[];
  setMoveOptions: (options: MoveOptionsState | null) => void;
  invadeTimeKeys: Set<string>;
  legalAttackTargets: string[];
  gutsRangedTargetIds: string[];
  asgoreFireballTargetIds: string[];
  hassanTrueEnemyCandidateIds: string[];
  guideTravelerTargetIds: string[];
  papyrusLongBoneAttackTargetIds: string[];
  assassinMarkTargetIds: string[];
  doraTargetKeys: Set<string>;
  mettatonLineTargetKeys: Set<string>;
  jebeHailTargetKeys: Set<string>;
  kaladinFifthTargetKeys: Set<string>;
  tisonaTargetKeys: Set<string>;
  papyrusLineAxis: PapyrusLineAxis;
  sendAction: (action: GameAction) => void;
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
    isRiverBoatCarryChoice,
    riverBoatCarryOptionIds,
    isRiverBoatDropDestination,
    riverBoatDropDestinationKeys,
    isRiverTraLaLaTargetChoice,
    riverTraLaLaTargetIds,
    isRiverTraLaLaDestinationChoice,
    riverTraLaLaDestinationKeys,
    isChikatiloPlacement,
    chikatiloPlacementKeys,
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
    placeUnitId,
    legalPlacementCoords,
    sendGameAction,
    setActionMode,
    setPlaceUnitId,
    selectedUnitId,
    legalMoveCoords,
    setMoveOptions,
    invadeTimeKeys,
    legalAttackTargets,
    gutsRangedTargetIds,
    asgoreFireballTargetIds,
    hassanTrueEnemyCandidateIds,
    guideTravelerTargetIds,
    papyrusLongBoneAttackTargetIds,
    assassinMarkTargetIds,
    doraTargetKeys,
    mettatonLineTargetKeys,
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
      } as GameAction);
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
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!hassanTrueEnemyTargetIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "hassanTrueEnemyTarget", targetId: target.id },
      } as GameAction);
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
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!lokiMindControlEnemyIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "lokiMindControlEnemy", targetId: target.id },
      } as GameAction);
      return;
    }

    if (isLokiMindControlTargetChoice) {
      const target = getUnitAt(view, col, row);
      if (!target || !pendingRoll) return;
      if (!lokiMindControlTargetIds.includes(target.id)) return;
      sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pendingRoll.id,
        choice: { type: "lokiMindControlTarget", targetId: target.id },
      } as GameAction);
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

    if (actionMode === "place" && placeUnitId) {
      if (!isCoordInList(legalPlacementCoords, col, row)) return;
      sendGameAction({
        type: "placeUnit",
        unitId: placeUnitId,
        position: { col, row },
      });
      setActionMode(null);
      setPlaceUnitId(null);
      return;
    }

    if (!selectedUnitId) return;

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
      setActionMode(null);
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
      setActionMode(null);
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
      setActionMode(null);
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
      setActionMode(null);
      return;
    }

    if (actionMode === "hassanTrueEnemy") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      if (!hassanTrueEnemyCandidateIds.includes(target.id)) return;
      sendGameAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: HASSAN_TRUE_ENEMY_ID,
        payload: { forcedAttackerId: target.id },
      });
      setActionMode(null);
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
      sendGameAction({
        type: "attack",
        attackerId: selectedUnitId,
        defenderId: target.id,
      });
      setActionMode(null);
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
      setActionMode(null);
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
  mettatonLineTargetKeys: Set<string>;
  jebeHailTargetKeys: Set<string>;
  kaladinFifthTargetKeys: Set<string>;
  tisonaTargetKeys: Set<string>;
  forestTargetKeys: Set<string>;
  setDoraPreviewCenter: Dispatch<SetStateAction<Coord | null>>;
  setMettatonPoppinsPreviewCenter: Dispatch<SetStateAction<Coord | null>>;
  setMettatonLaserPreviewTarget: Dispatch<SetStateAction<Coord | null>>;
  setJebeHailPreviewCenter: Dispatch<SetStateAction<Coord | null>>;
  setKaladinFifthPreviewCenter: Dispatch<SetStateAction<Coord | null>>;
  setTisonaPreviewCoord: Dispatch<SetStateAction<Coord | null>>;
  setForestPreviewCenter: Dispatch<SetStateAction<Coord | null>>;
}

export function createCellHoverHandler(context: CellHoverContext) {
  const {
    actionMode,
    isForestTarget,
    doraTargetKeys,
    mettatonLineTargetKeys,
    jebeHailTargetKeys,
    kaladinFifthTargetKeys,
    tisonaTargetKeys,
    forestTargetKeys,
    setDoraPreviewCenter,
    setMettatonPoppinsPreviewCenter,
    setMettatonLaserPreviewTarget,
    setJebeHailPreviewCenter,
    setKaladinFifthPreviewCenter,
    setTisonaPreviewCoord,
    setForestPreviewCenter,
  } = context;

  return (coord: Coord | null) => {
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
