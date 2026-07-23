import type { Coord, PapyrusLineAxis, PlayerView } from "rules";
import { type ActionPreviewMode } from "../../store";
import {
  ASGORE_ID,
  FEMTO_ID,
  GUTS_ID,
  KALADIN_ID,
  UNDYNE_ID,
} from "../../rulesHints";

const DORA_DIRS: Coord[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
  { col: 1, row: 1 },
  { col: 1, row: -1 },
  { col: -1, row: 1 },
  { col: -1, row: -1 },
];

export function getUnitAt(view: PlayerView, col: number, row: number) {
  return getUnitsAt(view, col, row)[0];
}

export function getUnitsAt(view: PlayerView, col: number, row: number) {
  return Object.values(view.units).filter(
    (u) => u.position && u.position.col === col && u.position.row === row
  );
}

/**
 * Resolves only projected, authoritative unit targets at a cell. Callers pass
 * target ids from the player view, so private occupants can neither block the
 * result nor be inferred through this helper.
 */
export function getSelectableAttackTargetsAtCell(
  view: PlayerView,
  col: number,
  row: number,
  legalTargetIds: readonly string[],
) {
  const legalIds = new Set(legalTargetIds);
  return getUnitsAt(view, col, row).filter((unit) => legalIds.has(unit.id));
}

export function getDoraTargetCenters(view: PlayerView, casterId: string): Coord[] {
  const caster = view.units[casterId];
  if (!caster?.position) return [];
  const size = view.boardSize ?? 9;
  const origin = caster.position;
  const targets: Coord[] = [];

  for (const dir of DORA_DIRS) {
    let col = origin.col + dir.col;
    let row = origin.row + dir.row;
    while (col >= 0 && row >= 0 && col < size && row < size) {
      targets.push({ col, row });
      const units = getUnitsAt(view, col, row);
      if (units.some((unit) => unit.owner !== caster.owner)) {
        break;
      }
      col += dir.col;
      row += dir.row;
    }
  }

  return targets;
}

export function getArcherLikeTargetIds(view: PlayerView, casterId: string): string[] {
  const caster = view.units[casterId];
  if (!caster?.position) return [];
  const size = view.boardSize ?? 9;
  const origin = caster.position;
  const targets: string[] = [];
  const seen = new Set<string>();

  for (const dir of DORA_DIRS) {
    let col = origin.col + dir.col;
    let row = origin.row + dir.row;
    while (col >= 0 && row >= 0 && col < size && row < size) {
      const enemies = getUnitsAt(view, col, row).filter(
        (unit) => unit.owner !== caster.owner,
      );
      if (enemies.length > 0) {
        for (const enemy of enemies) {
          if (!seen.has(enemy.id)) {
            seen.add(enemy.id);
            targets.push(enemy.id);
          }
        }
        break;
      }
      col += dir.col;
      row += dir.row;
    }
  }

  return targets;
}

export function coordKey(coord: Coord) {
  return `${coord.col},${coord.row}`;
}

const COLS = "abcdefghi";

function coordFromNotationSafe(value: string): Coord | null {
  if (value.length !== 2) return null;
  const colChar = value[0]?.toLowerCase() ?? "";
  const rowChar = value[1] ?? "";
  const col = COLS.indexOf(colChar);
  const row = Number.parseInt(rowChar, 10);
  if (col < 0 || Number.isNaN(row)) return null;
  return { col, row };
}

function normalizeCoordInput(value: unknown): Coord | null {
  if (value && typeof value === "object") {
    const colRaw = (value as { col?: unknown }).col;
    const rowRaw = (value as { row?: unknown }).row;
    const col =
      typeof colRaw === "number"
        ? colRaw
        : typeof colRaw === "string"
        ? Number(colRaw)
        : NaN;
    const row =
      typeof rowRaw === "number"
        ? rowRaw
        : typeof rowRaw === "string"
        ? Number(rowRaw)
        : NaN;
    if (Number.isFinite(col) && Number.isFinite(row)) {
      return { col, row };
    }
  }
  if (typeof value === "string") {
    return coordFromNotationSafe(value);
  }
  return null;
}

export function normalizeCoordList(value: unknown): Coord[] {
  if (!Array.isArray(value)) return [];
  const coords: Coord[] = [];
  for (const item of value) {
    const parsed = normalizeCoordInput(item);
    if (parsed) coords.push(parsed);
  }
  return coords;
}

export function linePath(start: Coord, end: Coord): Coord[] | null {
  const dx = end.col - start.col;
  const dy = end.row - start.row;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (dx === 0 && dy === 0) {
    return [{ col: start.col, row: start.row }];
  }
  if (!(dx === 0 || dy === 0 || absDx === absDy)) {
    return null;
  }
  const steps = Math.max(absDx, absDy);
  const stepCol = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepRow = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  const path: Coord[] = [];
  for (let i = 0; i <= steps; i += 1) {
    path.push({
      col: start.col + stepCol * i,
      row: start.row + stepRow * i,
    });
  }
  return path;
}

export function getOrthogonalLineCells(
  size: number,
  origin: Coord,
  target: Coord
): Coord[] {
  const cells: Coord[] = [];
  if (origin.row === target.row) {
    for (let col = 0; col < size; col += 1) {
      if (col === origin.col) continue;
      cells.push({ col, row: origin.row });
    }
    return cells;
  }
  if (origin.col === target.col) {
    for (let row = 0; row < size; row += 1) {
      if (row === origin.row) continue;
      cells.push({ col: origin.col, row });
    }
  }
  return cells;
}

export function getPapyrusLineCells(
  size: number,
  axis: PapyrusLineAxis,
  anchor: Coord
): Coord[] {
  const cells: Coord[] = [];
  for (let col = 0; col < size; col += 1) {
    for (let row = 0; row < size; row += 1) {
      const matches =
        axis === "row"
          ? row === anchor.row
          : axis === "col"
          ? col === anchor.col
          : axis === "diagMain"
          ? col - row === anchor.col - anchor.row
          : col + row === anchor.col + anchor.row;
      if (matches) {
        cells.push({ col, row });
      }
    }
  }
  return cells;
}

export function getAttackRangeCells(view: PlayerView, unitId: string): Coord[] {
  const unit = view.units[unitId];
  if (!unit?.position) return [];
  const size = view.boardSize ?? 9;
  const origin = unit.position;
  const isKaladin = unit.heroId === KALADIN_ID;
  const effectiveClass =
    unit.heroId === FEMTO_ID ||
    unit.heroId === UNDYNE_ID ||
    unit.heroId === ASGORE_ID ||
    (unit.heroId === GUTS_ID && unit.gutsBerserkModeActive)
      ? "spearman"
      : unit.class;
  const cells: Coord[] = [];

  const addCell = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= size || row >= size) return;
    if (col === origin.col && row === origin.row) return;
    cells.push({ col, row });
  };

  if (isKaladin) {
    for (let dc = -1; dc <= 1; dc += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        if (dc === 0 && dr === 0) continue;
        addCell(origin.col + dc, origin.row + dr);
      }
    }
    const reach2 = [
      { col: 2, row: 0 },
      { col: -2, row: 0 },
      { col: 0, row: 2 },
      { col: 0, row: -2 },
      { col: 2, row: 2 },
      { col: 2, row: -2 },
      { col: -2, row: 2 },
      { col: -2, row: -2 },
    ];
    for (const offset of reach2) {
      addCell(origin.col + offset.col, origin.row + offset.row);
    }
    for (let dc = -2; dc <= 2; dc += 1) {
      for (let dr = -2; dr <= 2; dr += 1) {
        if (dc === 0 && dr === 0) continue;
        if (Math.max(Math.abs(dc), Math.abs(dr)) <= 2) {
          addCell(origin.col + dc, origin.row + dr);
        }
      }
    }
    return cells;
  }

  switch (effectiveClass) {
    case "archer": {
      for (const dir of DORA_DIRS) {
        let col = origin.col + dir.col;
        let row = origin.row + dir.row;
        while (col >= 0 && row >= 0 && col < size && row < size) {
          cells.push({ col, row });
          const occupants = getUnitsAt(view, col, row);
          if (occupants.some((occupant) => occupant.owner !== unit.owner)) {
            break;
          }
          col += dir.col;
          row += dir.row;
        }
      }
      break;
    }

    case "spearman": {
      for (let dc = -1; dc <= 1; dc += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          if (dc === 0 && dr === 0) continue;
          addCell(origin.col + dc, origin.row + dr);
        }
      }
      const reach2 = [
        { col: 2, row: 0 },
        { col: -2, row: 0 },
        { col: 0, row: 2 },
        { col: 0, row: -2 },
        { col: 2, row: 2 },
        { col: 2, row: -2 },
        { col: -2, row: 2 },
        { col: -2, row: -2 },
      ];
      for (const offset of reach2) {
        addCell(origin.col + offset.col, origin.row + offset.row);
      }
      break;
    }

    case "trickster": {
      for (let dc = -2; dc <= 2; dc += 1) {
        for (let dr = -2; dr <= 2; dr += 1) {
          if (dc === 0 && dr === 0) continue;
          if (Math.max(Math.abs(dc), Math.abs(dr)) <= 2) {
            addCell(origin.col + dc, origin.row + dr);
          }
        }
      }
      break;
    }

    case "rider":
    case "knight":
    case "assassin":
    case "berserker": {
      for (let dc = -1; dc <= 1; dc += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          if (dc === 0 && dr === 0) continue;
          addCell(origin.col + dc, origin.row + dr);
        }
      }
      break;
    }

    default:
      break;
  }

  return cells;
}

const PENDING_ROLL_LABELS_UK: Record<string, string> = {
  attack_attackerRoll: "Кидок атаки",
  attack_defenderRoll: "Кидок захисту",
  riderPathAttack_attackerRoll: "Кидок атаки вершника на шляху",
  riderPathAttack_defenderRoll: "Захист від атаки вершника на шляху",
  tricksterAoE_attackerRoll: "Кидок атаки області трикстера",
  tricksterAoE_defenderRoll: "Захист від області трикстера",
  tricksterAoE_berserkerDefenseChoice: "Захист берсерка від атаки області",
  elCidTisona_attackerRoll: "Кидок атаки Тісони",
  elCidTisona_defenderRoll: "Захист від Тісони",
  elCidKolada_attackerRoll: "Кидок атаки Колади",
  elCidKolada_defenderRoll: "Захист від Колади",
  elCidDuelistChoice: "Вибір Демона-дуелянта",
  dora_attackerRoll: "Кидок атаки Дори",
  dora_defenderRoll: "Захист від Дори",
  dora_berserkerDefenseChoice: "Захист берсерка від Дори",
  jebeHailOfArrows_attackerRoll: "Кидок Граду стріл",
  jebeHailOfArrows_defenderRoll: "Захист від Граду стріл",
  jebeHailOfArrows_berserkerDefenseChoice: "Захист берсерка від Граду стріл",
  jebeKhansShooterRicochetRoll: "Кидок рикошетів Стрільця хана",
  jebeKhansShooterTargetChoice: "Вибір цілі Стрільця хана",
  hassanTrueEnemyTargetChoice: "Вибір цілі Справжнього ворога",
  mongolChargeAllyAttackTarget: "Монгольський ривок: оберіть ціль для атаки союзника",
  hassanAssassinOrderSelection: "Вибір Ордену убивць",
  asgoreSoulParadeRoll: "Кидок Параду душ",
  asgoreSoulParadePatienceTargetChoice: "Ціль Терпіння",
  asgoreSoulParadePerseveranceTargetChoice: "Ціль Наполегливості",
  asgoreSoulParadeJusticeTargetChoice: "Ціль Справедливості",
  asgoreSoulParadeIntegrityDestination: "Призначення Цілісності",
  asgoreBraveryDefenseChoice: "Вибір захисту Хоробрістю",
  lokiLaughtChoice: "Вибір Сміху Локі",
  lokiChickenTargetChoice: "Ціль Курки",
  lokiMindControlEnemyChoice: "Вибір ворога для Контролю розуму",
  lokiMindControlTargetChoice: "Ціль Контролю розуму",
  lokiSpinAbilityChoice: "Запасна здібність Крутите барабан",
  gutsBerserkAttackChoice: "Вибір атаки Берсерка",
  friskPacifismChoice: "Вибір Пацифізму",
  friskPacifismHugsTargetChoice: "Ціль Обіймів",
  friskWarmWordsTargetChoice: "Ціль Теплих слів",
  friskWarmWordsHealRoll: "Кидок лікування Теплими словами",
  friskGenocideChoice: "Вибір Геноциду",
  friskKeenEyeChoice: "Вибір Пильного ока",
  friskPrecisionStrikeTargetChoice: "Ціль Точного удару",
  friskSubstitutionChoice: "Вибір захисту Підміною",
  friskChildsCryChoice: "Вибір захисту Дитячим плачем",
  femtoDivineMoveRoll: "Кидок Божественного переміщення",
  femtoDivineMoveDestination: "Призначення Божественного переміщення",
  odinSleipnirDestination: "Вибір клітинки Слейпніра",
  chargedImpulseTargetChoice: "Вибір цілі імпульсу",
  kaiserCarpetStrikeCenter: "Кидок центру Килимового удару",
  kaiserCarpetStrikeAttack: "Кидок атаки Килимового удару",
  carpetStrike_defenderRoll: "Захист від Килимового удару",
  carpetStrike_berserkerDefenseChoice: "Захист берсерка від Килимового удару",
  vladPlaceStakes: "Розміщення кілків",
  vladIntimidateChoice: "Вибір Залякування",
  vladForestChoice: "Вибір Лісу мертвих",
  vladForestTarget: "Вибір цілі Лісу",
  vladForest_attackerRoll: "Кидок атаки Лісу",
  vladForest_defenderRoll: "Захист від Лісу",
  vladForest_berserkerDefenseChoice: "Захист берсерка від Лісу",
  chikatiloFalseTrailPlacement: "Розміщення Хибного сліду",
  groznyTyrantOptionChoice: "Вибір Тирана",
  groznyTyrantAllyChoice: "Ціль Тирана",
  groznyTyrantAttackCellChoice: "Клітинка атаки Тирана",
  lechyGuideTravelerPlacement: "Розміщення Провідника",
  lechyStormStartTurnRoll: "Кидок Бурі на початку ходу",
  chikatiloDecoyChoice: "Вибір Приманки",
  chikatiloFalseTrailRevealChoice: "Вибір Хибного сліду",
  falseTrailExplosion_attackerRoll: "Кидок вибуху Хибного сліду",
  falseTrailExplosion_defenderRoll: "Захист від вибуху Хибного сліду",
  berserkerDefenseChoice: "Вибір захисту берсерка",
  odinMuninnDefenseChoice: "Вибір захисту Мунінном",
  enterStealth: "Кидок скритності",
  searchStealth: "Кидок пошуку",
  moveTrickster: "Кидок руху трикстера",
  moveBerserker: "Кидок руху берсерка",
  forestMoveCheck: "Перевірка лісу",
  forestMoveDestination: "Призначення після невдалої перевірки лісу",
  riverBoatCarryChoice: "Вибір пасажира човна",
  riverBoatDestinationChoice: "Призначення човна",
  riverBoatDropDestination: "Місце висадки з човна",
  riverTraLaLaTargetChoice: "Ціль Тра-ля-ля",
  riverTraLaLaDestinationChoice: "Призначення Тра-ля-ля",
  riverTraLaLaDropDestinationChoice: "Висадка Тра-ля-ля",
  initiativeRoll: "Кидок ініціативи",
};

Object.assign(PENDING_ROLL_LABELS_UK, {
  donSorrowfulMoveChoice: "Рух Лицаря Сумного Образу",
  donMadDelusionDirection: "Безумство лицаря",
  ruleDeclarationChoice: "Оголошення правила",
  ruleDeclarationChessKingChoice: "Вибір Короля",
  ruleDeclarationAdvantageThreshold: "Поріг переваги",
  courtAttackerRoll: "Кидок атакуючого Суду",
  courtDefenderRoll: "Кидок захисного Суду",
  courtEffectUnitChoice: "Вибір фігури Суду",
  courtEffectChargeChoice: "Вибір заряду Суду",
  courtForcedAppearanceDestination: "Клітинка Суду",
  moonRoundRoll: "Кидок Місяця",
  moonCoordinateRoll: "Координати Місяця",
  moonCheeseHolesChoice: "Таємний вибір фігури",
  pureBloodRedirectChoice: "Чиста кров",
  papyrusBoneChoice: "Вибір кістки Папіруса",
});

export function getPendingRollLabel(kind?: string | null, language: "en" | "uk" = "en") {
  if (language === "uk") {
    return (kind && PENDING_ROLL_LABELS_UK[kind]) ?? "Кидок";
  }
  switch (kind) {
    case "attack_attackerRoll":
      return "Attack roll (attacker)";
    case "attack_defenderRoll":
      return "Defense roll";
    case "riderPathAttack_attackerRoll":
      return "Rider path attack roll";
    case "riderPathAttack_defenderRoll":
      return "Rider path defense roll";
    case "tricksterAoE_attackerRoll":
      return "Trickster AoE attack roll";
    case "tricksterAoE_defenderRoll":
      return "Trickster AoE defense roll";
    case "tricksterAoE_berserkerDefenseChoice":
      return "AoE berserker defense choice";
    case "elCidTisona_attackerRoll":
      return "Tisona attack roll";
    case "elCidTisona_defenderRoll":
      return "Tisona defense roll";
    case "elCidKolada_attackerRoll":
      return "Kolada attack roll";
    case "elCidKolada_defenderRoll":
      return "Kolada defense roll";
    case "elCidDuelistChoice":
      return "Demon Duelist choice";
    case "dora_attackerRoll":
      return "Dora attack roll";
    case "dora_defenderRoll":
      return "Dora defense roll";
    case "dora_berserkerDefenseChoice":
      return "Dora berserker defense choice";
    case "jebeHailOfArrows_attackerRoll":
      return "Hail of Arrows attack roll";
    case "jebeHailOfArrows_defenderRoll":
      return "Hail of Arrows defense roll";
    case "jebeHailOfArrows_berserkerDefenseChoice":
      return "Hail of Arrows berserker defense choice";
    case "jebeKhansShooterRicochetRoll":
      return "Khan's Shooter ricochet roll";
    case "jebeKhansShooterTargetChoice":
      return "Khan's Shooter target choice";
    case "hassanTrueEnemyTargetChoice":
      return "True Enemy forced target choice";
    case "mongolChargeAllyAttackTarget":
      return "Mongol Charge: choose ally attack target";
    case "hassanAssassinOrderSelection":
      return "Assassin Order selection";
    case "asgoreSoulParadeRoll":
      return "Soul Parade roll";
    case "asgoreSoulParadePatienceTargetChoice":
      return "Soul Parade (Patience) target";
    case "asgoreSoulParadePerseveranceTargetChoice":
      return "Soul Parade (Perseverance) target";
    case "asgoreSoulParadeJusticeTargetChoice":
      return "Soul Parade (Justice) target";
    case "asgoreSoulParadeIntegrityDestination":
      return "Soul Parade (Integrity) destination";
    case "asgoreBraveryDefenseChoice":
      return "Bravery defense choice";
    case "lokiLaughtChoice":
      return "Loki's Laughter choice";
    case "lokiChickenTargetChoice":
      return "Chicken target choice";
    case "lokiMindControlEnemyChoice":
      return "Mind Control enemy choice";
    case "lokiMindControlTargetChoice":
      return "Mind Control target choice";
    case "lokiSpinAbilityChoice":
      return "Spin the Wheel fallback ability";
    case "gutsBerserkAttackChoice":
      return "Berserk attack choice";
    case "friskPacifismChoice":
      return "Pacifism choice";
    case "friskPacifismHugsTargetChoice":
      return "Hugs target choice";
    case "friskWarmWordsTargetChoice":
      return "Warm Words target choice";
    case "friskWarmWordsHealRoll":
      return "Warm Words heal roll";
    case "friskGenocideChoice":
      return "Genocide choice";
    case "friskKeenEyeChoice":
      return "Keen Eye choice";
    case "friskPrecisionStrikeTargetChoice":
      return "Precision Strike target choice";
    case "friskSubstitutionChoice":
      return "Substitution defense choice";
    case "friskChildsCryChoice":
      return "Child's Cry defense choice";
    case "femtoDivineMoveRoll":
      return "Divine Movement roll";
    case "femtoDivineMoveDestination":
      return "Divine Movement destination";
    case "odinSleipnirDestination":
      return "Sleipnir destination";
    case "chargedImpulseTargetChoice":
      return "Impulse target choice";
    case "donSorrowfulMoveChoice":
      return "Knight of the Sorrowful Image reaction";
    case "donMadDelusionDirection":
      return "Madness of the Knight";
    case "kaiserCarpetStrikeCenter":
      return "Carpet Strike center roll";
    case "kaiserCarpetStrikeAttack":
      return "Carpet Strike attack roll";
    case "carpetStrike_defenderRoll":
      return "Carpet Strike defense roll";
    case "carpetStrike_berserkerDefenseChoice":
      return "Carpet Strike berserker defense choice";
    case "vladPlaceStakes":
      return "Place stakes";
    case "vladIntimidateChoice":
      return "Intimidate choice";
    case "donWindmillsRepositionChoice":
      return "Attack on Windmills reposition";
    case "vladForestChoice":
      return "Forest choice";
    case "vladForestTarget":
      return "Forest target selection";
    case "vladForest_attackerRoll":
      return "Forest attack roll";
    case "vladForest_defenderRoll":
      return "Forest defense roll";
    case "vladForest_berserkerDefenseChoice":
      return "Forest berserker defense choice";
    case "chikatiloFalseTrailPlacement":
      return "False Trail placement";
    case "groznyTyrantOptionChoice":
      return "Tyrant option";
    case "groznyTyrantAllyChoice":
      return "Tyrant ally target";
    case "groznyTyrantAttackCellChoice":
      return "Tyrant attack cell";
    case "lechyGuideTravelerPlacement":
      return "Guide Traveler placement";
    case "lechyStormStartTurnRoll":
      return "Storm start-turn roll";
    case "chikatiloDecoyChoice":
      return "Decoy choice";
    case "chikatiloFalseTrailRevealChoice":
      return "False Trail choice";
    case "falseTrailExplosion_attackerRoll":
      return "False Trail explosion attack roll";
    case "falseTrailExplosion_defenderRoll":
      return "False Trail explosion defense roll";
    case "berserkerDefenseChoice":
      return "Berserker defense choice";
    case "odinMuninnDefenseChoice":
      return "Muninn defense choice";
    case "enterStealth":
      return "Stealth roll";
    case "searchStealth":
      return "Search roll";
    case "moveTrickster":
      return "Trickster move roll";
    case "moveBerserker":
      return "Berserker move roll";
    case "forestMoveCheck":
      return "Forest check";
    case "forestMoveDestination":
      return "Forest fallback destination";
    case "riverBoatCarryChoice":
      return "Boat carry choice";
    case "riverBoatDestinationChoice":
      return "Boat destination";
    case "riverBoatDropDestination":
      return "Boat drop destination";
    case "riverTraLaLaTargetChoice":
      return "Tra-la-la target";
    case "riverTraLaLaDestinationChoice":
      return "Tra-la-la destination";
    case "riverTraLaLaDropDestinationChoice":
      return "Tra-la-la drop";
    case "ruleDeclarationChoice":
      return "Rule Declaration";
    case "ruleDeclarationChessKingChoice":
      return "King selection";
    case "ruleDeclarationAdvantageThreshold":
      return "Advantage threshold";
    case "courtAttackerRoll":
      return "Court attacker roll";
    case "courtDefenderRoll":
      return "Court defender roll";
    case "courtEffectUnitChoice":
      return "Court figure choice";
    case "courtEffectChargeChoice":
      return "Court charge choice";
    case "courtForcedAppearanceDestination":
      return "Court destination";
    case "moonRoundRoll":
      return "Moon roll";
    case "moonCoordinateRoll":
      return "Moon coordinate roll";
    case "moonCheeseHolesChoice":
      return "Secret figure choice";
    case "pureBloodRedirectChoice":
      return "Pure Blood redirect";
    case "papyrusBoneChoice":
      return "Papyrus bone choice";
    case "initiativeRoll":
      return "Initiative roll";
    default:
      return kind ?? "Roll";
  }
}

export function isCoordInList(coords: Coord[], col: number, row: number): boolean {
  return coords.some((c) => c.col === col && c.row === row);
}

export type CellHighlightKind =
  | "place"
  | "move"
  | "attack"
  | "dora"
  | "attackRange"
  | "previewMove"
  | "previewAttack"
  | "previewAbility";

export function previewKindForActionMode(
  mode: ActionPreviewMode | null
): "previewMove" | "previewAttack" | "previewAbility" | null {
  if (!mode) return null;
  if (mode === "move") return "previewMove";
  if (mode === "attack") return "previewAttack";
  return "previewAbility";
}
