import type { PlayerView, ResolveRollChoice } from "rules";
import { useI18n } from "../../../i18n";
import { getUnitFigureDisplayName } from "../../../i18n/displayMetadata";

export function ReactionChoicePanel({
  context,
  units,
  onResolve,
}: {
  context: Record<string, unknown>;
  units?: PlayerView["rosterUnits"];
  onResolve: (choice: ResolveRollChoice) => void;
}) {
  const { language, t } = useI18n();
  const reactorId = String(context.reactorUnitId ?? "");
  const targets = Array.isArray(context.targetUnitIds)
    ? context.targetUnitIds.filter((id): id is string => typeof id === "string")
    : [];
  const label = (id: string) =>
    units?.[id] ? getUnitFigureDisplayName(units[id], { language, t }) : id;
  return (
    <div className="w-full space-y-3" data-testid="reaction-choice-panel">
      <h3 className="font-semibold">{t("pending.reactionTitle")}</h3>
      {targets.map((targetId) => (
        <div key={targetId} className="space-y-2">
          <p>
            {t("pending.reactionPrompt", { reactor: label(reactorId), target: label(targetId) })}
          </p>
          <button
            type="button"
            className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-stone-950"
            onClick={() => onResolve({ type: "resolveReactionChoice", choice: "attack", targetId })}
          >
            {t("pending.reactionAttack")}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="rounded-lg bg-slate-200 px-4 py-2 font-semibold text-slate-900"
        onClick={() => onResolve({ type: "resolveReactionChoice", choice: "pass" })}
      >
        {t("pending.reactionPass")}
      </button>
    </div>
  );
}
