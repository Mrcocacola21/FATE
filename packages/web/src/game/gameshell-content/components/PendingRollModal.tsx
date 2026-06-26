import type { Coord, PlayerView, RuleDeclarationId } from "rules";
import { getPendingRollLabel } from "../helpers";
import { useI18n } from "../../../i18n";

type PendingRoll = NonNullable<PlayerView["pendingRoll"]>;

const RULE_DECLARATION_IDS: RuleDeclarationId[] = [
  "court",
  "chess_party",
  "moon_game",
  "advantage_game",
];

function ruleDeclarationKey(ruleId: RuleDeclarationId) {
  switch (ruleId) {
    case "court":
      return "court";
    case "chess_party":
      return "chessParty";
    case "moon_game":
      return "moonGame";
    case "advantage_game":
      return "advantageGame";
  }
}

function isRuleDeclarationId(value: unknown): value is RuleDeclarationId {
  return typeof value === "string" && RULE_DECLARATION_IDS.includes(value as RuleDeclarationId);
}

function isCoord(value: unknown): value is Coord {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Coord).col === "number" &&
    typeof (value as Coord).row === "number"
  );
}

interface PendingRollModalProps {
  pendingRoll: PendingRoll;
  view: PlayerView;
  showAttackerRoll: boolean;
  attackerDice: number[];
  tieBreakAttacker: number[];
  isForestMoveCheck: boolean;
  isForestChoice: boolean;
  isDuelistChoice: boolean;
  isAsgoreBraveryDefenseChoice: boolean;
  isLokiLaughtChoice: boolean;
  isFriskPacifismChoice: boolean;
  isFriskGenocideChoice: boolean;
  isFriskKeenEyeChoice: boolean;
  isFriskSubstitutionChoice: boolean;
  isFriskChildsCryChoice: boolean;
  isOdinMuninnDefenseChoice: boolean;
  isChikatiloRevealChoice: boolean;
  isChikatiloDecoyChoice: boolean;
  isBerserkerDefenseChoice: boolean;
  lokiLaughtCurrent: number;
  lokiCanAgainSomeNonsense: boolean;
  lokiCanChicken: boolean;
  lokiCanMindControl: boolean;
  lokiCanSpinTheDrum: boolean;
  lokiCanGreatLokiJoke: boolean;
  lokiLaughtChickenOptions: string[];
  lokiLaughtMindControlEnemyOptions: string[];
  lokiLaughtSpinCandidateIds: string[];
  friskPacifismPoints: number;
  friskPacifismDisabled: boolean;
  friskPacifismHugsOptions: string[];
  friskPacifismWarmWordsOptions: string[];
  friskPacifismPowerOfFriendshipEnabled: boolean;
  friskGenocidePoints: number;
  friskKeenEyeTargetIds: string[];
  defenderFriskGenocidePoints: number;
  defenderFriskPacifismPoints: number;
  defenderBerserkCharges: number;
  defenderMuninnCharges: number;
  defenderAsgoreBraveryReady: boolean;
  decoyCharges: number;
  duelistAttackerHp: number;
  onResolvePendingRoll: (choice?: unknown) => void;
}

export function PendingRollModal({
  pendingRoll,
  view,
  showAttackerRoll,
  attackerDice,
  tieBreakAttacker,
  isForestMoveCheck,
  isForestChoice,
  isDuelistChoice,
  isAsgoreBraveryDefenseChoice,
  isLokiLaughtChoice,
  isFriskPacifismChoice,
  isFriskGenocideChoice,
  isFriskKeenEyeChoice,
  isFriskSubstitutionChoice,
  isFriskChildsCryChoice,
  isOdinMuninnDefenseChoice,
  isChikatiloRevealChoice,
  isChikatiloDecoyChoice,
  isBerserkerDefenseChoice,
  lokiLaughtCurrent,
  lokiCanAgainSomeNonsense,
  lokiCanChicken,
  lokiCanMindControl,
  lokiCanSpinTheDrum,
  lokiCanGreatLokiJoke,
  lokiLaughtChickenOptions,
  lokiLaughtMindControlEnemyOptions,
  lokiLaughtSpinCandidateIds,
  friskPacifismPoints,
  friskPacifismDisabled,
  friskPacifismHugsOptions,
  friskPacifismWarmWordsOptions,
  friskPacifismPowerOfFriendshipEnabled,
  friskGenocidePoints,
  friskKeenEyeTargetIds,
  defenderFriskGenocidePoints,
  defenderFriskPacifismPoints,
  defenderBerserkCharges,
  defenderMuninnCharges,
  defenderAsgoreBraveryReady,
  decoyCharges,
  duelistAttackerHp,
  onResolvePendingRoll,
}: PendingRollModalProps) {
  const { language, t } = useI18n();
  const p = (en: string, uk: string) => (language === "uk" ? uk : en);
  const pendingContext = (pendingRoll.context ?? {}) as Record<string, unknown>;
  const isRuleDeclarationChoice = pendingRoll.kind === "ruleDeclarationChoice";
  const isRuleDeclarationThreshold =
    pendingRoll.kind === "ruleDeclarationAdvantageThreshold";
  const isRuleDeclarationUnitChoice =
    pendingRoll.kind === "ruleDeclarationChessKingChoice" ||
    pendingRoll.kind === "courtEffectUnitChoice" ||
    pendingRoll.kind === "moonCheeseHolesChoice" ||
    pendingRoll.kind === "pureBloodRedirectChoice";
  const isRuleDeclarationChargeChoice =
    pendingRoll.kind === "courtEffectChargeChoice";
  const isRuleDeclarationCellChoice =
    pendingRoll.kind === "courtForcedAppearanceDestination";
  const availableRuleIds = Array.isArray(pendingContext.availableRuleIds)
    ? pendingContext.availableRuleIds.filter(isRuleDeclarationId)
    : RULE_DECLARATION_IDS;
  const ruleUnitOptions = Array.isArray(pendingContext.options)
    ? pendingContext.options.filter((value): value is string => typeof value === "string")
    : [];
  const ruleChargeOptions = ruleUnitOptions;
  const ruleCellOptions = Array.isArray(pendingContext.options)
    ? pendingContext.options.filter(isCoord)
    : [];
  const thresholdMin =
    typeof pendingContext.min === "number" ? pendingContext.min : 3;
  const thresholdMax =
    typeof pendingContext.max === "number" ? pendingContext.max : 7;
  const thresholdOptions = Array.from(
    { length: Math.max(0, thresholdMax - thresholdMin + 1) },
    (_, index) => thresholdMin + index
  );
  const unitLabel = (unitId: string) => {
    const unit = view.units[unitId];
    return unit ? `${unitId} (${unit.class})` : unitId;
  };
  const coordLabel = (coord: Coord) => `${coord.col},${coord.row}`;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pending-roll-title"
      aria-describedby="pending-roll-description"
    >
      <div className="arcane-prompt scroll-panel panel-card max-h-[92vh] w-full max-w-lg overflow-y-auto border-violet-400/45 p-5 shadow-2xl shadow-violet-950/30 sm:p-6">
        <div className="relative z-10 flex items-start gap-3">
          <div className="brand-sigil mt-0.5 h-11 w-11" aria-hidden="true" />
          <div className="min-w-0">
            <div className="section-kicker text-violet-700 dark:text-violet-300">
              {t("pending.actionRequired")}
            </div>
            <div id="pending-roll-title" className="fate-brand mt-1 text-xl">
              {pendingRoll.kind === "initiativeRoll"
                ? t("pending.rollInitiative")
                : isRuleDeclarationChoice
                  ? t("ruleDeclarations.chooseTitle")
                  : isRuleDeclarationThreshold
                    ? t("ruleDeclarations.chooseThreshold")
                    : isRuleDeclarationUnitChoice
                      ? t("ruleDeclarations.chooseFigure")
                      : isRuleDeclarationChargeChoice
                        ? t("ruleDeclarations.chooseCounter")
                        : isRuleDeclarationCellChoice
                          ? t("ruleDeclarations.chooseCell")
                : isForestMoveCheck
                  ? t("pending.forestCheck")
                  : isForestChoice
                    ? t("pending.forestDead")
                    : isDuelistChoice
                      ? t("pending.demonDuelist")
                      : pendingRoll.kind === "asgoreSoulParadeRoll"
                        ? t("pending.soulParade")
                        : isAsgoreBraveryDefenseChoice
                          ? t("pending.braveryDefense")
                          : isLokiLaughtChoice
                            ? t("pending.lokiLaughter")
                            : isFriskPacifismChoice
                              ? t("pending.friskPacifism")
                              : isFriskGenocideChoice
                                ? t("pending.friskGenocide")
                                : isFriskKeenEyeChoice
                                  ? t("pending.friskKeenEye")
                                  : isFriskSubstitutionChoice
                                    ? t("pending.friskSubstitution")
                                    : isFriskChildsCryChoice
                                      ? t("pending.friskChildsCry")
                                      : isOdinMuninnDefenseChoice
                                        ? t("pending.muninnDefense")
                                        : isChikatiloRevealChoice
                                          ? t("pending.falseTrail")
                                          : isChikatiloDecoyChoice
                                            ? t("pending.decoy")
                                            : t("pending.rollRequired")}
            </div>
          </div>
        </div>
        <div
          id="pending-roll-description"
          className="relative z-10 mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300"
        >
          {isBerserkerDefenseChoice
            ? t("pending.chooseBerserkerDefense")
            : isRuleDeclarationChoice
              ? t("ruleDeclarations.chooseDescription")
              : isRuleDeclarationThreshold
                ? t("ruleDeclarations.thresholdRange", {
                    min: thresholdMin,
                    max: thresholdMax,
                  })
                : isRuleDeclarationUnitChoice ||
                    isRuleDeclarationChargeChoice ||
                    isRuleDeclarationCellChoice
                  ? t("pending.resolveRoll", {
                      roll: getPendingRollLabel(pendingRoll.kind, language),
                    })
            : isLokiLaughtChoice
              ? p(
                  "Pick one Loki trick. Costs Laughter and does not reveal stealth.",
                  "Оберіть одну хитрість Локі. Вона витрачає Сміх і не розкриває скритність.",
                )
              : isFriskPacifismChoice
                ? p(
                    "Pick a Pacifism option. Pacifism abilities do not reveal Frisk stealth.",
                    "Оберіть дію Пацифізму. Вона не розкриває скритність Фріск.",
                  )
                : isFriskGenocideChoice
                  ? p("Pick a Genocide option.", "Оберіть дію Геноциду.")
                  : isFriskKeenEyeChoice
                    ? p(
                        "Pick an enemy to reveal with Keen Eye, or attempt normal stealth.",
                        "Оберіть ворога для розкриття Пильним оком або виконайте звичайну спробу скритності.",
                      )
                    : isFriskSubstitutionChoice
                      ? p(
                          "Use Substitution before defense roll to take exactly 1 damage.",
                          "Використайте Підміну до кидка захисту, щоб отримати рівно 1 шкоду.",
                        )
                      : isFriskChildsCryChoice
                        ? p(
                            "Use Child's Cry after the roll to reduce this hit's damage to 0.",
                            "Використайте Дитячий плач після кидка, щоб зменшити шкоду до нуля.",
                          )
                        : isOdinMuninnDefenseChoice
                          ? p(
                              "Defense roll is ready. Keep the roll or spend 6 charges for Muninn auto-defense.",
                              "Кидок захисту готовий. Залиште його або витратьте 6 зарядів на автозахист Мунінном.",
                            )
                          : isAsgoreBraveryDefenseChoice
                            ? p(
                                "Defense roll is ready. Keep the roll or consume Bravery for automatic defense.",
                                "Кидок захисту готовий. Залиште його або витратьте Хоробрість на автоматичний захист.",
                              )
                            : isChikatiloDecoyChoice
                              ? p(
                                  "Roll defense or spend 3 charges to take 1 damage.",
                                  "Киньте захист або витратьте 3 заряди, щоб отримати 1 шкоду.",
                                )
                              : isChikatiloRevealChoice
                                ? p(
                                    "Explode the token or remove it.",
                                    "Підірвіть жетон або приберіть його.",
                                  )
                                : pendingRoll.kind === "asgoreSoulParadeRoll"
                                  ? p(
                                      "Roll 1d6 to determine Soul Parade effect.",
                                      "Киньте 1d6, щоб визначити ефект Параду душ.",
                                    )
                                  : isForestMoveCheck
                                    ? p(
                                        "Forest check: roll 5-6 to leave",
                                        "Перевірка лісу: киньте 5–6, щоб вийти",
                                      )
                                    : isForestChoice
                                      ? p(
                                          "Activate Forest of the Dead or skip.",
                                          "Активуйте Ліс мертвих або пропустіть.",
                                        )
                                      : isDuelistChoice
                                        ? p(
                                            "Pay 1 HP to continue the duel, or stop.",
                                            "Сплатіть 1 здоров’я, щоб продовжити дуель, або зупиніться.",
                                          )
                                        : t("pending.resolveRoll", {
                                            roll: getPendingRollLabel(pendingRoll.kind, language),
                                          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="status-pill badge-warning">
            {t("pending.pendingFor", { player: pendingRoll.player })}
          </span>
          <span className="status-pill badge-special">
            {getPendingRollLabel(pendingRoll.kind, language)}
          </span>
        </div>
        {pendingRoll.kind === "initiativeRoll" && (
          <div className="panel-card-muted mt-3 p-3 text-xs text-stone-600 dark:text-stone-200">
            {pendingRoll.player === "P2" && view.initiative.P1 !== null && (
              <div>{t("pending.rolled", { player: "P1", value: view.initiative.P1 })}</div>
            )}
            {pendingRoll.player === "P1" && view.initiative.P2 !== null && (
              <div>{t("pending.rolled", { player: "P2", value: view.initiative.P2 })}</div>
            )}
            {pendingRoll.player === "P1" &&
              view.initiative.P2 === null &&
              view.initiative.P1 === null && <div>{t("pending.awaitingRoll")}</div>}
          </div>
        )}
        {showAttackerRoll && attackerDice.length > 0 && (
          <div className="panel-card-muted mt-3 p-3 text-xs text-stone-600 dark:text-stone-200">
            <div>{t("pending.attackerRoll", { dice: attackerDice.join(", ") })}</div>
            {tieBreakAttacker.length > 0 && (
              <div className="mt-1">
                {t("pending.tieBreak", { dice: tieBreakAttacker.join(", ") })}
              </div>
            )}
          </div>
        )}
        <div className="pending-choice mt-5 flex flex-col gap-2 border-t border-violet-300/40 pt-4 dark:border-violet-800/50 sm:flex-row">
          {isRuleDeclarationChoice ? (
            <div className="grid w-full grid-cols-1 gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-300">
                {t("ruleDeclarations.initiativeWinner", {
                  player: String(pendingContext.initiativeWinner ?? "-"),
                })}
                {" / "}
                {t("ruleDeclarations.chooser", {
                  player: String(pendingContext.chooserPlayer ?? pendingRoll.player),
                })}
              </div>
              {availableRuleIds.map((ruleId) => {
                const key = ruleDeclarationKey(ruleId);
                const name = t(`ruleDeclarations.${key}.name`);
                return (
                  <button
                    key={ruleId}
                    type="button"
                    className="w-full rounded-lg border border-violet-300/60 bg-white/85 p-3 text-left text-slate-900 shadow-sm transition hover:border-violet-500 hover:shadow dark:border-violet-800/70 dark:bg-slate-950/80 dark:text-slate-100"
                    onClick={() =>
                      onResolvePendingRoll({
                        type: "chooseRuleDeclaration",
                        ruleId,
                      })
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold">{name}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                          {t(`ruleDeclarations.${key}.summary`)}
                        </div>
                      </div>
                      <span className="status-pill badge-special shrink-0">
                        {ruleId === "chess_party" || ruleId === "advantage_game"
                          ? t("ruleDeclarations.setupRequired")
                          : t("ruleDeclarations.noSetup")}
                      </span>
                    </div>
                    <details className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                      <summary className="cursor-pointer font-semibold">
                        {t("common.details")}
                      </summary>
                      <div className="mt-1">{t(`ruleDeclarations.${key}.description`)}</div>
                      <div className="mt-1 font-semibold">
                        {t(`ruleDeclarations.${key}.timing`)}
                      </div>
                    </details>
                  </button>
                );
              })}
            </div>
          ) : isRuleDeclarationThreshold ? (
            <div className="grid w-full grid-cols-1 gap-2">
              <div className="text-xs text-slate-500 dark:text-slate-300">
                {t("ruleDeclarations.thresholdRange", {
                  min: thresholdMin,
                  max: thresholdMax,
                })}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {thresholdOptions.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                    onClick={() =>
                      onResolvePendingRoll({
                        type: "ruleThreshold",
                        threshold: value,
                      })
                    }
                  >
                    {t("ruleDeclarations.threshold", { value })}
                  </button>
                ))}
              </div>
            </div>
          ) : isRuleDeclarationUnitChoice ? (
            <div className="grid w-full grid-cols-1 gap-2">
              {ruleUnitOptions.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-300">
                  {t("pending.noValidTargets")}
                </div>
              ) : null}
              {ruleUnitOptions.map((unitId) => (
                <button
                  key={unitId}
                  type="button"
                  className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                  onClick={() =>
                    onResolvePendingRoll({
                      type: "ruleUnit",
                      unitId,
                    })
                  }
                >
                  {unitLabel(unitId)}
                </button>
              ))}
            </div>
          ) : isRuleDeclarationChargeChoice ? (
            <div className="grid w-full grid-cols-1 gap-2">
              {ruleChargeOptions.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-300">
                  {t("pending.noValidTargets")}
                </div>
              ) : null}
              {ruleChargeOptions.map((abilityId) => (
                <button
                  key={abilityId}
                  type="button"
                  className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                  onClick={() =>
                    onResolvePendingRoll({
                      type: "ruleCharge",
                      abilityId,
                    })
                  }
                >
                  {abilityId}
                </button>
              ))}
            </div>
          ) : isRuleDeclarationCellChoice ? (
            <div className="grid max-h-64 w-full grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
              {ruleCellOptions.map((position) => (
                <button
                  key={coordLabel(position)}
                  type="button"
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                  onClick={() =>
                    onResolvePendingRoll({
                      type: "ruleCell",
                      position,
                    })
                  }
                >
                  {coordLabel(position)}
                </button>
              ))}
            </div>
          ) : isLokiLaughtChoice ? (
            <div className="grid w-full grid-cols-1 gap-2">
              <div className="text-xs text-slate-500 dark:text-slate-300">
                {p("Laughter", "Сміх")}: {lokiLaughtCurrent}/15
              </div>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({
                    type: "lokiLaughtOption",
                    option: "againSomeNonsense",
                  })
                }
                disabled={!lokiCanAgainSomeNonsense}
                title={
                  lokiCanAgainSomeNonsense ? "" : p("Not enough Laughter", "Недостатньо Сміху")
                }
              >
                {p("Again some nonsense (-3)", "Знову якась нісенітниця (-3)")}
                {!lokiCanAgainSomeNonsense
                  ? ` — ${p("Not enough Laughter", "Недостатньо Сміху")}`
                  : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({ type: "lokiLaughtOption", option: "chicken" })
                }
                disabled={!lokiCanChicken}
                title={
                  lokiLaughtCurrent < 5
                    ? p("Not enough Laughter", "Недостатньо Сміху")
                    : lokiLaughtChickenOptions.length === 0
                      ? t("pending.noValidTargets")
                      : ""
                }
              >
                {p("Chicken (-5)", "Курка (-5)")}
                {lokiLaughtCurrent < 5
                  ? ` — ${p("Not enough Laughter", "Недостатньо Сміху")}`
                  : lokiLaughtChickenOptions.length === 0
                    ? ` — ${t("pending.noValidTargets")}`
                    : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({
                    type: "lokiLaughtOption",
                    option: "mindControl",
                  })
                }
                disabled={!lokiCanMindControl}
                title={
                  lokiLaughtCurrent < 10
                    ? p("Not enough Laughter", "Недостатньо Сміху")
                    : lokiLaughtMindControlEnemyOptions.length === 0
                      ? t("pending.noValidTargets")
                      : ""
                }
              >
                {p("Mind Control (-10)", "Контроль розуму (-10)")}
                {lokiLaughtCurrent < 10
                  ? ` — ${p("Not enough Laughter", "Недостатньо Сміху")}`
                  : lokiLaughtMindControlEnemyOptions.length === 0
                    ? ` — ${t("pending.noValidTargets")}`
                    : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({
                    type: "lokiLaughtOption",
                    option: "spinTheDrum",
                  })
                }
                disabled={!lokiCanSpinTheDrum}
                title={lokiCanSpinTheDrum ? "" : p("Not enough Laughter", "Недостатньо Сміху")}
              >
                {p("Spin the drum (-12)", "Закрутити барабан (-12)")}
                {!lokiCanSpinTheDrum ? ` — ${p("Not enough Laughter", "Недостатньо Сміху")}` : ""}
                {lokiCanSpinTheDrum && lokiLaughtSpinCandidateIds.length === 0
                  ? ` — ${p("No allied heroes to spin", "Немає союзних героїв")}`
                  : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({
                    type: "lokiLaughtOption",
                    option: "greatLokiJoke",
                  })
                }
                disabled={!lokiCanGreatLokiJoke}
                title={lokiCanGreatLokiJoke ? "" : p("Not enough Laughter", "Недостатньо Сміху")}
              >
                {p("Great Loki joke (-15)", "Великий жарт Локі (-15)")}
                {!lokiCanGreatLokiJoke ? ` — ${p("Not enough Laughter", "Недостатньо Сміху")}` : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("skip")}
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : isFriskPacifismChoice ? (
            <div className="grid w-full grid-cols-1 gap-2">
              <div className="text-xs text-slate-500 dark:text-slate-300">
                {p("Pacifism", "Пацифізм")}: {friskPacifismPoints}/30
              </div>
              {friskPacifismDisabled && (
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  {p("Pacifism lost (One Path)", "Пацифізм втрачено («Один шлях»)")}
                </div>
              )}
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({ type: "friskPacifismOption", option: "hugs" })
                }
                disabled={
                  friskPacifismDisabled ||
                  friskPacifismPoints < 3 ||
                  friskPacifismHugsOptions.length === 0
                }
              >
                {p("Hugs (-3)", "Обійми (-3)")}
                {friskPacifismPoints < 3
                  ? ` — ${t("game.notEnoughCharges")}`
                  : friskPacifismHugsOptions.length === 0
                    ? ` — ${t("pending.noValidTargets")}`
                    : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({ type: "friskPacifismOption", option: "childsCry" })
                }
                disabled={friskPacifismDisabled || friskPacifismPoints < 5}
              >
                {p("Child's Cry (-5)", "Дитячий плач (-5)")}
                {friskPacifismPoints < 5 ? ` — ${t("game.notEnoughCharges")}` : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({ type: "friskPacifismOption", option: "warmWords" })
                }
                disabled={
                  friskPacifismDisabled ||
                  friskPacifismPoints < 10 ||
                  friskPacifismWarmWordsOptions.length === 0
                }
              >
                {p("Warm Words (-10)", "Теплі слова (-10)")}
                {friskPacifismPoints < 10
                  ? ` — ${t("game.notEnoughCharges")}`
                  : friskPacifismWarmWordsOptions.length === 0
                    ? ` — ${t("pending.noValidTargets")}`
                    : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({
                    type: "friskPacifismOption",
                    option: "powerOfFriendship",
                  })
                }
                disabled={friskPacifismDisabled || !friskPacifismPowerOfFriendshipEnabled}
              >
                {p("Power of Friendship", "Сила дружби")}
                {!friskPacifismPowerOfFriendshipEnabled ? ` — ${t("pending.conditionNotMet")}` : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("skip")}
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : isFriskGenocideChoice ? (
            <div className="grid w-full grid-cols-1 gap-2">
              <div className="text-xs text-slate-500 dark:text-slate-300">
                {p("Genocide", "Геноцид")}: {friskGenocidePoints}/30
              </div>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({ type: "friskGenocideOption", option: "substitution" })
                }
                disabled={friskGenocidePoints < 3}
              >
                {p("Substitution (-3)", "Підміна (-3)")}
                {friskGenocidePoints < 3 ? ` — ${t("game.notEnoughCharges")}` : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({ type: "friskGenocideOption", option: "keenEye" })
                }
                disabled={friskGenocidePoints < 5}
              >
                {p("Keen Eye (-5)", "Пильне око (-5)")}
                {friskGenocidePoints < 5 ? ` — ${t("game.notEnoughCharges")}` : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({
                    type: "friskGenocideOption",
                    option: "precisionStrike",
                  })
                }
                disabled={friskGenocidePoints < 10}
              >
                {p("Precision Strike (-10)", "Точний удар (-10)")}
                {friskGenocidePoints < 10 ? ` — ${t("game.notEnoughCharges")}` : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("skip")}
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : isFriskKeenEyeChoice ? (
            <div className="grid w-full grid-cols-1 gap-2">
              {friskKeenEyeTargetIds.length === 0 && (
                <div className="text-xs text-slate-500 dark:text-slate-300">
                  {p("No valid Keen Eye targets.", "Немає доступних цілей для Пильного ока.")}
                </div>
              )}
              {friskKeenEyeTargetIds.map((unitId) => (
                <button
                  key={unitId}
                  className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                  onClick={() =>
                    onResolvePendingRoll({ type: "friskKeenEyeTarget", targetId: unitId })
                  }
                >
                  {p("Reveal", "Розкрити")} {unitId}
                </button>
              ))}
              <button
                className="w-full rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("skip")}
              >
                {p("Attempt Stealth Instead", "Натомість спробувати скритність")}
              </button>
            </div>
          ) : isFriskSubstitutionChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("roll")}
              >
                {t("pending.rollDefense")}
              </button>
              <button
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
                onClick={() => onResolvePendingRoll("activate")}
                disabled={defenderFriskGenocidePoints < 3}
              >
                {p("Use Substitution (-3)", "Використати Підміну (-3)")}
              </button>
            </>
          ) : isFriskChildsCryChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("skip")}
              >
                {t("pending.takeDamage")}
              </button>
              <button
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
                onClick={() => onResolvePendingRoll("activate")}
                disabled={defenderFriskPacifismPoints < 5}
              >
                {p("Use Child's Cry (-5)", "Використати Дитячий плач (-5)")}
              </button>
            </>
          ) : isBerserkerDefenseChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("roll")}
              >
                {t("pending.rollDefense")}
              </button>
              <button
                className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
                onClick={() => onResolvePendingRoll("auto")}
                disabled={defenderBerserkCharges !== 6}
              >
                {t("pending.autoDodge")}
              </button>
            </>
          ) : isOdinMuninnDefenseChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("roll")}
              >
                {t("pending.keepRoll")}
              </button>
              <button
                className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
                onClick={() => onResolvePendingRoll("auto")}
                disabled={defenderMuninnCharges !== 6}
              >
                {p("Use Muninn (-6)", "Використати Мунінна (-6)")}
              </button>
            </>
          ) : isAsgoreBraveryDefenseChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("roll")}
              >
                {t("pending.keepRoll")}
              </button>
              <button
                className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
                onClick={() => onResolvePendingRoll("auto")}
                disabled={!defenderAsgoreBraveryReady}
              >
                {p("Use Bravery", "Використати Хоробрість")}
              </button>
            </>
          ) : isChikatiloDecoyChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("roll")}
              >
                {t("pending.rollDefense")}
              </button>
              <button
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
                onClick={() => onResolvePendingRoll("decoy")}
                disabled={decoyCharges < 3}
              >
                {p("Use Decoy (-3)", "Використати Приманку (-3)")}
              </button>
            </>
          ) : isDuelistChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
                onClick={() => onResolvePendingRoll("elCidDuelistContinue")}
                disabled={duelistAttackerHp <= 1}
              >
                {t("pending.payHp")}
              </button>
              <button
                className="flex-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("elCidDuelistStop")}
              >
                {t("common.stop")}
              </button>
            </>
          ) : isForestChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("activate")}
              >
                {t("common.activate")}
              </button>
              <button
                className="flex-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("skip")}
              >
                {t("common.skip")}
              </button>
            </>
          ) : isChikatiloRevealChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
                onClick={() => onResolvePendingRoll("falseTrailExplode")}
              >
                {t("common.explode")}
              </button>
              <button
                className="flex-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("falseTrailRemove")}
              >
                {t("common.remove")}
              </button>
            </>
          ) : (
            <button
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
              onClick={() => onResolvePendingRoll()}
            >
              {t("pending.rollDice")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
