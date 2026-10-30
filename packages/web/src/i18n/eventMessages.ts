import { getLocaleText, translateForLanguage } from ".";
import type { DiceRoll, ProjectedGameEvent, PlayerView, RuleDeclarationId } from "rules";
import type { Language, Translate } from ".";
import {
  getAbilityDisplay,
  getArenaLabel,
  getHeroDisplayName,
  getUnitFigureDisplayName,
} from "./displayMetadata";
import {
  GRIFFITH_FEMTO_REBIRTH_ID,
  GUTS_BERSERK_MODE_ID,
  GUTS_EXIT_BERSERK_ID,
  METTATON_EX_ID,
  METTATON_NEO_ID,
} from "../rulesHints";
import { presentationEn } from "./locales/presentation";

function value(input: unknown) {
  return input === null || input === undefined || input === "" ? "-" : String(input);
}

function diceList(input: unknown) {
  return Array.isArray(input) && input.length > 0 ? `[${input.join(", ")}]` : "[-]";
}

function unitList(ids: string[], language: Language) {
  return ids.length ? new Intl.ListFormat(language, { type: "conjunction" }).format(ids) : "-";
}

function coordText(coord: { col?: unknown; row?: unknown } | undefined) {
  return typeof coord?.col === "number" && typeof coord?.row === "number"
    ? `${coord.col}:${coord.row}`
    : "-";
}

function transformationForm(
  event: Extract<ProjectedGameEvent, { type: "unitTransformed" }>,
  language: Language,
) {
  if (event.toFormId === METTATON_EX_ID || event.abilityId === METTATON_EX_ID) {
    return `${getHeroDisplayName("mettaton", "Mettaton", language)} EX`;
  }
  if (event.toFormId === METTATON_NEO_ID || event.abilityId === METTATON_NEO_ID) {
    return `${getHeroDisplayName("mettaton", "Mettaton", language)} NEO`;
  }
  if (event.toHeroId === "femto" || event.toFormId === "femto") {
    return getHeroDisplayName("femto", "Femto", language);
  }
  return getHeroDisplayName(event.toHeroId, event.toHeroId, language);
}

const pendingLabels = presentationEn.pendingLabels;

function rollLabel(kind: string, language: Language) {
  const key = Object.prototype.hasOwnProperty.call(pendingLabels, kind) ? kind : "unknown";
  return translateForLanguage(language, `presentation.pendingLabels.${key}`);
}

const RULE_NAME_KEYS: Record<RuleDeclarationId, string> = {
  normal_rule: "normalRule",
  court: "court",
  chess_party: "chessParty",
  moon_game: "moonGame",
  advantage_game: "advantageGame",
};

function courtEffectName(effectId: string, language: Language) {
  return translateForLanguage(language, `presentation.courtEffects.${effectId}`);
}

function moonEffectName(effectId: string, language: Language) {
  return translateForLanguage(language, `presentation.moonEffects.${effectId}`);
}

function ruleName(ruleId: RuleDeclarationId, t: Translate) {
  return t(`ruleDeclarations.${RULE_NAME_KEYS[ruleId]}.name`);
}

/**
 * Player-facing name of a unit in the log. The roster holds every unit this viewer
 * may know about, so an id it lacks belongs to a hidden unit and is never shown as is.
 */
export function eventUnitName(
  id: string | null | undefined,
  language: Language,
  t: Translate,
  units?: PlayerView["rosterUnits"],
): string {
  if (!id) return "-";
  if (!units) return id;
  const unit = units[id];
  return unit ? getUnitFigureDisplayName(unit, { language, t }) : t("pending.context.hiddenUnit");
}

export function formatDice(roll?: DiceRoll | null) {
  if (!roll || !Array.isArray(roll.dice)) return "(-) = -";
  return `(${roll.dice.length ? roll.dice.join(", ") : "-"}) = ${roll.sum ?? "-"}`;
}

export function formatEventMessage(
  event: ProjectedGameEvent,
  language: Language,
  t: Translate,
  units?: PlayerView["rosterUnits"],
): string {
  const unitName = (id?: string | null) => eventUnitName(id, language, t, units);
  switch (event.type) {
    case "eventRedacted":
      return "";
    case "reactionOpportunity":
      return translateForLanguage(
        language,
        "presentation.eventMessages.has_a_reaction_opportunity_against",
        {
          value0: unitName(event.reactorUnitId),
          value1: event.targetUnitIds.map(unitName).join(", "),
        },
      );
    case "reactionChoiceResolved":
      return event.choice === "attack"
        ? translateForLanguage(language, "presentation.eventMessages.chose_to_attack", {
            value0: unitName(event.reactorUnitId),
          })
        : translateForLanguage(language, "presentation.eventMessages.passed_on_the_reaction", {
            value0: unitName(event.reactorUnitId),
          });
    case "reactionMovementResumed":
      return translateForLanguage(language, "presentation.eventMessages.movement_resumes", {
        value0: getAbilityDisplay(
          event.source === "tralala" ? "riverTraLaLa" : "genghisKhanMongolCharge",
          event.source === "tralala" ? "Tralala" : "Mongol Charge",
          "",
          language,
        ).name,
      });

    case "turnStarted":
      return translateForLanguage(language, "presentation.eventMessages.Turn_started_turn", {
        value0: event.player,
        value1: event.turnNumber,
      });
    case "roundStarted":
      return translateForLanguage(language, "presentation.eventMessages.Round_started", {
        value0: event.roundNumber,
      });
    case "unitPlaced":
      return translateForLanguage(language, "presentation.eventMessages.Unit_placed", {
        value0: unitName(event.unitId),
      });
    case "unitMoved":
      return event.unitId
        ? translateForLanguage(language, "presentation.eventMessages.Unit_moved", {
            value0: unitName(event.unitId),
          })
        : translateForLanguage(
            language,
            "presentation.eventMessages.A_hidden_movement_was_resolved",
          );
    case "hiddenCollisionResolved":
      if (!event.displacedUnitId) {
        return translateForLanguage(
          language,
          "presentation.eventMessages.A_hidden_collision_was_resolved",
        );
      }
      return event.damage === 1
        ? translateForLanguage(
            language,
            "presentation.eventMessages.had_no_free_adjacent_cell_and_took",
            { value0: unitName(event.displacedUnitId) },
          )
        : translateForLanguage(
            language,
            "presentation.eventMessages.Hidden_collision_rolled_on_d",
            { value0: unitName(event.displacedUnitId), value1: event.roll, value2: event.dieSides },
          );
    case "attackResolved":
      return translateForLanguage(language, "presentation.eventMessages.Attack", {
        value0: unitName(event.attackerId),
        value1: unitName(event.defenderId),
      });
    case "unitDied":
      return translateForLanguage(language, "presentation.eventMessages.Unit_died", {
        value0: unitName(event.unitId),
      });
    case "stealthEntered": {
      const result =
        event.success === true
          ? translateForLanguage(language, "presentation.eventMessages.success")
          : event.success === false
            ? translateForLanguage(language, "presentation.eventMessages.failed")
            : translateForLanguage(language, "presentation.eventMessages.unknown");
      const roll =
        typeof event.roll === "number"
          ? ` ${translateForLanguage(language, "presentation.eventMessages.rolled")} ${event.roll}`
          : "";
      return translateForLanguage(language, "presentation.eventMessages.Stealth_attempt", {
        value0: unitName(event.unitId),
        value1: roll,
        value2: result,
      });
    }
    case "stealthRevealed":
      if (event.reason === "timerExpired") {
        return translateForLanguage(
          language,
          "presentation.eventMessages.reveals_because_stealth_duration_expired",
          { value0: unitName(event.unitId) },
        );
      }
      return translateForLanguage(language, "presentation.eventMessages.Stealth_revealed", {
        value0: unitName(event.unitId),
      });
    case "rollRequested":
      return translateForLanguage(language, "presentation.eventMessages.Roll_requested", {
        value0: rollLabel(event.kind, language),
        value1: event.actorUnitId ? unitName(event.actorUnitId) : value(event.player),
      });
    case "initiativeRollRequested":
      return translateForLanguage(
        language,
        "presentation.eventMessages.Initiative_roll_requested",
        { value0: value(event.player) },
      );
    case "initiativeRolled":
      return translateForLanguage(language, "presentation.eventMessages.Initiative_rolled", {
        value0: value(event.player),
        value1: diceList(event.dice),
        value2: value(event.sum),
      });
    case "initiativeResolved":
      return translateForLanguage(
        language,
        "presentation.eventMessages.Initiative_resolved_P_P_winner",
        { value0: value(event.P1sum), value1: value(event.P2sum), value2: value(event.winner) },
      );
    case "placementStarted":
      return translateForLanguage(language, "presentation.eventMessages.Placement_started", {
        value0: value(event.placementFirstPlayer),
      });
    case "ruleDeclarationSelected":
      return translateForLanguage(language, "presentation.eventMessages.Rule_selected_by", {
        value0: ruleName(event.ruleId, t),
        value1: value(event.chooserPlayer),
      });
    case "ruleDeclarationSetupCompleted":
      return translateForLanguage(language, "presentation.eventMessages.Rule_setup_complete", {
        value0: ruleName(event.ruleId, t),
      });
    case "courtRolesAssigned":
      return translateForLanguage(
        language,
        "presentation.eventMessages.Court_roles_attacker_defender",
        { value0: value(event.attackerPlayer), value1: value(event.defenderPlayer) },
      );
    case "courtRolesSwapped":
      return translateForLanguage(
        language,
        "presentation.eventMessages.Court_roles_swapped_attacker_defender",
        { value0: value(event.attackerPlayer), value1: value(event.defenderPlayer) },
      );
    case "courtRollResult":
      return translateForLanguage(language, "presentation.eventMessages.Court_roll_rolled", {
        value0: translateForLanguage(
          language,
          event.side === "attacker"
            ? "presentation.fragments.courtSideAttacker"
            : "presentation.fragments.courtSideDefender",
        ),
        value1: event.player,
        value2: event.roll,
        value3: courtEffectName(event.effectId, language),
      });
    case "courtEffectApplied": {
      const unitId = event.unitId ?? event.targetId;
      const target = unitId
        ? unitName(unitId)
        : event.position
          ? `${event.position.col},${event.position.row}`
          : "-";
      return translateForLanguage(language, "presentation.eventMessages.Court_effect", {
        value0: courtEffectName(event.effectId, language),
        value1: value(target),
      });
    }
    case "chessKingSelected":
      return translateForLanguage(language, "presentation.eventMessages.King_selected", {
        value0: event.player,
        value1: unitName(event.unitId),
      });
    case "chessKingDeathResolved":
      return event.draw
        ? translateForLanguage(language, "presentation.eventMessages.Both_Kings_died_draw")
        : translateForLanguage(language, "presentation.eventMessages.King_died_winner", {
            value0: value(event.winner),
          });
    case "gameDraw":
      return translateForLanguage(language, "presentation.eventMessages.Game_ended_in_a_draw");
    case "pureBloodRedirected":
      return translateForLanguage(
        language,
        "presentation.eventMessages.Pure_Blood_redirected_damage_to",
        {
          value0: unitName(event.kingId),
          value1: event.damage,
          value2: unitName(event.redirectedToUnitId),
        },
      );
    case "moonRollResult":
      return translateForLanguage(language, "presentation.eventMessages.Moon_roll", {
        value0: event.roll,
        value1: moonEffectName(event.effectId, language),
      });
    case "moonEffectApplied":
      return translateForLanguage(language, "presentation.eventMessages.Moon_effect", {
        value0: moonEffectName(event.effectId, language),
      });
    case "advantageThresholdDeclared":
      return translateForLanguage(
        language,
        "presentation.eventMessages.Advantage_threshold_declared",
        { value0: event.player, value1: event.threshold },
      );
    case "advantageWinTriggered":
      return translateForLanguage(language, "presentation.eventMessages.Advantage_win", {
        value0: event.winner,
        value1: event.P1living,
        value2: event.P2living,
      });
    case "berserkerDefenseChosen":
      return translateForLanguage(language, "presentation.eventMessages.Berserker_defense", {
        value0: unitName(event.defenderId),
        value1: translateForLanguage(
          language,
          event.choice === "auto"
            ? "presentation.fragments.berserkerDefenseAuto"
            : "presentation.fragments.berserkerDefenseRoll",
        ),
      });
    case "chargesUpdated": {
      const entries = Object.entries(event.deltas ?? {}).map(([id, delta]) => {
        const ability = getAbilityDisplay(id, id, "", language).name;
        const after = event.now?.[id];
        const before =
          typeof after === "number" && typeof delta === "number" ? after - delta : undefined;
        return typeof before === "number" && typeof after === "number"
          ? `${ability} ${before}→${after}`
          : `${ability} ${Number(delta) >= 0 ? "+" : ""}${delta}`;
      });
      return translateForLanguage(language, "presentation.eventMessages.Charges", {
        value0: unitName(event.unitId),
        value1: entries.join(", ") || "-",
      });
    }
    case "mettatonRatingChanged": {
      const delta = event.delta >= 0 ? `+${event.delta}` : String(event.delta);
      return translateForLanguage(language, "presentation.eventMessages.Rating", {
        value0: unitName(event.unitId),
        value1: delta,
        value2: event.now,
      });
    }
    case "bunkerEntered":
      return translateForLanguage(language, "presentation.eventMessages.Bunker_entered_roll", {
        value0: unitName(event.unitId),
        value1: value(event.roll),
      });
    case "bunkerEnterFailed":
      return translateForLanguage(language, "presentation.eventMessages.Bunker_failed_roll", {
        value0: unitName(event.unitId),
        value1: value(event.roll),
      });
    case "bunkerExited":
      return translateForLanguage(language, "presentation.eventMessages.Bunker_exited", {
        value0: unitName(event.unitId),
      });
    case "carpetStrikeTriggered":
      return translateForLanguage(language, "presentation.eventMessages.Carpet_Strike_triggered", {
        value0: unitName(event.unitId),
      });
    case "carpetStrikeCenter":
      return translateForLanguage(language, "presentation.eventMessages.Carpet_Strike_center", {
        value0: event.unitId ? unitName(event.unitId) : event.unitId,
        value1: diceList(event.dice),
        value2: value(event.sum),
        value3: value(event.center?.col),
        value4: value(event.center?.row),
      });
    case "carpetStrikeAttackRolled":
      return translateForLanguage(language, "presentation.eventMessages.Carpet_Strike_attack", {
        value0: event.unitId ? unitName(event.unitId) : event.unitId,
        value1: diceList(event.dice),
        value2: value(event.sum),
      });
    case "searchStealth": {
      const actor = unitName(event.unitId);
      const modeLabel =
        event.mode === "move"
          ? translateForLanguage(language, "presentation.eventMessages.used_Movement_to_Search")
          : translateForLanguage(language, "presentation.eventMessages.used_Search");
      const rolls = Array.isArray(event.rolls) ? event.rolls : null;
      const revealed =
        rolls
          ?.filter((roll) => roll.success === true && typeof roll.targetId === "string")
          .map((roll) => roll.targetId) ?? [];
      if (!rolls) {
        return translateForLanguage(language, "presentation.eventMessages.message", {
          value0: actor,
          value1: modeLabel,
        });
      }
      if (revealed.length > 0) {
        return translateForLanguage(language, "presentation.eventMessages.and_revealed", {
          value0: actor,
          value1: modeLabel,
          value2: unitList(revealed.map(unitName), language),
        });
      }
      return translateForLanguage(
        language,
        "presentation.eventMessages.No_hidden_unit_was_revealed",
        { value0: actor, value1: modeLabel },
      );
    }
    case "abilityUsed": {
      if (typeof event.abilityId !== "string" || typeof event.unitId !== "string") {
        return translateForLanguage(language, "presentation.eventMessages.Hidden_ability_used");
      }
      if (event.abilityId === GRIFFITH_FEMTO_REBIRTH_ID) {
        return translateForLanguage(
          language,
          "presentation.eventMessages.Griffith_was_reborn_as_Femto",
        );
      }
      if (event.abilityId === "jackRipperSnares") {
        return translateForLanguage(
          language,
          "presentation.eventMessages.Jack_finished_placing_snares",
        );
      }
      if (event.abilityId === "hassanAssasinOrder") {
        return translateForLanguage(
          language,
          "presentation.eventMessages.Hassan_finished_preparing_a_stealth_effect",
        );
      }
      if (event.abilityId === GUTS_BERSERK_MODE_ID) {
        return translateForLanguage(language, "presentation.eventMessages.entered_Berserk_Mode", {
          value0: unitName(event.unitId),
        });
      }
      if (event.abilityId === GUTS_EXIT_BERSERK_ID) {
        return translateForLanguage(language, "presentation.eventMessages.exited_Berserk_Mode", {
          value0: unitName(event.unitId),
        });
      }
      if (event.abilityId === METTATON_EX_ID) {
        return translateForLanguage(
          language,
          "presentation.eventMessages.transformed_into_Mettaton_EX",
          { value0: unitName(event.unitId) },
        );
      }
      if (event.abilityId === METTATON_NEO_ID) {
        return translateForLanguage(
          language,
          "presentation.eventMessages.transformed_into_Mettaton_NEO",
          { value0: unitName(event.unitId) },
        );
      }
      const ability = getAbilityDisplay(event.abilityId, event.abilityId, "", language).name;
      return translateForLanguage(language, "presentation.eventMessages.Ability_used", {
        value0: unitName(event.unitId),
        value1: ability,
      });
    }
    case "chikatiloMarkApplied": {
      if (typeof event.targetId !== "string") {
        return translateForLanguage(
          language,
          "presentation.eventMessages.Killer_s_Mark_was_applied",
        );
      }
      return translateForLanguage(
        language,
        "presentation.eventMessages.Chikatilo_applied_Killer_s_Mark_to_Exact",
        { value0: unitName(event.targetId) },
      );
    }
    case "papyrusUnbelieverActivated":
    case "sansUnbelieverActivated":
      return translateForLanguage(language, "presentation.eventMessages.Unbeliever_awakened");
    case "papyrusBoneApplied":
      return translateForLanguage(language, "presentation.eventMessages.applied_to", {
        value0: unitName(event.papyrusId),
        value1: translateForLanguage(
          language,
          event.boneType === "blue"
            ? "presentation.fragments.blueBone"
            : "presentation.fragments.orangeBone",
        ),
        value2: unitName(event.targetId),
      });
    case "papyrusBonePunished":
    case "sansBoneFieldPunished":
      return translateForLanguage(language, "presentation.eventMessages.Bone_punishment_took", {
        value0: unitName(event.targetId),
        value1: event.damage,
      });
    case "sansBadassJokeApplied":
      return translateForLanguage(language, "presentation.eventMessages.Movement_locked", {
        value0: unitName(event.targetId),
      });
    case "sansMoveDenied":
      return translateForLanguage(language, "presentation.eventMessages.Movement_denied", {
        value0: unitName(event.unitId),
      });
    case "sansBoneFieldActivated":
      return translateForLanguage(
        language,
        "presentation.eventMessages.Bone_Field_activated_rounds",
        { value0: unitName(event.sansId), value1: event.duration },
      );
    case "sansBoneFieldApplied":
      return translateForLanguage(language, "presentation.eventMessages.Bone_Field_applied_to", {
        value0: unitName(event.unitId),
      });
    case "sansLastAttackApplied":
      return translateForLanguage(
        language,
        "presentation.eventMessages.Sans_cursed_with_Last_Attack",
        { value0: unitName(event.targetId) },
      );
    case "sansLastAttackTick":
      return translateForLanguage(
        language,
        "presentation.eventMessages.suffers_damage_from_Sans_s_curse",
        { value0: unitName(event.targetId), value1: event.damage },
      );
    case "sansLastAttackRemoved":
      return translateForLanguage(
        language,
        "presentation.eventMessages.Sans_s_curse_on_has_ended",
        { value0: unitName(event.targetId) },
      );
    case "friskHugsApplied":
      return translateForLanguage(language, "presentation.eventMessages.Hugs_chose", {
        value0: unitName(event.friskId),
        value1: unitName(event.targetId),
      });
    case "lokiChickenApplied":
      return translateForLanguage(language, "presentation.eventMessages.Chicken_was_changed_by", {
        value0: unitName(event.targetId),
        value1: unitName(event.lokiId),
      });
    case "lokiChickenGroupApplied": {
      const targets = Array.isArray(event.targetIds) ? event.targetIds : [];
      const targetText = unitList(targets.map(unitName), language);
      if (targets.length === 0) {
        return translateForLanguage(
          language,
          "presentation.eventMessages.Loki_s_Good_Joke_resolved",
        );
      }
      if (targets.length === 1) {
        return translateForLanguage(
          language,
          "presentation.eventMessages.Loki_s_Good_Joke_turned_into_a",
          { value0: targetText },
        );
      }
      if (targets.length > 3) {
        return translateForLanguage(
          language,
          "presentation.eventMessages.Loki_s_Good_Joke_turned_units_into",
          { value0: targets.length, value1: targetText },
        );
      }
      return translateForLanguage(
        language,
        "presentation.eventMessages.Loki_s_Good_Joke_turned_into_chickens",
        { value0: targetText },
      );
    }
    case "controlledAttackDeclared":
      return translateForLanguage(
        language,
        "presentation.eventMessages.Controlled_attack_forced_to_attack",
        {
          value0: unitName(event.controllerUnitId),
          value1: unitName(event.controlledUnitId),
          value2: unitName(event.targetId),
        },
      );
    case "unitTransformed": {
      if (typeof event.unitId !== "string") {
        return translateForLanguage(language, "presentation.eventMessages.A_unit_transformed");
      }
      const form = transformationForm(event, language);
      if (event.reason === "griffithFemtoRebirth") {
        const from = getHeroDisplayName("griffith", "Griffith", language);
        return translateForLanguage(language, "presentation.eventMessages.was_reborn_as", {
          value0: from,
          value1: form,
        });
      }
      if (event.reason === "mettatonThreshold") {
        return translateForLanguage(
          language,
          "presentation.eventMessages.Mettaton_reached_the_Rating_threshold_and_transformed",
          { value0: form },
        );
      }
      return translateForLanguage(language, "presentation.eventMessages.transformed_into", {
        value0: unitName(event.unitId),
        value1: form,
      });
    }
    case "riverBoatmanGranted":
      return translateForLanguage(
        language,
        "presentation.eventMessages.River_Person_used_Boatman_and_gained_an",
      );
    case "riverBoatResolved":
      return translateForLanguage(
        language,
        "presentation.eventMessages.River_Person_transported_to",
        { value0: unitName(event.passengerId), value1: coordText(event.dropDestination) },
      );
    case "riverBoatDisembarkFailed":
      return event.reason === "carrierDied"
        ? translateForLanguage(
            language,
            "presentation.eventMessages.Boat_cannot_disembark_the_carrier_died_The",
          )
        : translateForLanguage(
            language,
            "presentation.eventMessages.Boat_cannot_disembark_no_legal_cells_are",
          );
    case "riverTraLaLaResolved": {
      const attackers = Array.isArray(event.touchedAttackerIds) ? event.touchedAttackerIds : [];
      const attackText =
        attackers.length > 0
          ? translateForLanguage(language, "presentation.fragments.tralalaAttacks", {
              attackers: unitList(attackers.map(unitName), language),
              target: unitName(event.targetId),
            })
          : "";
      return translateForLanguage(
        language,
        "presentation.eventMessages.River_Person_used_Tra_la_la_and",
        {
          value0: unitName(event.targetId),
          value1: coordText(event.dropDestination),
          value2: attackText,
        },
      );
    }
    case "asgoreSoulParadeResolved":
      return translateForLanguage(language, "presentation.eventMessages.rolled_for_Soul_Parade", {
        value0: event.asgoreId
          ? unitName(event.asgoreId)
          : getHeroDisplayName("asgore", "Asgore", language),
        value1: value(event.roll),
        value2:
          getLocaleText(
            language,
            `abilityDetails.asgore.soulParade.outcomes.${event.soulId}.name`,
          ) ?? t("common.unknown"),
        value3:
          getLocaleText(
            language,
            `abilityDetails.asgore.soulParade.outcomes.${event.soulId}.description`,
          ) ?? t("pending.context.genericSuccess"),
      });
    case "lechyStormStarted":
      return translateForLanguage(
        language,
        "presentation.eventMessages.started_Storm_Duration_roll_Storm_will_remain",
        {
          value0: event.sourceUnitId
            ? unitName(event.sourceUnitId)
            : getHeroDisplayName("lechy", "Lechy", language),
          value1: value(event.roll),
          value2: value(event.duration),
          value3: translateForLanguage(
            language,
            event.durationUnit === "round"
              ? "presentation.fragments.roundUnit"
              : "presentation.fragments.turnUnit",
            { count: event.duration },
          ),
        },
      );
    case "lechyStormRollResult":
      return translateForLanguage(language, "presentation.eventMessages.Storm_roll_rolled", {
        value0: unitName(event.unitId),
        value1: value(event.roll),
        value2: translateForLanguage(
          language,
          event.damage > 0
            ? "presentation.fragments.stormDamage"
            : "presentation.fragments.stormResisted",
          { damage: event.damage },
        ),
      });
    case "unitHealed":
      return event.hpAfter === undefined
        ? translateForLanguage(language, "presentation.eventMessages.Healed_no_HP", {
            value0: unitName(event.unitId),
            value1: event.amount,
          })
        : translateForLanguage(language, "presentation.eventMessages.Healed_HP", {
            value0: unitName(event.unitId),
            value1: event.amount,
            value2: event.hpAfter,
          });
    case "damageBonusApplied":
      return translateForLanguage(language, "presentation.eventMessages.Damage_bonus", {
        value0: unitName(event.unitId),
        value1: event.amount,
      });
    case "hiddenSetupCompleted":
      return event.ability === "vladStakes"
        ? translateForLanguage(
            language,
            "presentation.eventMessages.Vlad_finished_preparing_Field_of_Stakes",
          )
        : translateForLanguage(
            language,
            "presentation.eventMessages.Opponent_finished_resolving_a_hidden_battlefield_effect",
          );
    case "stakesPlaced":
      return translateForLanguage(language, "presentation.eventMessages.Stakes_placed", {
        value0: event.owner,
        value1: event.positions?.length ?? 0,
      });
    case "stakeTriggered":
      return translateForLanguage(language, "presentation.eventMessages.Stake_triggered", {
        value0: unitName(event.unitId),
      });
    case "intimidateTriggered":
      return translateForLanguage(language, "presentation.eventMessages.Intimidate_vs", {
        value0: unitName(event.defenderId),
        value1: unitName(event.attackerId),
      });
    case "intimidateResolved":
      return translateForLanguage(language, "presentation.eventMessages.Intimidate_push", {
        value0: unitName(event.attackerId),
      });
    case "forestActivated":
      return translateForLanguage(language, "presentation.eventMessages.Forest_activated", {
        value0: unitName(event.vladId),
      });
    case "aoeResolved":
      return translateForLanguage(
        language,
        "presentation.eventMessages.Area_attack_resolved_targets",
        { value0: unitName(event.sourceUnitId), value1: event.affectedUnitIds?.length ?? 0 },
      );
    case "moveOptionsGenerated":
      return translateForLanguage(language, "presentation.eventMessages.Move_options", {
        value0: unitName(event.unitId),
      });
    case "moveBlocked":
      return translateForLanguage(language, "presentation.eventMessages.Move_blocked", {
        value0: unitName(event.unitId),
      });
    case "battleStarted":
      return translateForLanguage(language, "presentation.eventMessages.Battle_started", {
        value0: event.startingPlayer,
      });
    case "arenaChosen":
      return translateForLanguage(language, "presentation.eventMessages.Arena_chosen", {
        value0: getArenaLabel(event.arenaId, t),
      });
    case "gameEnded": {
      const winner = t(`roles.${event.winner}`);
      return translateForLanguage(language, "presentation.eventMessages.Battle_ended_wins", {
        value0: winner,
      });
    }
    case "rollResolved":
      return translateForLanguage(language, "presentation.eventMessages.Roll_resolved", {
        value0: event.unitId ? unitName(event.unitId) : value(event.rollerPlayerId),
        value1: rollLabel(event.rollKind, language),
        value2: `(${event.dice.length ? event.dice.join(", ") : "-"}) = ${value(event.total)}`,
      });
    case "pendingRollUnhandled":
      return translateForLanguage(language, "presentation.eventMessages.Roll_not_resolved", {
        value0: rollLabel(event.kind, language),
      });
    case "reactionMovementEnded":
      return translateForLanguage(
        language,
        event.reason === "cancelled"
          ? "presentation.eventMessages.movement_cancelled"
          : "presentation.eventMessages.movement_completed",
        {
          value0: unitName(event.controllerUnitId),
          value1: getAbilityDisplay(
            event.source === "tralala" ? "riverTraLaLa" : "genghisKhanMongolCharge",
            event.source === "tralala" ? "Tralala" : "Mongol Charge",
            "",
            language,
          ).name,
        },
      );
    case "riverBoatPickup":
      return translateForLanguage(language, "presentation.eventMessages.took_aboard_the_boat", {
        value0: unitName(event.riverId),
        value1: unitName(event.passengerId),
      });
    case "riverBoatDisembarked":
      return translateForLanguage(language, "presentation.eventMessages.disembarked_from_the_boat", {
        value0: unitName(event.passengerId),
        value1: unitName(event.riverId),
        value2: coordText(event.dropDestination),
      });
    case "riverStormWard":
      return translateForLanguage(language, "presentation.eventMessages.sheltered_from_the_Storm", {
        value0: unitName(event.unitId),
      });
    case "snarePlaced":
      return translateForLanguage(language, "presentation.eventMessages.set_a_snare", {
        value0: unitName(event.sourceUnitId),
        value1: coordText(event.cell),
      });
    case "snareTriggered":
      return translateForLanguage(language, "presentation.eventMessages.caught_in_a_snare", {
        value0: unitName(event.unitId),
      });
    case "forestMovementStopped":
      return translateForLanguage(language, "presentation.eventMessages.stopped_by_the_forest", {
        value0: unitName(event.unitId),
      });
    case "heroSelfCost":
      return event.hpAfter === undefined
        ? translateForLanguage(language, "presentation.eventMessages.paid_HP_for_no_total", {
            value0: unitName(event.unitId),
            value1: event.damage,
            value2: getAbilityDisplay(event.sourceAbilityId, event.sourceAbilityId, "", language)
              .name,
          })
        : translateForLanguage(language, "presentation.eventMessages.paid_HP_for", {
            value0: unitName(event.unitId),
            value1: event.damage,
            value2: getAbilityDisplay(event.sourceAbilityId, event.sourceAbilityId, "", language)
              .name,
            value3: event.hpAfter,
          });
    case "groznyTyrantRewarded":
      return translateForLanguage(language, "presentation.eventMessages.rewarded_by_Tyrant", {
        value0: unitName(event.unitId),
      });
    case "duolingoBerserkerUnlocked":
      return translateForLanguage(language, "presentation.eventMessages.unlocked_Berserker", {
        value0: unitName(event.unitId),
      });
    case "kanekiFormEntered":
      return translateForLanguage(language, "presentation.eventMessages.entered_Scolopendra_form", {
        value0: unitName(event.unitId),
      });
    case "friskOnePathUnlocked":
      return translateForLanguage(language, "presentation.eventMessages.chose_the_One_Path", {
        value0: unitName(event.unitId),
      });
    case "friskFriendshipWon":
      return translateForLanguage(language, "presentation.eventMessages.won_by_Power_of_Friendship", {
        value0: unitName(event.unitId),
      });
    case "lokiSpinCommitted":
      return translateForLanguage(language, "presentation.eventMessages.spun_the_Wheel", {
        value0: unitName(event.unitId),
      });
    case "lokiGreatJokeCommitted":
      return translateForLanguage(language, "presentation.eventMessages.played_the_Amazing_Joke", {
        value0: unitName(event.unitId),
        value1: event.radius,
      });
    case "unitDeathFinalized":
      return translateForLanguage(language, "presentation.eventMessages.fell_for_good", {
        value0: unitName(event.unitId),
      });
    default:
      return t("log.unknownEvent");
  }
}
