import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { PlayerId, RuleDeclarationId } from "rules";
import type { Translate } from "../../../i18n";

export interface RuleDeclarationChoice {
  type: "chooseRuleDeclaration";
  ruleId: RuleDeclarationId;
}

interface ActionResult {
  ok: boolean;
  error?: string;
}

interface RuleDeclarationSubmissionGate {
  tryStart: (
    selectedRuleId: RuleDeclarationId | null,
    canChoose: boolean,
  ) => RuleDeclarationChoice | null;
  reset: () => void;
}

export function createRuleDeclarationSubmissionGate(): RuleDeclarationSubmissionGate {
  let inFlight = false;
  return {
    tryStart(selectedRuleId, canChoose) {
      if (!selectedRuleId || !canChoose || inFlight) return null;
      inFlight = true;
      return { type: "chooseRuleDeclaration", ruleId: selectedRuleId };
    },
    reset() {
      inFlight = false;
    },
  };
}

export const RULE_DECLARATION_IDS: RuleDeclarationId[] = [
  "normal_rule",
  "court",
  "chess_party",
  "moon_game",
  "advantage_game",
];

export function ruleDeclarationKey(ruleId: RuleDeclarationId) {
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
  }
}

export function isRuleDeclarationId(value: unknown): value is RuleDeclarationId {
  return typeof value === "string" && RULE_DECLARATION_IDS.includes(value as RuleDeclarationId);
}

interface RuleDeclarationChoiceViewProps {
  availableRuleIds: RuleDeclarationId[];
  selectedRuleId: RuleDeclarationId | null;
  canChoose: boolean;
  isConfirming: boolean;
  error: string | null;
  initiativeWinner: string;
  chooserPlayer: string;
  t: Translate;
  onSelect: (ruleId: RuleDeclarationId) => void;
  onConfirm: () => void;
}

export function RuleDeclarationChoiceView({
  availableRuleIds,
  selectedRuleId,
  canChoose,
  isConfirming,
  error,
  initiativeWinner,
  chooserPlayer,
  t,
  onSelect,
  onConfirm,
}: RuleDeclarationChoiceViewProps) {
  const selectedKey = selectedRuleId ? ruleDeclarationKey(selectedRuleId) : null;
  const stopDetailsClick = (event: MouseEvent<HTMLElement>) => event.stopPropagation();

  return (
    <div className="grid w-full grid-cols-1 gap-3">
      <div className="text-xs text-slate-500 dark:text-slate-300">
        {t("ruleDeclarations.initiativeWinner", { player: initiativeWinner })}
        {" / "}
        {t("ruleDeclarations.chooser", { player: chooserPlayer })}
      </div>
      <div className="text-sm leading-5 text-slate-700 dark:text-slate-200">
        {t("ruleDeclarations.selectionInstructions")}
      </div>
      <div className="grid grid-cols-1 gap-3" role="radiogroup" aria-label={t("ruleDeclarations.chooseTitle")}>
        {availableRuleIds.map((ruleId) => {
          const key = ruleDeclarationKey(ruleId);
          const name = t(`ruleDeclarations.${key}.name`);
          const isDefaultRule = ruleId === "normal_rule";
          const isSelected = selectedRuleId === ruleId;
          return (
            <div
              key={ruleId}
              data-testid={`rule-card-${ruleId}`}
              className={`rounded-xl border p-3 text-slate-900 shadow-sm transition dark:text-slate-100 ${
                isSelected
                  ? "border-violet-500 bg-violet-50 ring-2 ring-violet-400/45 shadow-violet-500/20 dark:border-violet-300 dark:bg-violet-950/55 dark:ring-violet-400/40"
                  : isDefaultRule
                    ? "border-emerald-300/80 bg-emerald-50/90 dark:border-emerald-800/80 dark:bg-emerald-950/35"
                    : "border-violet-300/60 bg-white/85 dark:border-violet-800/70 dark:bg-slate-950/80"
              }`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!canChoose || isConfirming}
                data-testid={`rule-select-${ruleId}`}
                className="w-full rounded-lg text-left outline-none transition enabled:cursor-pointer enabled:hover:bg-violet-100/60 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-default dark:enabled:hover:bg-violet-900/25"
                onClick={() => onSelect(ruleId)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      <span>{name}</span>
                      {isSelected && (
                        <span className="status-pill badge-special" data-testid="selected-rule-badge">
                          <span aria-hidden="true">✓</span> {t("ruleDeclarations.selected")}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {t(`ruleDeclarations.${key}.summary`)}
                    </div>
                  </div>
                  <span
                    className={`status-pill shrink-0 ${
                      isDefaultRule ? "badge-success" : "badge-special"
                    }`}
                  >
                    {isDefaultRule
                      ? t("ruleDeclarations.defaultRule")
                      : ruleId === "chess_party" || ruleId === "advantage_game"
                        ? t("ruleDeclarations.setupRequired")
                        : t("ruleDeclarations.noSetup")}
                  </span>
                </div>
              </button>
              <details className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                <summary
                  className="cursor-pointer rounded font-semibold outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  data-testid={`rule-details-${ruleId}`}
                  onClick={stopDetailsClick}
                >
                  {t("common.details")}
                </summary>
                <div className="mt-1">{t(`ruleDeclarations.${key}.description`)}</div>
                <div className="mt-1 font-semibold">{t(`ruleDeclarations.${key}.timing`)}</div>
              </details>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 z-20 -mx-1 mt-1 border-t border-violet-300/60 bg-white/95 px-1 pb-1 pt-3 shadow-[0_-12px_20px_-16px_rgba(76,29,149,0.7)] backdrop-blur dark:border-violet-800/70 dark:bg-slate-950/95">
        {error && (
          <div className="mb-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200" role="alert">
            {error}
          </div>
        )}
        {canChoose ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {selectedKey
                ? t("ruleDeclarations.selectedRule", {
                    rule: t(`ruleDeclarations.${selectedKey}.name`),
                  })
                : t("ruleDeclarations.selectRuleFirst")}
            </div>
            <button
              type="button"
              data-testid="confirm-rule"
              disabled={!selectedRuleId || isConfirming}
              className="rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-900/20 transition enabled:hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-500 dark:text-slate-950 dark:enabled:hover:bg-violet-400 dark:focus-visible:ring-offset-slate-950"
              onClick={onConfirm}
            >
              {isConfirming
                ? t("ruleDeclarations.confirming")
                : selectedRuleId
                  ? t("ruleDeclarations.confirmRule")
                  : t("ruleDeclarations.selectRuleFirst")}
            </button>
          </div>
        ) : (
          <div className="text-sm font-semibold text-slate-600 dark:text-slate-300" data-testid="rule-waiting">
            {t("ruleDeclarations.waiting")}
          </div>
        )}
      </div>
    </div>
  );
}

interface RuleDeclarationChoicePanelProps {
  availableRuleIds: RuleDeclarationId[];
  playerId: PlayerId;
  chooserPlayer: PlayerId;
  initiativeWinner: string;
  lastActionResult: ActionResult | null;
  t: Translate;
  onConfirm: (choice: RuleDeclarationChoice) => void;
}

export function RuleDeclarationChoicePanel({
  availableRuleIds,
  playerId,
  chooserPlayer,
  initiativeWinner,
  lastActionResult,
  t,
  onConfirm,
}: RuleDeclarationChoicePanelProps) {
  const [selectedRuleId, setSelectedRuleId] = useState<RuleDeclarationId | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gateRef = useRef<RuleDeclarationSubmissionGate | null>(null);
  const resultAtSubmissionRef = useRef<ActionResult | null>(null);
  if (!gateRef.current) gateRef.current = createRuleDeclarationSubmissionGate();
  const canChoose = playerId === chooserPlayer;

  useEffect(() => {
    if (!isConfirming || lastActionResult === resultAtSubmissionRef.current) return;
    if (!lastActionResult || lastActionResult.ok) return;
    gateRef.current?.reset();
    setIsConfirming(false);
    setError(lastActionResult.error || t("errors.actionRejected"));
  }, [isConfirming, lastActionResult, t]);

  const handleSelect = (ruleId: RuleDeclarationId) => {
    if (!canChoose || isConfirming) return;
    setSelectedRuleId(ruleId);
    setError(null);
  };

  const handleConfirm = () => {
    const choice = gateRef.current?.tryStart(selectedRuleId, canChoose) ?? null;
    if (!choice) return;
    resultAtSubmissionRef.current = lastActionResult;
    setError(null);
    setIsConfirming(true);
    onConfirm(choice);
  };

  return (
    <RuleDeclarationChoiceView
      availableRuleIds={availableRuleIds}
      selectedRuleId={selectedRuleId}
      canChoose={canChoose}
      isConfirming={isConfirming}
      error={error}
      initiativeWinner={initiativeWinner}
      chooserPlayer={chooserPlayer}
      t={t}
      onSelect={handleSelect}
      onConfirm={handleConfirm}
    />
  );
}
