import type { DiceRoll, GameEvent } from "rules";
import type { Language, Translate } from ".";
import { getAbilityDisplay, getArenaLabel } from "./displayMetadata";

function text(language: Language, en: string, uk: string) {
  return language === "uk" ? uk : en;
}

function value(input: unknown) {
  return input === null || input === undefined || input === "" ? "-" : String(input);
}

function diceList(input: unknown) {
  return Array.isArray(input) && input.length > 0 ? `[${input.join(", ")}]` : "[-]";
}

export function formatDice(roll?: DiceRoll | null) {
  if (!roll || !Array.isArray(roll.dice)) return "(-) = -";
  return `(${roll.dice.length ? roll.dice.join(", ") : "-"}) = ${roll.sum ?? "-"}`;
}

export function formatEventMessage(
  event: GameEvent,
  language: Language,
  t: Translate,
): string {
  switch (event.type) {
    case "turnStarted":
      return text(
        language,
        `Turn started: ${event.player} (turn ${event.turnNumber})`,
        `Почався хід ${event.player} (хід ${event.turnNumber})`,
      );
    case "roundStarted":
      return text(language, `Round ${event.roundNumber} started`, `Почався раунд ${event.roundNumber}`);
    case "unitPlaced":
      return text(language, `Unit placed: ${event.unitId}`, `Розміщено фігуру: ${event.unitId}`);
    case "unitMoved":
      return text(language, `Unit moved: ${event.unitId}`, `Фігуру переміщено: ${event.unitId}`);
    case "attackResolved":
      return text(
        language,
        `Attack: ${event.attackerId} → ${event.defenderId}`,
        `Атака: ${event.attackerId} → ${event.defenderId}`,
      );
    case "unitDied":
      return text(language, `Unit died: ${event.unitId}`, `Фігура загинула: ${event.unitId}`);
    case "stealthEntered": {
      const result =
        event.success === true
          ? text(language, "success", "успіх")
          : event.success === false
            ? text(language, "failed", "невдача")
            : text(language, "unknown", "невідомо");
      const roll = typeof event.roll === "number" ? ` ${text(language, "rolled", "кидок")} ${event.roll}` : "";
      return text(
        language,
        `Stealth attempt: ${event.unitId}${roll} (${result})`,
        `Спроба скритності: ${event.unitId}${roll} (${result})`,
      );
    }
    case "stealthRevealed":
      return text(
        language,
        `Stealth revealed: ${event.unitId}`,
        `Скритність розкрито: ${event.unitId}`,
      );
    case "rollRequested":
      return text(
        language,
        `Roll requested: ${value(event.kind)} (${value(event.actorUnitId ?? event.player)})`,
        `Потрібен кидок: ${value(event.kind)} (${value(event.actorUnitId ?? event.player)})`,
      );
    case "initiativeRollRequested":
      return text(
        language,
        `Initiative roll requested: ${value(event.player)}`,
        `Потрібен кидок ініціативи: ${value(event.player)}`,
      );
    case "initiativeRolled":
      return text(
        language,
        `Initiative rolled: ${value(event.player)} ${diceList(event.dice)} = ${value(event.sum)}`,
        `Кидок ініціативи: ${value(event.player)} ${diceList(event.dice)} = ${value(event.sum)}`,
      );
    case "initiativeResolved":
      return text(
        language,
        `Initiative resolved: P1 ${value(event.P1sum)} / P2 ${value(event.P2sum)} (winner ${value(event.winner)})`,
        `Ініціативу визначено: P1 ${value(event.P1sum)} / P2 ${value(event.P2sum)} (переможець ${value(event.winner)})`,
      );
    case "placementStarted":
      return text(
        language,
        `Placement started: ${value(event.placementFirstPlayer)}`,
        `Почалося розміщення: ${value(event.placementFirstPlayer)}`,
      );
    case "ruleDeclarationSelected":
      return text(
        language,
        `Rule selected: ${value(event.ruleId)} by ${value(event.chooserPlayer)}`,
        `Обрано правило: ${value(event.ruleId)} гравцем ${value(event.chooserPlayer)}`,
      );
    case "ruleDeclarationSetupCompleted":
      return text(
        language,
        `Rule setup complete: ${value(event.ruleId)}`,
        `Налаштування правила завершено: ${value(event.ruleId)}`,
      );
    case "courtRolesAssigned":
      return text(
        language,
        `Court roles: attacker ${value(event.attackerPlayer)}, defender ${value(event.defenderPlayer)}`,
        `Ролі Суду: атака ${value(event.attackerPlayer)}, захист ${value(event.defenderPlayer)}`,
      );
    case "courtRolesSwapped":
      return text(
        language,
        `Court roles swapped: attacker ${value(event.attackerPlayer)}, defender ${value(event.defenderPlayer)}`,
        `Ролі Суду змінено: атака ${value(event.attackerPlayer)}, захист ${value(event.defenderPlayer)}`,
      );
    case "courtRollResult":
      return text(
        language,
        `Court roll: ${event.side} ${event.player} rolled ${event.roll} (${event.effectId})`,
        `Кидок Суду: ${event.side} ${event.player} кинув ${event.roll} (${event.effectId})`,
      );
    case "courtEffectApplied": {
      const target = event.unitId ?? event.targetId ?? (event.position ? `${event.position.col},${event.position.row}` : "-");
      return text(
        language,
        `Court effect: ${event.effectId} (${value(target)})`,
        `Ефект Суду: ${event.effectId} (${value(target)})`,
      );
    }
    case "chessKingSelected":
      return text(
        language,
        `King selected: ${event.player} ${event.unitId}`,
        `Обрано Короля: ${event.player} ${event.unitId}`,
      );
    case "chessKingDeathResolved":
      return event.draw
        ? text(language, "Both Kings died: draw", "Обидва Королі загинули: нічия")
        : text(
            language,
            `King died: winner ${value(event.winner)}`,
            `Король загинув: переможець ${value(event.winner)}`,
          );
    case "gameDraw":
      return text(language, "Game ended in a draw", "Гра завершилася нічиєю");
    case "pureBloodRedirected":
      return text(
        language,
        `Pure Blood: ${event.kingId} redirected ${event.damage} damage to ${event.redirectedToUnitId}`,
        `Чиста кров: ${event.kingId} перенаправив ${event.damage} шкоди на ${event.redirectedToUnitId}`,
      );
    case "moonRollResult":
      return text(
        language,
        `Moon roll: ${event.roll} (${event.effectId})`,
        `Кидок Місяця: ${event.roll} (${event.effectId})`,
      );
    case "moonEffectApplied":
      return text(
        language,
        `Moon effect: ${event.effectId}`,
        `Ефект Місяця: ${event.effectId}`,
      );
    case "advantageThresholdDeclared":
      return text(
        language,
        `Advantage threshold: ${event.player} declared ${event.threshold}`,
        `Поріг переваги: ${event.player} оголосив ${event.threshold}`,
      );
    case "advantageWinTriggered":
      return text(
        language,
        `Advantage win: ${event.winner} (${event.P1living}-${event.P2living})`,
        `Перемога за перевагою: ${event.winner} (${event.P1living}-${event.P2living})`,
      );
    case "berserkerDefenseChosen":
      return text(
        language,
        `Berserker defense: ${event.defenderId} (${event.choice})`,
        `Захист берсерка: ${event.defenderId} (${event.choice})`,
      );
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
      return text(
        language,
        `Charges: ${event.unitId} ${entries.join(", ") || "-"}`,
        `Заряди: ${event.unitId} ${entries.join(", ") || "-"}`,
      );
    }
    case "mettatonRatingChanged": {
      const delta = event.delta >= 0 ? `+${event.delta}` : String(event.delta);
      return text(
        language,
        `Rating: ${event.unitId} ${delta} → ${event.now}`,
        `Рейтинг: ${event.unitId} ${delta} → ${event.now}`,
      );
    }
    case "bunkerEntered":
      return text(language, `Bunker entered: ${event.unitId} (roll ${value(event.roll)})`, `Вхід у бункер: ${event.unitId} (кидок ${value(event.roll)})`);
    case "bunkerEnterFailed":
      return text(language, `Bunker failed: ${event.unitId} (roll ${value(event.roll)})`, `Не вдалося увійти в бункер: ${event.unitId} (кидок ${value(event.roll)})`);
    case "bunkerExited":
      return text(language, `Bunker exited: ${event.unitId}`, `Вихід із бункера: ${event.unitId}`);
    case "carpetStrikeTriggered":
      return text(language, `Carpet Strike triggered: ${event.unitId}`, `Килимовий удар активовано: ${event.unitId}`);
    case "carpetStrikeCenter":
      return text(
        language,
        `Carpet Strike center: ${event.unitId} ${diceList(event.dice)} = ${value(event.sum)} → (${value(event.center?.col)}, ${value(event.center?.row)})`,
        `Центр Килимового удару: ${event.unitId} ${diceList(event.dice)} = ${value(event.sum)} → (${value(event.center?.col)}, ${value(event.center?.row)})`,
      );
    case "carpetStrikeAttackRolled":
      return text(
        language,
        `Carpet Strike attack: ${event.unitId} ${diceList(event.dice)} = ${value(event.sum)}`,
        `Атака Килимового удару: ${event.unitId} ${diceList(event.dice)} = ${value(event.sum)}`,
      );
    case "searchStealth":
      return text(
        language,
        `Stealth search: ${event.unitId} (${event.mode})`,
        `Пошук прихованих: ${event.unitId} (${event.mode})`,
      );
    case "abilityUsed": {
      const ability = getAbilityDisplay(event.abilityId, event.abilityId, "", language).name;
      return text(language, `Ability used: ${event.unitId} (${ability})`, `Використано здібність: ${event.unitId} (${ability})`);
    }
    case "papyrusUnbelieverActivated":
    case "sansUnbelieverActivated":
      return text(language, "Unbeliever awakened", "Невіруючий пробудився");
    case "papyrusBoneApplied":
      return text(language, `Bone applied: ${event.papyrusId} → ${event.targetId}`, `Кістку накладено: ${event.papyrusId} → ${event.targetId}`);
    case "papyrusBonePunished":
    case "sansBoneFieldPunished":
      return text(language, `Bone punishment: ${event.targetId} took ${event.damage}`, `Покарання кісткою: ${event.targetId} отримує ${event.damage} шкоди`);
    case "sansBadassJokeApplied":
      return text(language, `Movement locked: ${event.targetId}`, `Переміщення заблоковано: ${event.targetId}`);
    case "sansMoveDenied":
      return text(language, `Movement denied: ${event.unitId}`, `Переміщення заборонено: ${event.unitId}`);
    case "sansBoneFieldActivated":
      return text(language, `Bone Field activated: ${event.sansId} (${event.duration} turns)`, `Поле кісток активовано: ${event.sansId} (${event.duration} ходів)`);
    case "sansBoneFieldApplied":
      return text(language, `Bone Field applied to ${event.unitId}`, `Поле кісток діє на ${event.unitId}`);
    case "sansLastAttackApplied":
      return text(language, `Curse applied: ${event.targetId}`, `Прокляття накладено: ${event.targetId}`);
    case "sansLastAttackTick":
      return text(language, `Curse: ${event.targetId} took ${event.damage}`, `Прокляття: ${event.targetId} отримує ${event.damage} шкоди`);
    case "sansLastAttackRemoved":
      return text(language, `Curse removed: ${event.targetId}`, `Прокляття знято: ${event.targetId}`);
    case "friskHugsApplied":
      return text(
        language,
        `Hugs: ${event.friskId} chose ${event.targetId}`,
        `Hugs: ${event.friskId} chose ${event.targetId}`,
      );
    case "lokiChickenApplied":
      return text(
        language,
        `Chicken: ${event.targetId} was changed by ${event.lokiId}`,
        `Chicken: ${event.targetId} was changed by ${event.lokiId}`,
      );
    case "controlledAttackDeclared":
      return text(
        language,
        `Controlled attack: ${event.controllerUnitId} forced ${event.controlledUnitId} to attack ${event.targetId}`,
        `Controlled attack: ${event.controllerUnitId} forced ${event.controlledUnitId} to attack ${event.targetId}`,
      );
    case "lechyStormRollResult":
      return text(
        language,
        `Storm roll: ${value(event.unitId)} rolled ${value(event.roll)}${
          event.damage > 0 ? ` and took ${event.damage} damage` : " and resisted"
        }`,
        `Кидок Бурі: ${value(event.unitId)} кинув ${value(event.roll)}${
          event.damage > 0 ? ` і отримав ${event.damage} шкоди` : " і встояв"
        }`,
      );
    case "unitHealed":
      return text(language, `Healed: ${event.unitId} +${event.amount} (HP ${event.hpAfter})`, `Лікування: ${event.unitId} +${event.amount} (здоров’я ${event.hpAfter})`);
    case "damageBonusApplied":
      return text(language, `Damage bonus: ${event.unitId} +${event.amount}`, `Бонус шкоди: ${event.unitId} +${event.amount}`);
    case "stakesPlaced":
      return text(language, `Stakes placed: ${event.owner} (${event.positions?.length ?? 0})`, `Кілки розміщено: ${event.owner} (${event.positions?.length ?? 0})`);
    case "stakeTriggered":
      return text(language, `Stake triggered: ${event.unitId}`, `Кілок спрацював: ${event.unitId}`);
    case "intimidateTriggered":
      return text(language, `Intimidate: ${event.defenderId} vs ${event.attackerId}`, `Залякування: ${event.defenderId} проти ${event.attackerId}`);
    case "intimidateResolved":
      return text(language, `Intimidate push: ${event.attackerId}`, `Відштовхування залякуванням: ${event.attackerId}`);
    case "forestActivated":
      return text(language, `Forest activated: ${event.vladId}`, `Ліс активовано: ${event.vladId}`);
    case "aoeResolved":
      return text(
        language,
        `Area attack resolved: ${event.sourceUnitId} (${event.affectedUnitIds?.length ?? 0} targets)`,
        `Атаку області завершено: ${event.sourceUnitId} (${event.affectedUnitIds?.length ?? 0} цілей)`,
      );
    case "moveOptionsGenerated":
      return text(language, `Move options: ${event.unitId}`, `Варіанти переміщення: ${event.unitId}`);
    case "moveBlocked":
      return text(language, `Move blocked: ${event.unitId}`, `Переміщення заблоковано: ${event.unitId}`);
    case "battleStarted":
      return text(language, `Battle started: ${event.startingPlayer}`, `Бій почався: ${event.startingPlayer}`);
    case "arenaChosen":
      return text(
        language,
        `Arena chosen: ${getArenaLabel(event.arenaId, t)}`,
        `Обрано арену: ${getArenaLabel(event.arenaId, t)}`,
      );
    case "gameEnded":
      return text(language, `Game ended: ${event.winner}`, `Гру завершено. Переможець: ${event.winner}`);
    default:
      return t("log.unknownEvent");
  }
}
