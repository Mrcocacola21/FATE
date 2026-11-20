import {
  getLegalAttackTargets,
  type AbilityView,
  type Coord,
  type GameAction,
  type GameState,
  type PlayerId,
  type PlayerView,
  type ResolveRollChoice,
  type UnitState,
} from "rules";
import type { BotProfile, BotRandom } from "./types";

/**
 * The bot's decisions in battle. Everything here reads one PlayerView, the projection a player in
 * the bot's seat receives, and returns the commands it would send, best first. The room tries them
 * in order through the normal command path, exactly as a player's clicks would arrive.
 */

type Scored = { action: GameAction; score: number };

const CLASS_VALUE: Record<string, number> = {
  knight: 1.3,
  spearman: 1,
  rider: 1.1,
  archer: 1.15,
  assassin: 1.1,
  trickster: 1,
  berserker: 1.2,
};

const distance = (a: Coord, b: Coord) => Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
const same = (a: Coord, b: Coord) => a.row === b.row && a.col === b.col;

function enemiesOf(view: PlayerView, seat: PlayerId): UnitState[] {
  return Object.values(view.units).filter(
    (unit) => unit.owner !== seat && unit.isAlive && !!unit.position,
  );
}

function figureValue(unit: UnitState): number {
  return (CLASS_VALUE[unit.class] ?? 1) * (unit.heroId ? 1.25 : 1);
}

/** Where the bot believes the hidden enemies are: their last known cells. */
function hiddenEnemyCells(view: PlayerView): Coord[] {
  return Object.values(view.lastKnownPositions ?? {});
}

/**
 * A GameState-shaped copy of the view for asking the rules "what could I attack from there".
 * Hidden enemies are simply absent, as they are for the player in this seat.
 */
export function beliefFromView(view: PlayerView): GameState {
  const {
    pendingDecision: _pendingDecision,
    pendingCombatQueueCount: _queue,
    pendingAoEPreview: _aoe,
    rosterUnits: _roster,
    abilitiesByUnitId: _abilities,
    legal: _legal,
    legalIntents: _intents,
    ...rest
  } = view;
  return {
    ...(rest as unknown as GameState),
    events: [],
    victoryDisabled: true,
    knowledge: { P1: {}, P2: {} },
    lastKnownPositions: { P1: {}, P2: {} },
    pendingRoll: null,
    pendingReactionMovement: null,
    combatResolutionChain: null,
    rollCounter: 0,
    abilityUseCounter: 0,
    pendingCombatQueue: [],
    pendingAoE: null,
    pendingPapyrusBoneChoices: [],
    stakeMarkers: [],
    stakeCounter: 0,
    jackTraps: [],
    jackTrapCounter: 0,
  } as unknown as GameState;
}

function attackTargetsFrom(belief: GameState, unitId: string, cell: Coord): string[] {
  const unit = belief.units[unitId];
  if (!unit) return [];
  const moved: GameState = {
    ...belief,
    units: { ...belief.units, [unitId]: { ...unit, position: { ...cell } } },
  };
  try {
    return getLegalAttackTargets(moved, unitId);
  } catch {
    return [];
  }
}

function attackScore(view: PlayerView, profile: BotProfile, attacker: UnitState, targetId: string) {
  const target = view.units[targetId];
  if (!target) return 4;
  // Enemy HP in a projection is a band stand-in: the bot sees exactly what the player would.
  const lethal = attacker.attack >= target.hp;
  let score = 10 + attacker.attack * 2;
  if (profile.focusFire) score += (lethal ? 12 : 0) + figureValue(target) * 3 - target.hp * 0.8;
  return score;
}

/** How good a cell is for this figure to stand on at the end of its activation. */
function cellScore(
  view: PlayerView,
  belief: GameState,
  profile: BotProfile,
  unit: UnitState,
  cell: Coord,
  enemies: UnitState[],
): number {
  const targets = enemies.length
    ? enemies.map((enemy) => enemy.position!)
    : hiddenEnemyCells(view).length
      ? hiddenEnemyCells(view)
      : [
          {
            row: unit.owner === "P1" ? view.boardSize - 1 : 0,
            col: Math.floor(view.boardSize / 2),
          },
        ];
  const nearest = Math.min(...targets.map((target) => distance(cell, target)));
  const ranged = unit.class === "archer";
  // Ranged figures like a little distance; everyone else closes in.
  let score = ranged ? -Math.abs(nearest - 3) * 1.5 : -nearest * 2;
  if (profile.lookahead && enemies.length) {
    const reachable = attackTargetsFrom(belief, unit.id, cell).length;
    if (reachable) score += 6 + reachable;
  }
  if (profile.caution) {
    const threats = enemies.filter((enemy) => distance(enemy.position!, cell) <= 1).length;
    const wounded = unit.hp <= 1;
    score -= threats * (wounded ? 4 : 1.2);
  }
  return score;
}

function abilityPayloads(ability: AbilityView, view: PlayerView, seat: PlayerId): unknown[] {
  const targeting = ability.targeting;
  const payloads: unknown[] = [];
  const ids = targeting?.targetIds ?? [];
  const enemyFirst = [...ids].sort((a, b) => {
    const enemy = (id: string) => (view.units[id] && view.units[id].owner !== seat ? 0 : 1);
    return enemy(a) - enemy(b);
  });
  for (const id of enemyFirst) {
    const destinations = targeting?.destinationsByTargetId?.[id];
    if (destinations?.length)
      for (const to of destinations)
        payloads.push({ targetId: id, to }, { targetId: id, destination: to });
    payloads.push({ targetId: id }, { targetUnitId: id });
  }
  const cells = [
    ...(targeting?.cells ?? []),
    ...(targeting?.modes?.line?.cells ?? []),
    ...(targeting?.modes?.aroundSelf?.cells ?? []),
  ];
  for (const cell of cells)
    payloads.push({ target: cell }, { center: cell }, { to: cell }, { position: cell });
  if (targeting?.modes?.line) payloads.push({ mode: "line" });
  if (targeting?.modes?.aroundSelf) payloads.push({ mode: "aroundSelf" });
  for (const option of ability.useOptions ?? [])
    if (option.isAvailable) payloads.push({ optionId: option.id });
  payloads.push(undefined);
  return payloads;
}

function enemyNear(view: PlayerView, seat: PlayerId, unit: UnitState, enemies: UnitState[]) {
  return unit.position
    ? Math.min(99, ...enemies.map((enemy) => distance(enemy.position!, unit.position!)))
    : 99;
}

/** Commands for the bot's own unit activation, best first. */
function battleCandidates(
  view: PlayerView,
  seat: PlayerId,
  profile: BotProfile,
  rng: BotRandom,
): Scored[] {
  if (!view.activeUnitId) {
    const next = view.turnQueue.length
      ? view.turnQueue[view.turnQueueIndex]
      : view.turnOrder[view.turnOrderIndex];
    const own = Object.values(view.units).filter((unit) => unit.owner === seat && unit.isAlive);
    const queue = [next, ...own.map((unit) => unit.id)].filter(
      (id, index, all): id is string => !!id && all.indexOf(id) === index,
    );
    return [
      ...queue.map((unitId, index) => ({
        action: { type: "unitStartTurn", unitId } as GameAction,
        score: 100 - index,
      })),
      { action: { type: "endTurn" }, score: 0 },
    ];
  }
  const unit = view.units[view.activeUnitId];
  const end: Scored = { action: { type: "endTurn" }, score: 0 };
  if (!unit || unit.owner !== seat || !unit.position) return [end];
  const intents = view.legalIntents;
  const belief = beliefFromView(view);
  const enemies = enemiesOf(view, seat);
  const options: Scored[] = [end];

  if (intents?.canAttack)
    for (const targetId of view.legal?.attackTargetsByUnitId?.[unit.id] ?? [])
      options.push({
        action: { type: "attack", attackerId: unit.id, defenderId: targetId },
        score: attackScore(view, profile, unit, targetId),
      });

  const here = cellScore(view, belief, profile, unit, unit.position, enemies);
  if (view.pendingMove && view.pendingMove.unitId === unit.id) {
    for (const to of view.pendingMove.legalTo) {
      if (same(to, unit.position)) continue;
      const gain = cellScore(view, belief, profile, unit, to, enemies) - here;
      options.push({ action: { type: "move", unitId: unit.id, to }, score: 3 + gain });
    }
  } else if (intents?.canMove) {
    const preview = view.legal?.movesByUnitId?.[unit.id] ?? [];
    const best = Math.max(
      -Infinity,
      ...preview.map((to) => cellScore(view, belief, profile, unit, to, enemies) - here),
    );
    // Rolled movers (no preview) still try their luck when no attack is on offer.
    const gain = preview.length ? best : enemies.length ? 1 : 0.5;
    if (gain > 0)
      options.push({
        action: { type: "requestMoveOptions", unitId: unit.id, mode: "normal" },
        score: 3 + gain,
      });
  }

  if (rng.next() < profile.abilityUse)
    for (const ability of view.abilitiesByUnitId?.[unit.id] ?? []) {
      if (!ability.isAvailable || ability.kind === "passive") continue;
      const payloads = abilityPayloads(ability, view, seat).slice(0, MAX_PAYLOADS_PER_ABILITY);
      // Abilities are a hero's strength; prefer them over a plain step, not over a sure kill.
      // Far from the fight, closing in comes first; the ability can follow the step.
      const far = enemyNear(view, seat, unit, enemies) > 3 ? 9 : 0;
      const base = (ability.kind === "phantasm" ? 16 : ability.kind === "impulse" ? 13 : 11) - far;
      payloads.forEach((payload, index) =>
        options.push({
          action: {
            type: "useAbility",
            unitId: unit.id,
            abilityId: ability.id,
            ...(payload === undefined ? {} : { payload }),
          },
          score: base - index * 0.01,
        }),
      );
    }

  const near = enemyNear(view, seat, unit, enemies);
  if (intents?.canEnterStealth && near > 1 && !options.some((o) => o.action.type === "attack"))
    options.push({
      action: { type: "enterStealth", unitId: unit.id },
      score: profile.caution ? 2.5 : 1,
    });
  if (!enemies.length && hiddenEnemyCells(view).length) {
    if (intents?.canSearchAction)
      options.push({
        action: { type: "searchStealth", unitId: unit.id, mode: "action" },
        score: 4,
      });
    else if (intents?.canSearchMove)
      options.push({ action: { type: "searchStealth", unitId: unit.id, mode: "move" }, score: 2 });
  }
  return options;
}

function placementCandidates(
  view: PlayerView,
  seat: PlayerId,
  profile: BotProfile,
  rng: BotRandom,
) {
  const options: Scored[] = [];
  const own = Object.values(view.units).filter((unit) => unit.owner === seat);
  const placed = own.filter((unit) => unit.position).map((unit) => unit.position!);
  const center = (view.boardSize - 1) / 2;
  for (const [unitId, cells] of Object.entries(view.legal?.placementsByUnitId ?? {}))
    for (const position of cells) {
      // Spread out around the middle of the back line; the apprentice simply drops figures anywhere.
      const crowd = placed.filter((cell) => distance(cell, position) <= 1).length;
      const score =
        profile.blunder >= 0.4
          ? rng.next()
          : -Math.abs(position.col - center) * 0.3 - crowd + rng.next() * 0.5;
      options.push({ action: { type: "placeUnit", unitId, position }, score });
    }
  return options;
}

function coordsIn(value: unknown, into: Coord[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) coordsIn(item, into);
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.row === "number" && typeof record.col === "number") {
    into.push({ row: record.row, col: record.col });
    return;
  }
  for (const nested of Object.values(record))
    if (typeof nested === "object") coordsIn(nested, into);
}

const ROLL_ONLY = new Set([
  "enterStealth",
  "enterBunker",
  "searchStealth",
  "moveTrickster",
  "moveBerserker",
  "initiativeRoll",
  "forestMoveCheck",
  "kaiserCarpetStrikeCenter",
  "kaiserCarpetStrikeAttack",
  "moonRoundRoll",
  "moonCoordinateRoll",
  "courtAttackerRoll",
  "courtDefenderRoll",
]);

const OFFER_LISTS = [
  "options",
  "legalTargetIds",
  "targetIds",
  "eligibleUnitIds",
  "legalPositions",
  "legalCells",
  "legalTargets",
];

/** Ids and cells a pending decision offers in its context: the lists a player's client shows. */
function offered(context: Record<string, unknown>, units: Record<string, unknown>) {
  const ids = new Set<string>();
  const cells: Coord[] = [];
  for (const key of OFFER_LISTS) {
    const value = context[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item === "string" && units[item]) ids.add(item);
      else coordsIn(item, cells);
    }
  }
  return { ids: [...ids], cells };
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/**
 * Answers to a pending decision, each in the exact shape the player's client sends for it. The
 * rules read an unexpected answer as declining the effect, so the bot never guesses a shape: a
 * decision it does not know is rolled, or passed when it cannot be rolled.
 */
function pendingCandidates(view: PlayerView, seat: PlayerId, rng: BotRandom): ResolveRollChoice[] {
  const pending = view.pendingRoll!;
  const kind = pending.kind as string;
  const context = (pending.context ?? {}) as Record<string, unknown>;
  const enemies = enemiesOf(view, seat).map((unit) => unit.id);
  const own = Object.values(view.units).filter((u) => u.owner === seat && u.isAlive && u.position);
  const shuffle = <T>(items: T[]) =>
    items
      .map((item) => ({ item, key: rng.next() }))
      .sort((a, b) => a.key - b.key)
      .map(({ item }) => item);
  const { ids, cells } = offered(context, view.units);
  const targets = ids.length ? shuffle(ids) : enemies;
  const spots = shuffle(cells);
  const out: unknown[] = [];
  const each = <T>(items: T[], make: (item: T) => unknown) => {
    for (const item of items) out.push(make(item));
  };

  if (/(_attackerRoll|_defenderRoll|Roll)$/.test(kind) || ROLL_ONLY.has(kind)) out.push("roll");
  else if (/DefenseChoice$/.test(kind)) out.push("auto", "roll");
  else
    switch (kind) {
      case "reactionChoice":
        each(ids, (targetId) => ({ type: "resolveReactionChoice", choice: "attack", targetId }));
        out.push({ type: "resolveReactionChoice", choice: "pass" });
        break;
      case "reactionDropChoice":
        each(spots, (position) => ({ type: "reactionDropDestination", position }));
        break;
      case "ruleDeclarationChoice":
        out.push({ type: "chooseRuleDeclaration", ruleId: "normal_rule" });
        break;
      case "ruleDeclarationAdvantageThreshold":
        each([7, 6, 8, 5, 9], (threshold) => ({ type: "ruleThreshold", threshold }));
        break;
      case "ruleDeclarationChessKingChoice":
      case "courtEffectUnitChoice":
      case "moonCheeseHolesChoice":
      case "pureBloodRedirectChoice":
        // The projection drops own figures it cannot place on the board (before placement, or
        // fallen ones), so the bot offers its own roster, as a player picks from the roster panel.
        each(
          ids.length
            ? shuffle(ids)
            : shuffle(
                Object.values(view.units)
                  .filter((u) => u.owner === seat)
                  .map((u) => u.id),
              ),
          (unitId) => ({ type: "ruleUnit", unitId }),
        );
        out.push("skip");
        break;
      case "courtEffectChargeChoice":
        each(strings(context.options), (abilityId) => ({ type: "ruleCharge", abilityId }));
        for (const unit of own)
          each(Object.keys(unit.charges ?? {}), (abilityId) => ({ type: "ruleCharge", abilityId }));
        break;
      case "courtForcedAppearanceDestination":
        each(spots, (position) => ({ type: "ruleCell", position }));
        break;
      case "papyrusBoneChoice":
        each(shuffle(["blue", "orange"]), (boneType) => ({ type: "papyrusBoneChoice", boneType }));
        break;
      case "selectLastAttackTarget":
        each(targets, (targetId) => ({ type: "sansLastAttackTarget", targetId }));
        break;
      case "odinSleipnirDestination":
      case "femtoDivineMoveDestination":
      case "asgoreSoulParadeIntegrityDestination":
      case "forestMoveDestination":
        each(spots, (position) => ({ type: kind, position }));
        break;
      case "chargedImpulseTargetChoice":
        each(spots, (position) => ({ type: "chargedImpulseTarget", position }));
        break;
      case "donMadDelusionDirection":
        each(spots, (direction) => ({ type: "donMadDelusionDirection", direction }));
        break;
      case "donWindmillsRepositionChoice":
        each(spots, (destination) => ({ type: "donWindmillsReposition", destination }));
        break;
      case "donSorrowfulMoveChoice":
        each(spots, (destination) => ({ type: "donSorrowfulMove", destination }));
        out.push("skip");
        break;
      case "mongolChargeAllyAttackTarget":
        each(targets, (targetId) => ({ type: "mongolChargeAllyAttackTarget", targetId }));
        break;
      case "jebeKhansShooterTargetChoice":
      case "hassanTrueEnemyTargetChoice":
      case "asgoreSoulParadePatienceTargetChoice":
      case "asgoreSoulParadePerseveranceTargetChoice":
      case "asgoreSoulParadeJusticeTargetChoice":
      case "friskPacifismHugsTargetChoice":
      case "friskWarmWordsTargetChoice":
      case "friskPrecisionStrikeTargetChoice":
      case "lokiChickenTargetChoice":
      case "lokiMindControlEnemyChoice":
      case "lokiMindControlTargetChoice":
      case "groznyTyrantAllyChoice":
        each(targets, (targetId) => ({ type: kind.replace(/Choice$/, ""), targetId }));
        break;
      case "friskKeenEyeChoice":
        each(targets, (targetId) => ({ type: "friskKeenEyeTarget", targetId }));
        out.push("skip");
        break;
      case "vladIntimidateChoice":
        each(spots, (to) => ({ type: "intimidatePush", to }));
        out.push("skip");
        break;
      case "vladPlaceStakes": {
        const count = typeof context.count === "number" ? context.count : 3;
        for (let i = 0; i < 4 && cells.length; i++)
          out.push({ type: "placeStakes", positions: shuffle(cells).slice(0, count) });
        break;
      }
      case "vladForestChoice":
        out.push("activate", "skip");
        break;
      case "vladForestTarget": {
        const centers = enemiesOf(view, seat).map((unit) => unit.position!);
        const middle = Math.floor(view.boardSize / 2);
        each(centers.length ? shuffle(centers) : [{ row: middle, col: middle }], (center) => ({
          type: "forestTarget",
          center,
        }));
        break;
      }
      case "chikatiloFalseTrailPlacement":
        each(spots, (position) => ({ type: "chikatiloPlace", position }));
        break;
      case "chikatiloDecoyChoice":
        out.push("decoy", "roll");
        break;
      case "chikatiloFalseTrailRevealChoice":
        out.push("falseTrailExplode", "falseTrailRemove");
        break;
      case "elCidDuelistChoice":
        out.push(
          rng.next() < 0.7 ? "elCidDuelistContinue" : "elCidDuelistStop",
          "elCidDuelistStop",
        );
        break;
      case "groznyTyrantOptionChoice":
        each(shuffle(["normal", "invadeTime"]), (mode) => ({ type: "groznyTyrantOption", mode }));
        break;
      case "groznyTyrantAttackCellChoice": {
        const options = Array.isArray(context.options) ? (context.options as unknown[]) : [];
        each(
          shuffle(
            options.filter(
              (o): o is Record<string, unknown> =>
                !!o &&
                typeof o === "object" &&
                typeof (o as { targetId?: unknown }).targetId === "string",
            ),
          ),
          (o) => ({
            type: "groznyTyrantAttackCell",
            mode: o.mode,
            targetId: o.targetId,
            position: o.position,
          }),
        );
        out.push("skip");
        break;
      }
      case "lechyGuideTravelerPlacement":
        each(spots, (position) => ({ type: "lechyGuideTravelerPlace", position }));
        break;
      // The ferryman's choices read only a target id or a cell; the client sends them in the
      // shared target and destination shapes, and so does the bot.
      case "riverBoatCarryChoice":
        each(
          targets.filter((id) => view.units[id]?.owner === seat),
          (targetId) => ({ type: "hassanTrueEnemyTarget", targetId }),
        );
        out.push({ type: "riverBoatNoPassenger" });
        break;
      case "riverTraLaLaTargetChoice":
        each(targets, (targetId) => ({ type: "hassanTrueEnemyTarget", targetId }));
        out.push("skip");
        break;
      case "riverBoatDestinationChoice":
      case "riverBoatDropDestination":
      case "riverTraLaLaDestinationChoice":
      case "riverTraLaLaDropDestinationChoice":
        each(spots, (position) => ({ type: "forestMoveDestination", position }));
        out.push("skip");
        break;
      case "hassanAssassinOrderSelection": {
        const eligible = strings(context.eligibleUnitIds);
        for (let i = 0; i < 3 && eligible.length >= 2; i++)
          out.push({ type: "hassanAssassinOrderPick", unitIds: shuffle(eligible).slice(0, 2) });
        break;
      }
      case "lokiLaughtChoice":
        each(
          shuffle(["againSomeNonsense", "chicken", "mindControl", "spinTheDrum", "greatLokiJoke"]),
          (option) => ({ type: "lokiLaughtOption", option }),
        );
        out.push("skip");
        break;
      case "lokiSpinAbilityChoice":
        each(shuffle(strings(context.options)), (abilityId) => ({
          type: "lokiSpinAbility",
          abilityId,
        }));
        out.push("skip");
        break;
      case "gutsBerserkAttackChoice":
        for (const targetId of targets)
          each(shuffle(["single", "aoe"]), (mode) => ({
            type: "gutsBerserkAttackMode",
            mode,
            targetId,
          }));
        out.push("skip");
        break;
      case "friskPacifismChoice":
        each(shuffle(["powerOfFriendship", "warmWords", "hugs", "childsCry"]), (option) => ({
          type: "friskPacifismOption",
          option,
        }));
        out.push("skip");
        break;
      case "friskGenocideChoice":
        each(shuffle(["precisionStrike", "keenEye", "substitution"]), (option) => ({
          type: "friskGenocideOption",
          option,
        }));
        out.push("skip");
        break;
      case "friskSubstitutionChoice":
        out.push("activate", "roll");
        break;
      case "friskChildsCryChoice":
        out.push("activate", "skip");
        break;
      default:
        out.push("roll", "skip", "auto");
    }
  return out as ResolveRollChoice[];
}

function pickOrder(options: Scored[], profile: BotProfile, rng: BotRandom): GameAction[] {
  const sorted = [...options].sort((a, b) => b.score - a.score);
  if (sorted.length > 1 && rng.next() < profile.blunder) {
    // A blunder: any option other than the best one, a wasted turn included.
    const pool = sorted.slice(1);
    const pick = pool[Math.floor(rng.next() * pool.length)];
    if (pick) return [pick.action, ...sorted.filter((o) => o !== pick).map((o) => o.action)];
  }
  return sorted.map((option) => option.action);
}

/** Every command the bot would consider right now in battle, in the order it would try them. */
export function decideBattle(
  view: PlayerView,
  seat: PlayerId,
  profile: BotProfile,
  rng: BotRandom,
  memory?: BotMemory,
): GameAction[] {
  if (view.phase === "ended") return [];
  if (view.pendingRoll) {
    if (view.pendingRoll.player !== seat) return [];
    return pendingCandidates(view, seat, rng).map((choice) => ({
      type: "resolvePendingRoll",
      pendingRollId: view.pendingRoll!.id,
      player: seat,
      choice,
    }));
  }
  if (view.currentPlayer !== seat) return [];
  if (view.phase === "placement")
    return pickOrder(placementCandidates(view, seat, profile, rng), profile, rng);
  if (view.phase === "battle") {
    const fresh = battleCandidates(view, seat, profile, rng).filter(
      (option) => !memory?.has(activationKey(view), option.action),
    );
    const ordered = pickOrder(fresh, profile, rng);
    // Keep the list short enough to try in one go, and never lose the way to end the activation.
    if (ordered.length <= MAX_CANDIDATES) return ordered;
    return [...ordered.slice(0, MAX_CANDIDATES - 1), { type: "endTurn" }];
  }
  return [];
}

/** The room tries at most this many commands for one decision. */
export const MAX_CANDIDATES = 120;
const MAX_PAYLOADS_PER_ABILITY = 24;

const ONCE_PER_ACTIVATION = new Set([
  "useAbility",
  "requestMoveOptions",
  "enterStealth",
  "searchStealth",
]);

function activationKey(view: PlayerView): string {
  return `${view.turnNumber}:${view.activeUnitId ?? "-"}`;
}

/**
 * What the bot has already done with the figure it is moving. A player does not press the same
 * ability twice in one activation hoping for a different result, and neither does the bot.
 */
export class BotMemory {
  private activation = "";
  private readonly used = new Set<string>();

  private key(action: GameAction): string | null {
    return ONCE_PER_ACTIVATION.has(action.type) ? JSON.stringify(action) : null;
  }

  has(activation: string, action: GameAction): boolean {
    const key = this.key(action);
    return activation === this.activation && key !== null && this.used.has(key);
  }

  remember(view: PlayerView, action: GameAction): void {
    const activation = activationKey(view);
    if (activation !== this.activation) {
      this.activation = activation;
      this.used.clear();
    }
    const key = this.key(action);
    if (key) {
      this.used.add(key);
      // One use of an ability per activation, whatever the target.
      if (action.type === "useAbility")
        this.used.add(JSON.stringify({ ability: action.abilityId }));
    }
  }

  usedAbility(view: PlayerView, abilityId: string): boolean {
    return (
      activationKey(view) === this.activation &&
      this.used.has(JSON.stringify({ ability: abilityId }))
    );
  }
}
