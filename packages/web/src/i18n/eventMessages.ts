import type { DiceRoll, GameEvent } from "rules";
import type { Language, Translate } from ".";
import { getAbilityDisplay, getArenaLabel, getHeroDisplayName } from "./displayMetadata";
import {
  GRIFFITH_FEMTO_REBIRTH_ID,
  GUTS_BERSERK_MODE_ID,
  GUTS_EXIT_BERSERK_ID,
  METTATON_EX_ID,
  METTATON_NEO_ID,
} from "../rulesHints";

function text(language: Language, en: string, uk: string) {
  return language === "uk" ? uk : en;
}

function value(input: unknown) {
  return input === null || input === undefined || input === "" ? "-" : String(input);
}

function diceList(input: unknown) {
  return Array.isArray(input) && input.length > 0 ? `[${input.join(", ")}]` : "[-]";
}

function unitList(ids: string[], language: Language) {
  if (ids.length === 0) return "-";
  if (ids.length === 1) return ids[0]!;
  if (ids.length === 2) {
    return `${ids[0]} ${text(language, "and", "і")} ${ids[1]}`;
  }
  const head = ids.slice(0, -1).join(", ");
  return `${head}, ${text(language, "and", "і")} ${ids[ids.length - 1]}`;
}

function coordText(coord: { col?: unknown; row?: unknown } | undefined) {
  return typeof coord?.col === "number" && typeof coord?.row === "number"
    ? `${coord.col}:${coord.row}`
    : "-";
}

function transformationForm(
  event: Extract<GameEvent, { type: "unitTransformed" }>,
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

export function formatDice(roll?: DiceRoll | null) {
  if (!roll || !Array.isArray(roll.dice)) return "(-) = -";
  return `(${roll.dice.length ? roll.dice.join(", ") : "-"}) = ${roll.sum ?? "-"}`;
}

export function formatEventMessage(event: GameEvent, language: Language, t: Translate): string {
  switch (event.type) {
    case "turnStarted":
      return text(
        language,
        `Turn started: ${event.player} (turn ${event.turnNumber})`,
        `Почався хід ${event.player} (хід ${event.turnNumber})`,
      );
    case "roundStarted":
      return text(
        language,
        `Round ${event.roundNumber} started`,
        `Почався раунд ${event.roundNumber}`,
      );
    case "unitPlaced":
      return text(language, `Unit placed: ${event.unitId}`, `Розміщено фігуру: ${event.unitId}`);
    case "unitMoved":
      return event.unitId
        ? text(language, `Unit moved: ${event.unitId}`, `Фігуру переміщено: ${event.unitId}`)
        : text(
            language,
            "A hidden movement was resolved.",
            "Приховане переміщення завершено.",
          );
    case "hiddenCollisionResolved":
      if (!event.displacedUnitId) {
        return text(
          language,
          "A hidden collision was resolved.",
          "Приховане зіткнення завершено.",
        );
      }
      return event.damage === 1
        ? text(
            language,
            `${event.displacedUnitId} had no free adjacent cell and took 1 damage.`,
            `${event.displacedUnitId} не мав вільної сусідньої клітинки та отримав 1 шкоди.`,
          )
        : text(
            language,
            `Hidden collision: ${event.displacedUnitId} rolled ${event.roll} on 1d${event.dieSides}.`,
            `Приховане зіткнення: ${event.displacedUnitId} викинув ${event.roll} на 1d${event.dieSides}.`,
          );
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
      const roll =
        typeof event.roll === "number" ? ` ${text(language, "rolled", "кидок")} ${event.roll}` : "";
      return text(
        language,
        `Stealth attempt: ${event.unitId}${roll} (${result})`,
        `Спроба скритності: ${event.unitId}${roll} (${result})`,
      );
    }
    case "stealthRevealed":
      if (event.reason === "timerExpired") {
        return text(
          language,
          `${event.unitId} reveals because stealth duration expired.`,
          `${event.unitId} розкривається, бо сплинула тривалість скритності.`,
        );
      }
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
      const target =
        event.unitId ??
        event.targetId ??
        (event.position ? `${event.position.col},${event.position.row}` : "-");
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
      return text(language, `Moon effect: ${event.effectId}`, `Ефект Місяця: ${event.effectId}`);
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
      return text(
        language,
        `Bunker entered: ${event.unitId} (roll ${value(event.roll)})`,
        `Вхід у бункер: ${event.unitId} (кидок ${value(event.roll)})`,
      );
    case "bunkerEnterFailed":
      return text(
        language,
        `Bunker failed: ${event.unitId} (roll ${value(event.roll)})`,
        `Не вдалося увійти в бункер: ${event.unitId} (кидок ${value(event.roll)})`,
      );
    case "bunkerExited":
      return text(language, `Bunker exited: ${event.unitId}`, `Вихід із бункера: ${event.unitId}`);
    case "carpetStrikeTriggered":
      return text(
        language,
        `Carpet Strike triggered: ${event.unitId}`,
        `Килимовий удар активовано: ${event.unitId}`,
      );
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
    case "searchStealth": {
      const actor = value(event.unitId);
      const modeLabel =
        event.mode === "move"
          ? text(language, "used Movement to Search", "використав Рух для Пошуку")
          : text(language, "used Search", "використав Пошук");
      const rolls = Array.isArray(event.rolls) ? event.rolls : null;
      const revealed =
        rolls
          ?.filter((roll) => roll.success === true && typeof roll.targetId === "string")
          .map((roll) => roll.targetId) ?? [];
      if (!rolls) {
        return text(language, `${actor} ${modeLabel}.`, `${actor} ${modeLabel}.`);
      }
      if (revealed.length > 0) {
        return text(
          language,
          `${actor} ${modeLabel} and revealed ${unitList(revealed, language)}.`,
          `${actor} ${modeLabel} і розкрив ${unitList(revealed, language)}.`,
        );
      }
      return text(
        language,
        `${actor} ${modeLabel}. No hidden unit was revealed.`,
        `${actor} ${modeLabel}. Прихованих фігур не розкрито.`,
      );
    }
    case "abilityUsed": {
      if (typeof event.abilityId !== "string" || typeof event.unitId !== "string") {
        return text(language, "Hidden ability used.", "Використано приховану здібність.");
      }
      if (event.abilityId === GRIFFITH_FEMTO_REBIRTH_ID) {
        return text(language, "Griffith was reborn as Femto.", "Гріффіт переродився у Фемто.");
      }
      if (event.abilityId === GUTS_BERSERK_MODE_ID) {
        return text(
          language,
          `${event.unitId} entered Berserk Mode.`,
          `${event.unitId} увійшов у Режим берсерка.`,
        );
      }
      if (event.abilityId === GUTS_EXIT_BERSERK_ID) {
        return text(
          language,
          `${event.unitId} exited Berserk Mode.`,
          `${event.unitId} вийшов із Режиму берсерка.`,
        );
      }
      if (event.abilityId === METTATON_EX_ID) {
        return text(
          language,
          `${event.unitId} transformed into Mettaton EX.`,
          `${event.unitId} трансформувався у Меттатона EX.`,
        );
      }
      if (event.abilityId === METTATON_NEO_ID) {
        return text(
          language,
          `${event.unitId} transformed into Mettaton NEO.`,
          `${event.unitId} трансформувався у Меттатона NEO.`,
        );
      }
      const ability = getAbilityDisplay(event.abilityId, event.abilityId, "", language).name;
      return text(
        language,
        `Ability used: ${event.unitId} (${ability})`,
        `Використано здібність: ${event.unitId} (${ability})`,
      );
    }
    case "chikatiloMarkApplied": {
      if (typeof event.targetId !== "string") {
        return text(language, "Killer's Mark was applied.", "Мітку вбивці накладено.");
      }
      return text(
        language,
        `Chikatilo applied Killer's Mark to ${event.targetId}. Exact location will be tracked from Chikatilo's turn start until the marked target finishes a turn.`,
        `Чикатило наклав Мітку вбивці на ${event.targetId}. Точне місце буде відстежуватися від початку ходу Чикатила до завершення ходу поміченої цілі.`,
      );
    }
    case "papyrusUnbelieverActivated":
    case "sansUnbelieverActivated":
      return text(language, "Unbeliever awakened", "Невіруючий пробудився");
    case "papyrusBoneApplied":
      return text(
        language,
        `${event.papyrusId} applied ${event.boneType === "blue" ? "Blue Bone" : "Orange Bone"} to ${event.targetId}.`,
        `${event.papyrusId} наклав ${event.boneType === "blue" ? "Синю кістку" : "Помаранчеву кістку"} на ${event.targetId}.`,
      );
    case "papyrusBonePunished":
    case "sansBoneFieldPunished":
      return text(
        language,
        `Bone punishment: ${event.targetId} took ${event.damage}`,
        `Покарання кісткою: ${event.targetId} отримує ${event.damage} шкоди`,
      );
    case "sansBadassJokeApplied":
      return text(
        language,
        `Movement locked: ${event.targetId}`,
        `Переміщення заблоковано: ${event.targetId}`,
      );
    case "sansMoveDenied":
      return text(
        language,
        `Movement denied: ${event.unitId}`,
        `Переміщення заборонено: ${event.unitId}`,
      );
    case "sansBoneFieldActivated":
      return text(
        language,
        `Bone Field activated: ${event.sansId} (${event.duration} turns)`,
        `Поле кісток активовано: ${event.sansId} (${event.duration} ходів)`,
      );
    case "sansBoneFieldApplied":
      return text(
        language,
        `Bone Field applied to ${event.unitId}`,
        `Поле кісток діє на ${event.unitId}`,
      );
    case "sansLastAttackApplied":
      return text(
        language,
        `Curse applied: ${event.targetId}`,
        `Прокляття накладено: ${event.targetId}`,
      );
    case "sansLastAttackTick":
      return text(
        language,
        `Curse: ${event.targetId} took ${event.damage}`,
        `Прокляття: ${event.targetId} отримує ${event.damage} шкоди`,
      );
    case "sansLastAttackRemoved":
      return text(
        language,
        `Curse removed: ${event.targetId}`,
        `Прокляття знято: ${event.targetId}`,
      );
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
    case "lokiChickenGroupApplied": {
      const targets = Array.isArray(event.targetIds) ? event.targetIds : [];
      const targetText = unitList(targets, language);
      if (targets.length === 0) {
        return text(language, "Loki's Good Joke resolved.", "Жарт Локі завершено.");
      }
      if (targets.length === 1) {
        return text(
          language,
          `Loki's Good Joke turned ${targetText} into a chicken.`,
          `Жарт Локі перетворив ${targetText} на курку.`,
        );
      }
      if (targets.length > 3) {
        return text(
          language,
          `Loki's Good Joke turned ${targets.length} units into chickens: ${targetText}.`,
          `Жарт Локі перетворив ${targets.length} фігури на курей: ${targetText}.`,
        );
      }
      return text(
        language,
        `Loki's Good Joke turned ${targetText} into chickens.`,
        `Жарт Локі перетворив ${targetText} на курей.`,
      );
    }
    case "controlledAttackDeclared":
      return text(
        language,
        `Controlled attack: ${event.controllerUnitId} forced ${event.controlledUnitId} to attack ${event.targetId}`,
        `Controlled attack: ${event.controllerUnitId} forced ${event.controlledUnitId} to attack ${event.targetId}`,
      );
    case "unitTransformed": {
      if (typeof event.unitId !== "string") {
        return text(language, "A unit transformed.", "Фігура трансформувалася.");
      }
      const form = transformationForm(event, language);
      if (event.reason === "griffithFemtoRebirth") {
        const from = getHeroDisplayName("griffith", "Griffith", language);
        return text(language, `${from} was reborn as ${form}.`, `${from} переродився у ${form}.`);
      }
      if (event.reason === "mettatonThreshold") {
        return text(
          language,
          `Mettaton reached the Rating threshold and transformed into ${form}. Rating was not spent.`,
          `Меттатон досяг порогу Рейтингу і трансформувався у ${form}. Рейтинг не витрачено.`,
        );
      }
      return text(
        language,
        `${event.unitId} transformed into ${form}.`,
        `${event.unitId} трансформувався у ${form}.`,
      );
    }
    case "riverBoatmanGranted":
      return text(
        language,
        "River Person used Boatman and gained an extra Movement action.",
        "Лодочник використав Boatman і отримав додаткову дію переміщення.",
      );
    case "riverBoatResolved":
      return text(
        language,
        `River Person transported ${value(event.passengerId)} to ${coordText(event.dropDestination)}.`,
        `Річкова Людина перевезла ${value(event.passengerId)} до ${coordText(event.dropDestination)}.`,
      );
    case "riverTraLaLaResolved": {
      const attackers = Array.isArray(event.touchedAttackerIds) ? event.touchedAttackerIds : [];
      const attackText =
        attackers.length > 0
          ? ` During Tra-la-la, ${unitList(attackers, language)} attacked ${value(event.targetId)}.`
          : "";
      const attackTextUk =
        attackers.length > 0
          ? ` Під час Тра-ля-ля ${unitList(attackers, language)} атакували ${value(event.targetId)}.`
          : "";
      return text(
        language,
        `River Person used Tra-la-la and dragged ${value(event.targetId)} to ${coordText(event.dropDestination)}.${attackText}`,
        `Річкова Людина використала Тра-ля-ля і перетягнула ${value(event.targetId)} до ${coordText(event.dropDestination)}.${attackTextUk}`,
      );
    }
    case "asgoreSoulParadeResolved":
      return text(
        language,
        `${value(event.asgoreId ?? "Asgore")} rolled ${value(event.roll)} for Soul Parade: ${value(event.soulName)} - ${value(event.effectDescription)}`,
        `${value(event.asgoreId ?? "Асгор")} кинув ${value(event.roll)} для Параду душ: ${value(event.soulName)} - ${value(event.effectDescription)}`,
      );
    case "lechyStormStarted":
      return text(
        language,
        `${value(event.sourceUnitId ?? "Lechy")} started Storm. Duration roll: ${value(event.roll)}. Storm will remain active for ${value(event.duration)} turns.`,
        `${value(event.sourceUnitId ?? "Лісовик")} почав Бурю. Кидок тривалості: ${value(event.roll)}. Буря триватиме ${value(event.duration)} ходів.`,
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
      return text(
        language,
        `Healed: ${event.unitId} +${event.amount} (HP ${event.hpAfter})`,
        `Лікування: ${event.unitId} +${event.amount} (здоров’я ${event.hpAfter})`,
      );
    case "damageBonusApplied":
      return text(
        language,
        `Damage bonus: ${event.unitId} +${event.amount}`,
        `Бонус шкоди: ${event.unitId} +${event.amount}`,
      );
    case "stakesPlaced":
      return text(
        language,
        `Stakes placed: ${event.owner} (${event.positions?.length ?? 0})`,
        `Кілки розміщено: ${event.owner} (${event.positions?.length ?? 0})`,
      );
    case "stakeTriggered":
      return text(language, `Stake triggered: ${event.unitId}`, `Кілок спрацював: ${event.unitId}`);
    case "intimidateTriggered":
      return text(
        language,
        `Intimidate: ${event.defenderId} vs ${event.attackerId}`,
        `Залякування: ${event.defenderId} проти ${event.attackerId}`,
      );
    case "intimidateResolved":
      return text(
        language,
        `Intimidate push: ${event.attackerId}`,
        `Відштовхування залякуванням: ${event.attackerId}`,
      );
    case "forestActivated":
      return text(language, `Forest activated: ${event.vladId}`, `Ліс активовано: ${event.vladId}`);
    case "aoeResolved":
      return text(
        language,
        `Area attack resolved: ${event.sourceUnitId} (${event.affectedUnitIds?.length ?? 0} targets)`,
        `Атаку області завершено: ${event.sourceUnitId} (${event.affectedUnitIds?.length ?? 0} цілей)`,
      );
    case "moveOptionsGenerated":
      return text(
        language,
        `Move options: ${event.unitId}`,
        `Варіанти переміщення: ${event.unitId}`,
      );
    case "moveBlocked":
      return text(
        language,
        `Move blocked: ${event.unitId}`,
        `Переміщення заблоковано: ${event.unitId}`,
      );
    case "battleStarted":
      return text(
        language,
        `Battle started: ${event.startingPlayer}`,
        `Бій почався: ${event.startingPlayer}`,
      );
    case "arenaChosen":
      return text(
        language,
        `Arena chosen: ${getArenaLabel(event.arenaId, t)}`,
        `Обрано арену: ${getArenaLabel(event.arenaId, t)}`,
      );
    case "gameEnded":
      const winner = t(`roles.${event.winner}`);
      return text(language, `Battle ended. ${winner} wins.`, `Бій завершено. ${winner} переміг.`);
    default:
      return t("log.unknownEvent");
  }
}
