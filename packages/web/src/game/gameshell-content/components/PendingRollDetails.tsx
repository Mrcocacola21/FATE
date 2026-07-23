import type { PendingRollContext } from "rules";
import { useI18n } from "../../../i18n";
import {
  localizedOutcome,
  localizedSuccessRule,
  pendingRollReason,
  pendingRollTitle,
} from "../../pendingRollPresentation";

interface PendingRollDetailsProps {
  context: PendingRollContext;
  mode: "active" | "waiting";
  playerLabel?: string;
}

export function PendingRollDetails({ context, mode, playerLabel }: PendingRollDetailsProps) {
  const { language, t } = useI18n();
  const actor = context.actorName ?? t("pending.context.hiddenUnit");
  const source = context.sourceName;
  const target = context.targetName;
  const success = localizedOutcome(context, "success", language, t);
  const failure = localizedOutcome(context, "failure", language, t);
  const rule = localizedSuccessRule(context.successRule, language, t);
  const title = pendingRollTitle(context, t);
  const hasActor = !!context.actorName;
  const comparedAgainst =
    language === "uk" && context.opponentRollTotal !== undefined
      ? t("pending.context.againstAttackRoll", {
          source: context.sourceName ?? t("pending.context.unknownSource"),
          total: context.opponentRollTotal,
        })
      : context.comparedAgainst;

  return (
    <div className="pending-roll-context" data-testid="pending-roll-context">
      <div className="flex min-w-0 items-start gap-3">
        <div className="pending-roll-sigil" aria-hidden="true">
          <span>✦</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="section-kicker text-amber-700 dark:text-amber-300">
            {t("pending.rollRequired")}
          </div>
          <h2 id="pending-roll-title" className="fate-brand mt-1 text-2xl leading-tight">
            {title}
          </h2>
          <p className="mt-1.5 text-sm font-semibold text-stone-700 dark:text-stone-200">
            {mode === "active"
              ? hasActor
                ? context.isControlledRoll
                  ? t("pending.context.youRollControlled", { unit: actor })
                  : t("pending.context.youRollFor", { unit: actor })
                : t("pending.context.yourRoll")
              : hasActor
                ? t("pending.context.waitingForRoll", {
                    player:
                      playerLabel ?? context.requestedPlayerLabel ?? context.requestedPlayerId,
                    unit: actor,
                    roll: title,
                  })
                : t("pending.context.waitingForSimpleRoll", {
                    player:
                      playerLabel ?? context.requestedPlayerLabel ?? context.requestedPlayerId,
                    roll: title,
                  })}
          </p>
        </div>
      </div>

      {(source || target) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {source ? <span className="pending-roll-unit">{source}</span> : null}
          {source && target ? (
            <span className="text-stone-400" aria-hidden="true">
              →
            </span>
          ) : null}
          {target ? <span className="pending-roll-unit">{target}</span> : null}
          {context.abilityName ? (
            <span className="pending-roll-ability">{context.abilityName}</span>
          ) : null}
        </div>
      )}

      <div className="pending-roll-facts mt-4">
        <div>
          <span>{t("pending.context.roll")}</span>
          <strong className="pending-roll-dice">{context.diceLabel}</strong>
        </div>
        {rule ? (
          <div>
            <span>{t("pending.context.successCondition")}</span>
            <strong>{rule}</strong>
          </div>
        ) : null}
        {comparedAgainst ? (
          <div>
            <span>{t("pending.context.against")}</span>
            <strong>{comparedAgainst}</strong>
          </div>
        ) : null}
      </div>

      {(success || failure) && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {success ? (
            <div className="pending-roll-outcome pending-roll-outcome--success">
              <span>{t("pending.context.success")}</span>
              <p>{success}</p>
            </div>
          ) : null}
          {failure ? (
            <div className="pending-roll-outcome pending-roll-outcome--failure">
              <span>{t("pending.context.failure")}</span>
              <p>{failure}</p>
            </div>
          ) : null}
        </div>
      )}

      <div className="pending-roll-reason mt-4">
        <span>{t("pending.context.reason")}</span>
        <p>{pendingRollReason(context, language, t)}</p>
      </div>
    </div>
  );
}
