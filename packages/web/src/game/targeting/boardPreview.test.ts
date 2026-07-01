import assert from "node:assert/strict";
import test from "node:test";
import type { Coord, PlayerId, PlayerView, UnitClass, UnitState } from "rules";
import {
  ASGORE_FIRE_PARADE_ID,
  CHIKATILO_ASSASSIN_MARK_ID,
  GENGHIS_KHAN_KHANS_DECREE_ID,
  GUTS_ARBALET_ID,
  GUTS_CANNON_ID,
  HASSAN_TRUE_ENEMY_ID,
  LECHY_GUIDE_TRAVELER_ID,
  LOKI_LAUGHT_ID,
  RIVER_PERSON_BOATMAN_ID,
  RIVER_PERSON_TRA_LA_LA_ID,
} from "../../rulesHints";
import { buildAbilityPreview } from "./buildAbilityPreview";
import { buildPendingPreview } from "./buildPendingPreview";
import { buildPreviewCellMap, previewCoordKey, type BoardPreview, type TargetRef } from "./previewTypes";
import { selectBoardPreview } from "./selectBoardPreview";

function unit(overrides: Partial<UnitState> & { id: string; owner: PlayerId; position: Coord }): UnitState {
  return {
    ...overrides,
    id: overrides.id,
    owner: overrides.owner,
    class: overrides.class ?? "spearman",
    heroId: overrides.heroId,
    hp: overrides.hp ?? 5,
    attack: overrides.attack ?? 2,
    position: overrides.position,
    isStealthed: overrides.isStealthed ?? false,
    stealthTurnsLeft: 0,
    stealthAttemptedThisTurn: false,
    turn: overrides.turn ?? {
      moveUsed: false,
      attackUsed: false,
      actionUsed: false,
      stealthUsed: false,
    },
    charges: overrides.charges ?? {},
    cooldowns: overrides.cooldowns ?? {},
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    isAlive: overrides.isAlive ?? true,
  } as UnitState;
}

function makeView(
  units: UnitState[],
  extra: Partial<PlayerView> = {},
): PlayerView {
  const unitMap = Object.fromEntries(units.map((item) => [item.id, item]));
  return {
    boardSize: 9,
    units: unitMap,
    currentPlayer: "P1",
    activeUnitId: units[0]?.id ?? null,
    pendingRoll: null,
    pendingMove: null,
    pendingAoEPreview: null,
    pendingCombatQueueCount: 0,
    lastKnownPositions: {},
    abilitiesByUnitId: {},
    legal: {
      placementsByUnitId: {},
      movesByUnitId: {},
      attackTargetsByUnitId: {},
    },
    ...extra,
  } as PlayerView;
}

function collectTargets(preview: BoardPreview | null): TargetRef[] {
  if (!preview) return [];
  if (preview.kind === "compound") {
    return preview.layers.flatMap(collectTargets);
  }
  return [
    ...("validTargets" in preview ? preview.validTargets ?? [] : []),
    ...("invalidTargets" in preview ? preview.invalidTargets ?? [] : []),
    ...("affectedTargets" in preview ? preview.affectedTargets ?? [] : []),
  ];
}

function validTargetIds(preview: BoardPreview | null): string[] {
  return collectTargets(preview)
    .filter((target) => !target.disabled)
    .map((target) => target.unitId)
    .sort();
}

function disabledTargetIds(preview: BoardPreview | null): string[] {
  return collectTargets(preview)
    .filter((target) => target.disabled)
    .map((target) => target.unitId)
    .sort();
}

function hasKind(preview: BoardPreview | null, coord: Coord, kind: string): boolean {
  return buildPreviewCellMap(preview).get(previewCoordKey(coord))?.kinds.includes(kind as never) ?? false;
}

test("Chikatilo mark preview includes visible radius targets without hidden target ids", () => {
  const chikatilo = unit({
    id: "chikatilo",
    owner: "P1",
    heroId: "chikatilo",
    class: "assassin",
    position: { col: 4, row: 4 },
  });
  const visibleEnemy = unit({
    id: "visible-enemy",
    owner: "P2",
    position: { col: 6, row: 4 },
  });
  const view = makeView([chikatilo, visibleEnemy], {
    lastKnownPositions: { hiddenEnemy: { col: 5, row: 5 } },
  });

  const preview = buildAbilityPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: chikatilo.id,
    abilityId: CHIKATILO_ASSASSIN_MARK_ID,
  });

  assert.deepEqual(validTargetIds(preview), ["visible-enemy"]);
  assert.doesNotMatch(JSON.stringify(preview), /hiddenEnemy/);
});

test("Lechy Guide Traveler preview includes ally targets and marks enemies disabled", () => {
  const lechy = unit({
    id: "lechy",
    owner: "P1",
    heroId: "lechy",
    class: "trickster",
    position: { col: 4, row: 4 },
  });
  const ally = unit({ id: "ally", owner: "P1", position: { col: 5, row: 5 } });
  const enemy = unit({ id: "enemy", owner: "P2", position: { col: 6, row: 4 } });
  const preview = buildAbilityPreview({
    gameView: makeView([lechy, ally, enemy]),
    viewerPlayerId: "P1",
    sourceUnitId: lechy.id,
    abilityId: LECHY_GUIDE_TRAVELER_ID,
  });

  assert.deepEqual(validTargetIds(preview), ["ally"]);
  assert.deepEqual(disabledTargetIds(preview), ["enemy"]);
});

test("active targeting preview overrides unrelated hover preview and cancel clears it", () => {
  const chikatilo = unit({
    id: "chikatilo",
    owner: "P1",
    heroId: "chikatilo",
    class: "assassin",
    position: { col: 4, row: 4 },
  });
  const enemy = unit({ id: "enemy", owner: "P2", position: { col: 5, row: 4 } });
  const view = makeView([chikatilo, enemy]);

  const active = selectBoardPreview({
    gameView: view,
    viewerPlayerId: "P1",
    selectedUnitId: chikatilo.id,
    actionMode: "assassinMark",
    hoverActionMode: null,
    allowActionHoverPreview: false,
    hoveredAbilityId: ASGORE_FIRE_PARADE_ID,
  });

  assert.equal(active?.kind, "radius");
  assert.deepEqual(validTargetIds(active), ["enemy"]);

  const canceled = selectBoardPreview({
    gameView: view,
    viewerPlayerId: "P1",
    selectedUnitId: chikatilo.id,
    actionMode: null,
    hoverActionMode: null,
    allowActionHoverPreview: false,
    hoveredAbilityId: null,
  });
  assert.equal(canceled, null);
});

test("unknown hidden enemy does not appear as a line blocker", () => {
  const guts = unit({
    id: "guts",
    owner: "P1",
    heroId: "guts",
    class: "berserker",
    position: { col: 4, row: 4 },
  });
  const enemy = unit({ id: "enemy", owner: "P2", position: { col: 8, row: 4 } });
  const view = makeView([guts, enemy], {
    lastKnownPositions: { hiddenEnemy: { col: 6, row: 4 } },
  });

  const preview = buildAbilityPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: guts.id,
    abilityId: GUTS_ARBALET_ID,
  });

  assert.deepEqual(validTargetIds(preview), ["enemy"]);
  assert.equal(hasKind(preview, { col: 6, row: 4 }, "blocked"), false);
  assert.doesNotMatch(JSON.stringify(preview), /hiddenEnemy/);
});

test("movement preview does not mark unknown hidden enemy cell as blocked", () => {
  const rider = unit({
    id: "rider",
    owner: "P1",
    class: "rider",
    position: { col: 4, row: 4 },
  });
  const view = makeView([rider], {
    lastKnownPositions: { hiddenEnemy: { col: 6, row: 6 } },
    pendingMove: {
      unitId: rider.id,
      legalTo: [{ col: 8, row: 8 }],
      expiresTurnNumber: 1,
      mode: "rider",
    },
  });

  const preview = buildPendingPreview(view);
  assert.equal(hasKind(preview, { col: 8, row: 8 }, "validMove"), true);
  assert.equal(hasKind(preview, { col: 6, row: 6 }, "blocked"), false);
});

test("Asgore Fire Parade and Justice previews show area and archer line", () => {
  const asgore = unit({
    id: "asgore",
    owner: "P1",
    heroId: "asgore",
    class: "spearman",
    position: { col: 4, row: 4 },
  });
  const enemy = unit({ id: "enemy", owner: "P2", position: { col: 8, row: 4 } });
  const view = makeView([asgore, enemy]);

  const fireParade = buildAbilityPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: asgore.id,
    abilityId: ASGORE_FIRE_PARADE_ID,
  });
  assert.equal(fireParade?.kind, "area");
  assert.equal(hasKind(fireParade, { col: 5, row: 5 }, "area"), true);

  const justice = buildPendingPreview(
    makeView([asgore, enemy], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "asgoreSoulParadeJusticeTargetChoice",
        context: { asgoreId: asgore.id, options: [enemy.id] },
      },
    }),
  );
  assert.equal(justice?.kind, "line");
  assert.deepEqual(validTargetIds(justice), ["enemy"]);
});

test("Guts Hand Crossbow and Hand Cannon previews show ranged lines", () => {
  const guts = unit({
    id: "guts",
    owner: "P1",
    heroId: "guts",
    class: "berserker",
    position: { col: 4, row: 4 },
  });
  const enemy = unit({ id: "enemy", owner: "P2", position: { col: 4, row: 8 } });
  const view = makeView([guts, enemy]);

  for (const abilityId of [GUTS_ARBALET_ID, GUTS_CANNON_ID]) {
    const preview = buildAbilityPreview({
      gameView: view,
      viewerPlayerId: "P1",
      sourceUnitId: guts.id,
      abilityId,
    });
    assert.equal(preview?.kind, "line");
    assert.deepEqual(validTargetIds(preview), ["enemy"]);
    assert.equal(hasKind(preview, { col: 4, row: 7 }, "line"), true);
  }
});

test("Guts Berserk choice preview exposes single-target and radius-1 area options", () => {
  const guts = unit({
    id: "guts",
    owner: "P1",
    heroId: "guts",
    class: "berserker",
    position: { col: 4, row: 4 },
  });
  const enemy = unit({ id: "enemy", owner: "P2", position: { col: 5, row: 4 } });
  const preview = buildPendingPreview(
    makeView([guts, enemy], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "gutsBerserkAttackChoice",
        context: {
          gutsId: guts.id,
          targetId: enemy.id,
          singleTargetOptions: [enemy.id],
          aoeTargetIds: [enemy.id],
        },
      },
    }),
  );

  assert.equal(preview?.kind, "compound");
  assert.equal(hasKind(preview, { col: 5, row: 5 }, "area"), true);
  assert.deepEqual(validTargetIds(preview), ["enemy", "enemy"]);
});

test("Jebe Khan's Shooter ricochet preview uses pending next-target options", () => {
  const jebe = unit({
    id: "jebe",
    owner: "P1",
    heroId: "jebe",
    class: "archer",
    position: { col: 4, row: 4 },
  });
  const first = unit({ id: "first", owner: "P2", position: { col: 8, row: 4 } });
  const next = unit({ id: "next", owner: "P2", position: { col: 8, row: 8 } });
  const preview = buildPendingPreview(
    makeView([jebe, first, next], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "jebeKhansShooterTargetChoice",
        context: { casterId: jebe.id, lastTargetId: first.id, options: [next.id] },
      },
    }),
  );

  assert.deepEqual(validTargetIds(preview), ["next"]);
  assert.equal(hasKind(preview, { col: 8, row: 7 }, "line"), true);
});

test("Hassan and Loki second-step previews show controlled-unit attack ranges", () => {
  const hassan = unit({
    id: "hassan",
    owner: "P1",
    heroId: "hassan",
    class: "assassin",
    position: { col: 4, row: 4 },
  });
  const loki = unit({
    id: "loki",
    owner: "P1",
    heroId: "loki",
    class: "trickster",
    position: { col: 3, row: 3 },
  });
  const controlled = unit({
    id: "controlled",
    owner: "P2",
    class: "spearman",
    position: { col: 5, row: 4 },
  });
  const target = unit({ id: "target", owner: "P2", position: { col: 7, row: 4 } });

  const hassanPreview = buildPendingPreview(
    makeView([hassan, controlled, target], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "hassanTrueEnemyTargetChoice",
        context: { hassanId: hassan.id, forcedAttackerId: controlled.id, options: [target.id] },
      },
    }),
  );
  assert.deepEqual(validTargetIds(hassanPreview), ["target"]);
  assert.equal(hasKind(hassanPreview, controlled.position!, "source"), true);

  const lokiPreview = buildPendingPreview(
    makeView([loki, controlled, target], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "lokiMindControlTargetChoice",
        context: { lokiId: loki.id, controlledUnitId: controlled.id, options: [target.id] },
      },
    }),
  );
  assert.deepEqual(validTargetIds(lokiPreview), ["target"]);
  assert.equal(hasKind(lokiPreview, controlled.position!, "source"), true);
});

test("Loki Laughter hover shows option preview without command state", () => {
  const loki = unit({
    id: "loki",
    owner: "P1",
    heroId: "loki",
    class: "trickster",
    position: { col: 4, row: 4 },
  });
  const enemy = unit({ id: "enemy", owner: "P2", position: { col: 5, row: 5 } });
  const preview = buildAbilityPreview({
    gameView: makeView([loki, enemy]),
    viewerPlayerId: "P1",
    sourceUnitId: loki.id,
    abilityId: LOKI_LAUGHT_ID,
  });

  assert.equal(preview?.kind, "compound");
  assert.equal(hasKind(preview, { col: 5, row: 5 }, "affected"), true);
});

test("River Person Boat previews pickup and drop cells from pending options", () => {
  const river = unit({
    id: "river",
    owner: "P1",
    heroId: "riverPerson",
    class: "rider",
    position: { col: 4, row: 4 },
  });
  const ally = unit({ id: "ally", owner: "P1", position: { col: 5, row: 4 } });

  const pickup = buildPendingPreview(
    makeView([river, ally], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "riverBoatCarryChoice",
        context: { riverId: river.id, options: [ally.id] },
      },
    }),
  );
  assert.deepEqual(validTargetIds(pickup), ["ally"]);
  assert.equal(hasKind(pickup, ally.position!, "pickup"), true);

  const drop = buildPendingPreview(
    makeView([river, ally], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "riverBoatDropDestination",
        context: { riverId: river.id, allyId: ally.id, options: [{ col: 3, row: 4 }] },
      },
    }),
  );
  assert.equal(hasKind(drop, { col: 3, row: 4 }, "drop"), true);
});

test("River Person Tra-la-la previews target and straight-line destination", () => {
  const river = unit({
    id: "river",
    owner: "P1",
    heroId: "riverPerson",
    class: "rider",
    position: { col: 4, row: 4 },
  });
  const enemy = unit({ id: "enemy", owner: "P2", position: { col: 5, row: 4 } });
  const ally = unit({ id: "ally", owner: "P1", position: { col: 4, row: 5 } });

  const target = buildPendingPreview(
    makeView([river, enemy], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "riverTraLaLaTargetChoice",
        context: { riverId: river.id, options: [enemy.id] },
      },
    }),
  );
  assert.deepEqual(validTargetIds(target), ["enemy"]);

  const destination = buildPendingPreview(
    makeView([river, enemy, ally], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "riverTraLaLaDestinationChoice",
        context: { riverId: river.id, targetId: enemy.id, options: [{ col: 4, row: 8 }] },
      },
    }),
  );
  assert.equal(hasKind(destination, { col: 4, row: 8 }, "validMove"), true);
  assert.deepEqual(validTargetIds(destination), ["ally"]);
});

test("Genghis Khan diagonal movement preview uses projected pending move options", () => {
  const genghis = unit({
    id: "genghis",
    owner: "P1",
    heroId: "genghisKhan",
    class: "rider",
    position: { col: 4, row: 4 },
    genghisKhanDiagonalMoveActive: true,
    genghisKhanDecreeMovePending: true,
  });
  const view = makeView([genghis], {
    pendingMove: {
      unitId: genghis.id,
      legalTo: [
        { col: 5, row: 5 },
        { col: 6, row: 6 },
      ],
      expiresTurnNumber: 1,
      mode: "rider",
    },
  });

  const preview = selectBoardPreview({
    gameView: view,
    viewerPlayerId: "P1",
    selectedUnitId: genghis.id,
    actionMode: null,
    hoverActionMode: null,
    allowActionHoverPreview: false,
    hoveredAbilityId: GENGHIS_KHAN_KHANS_DECREE_ID,
  });

  assert.equal(hasKind(preview, { col: 6, row: 6 }, "validMove"), true);
});

test("River direct hover previews are available before server choices", () => {
  const river = unit({
    id: "river",
    owner: "P1",
    heroId: "riverPerson",
    class: "rider",
    position: { col: 4, row: 4 },
  });
  const ally = unit({ id: "ally", owner: "P1", position: { col: 5, row: 5 } });
  const enemy = unit({ id: "enemy", owner: "P2", position: { col: 3, row: 4 } });
  const view = makeView([river, ally, enemy]);

  const boat = buildAbilityPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: river.id,
    abilityId: RIVER_PERSON_BOATMAN_ID,
  });
  assert.deepEqual(validTargetIds(boat), ["ally"]);

  const tralala = buildAbilityPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: river.id,
    abilityId: RIVER_PERSON_TRA_LA_LA_ID,
  });
  assert.deepEqual(validTargetIds(tralala), ["enemy"]);
});
