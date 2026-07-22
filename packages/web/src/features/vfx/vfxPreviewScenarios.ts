import type { Coord, GameEvent, PlayerView, PlayerId, UnitClass, UnitState } from "rules";
import type { VfxEffectId } from "./vfxTypes";

export const VFX_PREVIEW_ROUTE = "/vfx-preview";

export interface VfxPreviewScenario {
  id: string;
  label: string;
  group: string;
  events: GameEvent[];
  expectedEffectIds: VfxEffectId[];
  waitMs: number;
}

const turn = {
  moveUsed: false,
  attackUsed: false,
  actionUsed: false,
  stealthUsed: false,
};

function unit(params: {
  id: string;
  owner: PlayerId;
  unitClass: UnitClass;
  position: Coord;
  heroId?: string;
  hp?: number;
  attack?: number;
  bunkerActive?: boolean;
  markStatus?: UnitState["chikatiloMarkStatus"];
}): UnitState {
  return {
    id: params.id,
    owner: params.owner,
    class: params.unitClass,
    heroId: params.heroId,
    hp: params.hp ?? 5,
    attack: params.attack ?? 2,
    position: params.position,
    isStealthed: false,
    stealthTurnsLeft: 0,
    stealthAttemptedThisTurn: false,
    bunker: params.bunkerActive ? { active: true, ownTurnsInBunker: 1 } : undefined,
    turn: { ...turn },
    charges: {},
    cooldowns: {},
    chikatiloMarkStatus: params.markStatus,
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    isAlive: true,
  };
}

export function createVfxPreviewView(): PlayerView {
  const units = [
    unit({
      id: "preview-searcher",
      owner: "P1",
      unitClass: "assassin",
      heroId: "chikatilo",
      position: { col: 1, row: 1 },
    }),
    unit({
      id: "preview-hidden",
      owner: "P2",
      unitClass: "trickster",
      heroId: "loki",
      position: { col: 2, row: 2 },
    }),
    unit({
      id: "preview-chikatilo",
      owner: "P1",
      unitClass: "assassin",
      heroId: "chikatilo",
      position: { col: 1, row: 6 },
    }),
    unit({
      id: "preview-marked",
      owner: "P2",
      unitClass: "knight",
      heroId: "griffith",
      position: { col: 3, row: 6 },
      markStatus: {
        sourceUnitId: "preview-chikatilo",
        exactTrackingActive: true,
        trackingStarts: "startOfChikatiloTurn",
        trackingExpires: "afterMarkedUnitTurn",
      },
    }),
    unit({
      id: "preview-lechy",
      owner: "P1",
      unitClass: "trickster",
      heroId: "lechy",
      position: { col: 4, row: 1 },
    }),
    unit({
      id: "preview-storm-target",
      owner: "P2",
      unitClass: "berserker",
      heroId: "guts",
      position: { col: 4, row: 2 },
    }),
    unit({
      id: "preview-asgore",
      owner: "P1",
      unitClass: "spearman",
      heroId: "asgore",
      position: { col: 7, row: 1 },
    }),
    unit({
      id: "preview-griffith",
      owner: "P1",
      unitClass: "knight",
      heroId: "griffith",
      position: { col: 6, row: 6 },
    }),
    unit({
      id: "preview-mettaton",
      owner: "P1",
      unitClass: "rider",
      heroId: "mettaton",
      position: { col: 7, row: 6 },
    }),
    unit({
      id: "preview-loki",
      owner: "P1",
      unitClass: "trickster",
      heroId: "loki",
      position: { col: 5, row: 4 },
    }),
    unit({
      id: "preview-chicken",
      owner: "P2",
      unitClass: "spearman",
      heroId: "papyrus",
      position: { col: 5, row: 5 },
    }),
    unit({
      id: "preview-river",
      owner: "P1",
      unitClass: "rider",
      heroId: "riverPerson",
      position: { col: 1, row: 7 },
    }),
    unit({
      id: "preview-passenger",
      owner: "P1",
      unitClass: "berserker",
      heroId: "guts",
      position: { col: 2, row: 7 },
    }),
    unit({
      id: "preview-grozny",
      owner: "P1",
      unitClass: "berserker",
      heroId: "grozny",
      position: { col: 6, row: 2 },
    }),
    unit({
      id: "preview-guts",
      owner: "P1",
      unitClass: "knight",
      heroId: "guts",
      position: { col: 7, row: 3 },
    }),
    unit({
      id: "preview-shield",
      owner: "P1",
      unitClass: "berserker",
      heroId: "frisk",
      position: { col: 3, row: 7 },
      bunkerActive: true,
    }),
  ];

  return {
    boardSize: 9,
    turnNumber: 4,
    activeUnitId: "preview-searcher",
    units: Object.fromEntries(units.map((entry) => [entry.id, entry])),
    lastKnownPositions: {},
    stakeMarkers: [],
    abilitiesByUnitId: {},
    pendingAoEPreview: null,
    pendingCombatQueueCount: 0,
    pendingRoll: null,
    knowledge: { P1: {}, P2: {} },
  } as unknown as PlayerView;
}

export const VFX_PREVIEW_SCENARIOS: VfxPreviewScenario[] = [
  {
    id: "search-reveal",
    label: "Search Reveal",
    group: "Reveal",
    expectedEffectIds: ["searchReveal"],
    waitMs: 220,
    events: [
      {
        type: "searchStealth",
        unitId: "preview-searcher",
        mode: "action",
        rolls: [{ targetId: "preview-hidden", roll: 5, success: false }],
      } as GameEvent,
    ],
  },
  {
    id: "hidden-reveal",
    label: "Hidden Reveal",
    group: "Reveal",
    expectedEffectIds: ["hiddenReveal"],
    waitMs: 240,
    events: [{ type: "stealthRevealed", unitId: "preview-hidden" } as GameEvent],
  },
  {
    id: "chikatilo-mark",
    label: "Chikatilo Mark",
    group: "Status",
    expectedEffectIds: ["markApply"],
    waitMs: 260,
    events: [
      {
        type: "chikatiloMarkApplied",
        chikatiloId: "preview-chikatilo",
        targetId: "preview-marked",
        ownerPlayerId: "P1",
        trackingStarts: "startOfChikatiloTurn",
        trackingExpires: "afterMarkedUnitTurn",
      } as GameEvent,
    ],
  },
  {
    id: "storm",
    label: "Lechy Storm",
    group: "Storm",
    expectedEffectIds: ["storm"],
    waitMs: 220,
    events: [
      { type: "lechyStormStarted", sourceUnitId: "preview-lechy" } as GameEvent,
      {
        type: "lechyStormRollResult",
        unitId: "preview-storm-target",
        roll: 1,
        success: false,
        damage: 1,
        hpAfter: 4,
      } as GameEvent,
    ],
  },
  {
    id: "soul-parade",
    label: "Soul Parade",
    group: "Mystic",
    expectedEffectIds: ["soulParade"],
    waitMs: 260,
    events: [
      {
        type: "asgoreSoulParadeResolved",
        asgoreId: "preview-asgore",
        soulId: "bravery",
        roll: 2,
      } as GameEvent,
    ],
  },
  {
    id: "fire-parade",
    label: "Fire Parade",
    group: "Area",
    expectedEffectIds: ["fireParade"],
    waitMs: 280,
    events: [
      {
        type: "aoeResolved",
        sourceUnitId: "preview-asgore",
        abilityId: "asgoreFireParade",
        center: { col: 6, row: 2 },
        radius: 2,
        affectedUnitIds: ["preview-asgore", "preview-guts"],
        damagedUnitIds: ["preview-guts"],
        revealedUnitIds: [],
        damageByUnitId: { "preview-guts": 1 },
      } as GameEvent,
    ],
  },
  {
    id: "berserk-aoe",
    label: "Guts Berserk AoE",
    group: "Area",
    expectedEffectIds: ["berserkAoE"],
    waitMs: 260,
    events: [
      {
        type: "aoeResolved",
        sourceUnitId: "preview-guts",
        abilityId: "gutsBerserkMode",
        center: { col: 6, row: 4 },
        radius: 1,
        affectedUnitIds: ["preview-chicken"],
        damagedUnitIds: ["preview-chicken"],
        revealedUnitIds: [],
        damageByUnitId: { "preview-chicken": 1 },
      } as GameEvent,
    ],
  },
  {
    id: "covering-tracks",
    label: "Covering Tracks snare explosion",
    group: "Area",
    expectedEffectIds: ["snareExplosion"],
    waitMs: 220,
    events: [
      {
        type: "aoeResolved",
        sourceUnitId: "preview-searcher",
        abilityId: "jackRipperCoveringTracks",
        center: { col: 3, row: 3 },
        radius: 1,
        affectedUnitIds: ["preview-hidden"],
        damagedUnitIds: ["preview-hidden"],
        revealedUnitIds: [],
        damageByUnitId: { "preview-hidden": 1 },
        rollsByUnitId: { "preview-hidden": 2 },
      } as GameEvent,
    ],
  },
  {
    id: "griffith-transformation",
    label: "Griffith to Femto",
    group: "Transform",
    expectedEffectIds: ["transformation"],
    waitMs: 260,
    events: [
      {
        type: "unitTransformed",
        unitId: "preview-griffith",
        fromHeroId: "griffith",
        toHeroId: "femto",
        reason: "griffithFemtoRebirth",
      } as GameEvent,
    ],
  },
  {
    id: "mettaton-stage",
    label: "Mettaton Stage",
    group: "Transform",
    expectedEffectIds: ["stageSpark"],
    waitMs: 220,
    events: [
      {
        type: "unitTransformed",
        unitId: "preview-mettaton",
        fromHeroId: "mettaton",
        toHeroId: "mettaton",
        toFormId: "mettatonNeo",
        reason: "mettatonThreshold",
      } as GameEvent,
    ],
  },
  {
    id: "loki-chicken",
    label: "Loki Chicken",
    group: "Smoke",
    expectedEffectIds: ["chicken"],
    waitMs: 220,
    events: [
      {
        type: "lokiChickenApplied",
        lokiId: "preview-loki",
        targetId: "preview-chicken",
        abilityId: "lokiLaught",
      } as GameEvent,
    ],
  },
  {
    id: "river-boat",
    label: "River Boat",
    group: "Transport",
    expectedEffectIds: ["boat"],
    waitMs: 260,
    events: [
      {
        type: "riverBoatResolved",
        riverId: "preview-river",
        passengerId: "preview-passenger",
        riverDestination: { col: 4, row: 7 },
        dropDestination: { col: 5, row: 7 },
      } as GameEvent,
    ],
  },
  {
    id: "river-tralala",
    label: "Tra-la-la Path",
    group: "Transport",
    expectedEffectIds: ["tralala"],
    waitMs: 280,
    events: [
      {
        type: "riverTraLaLaResolved",
        riverId: "preview-river",
        targetId: "preview-passenger",
        riverDestination: { col: 4, row: 7 },
        dropDestination: { col: 6, row: 7 },
      } as GameEvent,
    ],
  },
  {
    id: "portal",
    label: "Portal Cell",
    group: "Transport",
    expectedEffectIds: ["portal"],
    waitMs: 240,
    events: [
      {
        type: "riverTraLaLaResolved",
        riverId: "preview-river",
        targetId: "preview-passenger",
        riverDestination: { col: 3, row: 7 },
        dropDestination: { col: 4, row: 7 },
      } as GameEvent,
    ],
  },
  {
    id: "grozny-phantasm",
    label: "Grozny Phantasm",
    group: "Phantasm",
    expectedEffectIds: ["phantasm"],
    waitMs: 260,
    events: [
      {
        type: "abilityUsed",
        unitId: "preview-grozny",
        abilityId: "groznyInvadeTime",
      } as GameEvent,
    ],
  },
  {
    id: "phantasm-trace",
    label: "Phantasm Trace",
    group: "Phantasm",
    expectedEffectIds: ["phantasmTrace"],
    waitMs: 260,
    events: [
      {
        type: "abilityUsed",
        unitId: "preview-grozny",
        abilityId: "groznyInvadeTime",
      } as GameEvent,
      {
        type: "unitMoved",
        unitId: "preview-grozny",
        from: { col: 6, row: 2 },
        to: { col: 2, row: 6 },
      } as GameEvent,
    ],
  },
  {
    id: "guts-muzzle",
    label: "Guts Muzzle",
    group: "Ranged",
    expectedEffectIds: ["muzzle"],
    waitMs: 180,
    events: [
      { type: "abilityUsed", unitId: "preview-guts", abilityId: "gutsCannon" } as GameEvent,
    ],
  },
  {
    id: "shield",
    label: "HEX Shield",
    group: "Defense",
    expectedEffectIds: ["shield"],
    waitMs: 260,
    events: [{ type: "bunkerEntered", unitId: "preview-shield" } as GameEvent],
  },
];

export function previewScenarioById(id: string): VfxPreviewScenario | undefined {
  return VFX_PREVIEW_SCENARIOS.find((scenario) => scenario.id === id);
}
