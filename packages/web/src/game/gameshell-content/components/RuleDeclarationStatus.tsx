import { PanelCard, SectionHeader, StatusBadge } from "../../../components/ui";
import { useI18n } from "../../../i18n";

export function ruleDeclarationKey(ruleId: string | null | undefined) {
  switch (ruleId) {
    case "normal_rule":
      return "normalRule";
    case "court":
      return "court";
    case "chess_party":
      return "chessParty";
    case "moon_game":
      return "moonGame";
    case "advantage_game":
      return "advantageGame";
    default:
      return null;
  }
}

export function RuleDeclarationStatus({ vm }: { vm: any }) {
  const { t } = useI18n();
  const rule = vm.view?.ruleDeclaration;
  const selectedRuleId = rule?.selectedRuleId ?? null;
  const selectedKey = ruleDeclarationKey(selectedRuleId);
  const pendingMeta = vm.pendingMeta;
  const isRuleChoicePending = pendingMeta?.kind === "ruleDeclarationChoice";

  if (!selectedKey && !isRuleChoicePending) {
    return null;
  }

  const court = rule?.ruleData?.court;
  const chess = rule?.ruleData?.chessParty;
  const moon = rule?.ruleData?.moonGame;
  const advantage = rule?.ruleData?.advantageGame;
  const opponentSelectedNormal =
    selectedRuleId === "normal_rule" && rule?.chooserPlayer && rule.chooserPlayer !== vm.playerId;

  return (
    <PanelCard variant="parchment" className="p-4">
      <SectionHeader
        kicker={t("ruleDeclarations.title")}
        title={
          selectedKey
            ? t(`ruleDeclarations.${selectedKey}.name`)
            : t("ruleDeclarations.notSelected")
        }
        description={
          selectedKey
            ? t(`ruleDeclarations.${selectedKey}.summary`)
            : t("ruleDeclarations.chooseDescription")
        }
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {selectedKey ? (
          <StatusBadge tone="special">{t("ruleDeclarations.selected")}</StatusBadge>
        ) : null}
        {rule?.chooserPlayer ? (
          <StatusBadge tone="info">
            {t("ruleDeclarations.chooser", { player: rule.chooserPlayer })}
          </StatusBadge>
        ) : null}
        {isRuleChoicePending ? (
          <StatusBadge tone={pendingMeta.player === vm.playerId ? "warning" : "neutral"}>
            {pendingMeta.player === vm.playerId
              ? t("game.choicePending")
              : t("ruleDeclarations.waiting")}
          </StatusBadge>
        ) : null}
      </div>
      {court ? (
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-300">
          {t("ruleDeclarations.courtRoles", {
            attacker: court.attackerPlayer ?? "-",
            defender: court.defenderPlayer ?? "-",
          })}
        </p>
      ) : null}
      {chess ? (
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-300">
          {t("ruleDeclarations.chessKings", {
            p1: chess.kings?.P1 ?? "-",
            p2: chess.kings?.P2 ?? "-",
          })}
        </p>
      ) : null}
      {moon?.crater ? (
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-300">
          {t("ruleDeclarations.moonCrater", {
            col: moon.crater.center?.col ?? "-",
            row: moon.crater.center?.row ?? "-",
          })}
        </p>
      ) : null}
      {moon?.noStealthUntilRoundEnd ? (
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-300">
          {t("ruleDeclarations.moonNoStealth")}
        </p>
      ) : null}
      {moon?.reverseTurnOrderUntilRoundEnd ? (
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-300">
          {t("ruleDeclarations.moonReverse")}
        </p>
      ) : null}
      {advantage?.threshold ? (
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-300">
          {t("ruleDeclarations.advantageThreshold", {
            threshold: advantage.threshold,
          })}
        </p>
      ) : null}
      {opponentSelectedNormal ? (
        <p className="mt-3 text-xs font-semibold leading-5 text-emerald-700 dark:text-emerald-300">
          {t("ruleDeclarations.normalRule.opponentSelected")}
        </p>
      ) : null}
    </PanelCard>
  );
}
