import type { Coord, PlayerView, UnitState } from "rules";
import { HERO_CATALOG } from "../figures/catalog";
import { FALSE_TRAIL_TOKEN_ID } from "../rulesHints";
import type { Language, Translate } from ".";
import { getLocaleText } from ".";

type AbilityTranslation = { name: string; description: string };

const heroCatalogById = new Map(HERO_CATALOG.map((hero) => [hero.id, hero]));

const serverTextKeys: Record<string, string> = {
  MATCH_INTERRUPTED: "errors.matchInterrupted",
  RATED_RATING_DIFFERENCE_TOO_LARGE: "customLobby.gapTooLarge",
  "Rating difference is too large for a Rated match": "customLobby.gapTooLarge",
  RATED_RATING_UNAVAILABLE: "customLobby.ratingUnavailable",
  "Unable to verify player ratings": "customLobby.ratingUnavailable",
  RATED_MATCH_INVALID_PARTICIPANTS: "customLobby.distinctRequired",
  "Two distinct authenticated players are required": "customLobby.distinctRequired",
  INVALID_LOBBY_NAME: "customLobby.invalidName",
  "Invalid lobby name": "customLobby.invalidName",
  "Rated matches require authenticated players": "matchTypes.authRequired",
  RATED_MATCH_REQUIRES_AUTHENTICATION: "matchTypes.authRequired",
  "Choose Casual or Rated": "matchTypes.invalidType",
  "Match type is fixed at creation": "matchTypes.immutable",
  "Test rooms are always Casual": "matchTypes.testOnly",
  "Pending roll must be resolved": "errors.resolvePending",
  "Not in battle": "errors.gameNotStarted",
  "Not your turn": "game.notYourTurn",
  "Not active unit": "game.notActiveUnit",
  "Movement is blocked": "game.movementBlocked",
  "Chicken: this unit can only move": "game.chickenMoveOnly",
  "Requires Mettaton EX": "game.requiresMettatonEx",
  "Requires Unbeliever Sans": "game.requiresUnbelieverSans",
  "Already transformed": "game.alreadyTransformed",
  "Action slot already used": "game.actionSlotUsed",
  "Move slot already used": "game.moveSlotUsed",
  "Attack slot already used": "game.attackSlotUsed",
  "Stealth slot already used": "game.stealthSlotUsed",
  "Not Enough charges": "game.notEnoughCharges",
  "Not enough Laugh": "game.notEnoughLaugh",
  "Not enough Laugh.": "game.notEnoughLaugh",
  "No legal targets": "pending.noValidTargets",
  "No valid target.": "pending.noValidTargets",
  "WebSocket not connected.": "errors.socketDisconnected",
  "Not joined yet. Please join a room first.": "errors.notJoined",
  "Resolve the pending roll before acting.": "errors.resolvePending",
  "Game has not started yet.": "errors.gameNotStarted",
  "Spectators cannot act.": "errors.spectatorCannotAct",
  "Ready-up is only available in the lobby.": "errors.readyLobbyOnly",
  "Game can only be started from the lobby.": "errors.startLobbyOnly",
  "Socket not initialized": "errors.socketNotInitialized",
  Disconnected: "connection.disconnected",
  // Reason codes from the rules' legal intents (search buttons).
  pendingRollBlocking: "errors.resolvePending",
  notYourTurn: "game.notYourTurn",
  noActiveUnit: "game.notActiveUnit",
  activeUnitNotOwned: "game.notActiveUnit",
  moveSlotUsed: "actionMenu.movementAlreadySpent",
  actionSlotUsed: "actionMenu.actionAlreadySpent",
};

const complexAbilitySummaryKeys: Record<string, string> = {
  friskPacifism: "abilityDetails.frisk.pacifism.summary",
  friskGenocide: "abilityDetails.frisk.genocide.summary",
  friskOnePath: "abilityDetails.frisk.onePath.summary",
  lokiLaught: "abilityDetails.loki.laughter.summary",
  asgoreSoulParade: "abilityDetails.asgore.soulParade.summary",
  papyrusUnbeliever: "abilityDetails.papyrus.unbeliever.summary",
  kaiserEngineeringMiracle: "abilityDetails.kaiser.engineeringMiracle.summary",
  gutsBerserkMode: "abilityDetails.guts.berserk.summary",
  griffithFemtoRebirth: "abilityDetails.griffith.rebirth.summary",
  femtoDivineMove: "abilityDetails.griffith.divineMovement.summary",
  groznyTyrant: "abilityDetails.grozny.tyrant.summary",
  chikatiloFalseTrail: "abilityDetails.chikatilo.falseTrail.summary",
  vladStakes: "abilityDetails.vlad.stakes.summary",
  vladForest: "abilityDetails.vlad.forest.summary",
  riverBoat: "abilityDetails.river.boat.summary",
  riverTraLaLa: "abilityDetails.river.tralala.summary",
  mettatonRating: "abilityDetails.mettaton.rating.summary",
  sansUnbeliever: "abilityDetails.sans.unbeliever.summary",
  undyneUndying: "abilityDetails.undyne.undying.summary",
};

export function getHeroDisplayName(
  id: string | null | undefined,
  fallback: string,
  language: Language,
) {
  return id ? (getLocaleText(language, `metadata.heroes.${id}`) ?? fallback) : fallback;
}

export interface UnitDisplayNameOptions {
  language: Language;
  t: Translate;
}

/**
 * Resolve a projected unit to a player-facing figure name.
 *
 * Callers should pass only the UnitState from the recipient's PlayerView. Unknown
 * figure metadata deliberately falls back to the unit's public base class instead
 * of exposing the service unit id.
 */
export function getUnitFigureDisplayName(
  unit: Pick<UnitState, "class" | "figureId" | "heroId">,
  { language, t }: UnitDisplayNameOptions,
): string {
  const projectedFigureIds = [unit.figureId, unit.heroId].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );

  if (projectedFigureIds.includes(FALSE_TRAIL_TOKEN_ID)) {
    return t("game.falseTrailToken");
  }

  const catalogFigure = projectedFigureIds
    .map((id) => heroCatalogById.get(id))
    .find((figure) => figure !== undefined);
  if (catalogFigure) {
    return getHeroDisplayName(catalogFigure.id, catalogFigure.name, language);
  }

  // Femto is a visible transformed form rather than a selectable catalog figure.
  if (projectedFigureIds.includes("femto")) {
    return getHeroDisplayName("femto", "Femto", language);
  }

  const baseFigureId = `base-${unit.class}`;
  const baseFigure = heroCatalogById.get(baseFigureId);
  const fallback = baseFigure?.name ?? getClassLabel(unit.class, t);
  return getHeroDisplayName(baseFigureId, fallback, language);
}

/** Figure name for a unit id from the recipient's view; null when that unit is not visible. */
export function getUnitIdDisplayName(
  view: Pick<PlayerView, "units">,
  unitId: string | null | undefined,
  options: UnitDisplayNameOptions,
): string | null {
  const unit = unitId ? view.units[unitId] : undefined;
  return unit ? getUnitFigureDisplayName(unit, options) : null;
}

/** Same notation as the board rulers: column letter, then row number (B2). */
export function getCellLabel(coord: Pick<Coord, "col" | "row">): string {
  return `${String.fromCharCode(65 + coord.col)}${coord.row}`;
}

export function getUnitClassDisplayName(
  unit: Pick<UnitState, "class">,
  { t }: Pick<UnitDisplayNameOptions, "t">,
): string {
  return getClassLabel(unit.class, t);
}

export function getPlacementUnitLabel(unit: UnitState, options: UnitDisplayNameOptions): string {
  return `${getUnitFigureDisplayName(unit, options)} (${getUnitClassDisplayName(unit, options)})`;
}

export function getAbilityDisplay(
  id: string,
  fallbackName: string,
  fallbackDescription: string,
  language: Language,
): AbilityTranslation {
  const localized =
    language === "en"
      ? { name: fallbackName, description: fallbackDescription }
      : {
          name: getLocaleText(language, `metadata.abilities.${id}.name`) ?? fallbackName,
          description:
            getLocaleText(language, `metadata.abilities.${id}.description`) ?? fallbackDescription,
        };
  const summaryKey = complexAbilitySummaryKeys[id];
  return {
    ...localized,
    description: summaryKey
      ? (getLocaleText(language, summaryKey) ?? localized.description)
      : localized.description,
  };
}

export function localizeServerText(value: string | null | undefined, t: Translate): string {
  if (!value) return "";
  const key = serverTextKeys[value];
  if (key) return t(key);
  if (/^invalid_game_mode$/i.test(value)) return t("errors.invalidGameMode");
  if (/^not_host$/i.test(value)) return t("errors.notHost");
  if (/^(mode_locked|game_already_started)$/i.test(value)) return t("errors.modeLocked");
  if (
    /^(banned|picked|base_unit_not_allowed|hero_not_draftable|class_slot_already_filled|ban_would_break_class_pool|max_bans_per_class_reached|not_current_player|draft_phase_mismatch|invalid_draft_hero)$/i.test(
      value,
    )
  ) {
    return t(`draft.lockReasons.${value}`);
  }
  const rating = /^Need Rating (\d+)$/.exec(value);
  if (rating) return t("game.needRating", { rating: rating[1] });
  if (/^Failed to load rooms/.test(value)) return t("errors.loadRooms");
  if (/^Failed to create room/.test(value)) return t("errors.createRoom");
  if (/^Failed to join room/.test(value)) return t("errors.joinRoom");
  if (/^Failed to load heroes/.test(value)) return t("errors.loadHeroes");
  if (/^Failed to refresh rooms/.test(value)) return t("errors.refreshRooms");
  if (/role.+taken|role_taken/i.test(value)) return t("errors.roleTaken");
  if (/room.+not found|room_not_found/i.test(value)) return t("errors.roomNotFound");
  if (/room.+exists|room_exists/i.test(value)) return t("errors.roomExists");
  if (/rate.?limit|too many requests/i.test(value)) return t("errors.rateLimited");
  if (/invalid payload|payload.+invalid/i.test(value)) return t("errors.invalidPayload");
  if (/action rejected|rejected by rules/i.test(value)) return t("errors.actionRejected");
  return value;
}

export function getClassLabel(value: string, t: Translate): string {
  return t(`classes.${value}`);
}

export function getAbilityTypeLabel(value: string, t: Translate): string {
  return t(`abilityTypes.${value}`);
}

export function getSlotLabel(value: string, t: Translate): string {
  return t(`slots.${value}`);
}

export function getPhaseLabel(value: string, t: Translate): string {
  return t(`phases.${value}`);
}

export function getConnectionLabel(value: string, t: Translate): string {
  return t(`connection.${value}`);
}

export function getArenaLabel(value: string | null | undefined, t: Translate): string {
  return t(`arenas.${value ?? "default"}`);
}

export function getStatLabel(value: string, t: Translate): string {
  // Move types reuse existing labels: class-specific movement is named after its class.
  if (value === "normal") return t("actionUi.normalMovement");
  if (value === "rider" || value === "berserker") return getClassLabel(value, t);
  return t(`stats.${value.replace("-", "")}`);
}

export function localizeFigureSetError(value: string, t: Translate): string {
  if (value === "Invalid JSON file.") return t("errors.invalidJson");
  if (value === "Invalid selection payload.") return t("errors.invalidSelection");
  const missing = /^Missing hero for slot: (.+)$/.exec(value);
  if (missing) return t("errors.missingHero", { slot: getClassLabel(missing[1], t) });
  const unknown = /^Unknown hero id: (.+)$/.exec(value);
  if (unknown) return t("errors.unknownHero", { hero: unknown[1] });
  const mismatch = /^Hero (.+) does not match slot (.+)$/.exec(value);
  if (mismatch) {
    return t("errors.heroSlotMismatch", {
      hero: mismatch[1],
      slot: getClassLabel(mismatch[2], t),
    });
  }
  return value;
}
