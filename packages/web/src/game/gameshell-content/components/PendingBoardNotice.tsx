import type { Coord, ResolveRollChoice } from "rules";
import { getPendingRollLabel } from "../helpers";
import { useI18n } from "../../../i18n";
import { getHeroDisplayName } from "../../../i18n/displayMetadata";

interface PendingBoardNoticeProps {
  pendingRollKind: string;
  pendingRollContext?: Record<string, unknown>;
  pendingQueueCount: number;
  stakeSelections: Coord[];
  stakeLimit: number;
  hassanAssassinOrderSelections: string[];
  isStakePlacement: boolean;
  isIntimidateChoice: boolean;
  isForestTarget: boolean;
  isForestMoveDestination: boolean;
  isForestChoice: boolean;
  isForestMoveCheck: boolean;
  isDuelistChoice: boolean;
  isChikatiloPlacement: boolean;
  isGroznyTyrantOptionChoice: boolean;
  isGroznyTyrantAllyChoice: boolean;
  isGroznyTyrantAttackCellChoice: boolean;
  groznyTyrantAllowSkip: boolean;
  isGuideTravelerPlacement: boolean;
  isRiverBoatCarryChoice: boolean;
  isRiverBoatDestinationChoice: boolean;
  isRiverBoatDropDestination: boolean;
  isRiverTraLaLaTargetChoice: boolean;
  isRiverTraLaLaDestinationChoice: boolean;
  isRiverTraLaLaDropDestinationChoice: boolean;
  isJebeKhansShooterTargetChoice: boolean;
  isLokiLaughtChoice: boolean;
  isLokiChickenTargetChoice: boolean;
  isLokiMindControlEnemyChoice: boolean;
  isLokiMindControlTargetChoice: boolean;
  isHassanTrueEnemyTargetChoice: boolean;
  isAsgoreSoulParadePatienceTargetChoice: boolean;
  isAsgoreSoulParadePerseveranceTargetChoice: boolean;
  isAsgoreSoulParadeJusticeTargetChoice: boolean;
  isAsgoreSoulParadeIntegrityDestination: boolean;
  isHassanAssassinOrderSelection: boolean;
  isChikatiloRevealChoice: boolean;
  isChikatiloDecoyChoice: boolean;
  isFriskPacifismHugsTargetChoice: boolean;
  isFriskWarmWordsTargetChoice: boolean;
  isFriskPrecisionStrikeTargetChoice: boolean;
  onResolveChoice: (choice: ResolveRollChoice) => void;
  onResolveSkip: () => void;
  onConfirmStakePlacement: () => void;
  onClearStakeSelections: () => void;
  onConfirmHassanAssassinOrder: () => void;
  onClearHassanAssassinOrder: () => void;
  className?: string;
}

type SoulId =
  | "patience"
  | "bravery"
  | "integrity"
  | "perseverance"
  | "kindness"
  | "justice";

const SOUL_IDS = new Set<SoulId>([
  "patience",
  "bravery",
  "integrity",
  "perseverance",
  "kindness",
  "justice",
]);

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

type GroznyTyrantMode = "normal" | "invadeTime";

function groznyModeList(value: unknown): GroznyTyrantMode[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is GroznyTyrantMode =>
      item === "normal" || item === "invadeTime"
  );
}

export function PendingBoardNotice({
  pendingRollKind,
  pendingRollContext = {},
  pendingQueueCount,
  stakeSelections,
  stakeLimit,
  hassanAssassinOrderSelections,
  isStakePlacement,
  isIntimidateChoice,
  isForestTarget,
  isForestMoveDestination,
  isForestChoice,
  isForestMoveCheck,
  isDuelistChoice,
  isChikatiloPlacement,
  isGroznyTyrantOptionChoice,
  isGroznyTyrantAllyChoice,
  isGroznyTyrantAttackCellChoice,
  groznyTyrantAllowSkip,
  isGuideTravelerPlacement,
  isRiverBoatCarryChoice,
  isRiverBoatDestinationChoice,
  isRiverBoatDropDestination,
  isRiverTraLaLaTargetChoice,
  isRiverTraLaLaDestinationChoice,
  isRiverTraLaLaDropDestinationChoice,
  isJebeKhansShooterTargetChoice,
  isLokiLaughtChoice,
  isLokiChickenTargetChoice,
  isLokiMindControlEnemyChoice,
  isLokiMindControlTargetChoice,
  isHassanTrueEnemyTargetChoice,
  isAsgoreSoulParadePatienceTargetChoice,
  isAsgoreSoulParadePerseveranceTargetChoice,
  isAsgoreSoulParadeJusticeTargetChoice,
  isAsgoreSoulParadeIntegrityDestination,
  isHassanAssassinOrderSelection,
  isChikatiloRevealChoice,
  isChikatiloDecoyChoice,
  isFriskPacifismHugsTargetChoice,
  isFriskWarmWordsTargetChoice,
  isFriskPrecisionStrikeTargetChoice,
  onResolveChoice,
  onResolveSkip,
  onConfirmStakePlacement,
  onClearStakeSelections,
  onConfirmHassanAssassinOrder,
  onClearHassanAssassinOrder,
  className = "mt-4",
}: PendingBoardNoticeProps) {
  const { language, t } = useI18n();
  const p = (en: string, uk: string) => (language === "uk" ? uk : en);
  const groznyModeOptions = groznyModeList(pendingRollContext.options);
  const groznyAllowSkip = pendingRollContext.allowSkip === true;
  const groznySelectedMode =
    pendingRollContext.mode === "invadeTime"
      ? p("Tyrant with Invade Time", "Тиран разом із Часом вторгнення")
      : pendingRollContext.mode === "normal"
      ? p("Tyrant normally", "Тиран звичайним способом")
      : null;
  const soulContext =
    pendingRollContext.soulResult &&
    typeof pendingRollContext.soulResult === "object"
      ? (pendingRollContext.soulResult as Record<string, unknown>)
      : null;
  const soulId = stringValue(soulContext?.soulId);
  const validSoulId = soulId && SOUL_IDS.has(soulId as SoulId) ? (soulId as SoulId) : null;
  const soulRoll = numberValue(soulContext?.roll);
  const soulName = validSoulId
    ? t(`abilityDetails.asgore.soulParade.outcomes.${validSoulId}.name`)
    : stringValue(soulContext?.soulName);
  const soulEffect = validSoulId
    ? t(`abilityDetails.asgore.soulParade.outcomes.${validSoulId}.description`)
    : stringValue(soulContext?.effectDescription);
  const showSoulSummary =
    !!soulContext &&
    (isAsgoreSoulParadePatienceTargetChoice ||
      isAsgoreSoulParadePerseveranceTargetChoice ||
      isAsgoreSoulParadeJusticeTargetChoice ||
      isAsgoreSoulParadeIntegrityDestination);
  const ricochetStepIndex = numberValue(pendingRollContext.stepIndex);
  const ricochetTotalSteps = numberValue(pendingRollContext.totalSteps);
  const ricochetPrompt =
    ricochetStepIndex && ricochetTotalSteps
      ? ricochetStepIndex >= ricochetTotalSteps
        ? t("pending.khansShooterFinalRicochet")
        : t("pending.khansShooterRicochetStep", {
            current: ricochetStepIndex,
            total: ricochetTotalSteps,
          })
      : t("pending.khansShooterNextRicochet");
  return (
    <div
      className={`panel-arcane rounded-2xl border border-violet-300/70 bg-violet-50/75 p-4 text-sm text-violet-950 shadow-lg shadow-violet-950/5 dark:border-violet-800/70 dark:bg-violet-950/30 dark:text-violet-100 ${className}`}
    >
      {showSoulSummary ? (
        <div className="mb-3 rounded-lg border border-violet-300/70 bg-white/70 p-3 text-xs text-violet-950 dark:border-violet-700/70 dark:bg-violet-950/40 dark:text-violet-100">
          <div className="font-semibold">{t("pending.soulParade")}</div>
          <div className="mt-1">{t("pending.soulParadeRolled", { roll: soulRoll ?? "-" })}</div>
          <div>{t("pending.soulParadeSoul", { soul: soulName ?? "-" })}</div>
          <div>{t("pending.soulParadeEffect", { effect: soulEffect ?? "-" })}</div>
        </div>
      ) : null}
      {isStakePlacement ? (
        <div>
          <div className="font-semibold">{t("pending.placeStakes")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("pending.selectedCount", { current: stakeSelections.length, total: stakeLimit })}
          </div>
          {stakeSelections.length > 0 && (
            <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
              {stakeSelections.map((pos) => `(${pos.col},${pos.row})`).join(", ")}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
              onClick={onConfirmStakePlacement}
              disabled={stakeSelections.length !== stakeLimit}
            >
              {t("pending.placeStakesButton")}
            </button>
            <button
              className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={onClearStakeSelections}
            >
              {t("common.clear")}
            </button>
          </div>
        </div>
      ) : isIntimidateChoice ? (
        <div>
          <div className="font-semibold">
            {p("Intimidate: choose a push cell", "Залякування: оберіть клітинку відштовхування")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p("Click a highlighted cell or skip.", "Оберіть підсвічену клітинку або пропустіть.")}
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            {t("common.skip")}
          </button>
        </div>
      ) : isForestTarget ? (
        <div>
          <div className="font-semibold">{t("pending.forestDead")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p("Select the 3x3 center cell.", "Оберіть центральну клітинку області 3×3.")}
          </div>
        </div>
      ) : isForestMoveDestination ? (
        <div>
          <div className="font-semibold">
            {p("Forest check failed", "Перевірка лісу неуспішна")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Choose a highlighted destination inside the aura.",
              "Оберіть підсвічену клітинку всередині аури.",
            )}
          </div>
        </div>
      ) : isForestChoice ? (
        <div>
          <div className="font-semibold">
            {p("Forest of the Dead ready", "Ліс мертвих готовий")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p("Decide whether to activate the phantasm.", "Вирішіть, чи активувати фантазм.")}
          </div>
        </div>
      ) : isForestMoveCheck ? (
        <div>
          <div className="font-semibold">{t("pending.forestCheck")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p("Forest check: roll 5-6 to leave", "Перевірка лісу: киньте 5–6, щоб вийти")}
          </div>
        </div>
      ) : isDuelistChoice ? (
        <div>
          <div className="font-semibold">{t("pending.demonDuelist")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p("Choose whether to continue the duel.", "Оберіть, чи продовжувати дуель.")}
          </div>
        </div>
      ) : isChikatiloPlacement ? (
        <div>
          <div className="font-semibold">
            {p("False Trail placement", "Розміщення Хибного сліду")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Select any empty cell to place Chikatilo.",
              "Оберіть будь-яку вільну клітинку для Чикатило.",
            )}
          </div>
        </div>
      ) : isGroznyTyrantOptionChoice ? (
        <div>
          <div className="font-semibold">
            {getHeroDisplayName("grozny", "Ivan Grozny", language)}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Choose how to use Tyrant before any resources are spent.",
              "Оберіть спосіб використання Тирана до витрати ресурсів.",
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {groznyModeOptions.includes("invadeTime") ? (
              <button
                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
                onClick={() =>
                  onResolveChoice({
                    type: "groznyTyrantOption",
                    mode: "invadeTime",
                  })
                }
              >
                {p(
                  "Use Tyrant with Invade Time",
                  "Використати Тирана разом із Часом вторгнення",
                )}
              </button>
            ) : null}
            {groznyModeOptions.includes("normal") ? (
              <button
                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
                onClick={() =>
                  onResolveChoice({
                    type: "groznyTyrantOption",
                    mode: "normal",
                  })
                }
              >
                {p(
                  "Use Tyrant normally",
                  "Використати Тирана звичайним способом",
                )}
              </button>
            ) : null}
            {groznyAllowSkip ? (
              <button
                className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={onResolveSkip}
              >
                {t("common.skip")}
              </button>
            ) : null}
          </div>
        </div>
      ) : isGroznyTyrantAllyChoice ? (
        <div>
          <div className="font-semibold">
            {p("Tyrant: choose ally", "Тиран: оберіть союзника")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {groznySelectedMode ? `${groznySelectedMode}. ` : ""}
            {p(
              "Select a highlighted allied figure.",
              "Оберіть підсвічену союзну фігуру.",
            )}
          </div>
          {groznyAllowSkip ? (
            <button
              className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={onResolveSkip}
            >
              {t("common.skip")}
            </button>
          ) : null}
        </div>
      ) : isGroznyTyrantAttackCellChoice ? (
        <div>
          <div className="font-semibold">
            {p("Tyrant: choose attack cell", "Тиран: оберіть клітинку атаки")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {groznySelectedMode ? `${groznySelectedMode}. ` : ""}
            {p(
              "Select the highlighted cell Ivan Grozny attacks from.",
              "Оберіть підсвічену клітинку, з якої Іван Грозний атакує.",
            )}
          </div>
          {groznyTyrantAllowSkip && (
            <button
              className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={onResolveSkip}
            >
              {t("common.skip")}
            </button>
          )}
        </div>
      ) : isGuideTravelerPlacement ? (
        <div>
          <div className="font-semibold">
            {p("Guide Traveler placement", "Розміщення Провідника")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Select an empty cell to place the guided ally.",
              "Оберіть вільну клітинку для союзника.",
            )}
          </div>
        </div>
      ) : isRiverBoatCarryChoice ? (
        <div>
          <div className="font-semibold">{p("Boat carry", "Пасажир човна")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Select an adjacent ally to carry.",
              "Оберіть сусіднього союзника для перевезення.",
            )}
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : isRiverBoatDestinationChoice ? (
        <div>
          <div className="font-semibold">{p("Boat destination", "Призначення човна")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p("Select River Person's destination.", "Оберіть клітинку призначення Лодочника.")}
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : isRiverBoatDropDestination ? (
        <div>
          <div className="font-semibold">{p("Boat drop", "Висадка з човна")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Select an adjacent empty cell to drop the passenger.",
              "Оберіть сусідню порожню клітинку для висадки пасажира.",
            )}
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : isRiverTraLaLaTargetChoice ? (
        <div>
          <div className="font-semibold">{p("Tra-la-la", "Тра-ля-ля")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p("Select an adjacent enemy target.", "Оберіть сусіднього ворога.")}
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : isRiverTraLaLaDestinationChoice ? (
        <div>
          <div className="font-semibold">{p("Tra-la-la", "Тра-ля-ля")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Select a highlighted straight-line destination.",
              "Оберіть підсвічену клітинку на прямій.",
            )}
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : isRiverTraLaLaDropDestinationChoice ? (
        <div>
          <div className="font-semibold">{p("Tra-la-la drop", "Висадка Тра-ля-ля")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Select an adjacent empty cell to drop the dragged target.",
              "Оберіть сусідню порожню клітинку для висадки цілі.",
            )}
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : isJebeKhansShooterTargetChoice ? (
        <div>
          <div className="font-semibold">{t("pending.khansShooter")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {ricochetPrompt}
          </div>
        </div>
      ) : isLokiLaughtChoice ? (
        <div>
          <div className="font-semibold">{t("pending.lokiLaughter")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Choose one trick to activate without revealing Loki.",
              "Оберіть хитрість, не розкриваючи Локі.",
            )}
          </div>
        </div>
      ) : isLokiChickenTargetChoice ? (
        <div>
          <div className="font-semibold">{p("Chicken", "Курка")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p("Select an enemy hero within 2 cells.", "Оберіть ворожого героя в радіусі 2.")}
          </div>
        </div>
      ) : isLokiMindControlEnemyChoice ? (
        <div>
          <div className="font-semibold">{p("Mind Control", "Контроль розуму")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p("Select a unit to control.", "Оберіть фігуру для контролю.")}
          </div>
        </div>
      ) : isLokiMindControlTargetChoice ? (
        <div>
          <div className="font-semibold">{p("Mind Control", "Контроль розуму")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Select a target for the controlled attack.",
              "Оберіть ціль для контрольованої атаки.",
            )}
          </div>
        </div>
      ) : isHassanTrueEnemyTargetChoice ? (
        <div>
          <div className="font-semibold">{p("True Enemy", "Справжній ворог")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Select a target for the controlled attack.",
              "Оберіть ціль для контрольованої атаки.",
            )}
          </div>
        </div>
      ) : isAsgoreSoulParadePatienceTargetChoice ? (
        <div>
          <div className="font-semibold">{p("Soul Parade: Patience", "Парад душ: Терпіння")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Select a target in assassin attack range.",
              "Оберіть ціль у дальності атаки вбивці.",
            )}
          </div>
        </div>
      ) : isAsgoreSoulParadePerseveranceTargetChoice ? (
        <div>
          <div className="font-semibold">
            {p("Soul Parade: Perseverance", "Парад душ: Наполегливість")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Select a target in trickster attack range.",
              "Оберіть ціль у дальності атаки трикстера.",
            )}
          </div>
        </div>
      ) : isAsgoreSoulParadeJusticeTargetChoice ? (
        <div>
          <div className="font-semibold">
            {p("Soul Parade: Justice", "Парад душ: Справедливість")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p("Select a target in archer attack line.", "Оберіть ціль на лінії атаки лучника.")}
          </div>
        </div>
      ) : isAsgoreSoulParadeIntegrityDestination ? (
        <div>
          <div className="font-semibold">
            {p("Soul Parade: Integrity", "Парад душ: Цілісність")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Select any highlighted destination cell.",
              "Оберіть будь-яку підсвічену клітинку призначення.",
            )}
          </div>
        </div>
      ) : isHassanAssassinOrderSelection ? (
        <div>
          <div className="font-semibold">
            {p(
              "Assassin Order: pick 2 allied heroes to gain Stealth (5-6)",
              "Орден убивць: оберіть 2 союзних героїв для скритності на 5–6",
            )}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("pending.selectedCount", {
              current: hassanAssassinOrderSelections.length,
              total: 2,
            })}
          </div>
          {hassanAssassinOrderSelections.length > 0 && (
            <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
              {hassanAssassinOrderSelections.join(", ")}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
              onClick={onConfirmHassanAssassinOrder}
              disabled={hassanAssassinOrderSelections.length !== 2}
            >
              {t("common.confirm")}
            </button>
            <button
              className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={onClearHassanAssassinOrder}
            >
              {t("common.clear")}
            </button>
          </div>
        </div>
      ) : isChikatiloRevealChoice ? (
        <div>
          <div className="font-semibold">{p("False Trail choice", "Вибір Хибного сліду")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Decide whether the token explodes or is removed.",
              "Оберіть: підірвати жетон або прибрати його.",
            )}
          </div>
        </div>
      ) : isChikatiloDecoyChoice ? (
        <div>
          <div className="font-semibold">{t("pending.decoy")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {p(
              "Roll defense or spend 3 charges to take 1 damage.",
              "Киньте захист або витратьте 3 заряди, щоб отримати 1 шкоду.",
            )}
          </div>
        </div>
      ) : isFriskPacifismHugsTargetChoice ? (
        <div>
          <div className="font-semibold">{t("pending.friskHugs")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("pending.friskHugsPrompt")}
          </div>
        </div>
      ) : isFriskWarmWordsTargetChoice ? (
        <div>
          <div className="font-semibold">{t("pending.friskWarmWords")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("pending.friskWarmWordsPrompt")}
          </div>
        </div>
      ) : isFriskPrecisionStrikeTargetChoice ? (
        <div>
          <div className="font-semibold">{t("pending.friskPrecisionStrike")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("pending.friskPrecisionStrikePrompt")}
          </div>
        </div>
      ) : (
        <div>
          {t("pending.resolveToContinue", {
            roll: getPendingRollLabel(pendingRollKind, language),
          })}
        </div>
      )}
      {!isStakePlacement && pendingQueueCount > 0 && (
        <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
          {t("pending.pendingAttacks", { count: pendingQueueCount })}
        </div>
      )}
    </div>
  );
}
