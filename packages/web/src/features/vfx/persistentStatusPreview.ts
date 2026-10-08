import type { PlayerId, GameState, PlayerView } from "rules";
import { createVfxPreviewView } from "./vfxPreviewScenarios";

export type PersistentPreviewMode = "off" | "statuses" | "boneField" | "storm" | "cleared";
export type PreviewRecipient = PlayerId | "spectator";

/** Synthetic rules state passed through the real recipient projection. No ingress. */
function createFixtureData(): Pick<
  GameState,
  "units" | "stakeMarkers" | "jackTraps" | "lastKnownPositions"
> {
  const templates = createVfxPreviewView().units;
  const kaiser = {
    ...templates["preview-shield"],
    id: "status-kaiser",
    heroId: "grand-kaiser",
    position: { col: 2, row: 6 },
  };
  const cursed = {
    ...templates["preview-guts"],
    id: "status-cursed",
    position: { col: 4, row: 4 },
    sansLastAttackCurseSourceId: "hidden-source",
    movementDisabledNextTurn: true,
    immobilizedUntilOwnTurnStart: true,
  };
  const stealth = {
    ...templates["preview-asgore"],
    id: "status-stealth",
    position: { col: 1, row: 2 },
    isStealthed: true,
    asgorePatienceStealthActive: true,
    asgoreBraveryAutoDefenseReady: true,
  };
  const bone = {
    ...templates["preview-chicken"],
    id: "status-bone",
    position: { col: 6, row: 5 },
    papyrusBoneStatus: {
      sourceUnitId: "hidden-source",
      kind: "blue" as const,
      expiresOnSourceOwnTurn: 8,
    },
    sansBoneFieldStatus: { kind: "orange" as const, turnNumber: 4 },
  };
  const form = {
    ...templates["preview-guts"],
    id: "status-form",
    position: { col: 6, row: 2 },
    gutsBerserkModeActive: true,
  };
  const marker = {
    ...templates["preview-chikatilo"],
    id: "status-marker",
    position: { col: 2, row: 3 },
    chikatiloMarkedTargets: [bone.id],
    chikatiloTrackedTargets: [],
  };
  return {
    units: Object.fromEntries(
      [kaiser, cursed, stealth, bone, form, marker].map((unit) => [unit.id, unit]),
    ),
    lastKnownPositions: { P1: {}, P2: { [stealth.id]: { col: 0, row: 0 } } },
    stakeMarkers: [
      {
        id: "private-stake",
        owner: "P1",
        position: { col: 3, row: 2 },
        createdAt: 1,
        isRevealed: false,
      },
      {
        id: "public-stake",
        owner: "P1",
        position: { col: 5, row: 3 },
        createdAt: 2,
        isRevealed: true,
      },
    ],
    jackTraps: [
      {
        id: "private-snare",
        owner: "P1",
        sourceUnitId: marker.id,
        position: { col: 3, row: 6 },
        isRevealed: false,
        triggeredTargetIds: [],
      },
    ],
  };
}

export function createPersistentStatusFixture(base: GameState): GameState {
  return {
    ...base,
    ...createFixtureData(),
    phase: "battle",
    turnNumber: 4,
    activeUnitId: "status-bone",
  };
}

/** Presentation-only authorized fixtures. Never filters or accepts live raw state. */
export function createPersistentStatusPreview(
  mode: PersistentPreviewMode,
  recipient: PreviewRecipient,
): PlayerView {
  const fixture = createFixtureData();
  const units = Object.fromEntries(
    Object.entries(fixture.units)
      .filter(([, unit]) => mode === "cleared" || !unit.isStealthed || unit.owner === recipient)
      .map(([id, unit]) => [
        id,
        {
          ...unit,
          chikatiloMarkedTargets: undefined,
          chikatiloTrackedTargets: undefined,
          chikatiloMarkStatus:
            recipient === "P1" && id === "status-bone" && mode !== "cleared"
              ? {
                  sourceUnitId: "status-marker",
                  exactTrackingActive: false,
                  trackingStarts: "startOfChikatiloTurn" as const,
                  trackingExpires: "afterMarkedUnitTurn" as const,
                }
              : undefined,
          ...(mode === "cleared"
            ? {
                bunker: undefined,
                sansLastAttackCurseSourceId: undefined,
                movementDisabledNextTurn: false,
                immobilizedUntilOwnTurnStart: false,
                isStealthed: false,
                asgorePatienceStealthActive: false,
                asgoreBraveryAutoDefenseReady: false,
                papyrusBoneStatus: undefined,
                sansBoneFieldStatus: undefined,
                gutsBerserkModeActive: false,
              }
            : {}),
        },
      ]),
  );
  return {
    ...createVfxPreviewView(),
    units,
    lastKnownPositions:
      recipient === "P2" && mode !== "cleared" ? fixture.lastKnownPositions.P2 : {},
    stakeMarkers:
      mode === "cleared"
        ? []
        : fixture.stakeMarkers
            .filter((marker) => marker.owner === recipient || marker.isRevealed)
            .map((marker) => ({ position: marker.position, isRevealed: marker.isRevealed })),
    jackTraps:
      recipient === "P1" && mode !== "cleared"
        ? (fixture.jackTraps ?? []).map((trap) => ({
            id: trap.id,
            sourceUnitId: trap.sourceUnitId,
            position: trap.position,
            isRevealed: trap.isRevealed,
            isTriggered: false,
          }))
        : [],
    activeUnitId: "status-bone",
    arenaId: mode === "boneField" ? "boneField" : mode === "storm" ? "storm" : null,
    boneFieldTurnsLeft: mode === "boneField" ? 3 : 0,
    arenaEffects:
      mode === "storm"
        ? [
            {
              id: "preview-storm",
              effectId: "storm",
              remaining: 2,
              durationUnit: "turn",
              startedTurnNumber: 4,
            },
          ]
        : [],
  };
}
