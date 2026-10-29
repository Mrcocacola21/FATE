import { useEffect, useState, type ReactNode } from "react";
import type { DraftPhase, DraftState, PlayerId, RuleDeclarationId } from "rules";
import { useI18n, type Translate } from "../i18n";
import type { DraftClientChoice } from "../ws";
import {
  RULE_DECLARATION_IDS,
  RuleDeclarationChoiceView,
  ruleDeclarationKey,
} from "../game/gameshell-content/components/RuleDeclarationChoicePanel";

type Names = { P1: string; P2: string };

const STEPS = ["initiative", "right", "sides", "rule"] as const;
type Step = (typeof STEPS)[number];

function stepOf(phase: DraftPhase): Step {
  if (phase === "draftSide" || phase === "fieldSide") return "sides";
  if (phase === "initiative" || phase === "right" || phase === "rule") return phase;
  return "rule";
}

function other(player: PlayerId): PlayerId {
  return player === "P1" ? "P2" : "P1";
}

type Option<T extends string> = { value: T; title: string; detail: string };

/** Two weighty choices: select one, then confirm. */
function ChoiceCards<T extends string>({
  options,
  disabled,
  busy,
  confirmLabel,
  t,
  onConfirm,
}: {
  options: Option<T>[];
  disabled: boolean;
  busy: boolean;
  confirmLabel: string;
  t: Translate;
  onConfirm: (value: T) => void;
}) {
  const [selected, setSelected] = useState<T | null>(null);
  return (
    <div className="draft-prep__choice">
      <div className="draft-prep__options" role="radiogroup">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected === option.value}
            className="draft-prep__option"
            data-testid={`draft-option-${option.value}`}
            disabled={disabled || busy}
            onClick={() => setSelected(option.value)}
          >
            <span className="draft-prep__option-title">{option.title}</span>
            <span className="draft-prep__option-detail">{option.detail}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary draft-prep__confirm"
        data-testid="draft-option-confirm"
        disabled={!selected || disabled || busy}
        aria-busy={busy}
        onClick={() => selected && onConfirm(selected)}
      >
        {busy ? t("draft.confirming") : selected ? confirmLabel : t("draftPrep.selectFirst")}
      </button>
    </div>
  );
}

function Die({ value }: { value: number | null }) {
  return (
    <span className="draft-prep__die" data-empty={value === null || undefined}>
      {value ?? "?"}
    </span>
  );
}

/**
 * The privilege steps before the bans: both roll 2d6, the higher roll keeps one right (draft
 * order or field), each holder picks a side, the rule chooser names the rule. A ledger beside
 * the stage keeps every settled decision in view.
 */
export function DraftPrivileges({
  draft,
  seat,
  names,
  clientLog,
  onChoice,
}: {
  draft: DraftState;
  seat: PlayerId | null;
  names: Names;
  clientLog: string[];
  onChoice: (choice: DraftClientChoice) => void;
}) {
  const { t } = useI18n();
  const privileges = draft.privileges!;
  const [submission, setSubmission] = useState<{ history: number; log: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ruleId, setRuleId] = useState<RuleDeclarationId | null>(null);
  const mine = !!seat && seat === draft.currentPlayer;
  const current = names[draft.currentPlayer];
  const step = stepOf(draft.phase);

  useEffect(() => {
    if (!submission) return;
    if (draft.history.length > submission.history) {
      setSubmission(null);
      setError(null);
      return;
    }
    const newLog = clientLog.slice(submission.log);
    const rejection = newLog[newLog.length - 1];
    if (rejection) {
      setSubmission(null);
      const key = `draft.lockReasons.${rejection}`;
      const reason = t(key);
      setError(reason === key ? t("errors.actionRejected") : reason);
    }
  }, [clientLog, draft.history.length, submission, t]);

  const send = (choice: DraftClientChoice) => {
    if (!mine || submission) return;
    setError(null);
    setSubmission({ history: draft.history.length, log: clientLog.length });
    onChoice(choice);
  };
  const busy = !!submission;
  const waiting = (key: string) => (
    <p className="draft-prep__waiting" role="status">
      <span className="draft-prep__pulse" aria-hidden="true" />
      {t(key, { player: current })}
    </p>
  );

  const rolls = draft.history.filter((event) => event.type === "roll");
  const lastEvent = draft.history[draft.history.length - 1];
  const tie =
    draft.phase === "initiative" &&
    !privileges.rolls.P1 &&
    !privileges.rolls.P2 &&
    lastEvent?.type === "roll" &&
    rolls.length >= 2;
  const tieSum = tie && lastEvent?.type === "roll" ? lastEvent.dice[0] + lastEvent.dice[1] : null;

  let stage: ReactNode;
  if (draft.phase === "initiative") {
    stage = (
      <div className="draft-prep__duel">
        {(["P1", "P2"] as const).map((player, index) => {
          const dice = privileges.rolls[player];
          return (
            <div key={player} className="draft-prep__duelist-wrap">
              {index === 1 && (
                <span className="draft-prep__vs" aria-hidden="true">
                  {t("customLobby.vs")}
                </span>
              )}
              <div
                className="draft-prep__duelist"
                data-active={draft.currentPlayer === player || undefined}
                data-mine={seat === player || undefined}
              >
                <span className="draft-prep__seat">{player}</span>
                <strong className="draft-prep__name">{names[player]}</strong>
                <span className="draft-prep__dice" aria-label={dice ? t("draftPrep.rolled", { value: dice[0] + dice[1] }) : t("draftPrep.notRolled")}>
                  <Die value={dice?.[0] ?? null} />
                  <Die value={dice?.[1] ?? null} />
                </span>
                <span className="draft-prep__sum">{dice ? dice[0] + dice[1] : "—"}</span>
              </div>
            </div>
          );
        })}
        <div className="draft-prep__actions">
          {tie && (
            <p className="draft-prep__note" role="status">
              {t("draftPrep.tie", { value: tieSum ?? 0 })}
            </p>
          )}
          {mine ? (
            <button
              type="button"
              className="btn btn-primary draft-prep__confirm"
              data-testid="draft-roll"
              disabled={busy}
              aria-busy={busy}
              onClick={() => send({ type: "roll" })}
            >
              {busy ? t("draft.confirming") : t("draftPrep.roll")}
            </button>
          ) : (
            waiting("draftPrep.waitingRoll")
          )}
        </div>
      </div>
    );
  } else if (draft.phase === "right") {
    stage = mine ? (
      <ChoiceCards
        key={draft.phase}
        options={[
          { value: "draft", title: t("draftPrep.rightDraft"), detail: t("draftPrep.rightDraftDetail") },
          { value: "field", title: t("draftPrep.rightField"), detail: t("draftPrep.rightFieldDetail") },
        ]}
        disabled={!mine}
        busy={busy}
        confirmLabel={t("draftPrep.confirmRight")}
        t={t}
        onConfirm={(right) => send({ type: "chooseRight", right })}
      />
    ) : (
      waiting("draftPrep.waitingRight")
    );
  } else if (draft.phase === "draftSide") {
    stage = mine ? (
      <ChoiceCards
        key={draft.phase}
        options={[
          { value: "first", title: t("draftPrep.sideFirst"), detail: t("draftPrep.sideFirstDetail") },
          { value: "last", title: t("draftPrep.sideLast"), detail: t("draftPrep.sideLastDetail") },
        ]}
        disabled={!mine}
        busy={busy}
        confirmLabel={t("draftPrep.confirmSide")}
        t={t}
        onConfirm={(side) => send({ type: "chooseDraftSide", side })}
      />
    ) : (
      waiting("draftPrep.waitingDraftSide")
    );
  } else if (draft.phase === "fieldSide") {
    stage = mine ? (
      <ChoiceCards
        key={draft.phase}
        options={[
          { value: "placeFirst", title: t("draftPrep.placeFirst"), detail: t("draftPrep.placeFirstDetail") },
          { value: "chooseRule", title: t("draftPrep.chooseRule"), detail: t("draftPrep.chooseRuleDetail") },
        ]}
        disabled={!mine}
        busy={busy}
        confirmLabel={t("draftPrep.confirmSide")}
        t={t}
        onConfirm={(side) => send({ type: "chooseFieldSide", side })}
      />
    ) : (
      waiting("draftPrep.waitingFieldSide")
    );
  } else {
    stage = (
      <RuleDeclarationChoiceView
        availableRuleIds={[...RULE_DECLARATION_IDS]}
        selectedRuleId={ruleId}
        canChoose={mine}
        isConfirming={busy}
        error={null}
        initiativeWinner={privileges.initiativeWinner ? names[privileges.initiativeWinner] : "—"}
        chooserPlayer={current}
        t={t}
        onSelect={(id) => {
          if (!busy) setRuleId(id);
        }}
        onConfirm={() => ruleId && send({ type: "chooseRule", ruleId })}
      />
    );
  }

  const holder = (player: PlayerId | null) => (player ? names[player] : "—");
  const ledger: Array<[string, string]> = [
    [
      t("draftPrep.ledgerInitiative"),
      privileges.initiativeWinner
        ? t("draftPrep.ledgerInitiativeValue", {
            player: names[privileges.initiativeWinner],
            p1: privileges.rolls.P1 ? privileges.rolls.P1[0] + privileges.rolls.P1[1] : "—",
            p2: privileges.rolls.P2 ? privileges.rolls.P2[0] + privileges.rolls.P2[1] : "—",
          })
        : "—",
    ],
    [t("draftPrep.rightDraft"), holder(privileges.draftHolder)],
    [t("draftPrep.rightField"), holder(privileges.fieldHolder)],
    [t("draftPrep.ledgerFirstPick"), holder(privileges.firstPicker)],
    [t("draftPrep.ledgerPlacesFirst"), holder(privileges.placementFirst)],
    [
      t("draftPrep.ledgerRule"),
      privileges.ruleId
        ? t(`ruleDeclarations.${ruleDeclarationKey(privileges.ruleId)}.name`)
        : privileges.placementFirst
          ? t("draftPrep.ledgerRuleBy", { player: names[other(privileges.placementFirst)] })
          : "—",
    ],
  ];

  return (
    <section className="draft-prep" aria-labelledby="draft-prep-title" data-testid="draft-privileges">
      <div className="draft-prep__main">
        <header className="draft-prep__head">
          <p className="draft-prep__kicker">{t("draftPrep.kicker")}</p>
          <h2 id="draft-prep-title" className="draft-prep__title">
            {t(`draftPrep.title.${draft.phase}`)}
          </h2>
          <p className="draft-prep__lead">{t(`draftPrep.lead.${draft.phase}`)}</p>
        </header>
        <ol className="draft-prep__steps" aria-label={t("draftPrep.stepsLabel")}>
          {STEPS.map((item, index) => {
            const state =
              index < STEPS.indexOf(step) ? "done" : item === step ? "current" : "next";
            return (
              <li key={item} data-state={state} aria-current={state === "current" ? "step" : undefined}>
                <span className="draft-prep__step-mark" aria-hidden="true" />
                {t(`draftPrep.step.${item}`)}
              </li>
            );
          })}
        </ol>
        <div className="draft-prep__stage">{stage}</div>
        {error && (
          <p role="alert" className="draft-prep__error">
            {error}
          </p>
        )}
      </div>
      <aside className="draft-prep__ledger" aria-label={t("draftPrep.ledgerTitle")}>
        <h3>{t("draftPrep.ledgerTitle")}</h3>
        <dl>
          {ledger.map(([label, value]) => (
            <div key={label} data-settled={value !== "—" || undefined}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="draft-prep__ledger-note">{t("draftPrep.ledgerNote")}</p>
      </aside>
    </section>
  );
}
