import assert from "node:assert/strict";
import test from "node:test";
import type {
  AbilityView,
  Coord,
  PlayerId,
  PlayerView,
  UnitClass,
  UnitState,
} from "rules";
import {
  ASGORE_FIRE_PARADE_ID,
  ARTEMIS_MOON_INSIGHT_ID,
  ARTEMIS_SILVER_SICKLE_ID,
  CHIKATILO_ASSASSIN_MARK_ID,
  DON_WINDMILLS_ID,
  DUOLINGO_PUSH_NOTIFICATION_ID,
  EL_CID_COMPEADOR_ID,
  EL_CID_KOLADA_ID,
  GENGHIS_KHAN_KHANS_DECREE_ID,
  GUTS_ARBALET_ID,
  GUTS_CANNON_ID,
  HASSAN_TRUE_ENEMY_ID,
  JACK_SNARES_ID,
  LECHY_GUIDE_TRAVELER_ID,
  LUCHE_DIVINE_RAY_ID,
  LOKI_LAUGHT_ID,
  RIVER_PERSON_BOAT_ID,
  RIVER_PERSON_BOATMAN_ID,
  RIVER_PERSON_TRA_LA_LA_ID,
  ZORO_ASURA_ID,
  ZORO_ONI_GIRI_ID,
} from "../../rulesHints";
import { buildAbilityPreview } from "./buildAbilityPreview";
import { buildPendingPreview } from "./buildPendingPreview";
import { buildPreviewCellMap, previewCoordKey, type BoardPreview, type TargetRef } from "./previewTypes";
import { getOniGiriPreviewLines } from "./oniGiriPreviewLines";
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

function ability(overrides: Partial<AbilityView> & { id: string }): AbilityView {
  const { id, name, kind, description, slot, isAvailable, ...rest } = overrides;
  return {
    id,
    name: name ?? id,
    kind: kind ?? "active",
    description: description ?? "",
    slot: slot ?? "action",
    isAvailable: isAvailable ?? true,
    ...rest,
  };
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

function selectableTargetIds(preview: BoardPreview | null): string[] {
  if (!preview) return [];
  if (preview.kind === "compound") {
    return preview.layers.flatMap(selectableTargetIds).sort();
  }
  return ("validTargets" in preview ? preview.validTargets ?? [] : [])
    .map((target) => target.unitId)
    .sort();
}

function affectedTargetIds(preview: BoardPreview | null): string[] {
  if (!preview) return [];
  if (preview.kind === "compound") {
    return preview.layers.flatMap(affectedTargetIds).sort();
  }
  return ("affectedTargets" in preview ? preview.affectedTargets ?? [] : [])
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
  const edgeEnemy = unit({
    id: "edge-enemy",
    owner: "P2",
    position: { col: 7, row: 4 },
  });
  const projectedRange = 3;
  const view = makeView([chikatilo, visibleEnemy, edgeEnemy], {
    abilitiesByUnitId: {
      [chikatilo.id]: [
        ability({
          id: CHIKATILO_ASSASSIN_MARK_ID,
          targetRange: projectedRange,
        }),
      ],
    },
    lastKnownPositions: { hiddenEnemy: { col: 5, row: 5 } },
  });

  const preview = buildAbilityPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: chikatilo.id,
    abilityId: CHIKATILO_ASSASSIN_MARK_ID,
  });

  assert.deepEqual(validTargetIds(preview), ["edge-enemy", "visible-enemy"]);
  assert.doesNotMatch(JSON.stringify(preview), /hiddenEnemy/);
  assert.equal(preview?.kind, "radius");
  if (preview?.kind === "radius") {
    assert.equal(preview.labelKey, "preview.labels.selectAssassinMarkTarget");
    assert.equal(
      hasKind(
        preview,
        { col: chikatilo.position!.col + projectedRange, row: 4 },
        "validTarget",
      ),
      true,
    );
    assert.equal(
      hasKind(
        preview,
        { col: chikatilo.position!.col + projectedRange, row: 5 },
        "area",
      ),
      true,
    );
  }
});

test("Chikatilo mark preview includes tracked hidden projection but not unknown hidden positions", () => {
  const chikatilo = unit({
    id: "chikatilo",
    owner: "P1",
    heroId: "chikatilo",
    class: "assassin",
    position: { col: 4, row: 4 },
  });
  const trackedHidden = unit({
    id: "tracked-hidden",
    owner: "P2",
    position: { col: 5, row: 4 },
    isStealthed: true,
    chikatiloMarkStatus: {
      sourceUnitId: chikatilo.id,
      exactTrackingActive: true,
      trackingStarts: "startOfChikatiloTurn",
      trackingExpires: "afterMarkedUnitTurn",
    },
  });
  const view = makeView([chikatilo, trackedHidden], {
    abilitiesByUnitId: {
      [chikatilo.id]: [
        ability({
          id: CHIKATILO_ASSASSIN_MARK_ID,
          targetRange: 2,
        }),
      ],
    },
    lastKnownPositions: { unknownHidden: { col: 5, row: 5 } },
  });

  const preview = buildAbilityPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: chikatilo.id,
    abilityId: CHIKATILO_ASSASSIN_MARK_ID,
  });

  assert.deepEqual(validTargetIds(preview), ["tracked-hidden"]);
  assert.doesNotMatch(JSON.stringify(preview), /unknownHidden/);
});

test("Chikatilo mark preview follows authoritative target ids and disables an existing mark", () => {
  const chikatilo = unit({
    id: "chikatilo",
    owner: "P1",
    heroId: "chikatilo",
    class: "assassin",
    position: { col: 4, row: 4 },
  });
  const legal = unit({ id: "legal", owner: "P2", position: { col: 5, row: 4 } });
  const alreadyMarked = unit({
    id: "already-marked",
    owner: "P2",
    position: { col: 4, row: 5 },
  });
  const view = makeView([chikatilo, legal, alreadyMarked], {
    abilitiesByUnitId: {
      [chikatilo.id]: [
        ability({
          id: CHIKATILO_ASSASSIN_MARK_ID,
          targetRange: 2,
          targeting: { targetIds: [legal.id] },
        }),
      ],
    },
  });

  const preview = buildAbilityPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: chikatilo.id,
    abilityId: CHIKATILO_ASSASSIN_MARK_ID,
  });
  assert.deepEqual(validTargetIds(preview), [legal.id]);
  assert.deepEqual(disabledTargetIds(preview), [alreadyMarked.id]);
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
  const view = makeView([chikatilo, enemy], {
    abilitiesByUnitId: {
      [chikatilo.id]: [
        ability({
          id: CHIKATILO_ASSASSIN_MARK_ID,
          targetRange: 2,
        }),
      ],
    },
  });

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

test("selecting El Cid without hovered or active ability shows no radius preview", () => {
  const elCid = unit({
    id: "el-cid",
    owner: "P1",
    heroId: EL_CID_COMPEADOR_ID,
    class: "knight",
    position: { col: 4, row: 4 },
  });
  const preview = selectBoardPreview({
    gameView: makeView([elCid]),
    viewerPlayerId: "P1",
    selectedUnitId: elCid.id,
    actionMode: null,
    hoverActionMode: null,
    allowActionHoverPreview: false,
    hoveredAbilityId: null,
  });

  assert.equal(preview, null);
});

test("El Cid Kolada hover preview appears and ending hover removes it", () => {
  const elCid = unit({
    id: "el-cid",
    owner: "P1",
    heroId: EL_CID_COMPEADOR_ID,
    class: "knight",
    position: { col: 4, row: 4 },
  });
  const view = makeView([elCid]);

  const hovered = selectBoardPreview({
    gameView: view,
    viewerPlayerId: "P1",
    selectedUnitId: elCid.id,
    actionMode: null,
    hoverActionMode: null,
    allowActionHoverPreview: false,
    hoveredAbilityId: EL_CID_KOLADA_ID,
  });

  assert.equal(hovered?.kind, "area");
  assert.equal(hasKind(hovered, { col: 5, row: 4 }, "area"), true);

  const cleared = selectBoardPreview({
    gameView: view,
    viewerPlayerId: "P1",
    selectedUnitId: elCid.id,
    actionMode: null,
    hoverActionMode: null,
    allowActionHoverPreview: false,
    hoveredAbilityId: null,
  });

  assert.equal(cleared, null);
});

test("switching from another hero to El Cid does not retain prior hover preview", () => {
  const chikatilo = unit({
    id: "chikatilo",
    owner: "P1",
    heroId: "chikatilo",
    class: "assassin",
    position: { col: 2, row: 2 },
  });
  const elCid = unit({
    id: "el-cid",
    owner: "P1",
    heroId: EL_CID_COMPEADOR_ID,
    class: "knight",
    position: { col: 4, row: 4 },
  });
  const enemy = unit({ id: "enemy", owner: "P2", position: { col: 3, row: 2 } });
  const view = makeView([chikatilo, elCid, enemy], {
    abilitiesByUnitId: {
      [chikatilo.id]: [
        ability({
          id: CHIKATILO_ASSASSIN_MARK_ID,
          targetRange: 2,
        }),
      ],
    },
  });

  const prior = selectBoardPreview({
    gameView: view,
    viewerPlayerId: "P1",
    selectedUnitId: chikatilo.id,
    actionMode: null,
    hoverActionMode: null,
    allowActionHoverPreview: false,
    hoveredAbilityId: CHIKATILO_ASSASSIN_MARK_ID,
  });
  assert.equal(prior?.kind, "radius");

  const selectedElCid = selectBoardPreview({
    gameView: view,
    viewerPlayerId: "P1",
    selectedUnitId: elCid.id,
    actionMode: null,
    hoverActionMode: null,
    allowActionHoverPreview: false,
    hoveredAbilityId: null,
  });
  assert.equal(selectedElCid, null);
});

test("Grozny ally choice preview highlights projected legal allies", () => {
  const grozny = unit({
    id: "grozny",
    owner: "P1",
    heroId: "ivanGrozny",
    class: "berserker",
    position: { col: 0, row: 0 },
  });
  const ally = unit({
    id: "ally",
    owner: "P1",
    class: "spearman",
    position: { col: 4, row: 4 },
  });
  const preview = buildPendingPreview(
    makeView([grozny, ally], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "groznyTyrantAllyChoice",
        context: {
          groznyId: grozny.id,
          mode: "invadeTime",
          options: [ally.id],
        },
      },
    }),
  );

  assert.equal(preview?.kind, "multiStep");
  assert.deepEqual(validTargetIds(preview), ["ally"]);
  assert.equal(hasKind(preview, ally.position!, "validTarget"), true);
  assert.equal(hasKind(preview, grozny.position!, "source"), true);
});

test("Grozny attack-origin preview highlights every legal projected origin cell", () => {
  const grozny = unit({
    id: "grozny",
    owner: "P1",
    heroId: "ivanGrozny",
    class: "berserker",
    position: { col: 0, row: 0 },
  });
  const ally = unit({
    id: "ally",
    owner: "P1",
    class: "spearman",
    position: { col: 4, row: 4 },
  });
  const preview = buildPendingPreview(
    makeView([grozny, ally], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "groznyTyrantAttackCellChoice",
        context: {
          groznyId: grozny.id,
          targetId: ally.id,
          mode: "invadeTime",
          options: [
            {
              targetId: ally.id,
              mode: "invadeTime",
              position: { col: 4, row: 3 },
            },
            {
              targetId: ally.id,
              mode: "invadeTime",
              position: { col: 5, row: 4 },
            },
          ],
        },
      },
    }),
  );

  assert.equal(preview?.kind, "multiStep");
  assert.deepEqual(validTargetIds(preview), ["ally"]);
  assert.equal(hasKind(preview, { col: 4, row: 3 }, "validMove"), true);
  assert.equal(hasKind(preview, { col: 5, row: 4 }, "validMove"), true);
  assert.equal(hasKind(preview, ally.position!, "validTarget"), true);
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
  const activeFireParade = selectBoardPreview({
    gameView: view,
    viewerPlayerId: "P1",
    selectedUnitId: asgore.id,
    actionMode: "asgoreFireParade",
    hoverActionMode: null,
    allowActionHoverPreview: false,
    hoveredAbilityId: null,
  });
  assert.equal(activeFireParade?.kind, "area");
  assert.equal(hasKind(activeFireParade, { col: 5, row: 5 }, "area"), true);

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
  const offLineEnemy = unit({
    id: "off-line-enemy",
    owner: "P2",
    position: { col: 5, row: 8 },
  });
  const view = makeView([guts, enemy, offLineEnemy]);

  for (const abilityId of [GUTS_ARBALET_ID, GUTS_CANNON_ID]) {
    const preview = buildAbilityPreview({
      gameView: view,
      viewerPlayerId: "P1",
      sourceUnitId: guts.id,
      abilityId,
    });
    assert.equal(preview?.kind, "line");
    assert.deepEqual(validTargetIds(preview), ["enemy"]);
    assert.deepEqual(disabledTargetIds(preview), ["off-line-enemy"]);
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

test("Frisk target-choice pending previews use projected legal options only", () => {
  const frisk = unit({
    id: "frisk",
    owner: "P1",
    heroId: "frisk",
    class: "assassin",
    position: { col: 4, row: 4 },
  });
  const ally = unit({ id: "ally", owner: "P1", position: { col: 5, row: 4 } });
  const enemy = unit({ id: "enemy", owner: "P2", position: { col: 5, row: 5 } });
  const blockedEnemy = unit({
    id: "blocked-enemy",
    owner: "P2",
    position: { col: 6, row: 4 },
  });

  const hugs = buildPendingPreview(
    makeView([frisk, ally, enemy, blockedEnemy], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "friskPacifismHugsTargetChoice",
        context: { friskId: frisk.id, options: [ally.id, enemy.id] },
      },
      lastKnownPositions: { unknownHidden: { col: 4, row: 5 } },
    }),
  );
  assert.deepEqual(validTargetIds(hugs), ["ally", "enemy"]);
  assert.deepEqual(disabledTargetIds(hugs), ["blocked-enemy"]);
  assert.equal(hasKind(hugs, { col: 4, row: 5 }, "validTarget"), false);
  assert.doesNotMatch(JSON.stringify(hugs), /unknownHidden/);

  const warmWords = buildPendingPreview(
    makeView([frisk, ally, enemy], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "friskWarmWordsTargetChoice",
        context: { friskId: frisk.id, options: [ally.id] },
      },
    }),
  );
  assert.deepEqual(validTargetIds(warmWords), ["ally"]);
  assert.deepEqual(disabledTargetIds(warmWords), ["enemy"]);

  const precision = buildPendingPreview(
    makeView([frisk, ally, enemy], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "friskPrecisionStrikeTargetChoice",
        context: { friskId: frisk.id, options: [enemy.id] },
      },
    }),
  );
  assert.deepEqual(validTargetIds(precision), ["enemy"]);
  assert.equal(hasKind(precision, enemy.position!, "validTarget"), true);
});

test("authoritative Frisk pending preview overrides local targeting and hover previews", () => {
  const frisk = unit({
    id: "frisk",
    owner: "P1",
    heroId: "frisk",
    class: "assassin",
    position: { col: 4, row: 4 },
  });
  const target = unit({ id: "target", owner: "P1", position: { col: 5, row: 4 } });
  const view = makeView([frisk, target], {
    pendingRoll: {
      id: "roll",
      player: "P1",
      kind: "friskWarmWordsTargetChoice",
      context: { friskId: frisk.id, options: [target.id] },
    },
  });

  const preview = selectBoardPreview({
    gameView: view,
    viewerPlayerId: "P1",
    selectedUnitId: frisk.id,
    actionMode: "gutsCannon",
    hoverActionMode: null,
    allowActionHoverPreview: false,
    hoveredAbilityId: GUTS_CANNON_ID,
  });

  assert.equal(preview?.kind, "radius");
  assert.equal(preview?.labelKey, "preview.labels.friskWarmWordsTarget");
  assert.deepEqual(validTargetIds(preview), ["target"]);
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
        context: {
          casterId: jebe.id,
          lastTargetId: first.id,
          selectedTargetIds: [first.id],
          options: [next.id],
        },
      },
    }),
  );

  assert.deepEqual(selectableTargetIds(preview), ["next"]);
  assert.deepEqual(affectedTargetIds(preview), ["first"]);
  assert.equal(hasKind(preview, { col: 7, row: 7 }, "line"), true);
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
  assert.equal(
    hasKind(hassanPreview, { col: 5, row: 6 }, "area"),
    true,
    "Hassan preview should show the controlled spearman's full attack pattern, not only the path to a target",
  );

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
  assert.equal(
    hasKind(lokiPreview, { col: 5, row: 6 }, "area"),
    true,
    "Loki preview should show the controlled spearman's full attack pattern, not only the path to a target",
  );
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

  const destination = buildPendingPreview(
    makeView([river, ally], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "riverBoatDestinationChoice",
        context: { riverId: river.id, allyId: ally.id, options: [{ col: 4, row: 6 }] },
      },
    }),
  );
  assert.equal(hasKind(destination, { col: 4, row: 6 }, "validMove"), true);

  const drop = buildPendingPreview(
    makeView([river, ally], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "riverBoatDropDestination",
        context: {
          riverId: river.id,
          allyId: ally.id,
          riverDestination: { col: 4, row: 6 },
          options: [{ col: 3, row: 6 }],
        },
      },
    }),
  );
  assert.equal(hasKind(drop, { col: 4, row: 6 }, "source"), true);
  assert.equal(hasKind(drop, { col: 3, row: 6 }, "drop"), true);
});

test("River Person Tra-la-la previews target, straight-line destination, and drop", () => {
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
        context: {
          riverId: river.id,
          targetId: enemy.id,
          options: [
            { col: 4, row: 8 },
            { col: 7, row: 7 },
          ],
        },
      },
    }),
  );
  assert.equal(hasKind(destination, { col: 4, row: 8 }, "validMove"), true);
  assert.equal(hasKind(destination, { col: 7, row: 7 }, "validMove"), true);
  assert.deepEqual(validTargetIds(destination), ["ally"]);

  const drop = buildPendingPreview(
    makeView([river, enemy, ally], {
      pendingRoll: {
        id: "roll",
        player: "P1",
        kind: "riverTraLaLaDropDestinationChoice",
        context: {
          riverId: river.id,
          targetId: enemy.id,
          riverDestination: { col: 7, row: 7 },
          options: [{ col: 6, row: 7 }],
        },
      },
    }),
  );
  assert.equal(hasKind(drop, { col: 7, row: 7 }, "source"), true);
  assert.equal(hasKind(drop, { col: 6, row: 7 }, "drop"), true);
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

test("Mongol Charge movement preview shows the selected path, side influence, allies, and targets", () => {
  const genghis = unit({
    id: "genghis",
    owner: "P1",
    heroId: "genghisKhan",
    class: "rider",
    position: { col: 1, row: 1 },
    genghisKhanMongolChargeActive: true,
  });
  const ally = unit({
    id: "ally",
    owner: "P1",
    class: "knight",
    position: { col: 3, row: 0 },
  });
  const enemyA = unit({ id: "enemy-a", owner: "P2", position: { col: 2, row: 0 } });
  const enemyB = unit({ id: "enemy-b", owner: "P2", position: { col: 4, row: 0 } });
  const view = makeView([genghis, ally, enemyA, enemyB], {
    pendingMove: {
      unitId: genghis.id,
      legalTo: [{ col: 5, row: 1 }],
      expiresTurnNumber: 1,
      mode: "rider",
    },
    legal: {
      placementsByUnitId: {},
      movesByUnitId: {},
      attackTargetsByUnitId: {
        [ally.id]: [enemyA.id, enemyB.id],
      },
    },
  });

  const preview = selectBoardPreview({
    gameView: view,
    viewerPlayerId: "P1",
    selectedUnitId: genghis.id,
    actionMode: null,
    hoverActionMode: null,
    allowActionHoverPreview: false,
    hoveredAbilityId: null,
    targetingCell: { col: 5, row: 1 },
  });

  assert.equal(hasKind(preview, { col: 3, row: 1 }, "line"), true);
  assert.equal(hasKind(preview, { col: 5, row: 1 }, "line"), true);
  assert.equal(hasKind(preview, { col: 2, row: 0 }, "area"), true);
  assert.equal(hasKind(preview, { col: 4, row: 2 }, "area"), true);
  assert.deepEqual(affectedTargetIds(preview), [ally.id]);
  assert.deepEqual(selectableTargetIds(preview), [enemyA.id, enemyB.id]);
});

test("Mongol Charge pending target preview highlights every legal enemy", () => {
  const ally = unit({
    id: "ally",
    owner: "P1",
    class: "knight",
    position: { col: 3, row: 0 },
  });
  const enemyA = unit({ id: "enemy-a", owner: "P2", position: { col: 2, row: 0 } });
  const enemyB = unit({ id: "enemy-b", owner: "P2", position: { col: 4, row: 0 } });
  const view = makeView([ally, enemyA, enemyB], {
    pendingRoll: {
      id: "mongol-choice",
      player: "P1",
      kind: "mongolChargeAllyAttackTarget",
      context: {
        sourceUnitId: ally.id,
        controllerUnitId: "genghis",
        legalTargetIds: [enemyA.id, enemyB.id],
        options: [enemyA.id, enemyB.id],
      },
    },
  });

  const preview = buildPendingPreview(view);
  assert.deepEqual(selectableTargetIds(preview), [enemyA.id, enemyB.id]);
  assert.equal(hasKind(preview, enemyA.position!, "validTarget"), true);
  assert.equal(hasKind(preview, enemyB.position!, "validTarget"), true);
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

  const boatman = buildAbilityPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: river.id,
    abilityId: RIVER_PERSON_BOATMAN_ID,
  });
  assert.equal(boatman, null);

  const boat = buildAbilityPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: river.id,
    abilityId: RIVER_PERSON_BOAT_ID,
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

test("new hero previews expose targets, lines, areas, and trap placement without hidden data", () => {
  const source = unit({ id: "new-hero", owner: "P1", position: { col: 4, row: 4 } });
  const visibleEnemy = unit({ id: "visible", owner: "P2", position: { col: 6, row: 4 } });
  const hiddenEnemy = unit({ id: "hidden", owner: "P2", position: { col: 4, row: 7 }, isStealthed: true });
  const view = makeView([source, visibleEnemy]);
  view.abilitiesByUnitId[source.id] = [
    {
      id: DUOLINGO_PUSH_NOTIFICATION_ID,
      targeting: {
        targetIds: [visibleEnemy.id],
        destinationsByTargetId: { [visibleEnemy.id]: [{ col: 7, row: 4 }] },
      },
    } as any,
    {
      id: LUCHE_DIVINE_RAY_ID,
      targeting: { cells: [{ col: 5, row: 4 }, { col: 6, row: 4 }, { col: 7, row: 4 }] },
    } as any,
    {
      id: ZORO_ONI_GIRI_ID,
      targeting: {
        targetIds: [visibleEnemy.id],
        destinationsByTargetId: { [visibleEnemy.id]: [{ col: 5, row: 4 }, { col: 7, row: 4 }] },
      },
    } as any,
  ];

  const push = buildAbilityPreview({ gameView: view, viewerPlayerId: "P1", sourceUnitId: source.id, abilityId: DUOLINGO_PUSH_NOTIFICATION_ID });
  assert.deepEqual(validTargetIds(push), [visibleEnemy.id]);
  const pushDestinations = buildAbilityPreview({ gameView: view, viewerPlayerId: "P1", sourceUnitId: source.id, abilityId: DUOLINGO_PUSH_NOTIFICATION_ID, selectedTargetId: visibleEnemy.id });
  assert.equal(hasKind(pushDestinations, { col: 7, row: 4 }, "validMove"), true);

  const ray = buildAbilityPreview({ gameView: view, viewerPlayerId: "P1", sourceUnitId: source.id, abilityId: LUCHE_DIVINE_RAY_ID, targetingCell: { col: 7, row: 4 } });
  assert.equal(hasKind(ray, visibleEnemy.position!, "line"), true);
  assert.deepEqual(affectedTargetIds(ray), [visibleEnemy.id]);

  const oniTargets = buildAbilityPreview({ gameView: view, viewerPlayerId: "P1", sourceUnitId: source.id, abilityId: ZORO_ONI_GIRI_ID });
  assert.deepEqual(validTargetIds(oniTargets), [visibleEnemy.id]);
  const oniDestinations = buildAbilityPreview({ gameView: view, viewerPlayerId: "P1", sourceUnitId: source.id, abilityId: ZORO_ONI_GIRI_ID, selectedTargetId: visibleEnemy.id, targetingCell: { col: 5, row: 4 } });
  assert.equal(hasKind(oniDestinations, { col: 5, row: 4 }, "validMove"), true);
  assert.deepEqual(affectedTargetIds(oniDestinations), [visibleEnemy.id]);

  const asura = buildAbilityPreview({ gameView: view, viewerPlayerId: "P1", sourceUnitId: source.id, abilityId: ZORO_ASURA_ID });
  assert.equal(hasKind(asura, visibleEnemy.position!, "affected"), true);

  const windmills = buildAbilityPreview({ gameView: view, viewerPlayerId: "P1", sourceUnitId: source.id, abilityId: DON_WINDMILLS_ID });
  assert.deepEqual(validTargetIds(windmills), [visibleEnemy.id]);

  const traps = buildAbilityPreview({ gameView: view, viewerPlayerId: "P1", sourceUnitId: source.id, abilityId: JACK_SNARES_ID });
  assert.equal(hasKind(traps, { col: 0, row: 0 }, "validMove"), true);

  const insightLine = buildAbilityPreview({ gameView: view, viewerPlayerId: "P1", sourceUnitId: source.id, abilityId: ARTEMIS_MOON_INSIGHT_ID });
  assert.equal(hasKind(insightLine, { col: 6, row: 5 }, "area"), false);
  const insight = buildAbilityPreview({ gameView: view, viewerPlayerId: "P1", sourceUnitId: source.id, abilityId: ARTEMIS_MOON_INSIGHT_ID, targetingCell: { col: 6, row: 4 } });
  assert.equal(hasKind(insight, { col: 6, row: 5 }, "area"), true);
  assert.equal(hasKind(insight, { col: 6, row: 4 }, "affected"), true);
  const sickle = buildAbilityPreview({ gameView: view, viewerPlayerId: "P1", sourceUnitId: source.id, abilityId: ARTEMIS_SILVER_SICKLE_ID, targetingCell: { col: 6, row: 4 } });
  assert.equal(hasKind(sickle, { col: 6, row: 5 }, "area"), true);
  assert.equal(hasKind(sickle, { col: 5, row: 4 }, "affected"), true);
  assert.equal(hasKind(sickle, { col: 6, row: 4 }, "affected"), true);
  assert.equal(hasKind(sickle, { col: 7, row: 4 }, "area"), false);
  assert.equal(hasKind(sickle, { col: 8, row: 4 }, "line"), false);
  const offLineSickle = buildAbilityPreview({ gameView: view, viewerPlayerId: "P1", sourceUnitId: source.id, abilityId: ARTEMIS_SILVER_SICKLE_ID, targetingCell: { col: 6, row: 5 } });
  assert.equal(hasKind(offLineSickle, { col: 8, row: 5 }, "area"), false);

  assert.equal(collectTargets(push).some((target) => target.unitId === hiddenEnemy.id), false);
});

test("Oni Giri draws attack beams only to authoritative legal targets", () => {
  const source = unit({ id: "zoro-lines", owner: "P1", position: { col: 4, row: 4 } });
  const rowEnemy = unit({ id: "row-enemy", owner: "P2", position: { col: 7, row: 4 } });
  const diagonalEnemy = unit({ id: "diagonal-enemy", owner: "P2", position: { col: 1, row: 7 } });
  const illegalEnemy = unit({ id: "illegal-enemy", owner: "P2", position: { col: 6, row: 5 } });
  const view = makeView([source, rowEnemy, diagonalEnemy, illegalEnemy]);
  view.abilitiesByUnitId[source.id] = [{
    id: ZORO_ONI_GIRI_ID,
    targeting: {
      targetIds: [rowEnemy.id, diagonalEnemy.id],
      destinationsByTargetId: {
        [rowEnemy.id]: [{ col: 6, row: 4 }],
        [diagonalEnemy.id]: [{ col: 2, row: 6 }],
      },
    },
  } as any];

  assert.deepEqual(
    getOniGiriPreviewLines(view, source.id).map((line) => line.to),
    [rowEnemy.position, diagonalEnemy.position],
  );
  assert.deepEqual(
    getOniGiriPreviewLines(view, source.id, rowEnemy.id).map((line) => line.to),
    [rowEnemy.position],
  );
  assert.equal(
    getOniGiriPreviewLines(view, source.id).some((line) =>
      line.to.col === illegalEnemy.position!.col && line.to.row === illegalEnemy.position!.row),
    false,
  );
});

test("Silver Moon Sickle keeps farther legal endpoints faint while the affected preview stops at hover", () => {
  const artemida = unit({
    id: "artemida-sickle-preview",
    owner: "P1",
    heroId: "artemida",
    class: "archer",
    position: { col: 4, row: 4 },
  });
  const view = makeView([artemida]);

  const lineOnly = buildAbilityPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: artemida.id,
    abilityId: ARTEMIS_SILVER_SICKLE_ID,
  });
  assert.equal(hasKind(lineOnly, { col: 5, row: 4 }, "line"), true);
  assert.equal(hasKind(lineOnly, { col: 8, row: 4 }, "line"), true);
  assert.equal(hasKind(lineOnly, { col: 5, row: 4 }, "affected"), false);

  const hovered = buildAbilityPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: artemida.id,
    abilityId: ARTEMIS_SILVER_SICKLE_ID,
    targetingCell: { col: 6, row: 4 },
  });
  assert.equal(hasKind(hovered, { col: 5, row: 4 }, "affected"), true);
  assert.equal(hasKind(hovered, { col: 6, row: 4 }, "affected"), true);
  assert.equal(hasKind(hovered, { col: 7, row: 4 }, "affected"), false);
  assert.equal(hasKind(hovered, { col: 7, row: 4 }, "area"), false);
  assert.equal(hasKind(hovered, { col: 8, row: 4 }, "line"), true);
  assert.equal(hasKind(hovered, { col: 8, row: 4 }, "affected"), false);
});

test("Moon Insight pending preview uses authoritative line options and the hovered 3x3 center", () => {
  const artemida = unit({
    id: "artemida",
    owner: "P1",
    heroId: "artemida",
    class: "archer",
    position: { col: 4, row: 4 },
  });
  const view = makeView([artemida], {
    pendingRoll: {
      id: "moon-insight",
      player: "P1",
      kind: "chargedImpulseTargetChoice",
      context: {
        unitId: artemida.id,
        abilityId: ARTEMIS_MOON_INSIGHT_ID,
        options: [{ col: 6, row: 4 }],
      },
    } as PlayerView["pendingRoll"],
  });

  const lineOnly = buildPendingPreview(view);
  assert.equal(hasKind(lineOnly, { col: 6, row: 4 }, "line"), true);
  assert.equal(hasKind(lineOnly, { col: 6, row: 5 }, "area"), false);

  const selected = buildPendingPreview(view, { col: 6, row: 4 });
  assert.equal(hasKind(selected, { col: 6, row: 4 }, "affected"), true);
  assert.equal(hasKind(selected, { col: 6, row: 5 }, "area"), true);

  const rejectedLocalPoint = buildPendingPreview(view, { col: 6, row: 5 });
  assert.equal(hasKind(rejectedLocalPoint, { col: 6, row: 5 }, "area"), false);
});

test("Covering Tracks highlights existing snares and previews only visible radius-1 creatures", () => {
  const jack = unit({
    id: "jack",
    owner: "P1",
    heroId: "jackRipper",
    class: "assassin",
    position: { col: 8, row: 8 },
  });
  const visible = unit({ id: "visible", owner: "P2", position: { col: 2, row: 1 } });
  const view = makeView([jack, visible], {
    pendingRoll: {
      id: "covering-tracks",
      player: "P1",
      kind: "chargedImpulseTargetChoice",
      context: {
        unitId: jack.id,
        abilityId: JACK_SNARES_ID,
        step: "coveringTracks",
        placement: { col: 0, row: 8 },
        options: [{ col: 1, row: 1 }, { col: 5, row: 5 }],
      },
    } as PlayerView["pendingRoll"],
  });

  const options = buildPendingPreview(view);
  assert.equal(hasKind(options, { col: 1, row: 1 }, "validTarget"), true);
  assert.equal(hasKind(options, { col: 5, row: 5 }, "validTarget"), true);
  assert.equal(hasKind(options, { col: 2, row: 1 }, "area"), false);

  const hovered = buildPendingPreview(view, { col: 1, row: 1 });
  assert.equal(hasKind(hovered, { col: 2, row: 1 }, "area"), true);
  assert.equal(hasKind(hovered, { col: 2, row: 1 }, "affected"), true);
  assert.equal(hasKind(hovered, { col: 3, row: 1 }, "area"), false);
});

test("Madness of the Knight pending preview exposes all straight direction rays", () => {
  const don = unit({
    id: "don",
    owner: "P1",
    heroId: "donKihote",
    class: "rider",
    position: { col: 4, row: 4 },
  });
  const view = makeView([don], {
    pendingRoll: {
      id: "don-madness",
      player: "P1",
      kind: "donMadDelusionDirection",
      context: {
        unitId: don.id,
        origin: { col: 4, row: 4 },
        options: [
          { col: 0, row: -1 },
          { col: 0, row: 1 },
          { col: -1, row: 0 },
          { col: 1, row: 0 },
          { col: -1, row: -1 },
          { col: 1, row: -1 },
          { col: -1, row: 1 },
          { col: 1, row: 1 },
        ],
      },
    } as PlayerView["pendingRoll"],
  });

  const preview = buildPendingPreview(view);
  assert.equal(hasKind(preview, { col: 4, row: 0 }, "line"), true);
  assert.equal(hasKind(preview, { col: 8, row: 4 }, "line"), true);
  assert.equal(hasKind(preview, { col: 8, row: 8 }, "line"), true);
  assert.equal(hasKind(preview, { col: 6, row: 5 }, "line"), false);
});

test("Papyrus bone choice highlights only its current hit target", () => {
  const papyrus = unit({
    id: "papyrus",
    owner: "P1",
    heroId: "papyrus",
    position: { col: 1, row: 1 },
  });
  const current = unit({
    id: "duolingo",
    owner: "P2",
    position: { col: 4, row: 4 },
  });
  const later = unit({
    id: "zoro",
    owner: "P2",
    position: { col: 6, row: 4 },
  });
  const preview = buildPendingPreview(
    makeView([papyrus, current, later], {
      pendingRoll: {
        id: "papyrus-bone-1",
        player: "P1",
        kind: "papyrusBoneChoice",
        context: {
          papyrusUnitId: papyrus.id,
          targetUnitId: current.id,
          targetIds: [current.id, later.id],
          currentTargetIndex: 0,
          targetIndex: 1,
          targetCount: 2,
          availableBones: ["blue", "orange"],
        },
      },
    }),
  );

  assert.equal(hasKind(preview, current.position!, "affected"), true);
  assert.equal(hasKind(preview, later.position!, "affected"), false);
  assert.equal(hasKind(preview, papyrus.position!, "source"), true);
});
