import { useEffect } from "react";
import { coordKey } from "../helpers";

interface UseGameShellPreviewEffectsParams {
  actionMode: any;
  selectedUnitId: string | null;
  doraPreviewCenter: any;
  setDoraPreviewCenter: (value: any) => void;
  doraTargetKeys: Set<string>;
  jebeHailPreviewCenter: any;
  setJebeHailPreviewCenter: (value: any) => void;
  jebeHailTargetKeys: Set<string>;
  mettatonPoppinsPreviewCenter: any;
  setMettatonPoppinsPreviewCenter: (value: any) => void;
  mettatonLineTargetKeys: Set<string>;
  mettatonLaserPreviewTarget: any;
  setMettatonLaserPreviewTarget: (value: any) => void;
  sansGasterBlasterPreviewTarget: any;
  setSansGasterBlasterPreviewTarget: (value: any) => void;
  undyneEnergySpearPreviewTarget: any;
  setUndyneEnergySpearPreviewTarget: (value: any) => void;
  undyneEnergySpearTargetKeys: Set<string>;
  kaladinFifthPreviewCenter: any;
  setKaladinFifthPreviewCenter: (value: any) => void;
  kaladinFifthTargetKeys: Set<string>;
  tisonaPreviewCoord: any;
  setTisonaPreviewCoord: (value: any) => void;
  tisonaTargetKeys: Set<string>;
  isStakePlacement: boolean;
  pendingRoll: any;
  setStakeSelections: (value: any) => void;
  isHassanAssassinOrderSelection: boolean;
  setHassanAssassinOrderSelections: (value: any) => void;
  isForestTarget: boolean;
  forestPreviewCenter: any;
  setForestPreviewCenter: (value: any) => void;
  forestTargetKeys: Set<string>;
}

export function useGameShellPreviewEffects({
  actionMode,
  selectedUnitId,
  doraPreviewCenter,
  setDoraPreviewCenter,
  doraTargetKeys,
  jebeHailPreviewCenter,
  setJebeHailPreviewCenter,
  jebeHailTargetKeys,
  mettatonPoppinsPreviewCenter,
  setMettatonPoppinsPreviewCenter,
  mettatonLineTargetKeys,
  mettatonLaserPreviewTarget,
  setMettatonLaserPreviewTarget,
  sansGasterBlasterPreviewTarget,
  setSansGasterBlasterPreviewTarget,
  undyneEnergySpearPreviewTarget,
  setUndyneEnergySpearPreviewTarget,
  undyneEnergySpearTargetKeys,
  kaladinFifthPreviewCenter,
  setKaladinFifthPreviewCenter,
  kaladinFifthTargetKeys,
  tisonaPreviewCoord,
  setTisonaPreviewCoord,
  tisonaTargetKeys,
  isStakePlacement,
  pendingRoll,
  setStakeSelections,
  isHassanAssassinOrderSelection,
  setHassanAssassinOrderSelections,
  isForestTarget,
  forestPreviewCenter,
  setForestPreviewCenter,
  forestTargetKeys,
}: UseGameShellPreviewEffectsParams) {
  useEffect(() => {
    if (actionMode !== "dora") {
      setDoraPreviewCenter(null);
      return;
    }
    if (!selectedUnitId) {
      setDoraPreviewCenter(null);
    }
  }, [actionMode, selectedUnitId, setDoraPreviewCenter]);

  useEffect(() => {
    if (actionMode !== "dora" || !doraPreviewCenter) return;
    if (!doraTargetKeys.has(coordKey(doraPreviewCenter))) {
      setDoraPreviewCenter(null);
    }
  }, [actionMode, doraPreviewCenter, doraTargetKeys, setDoraPreviewCenter]);

  useEffect(() => {
    if (actionMode !== "jebeHailOfArrows") {
      setJebeHailPreviewCenter(null);
      return;
    }
    if (!selectedUnitId) {
      setJebeHailPreviewCenter(null);
    }
  }, [actionMode, selectedUnitId, setJebeHailPreviewCenter]);

  useEffect(() => {
    if (actionMode !== "jebeHailOfArrows" || !jebeHailPreviewCenter) return;
    if (!jebeHailTargetKeys.has(coordKey(jebeHailPreviewCenter))) {
      setJebeHailPreviewCenter(null);
    }
  }, [actionMode, jebeHailPreviewCenter, jebeHailTargetKeys, setJebeHailPreviewCenter]);

  useEffect(() => {
    if (actionMode !== "mettatonPoppins") {
      setMettatonPoppinsPreviewCenter(null);
      return;
    }
    if (!selectedUnitId) {
      setMettatonPoppinsPreviewCenter(null);
    }
  }, [actionMode, selectedUnitId, setMettatonPoppinsPreviewCenter]);

  useEffect(() => {
    if (actionMode !== "mettatonPoppins" || !mettatonPoppinsPreviewCenter) return;
    if (!mettatonLineTargetKeys.has(coordKey(mettatonPoppinsPreviewCenter))) {
      setMettatonPoppinsPreviewCenter(null);
    }
  }, [
    actionMode,
    mettatonPoppinsPreviewCenter,
    mettatonLineTargetKeys,
    setMettatonPoppinsPreviewCenter,
  ]);

  useEffect(() => {
    if (actionMode !== "mettatonLaser") {
      setMettatonLaserPreviewTarget(null);
      return;
    }
    if (!selectedUnitId) {
      setMettatonLaserPreviewTarget(null);
    }
  }, [actionMode, selectedUnitId, setMettatonLaserPreviewTarget]);

  useEffect(() => {
    if (actionMode !== "mettatonLaser" || !mettatonLaserPreviewTarget) return;
    if (!mettatonLineTargetKeys.has(coordKey(mettatonLaserPreviewTarget))) {
      setMettatonLaserPreviewTarget(null);
    }
  }, [
    actionMode,
    mettatonLaserPreviewTarget,
    mettatonLineTargetKeys,
    setMettatonLaserPreviewTarget,
  ]);

  useEffect(() => {
    if (actionMode !== "sansGasterBlaster") {
      setSansGasterBlasterPreviewTarget(null);
      return;
    }
    if (!selectedUnitId) {
      setSansGasterBlasterPreviewTarget(null);
    }
  }, [actionMode, selectedUnitId, setSansGasterBlasterPreviewTarget]);

  useEffect(() => {
    if (actionMode !== "sansGasterBlaster" || !sansGasterBlasterPreviewTarget) {
      return;
    }
    if (!mettatonLineTargetKeys.has(coordKey(sansGasterBlasterPreviewTarget))) {
      setSansGasterBlasterPreviewTarget(null);
    }
  }, [
    actionMode,
    sansGasterBlasterPreviewTarget,
    mettatonLineTargetKeys,
    setSansGasterBlasterPreviewTarget,
  ]);

  useEffect(() => {
    if (actionMode !== "undyneEnergySpear") {
      setUndyneEnergySpearPreviewTarget(null);
      return;
    }
    if (!selectedUnitId) {
      setUndyneEnergySpearPreviewTarget(null);
    }
  }, [actionMode, selectedUnitId, setUndyneEnergySpearPreviewTarget]);

  useEffect(() => {
    if (actionMode !== "undyneEnergySpear" || !undyneEnergySpearPreviewTarget) {
      return;
    }
    if (!undyneEnergySpearTargetKeys.has(coordKey(undyneEnergySpearPreviewTarget))) {
      setUndyneEnergySpearPreviewTarget(null);
    }
  }, [
    actionMode,
    undyneEnergySpearPreviewTarget,
    undyneEnergySpearTargetKeys,
    setUndyneEnergySpearPreviewTarget,
  ]);

  useEffect(() => {
    if (actionMode !== "kaladinFifth") {
      setKaladinFifthPreviewCenter(null);
      return;
    }
    if (!selectedUnitId) {
      setKaladinFifthPreviewCenter(null);
    }
  }, [actionMode, selectedUnitId, setKaladinFifthPreviewCenter]);

  useEffect(() => {
    if (actionMode !== "kaladinFifth" || !kaladinFifthPreviewCenter) return;
    if (!kaladinFifthTargetKeys.has(coordKey(kaladinFifthPreviewCenter))) {
      setKaladinFifthPreviewCenter(null);
    }
  }, [
    actionMode,
    kaladinFifthPreviewCenter,
    kaladinFifthTargetKeys,
    setKaladinFifthPreviewCenter,
  ]);

  useEffect(() => {
    if (actionMode !== "tisona") {
      setTisonaPreviewCoord(null);
      return;
    }
    if (!selectedUnitId) {
      setTisonaPreviewCoord(null);
    }
  }, [actionMode, selectedUnitId, setTisonaPreviewCoord]);

  useEffect(() => {
    if (actionMode !== "tisona" || !tisonaPreviewCoord) return;
    if (!tisonaTargetKeys.has(coordKey(tisonaPreviewCoord))) {
      setTisonaPreviewCoord(null);
    }
  }, [actionMode, tisonaPreviewCoord, tisonaTargetKeys, setTisonaPreviewCoord]);

  useEffect(() => {
    if (!isStakePlacement) {
      setStakeSelections([]);
      return;
    }
    setStakeSelections([]);
  }, [isStakePlacement, pendingRoll?.id, setStakeSelections]);

  useEffect(() => {
    if (!isHassanAssassinOrderSelection) {
      setHassanAssassinOrderSelections([]);
      return;
    }
    setHassanAssassinOrderSelections([]);
  }, [
    isHassanAssassinOrderSelection,
    pendingRoll?.id,
    setHassanAssassinOrderSelections,
  ]);

  useEffect(() => {
    if (!isForestTarget) {
      setForestPreviewCenter(null);
      return;
    }
    setForestPreviewCenter(null);
  }, [isForestTarget, pendingRoll?.id, setForestPreviewCenter]);

  useEffect(() => {
    if (!isForestTarget || !forestPreviewCenter) return;
    if (!forestTargetKeys.has(coordKey(forestPreviewCenter))) {
      setForestPreviewCenter(null);
    }
  }, [
    isForestTarget,
    forestPreviewCenter,
    forestTargetKeys,
    setForestPreviewCenter,
  ]);
}
