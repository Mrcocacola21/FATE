import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type { RuleDeclarationId } from "rules";
import type { Translate } from "../../../i18n";
import {
  createRuleDeclarationSubmissionGate,
  RuleDeclarationChoiceView,
  type RuleDeclarationChoice,
} from "./RuleDeclarationChoicePanel";

const availableRuleIds: RuleDeclarationId[] = ["normal_rule", "moon_game", "court"];

const t: Translate = (key, values) => {
  if (key === "ruleDeclarations.selectedRule") return `Selected: ${values?.rule}`;
  return key;
};

function findByTestId(node: ReactNode, testId: string): ReactElement | null {
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.props["data-testid"] === testId) return element;
  for (const child of Children.toArray(element.props.children as ReactNode)) {
    const found = findByTestId(child, testId);
    if (found) return found;
  }
  return null;
}

function renderChoiceView({
  selectedRuleId = null,
  canChoose = true,
  isConfirming = false,
  error = null,
  onSelect = () => undefined,
  onConfirm = () => undefined,
}: {
  selectedRuleId?: RuleDeclarationId | null;
  canChoose?: boolean;
  isConfirming?: boolean;
  error?: string | null;
  onSelect?: (ruleId: RuleDeclarationId) => void;
  onConfirm?: () => void;
} = {}) {
  return RuleDeclarationChoiceView({
    availableRuleIds,
    selectedRuleId,
    canChoose,
    isConfirming,
    error,
    initiativeWinner: "P1",
    chooserPlayer: "P2",
    t,
    onSelect,
    onConfirm,
  });
}

test("rule declaration starts unselected with Confirm disabled", () => {
  const view = renderChoiceView();
  const confirm = findByTestId(view, "confirm-rule");

  assert.ok(confirm);
  assert.equal(confirm.props.disabled, true);
  assert.equal(findByTestId(view, "selected-rule-badge"), null);
});

test("clicking a rule selects it locally and only Confirm sends the command", () => {
  let selectedRuleId: RuleDeclarationId | null = null;
  const submissions: RuleDeclarationChoice[] = [];
  const gate = createRuleDeclarationSubmissionGate();
  const onConfirm = () => {
    const choice = gate.tryStart(selectedRuleId, true);
    if (choice) submissions.push(choice);
  };

  const initialView = renderChoiceView({
    onSelect: (ruleId) => {
      selectedRuleId = ruleId;
    },
    onConfirm,
  });
  const moonCard = findByTestId(initialView, "rule-select-moon_game");
  assert.ok(moonCard);
  (moonCard.props.onClick as () => void)();

  assert.equal(selectedRuleId, "moon_game");
  assert.deepEqual(submissions, []);

  const selectedView = renderChoiceView({ selectedRuleId, onConfirm });
  const selectedMoonCard = findByTestId(selectedView, "rule-select-moon_game");
  const confirm = findByTestId(selectedView, "confirm-rule");
  assert.ok(selectedMoonCard);
  assert.ok(confirm);
  assert.equal(selectedMoonCard.props["aria-checked"], true);
  assert.equal(confirm.props.disabled, false);
  assert.ok(findByTestId(selectedView, "selected-rule-badge"));

  (confirm.props.onClick as () => void)();
  assert.deepEqual(submissions, [
    { type: "chooseRuleDeclaration", ruleId: "moon_game" },
  ]);
});

test("details toggle neither selects nor confirms a rule", () => {
  let selectedRuleId: RuleDeclarationId | null = null;
  let submitCount = 0;
  let propagationStopped = false;
  const view = renderChoiceView({
    onSelect: (ruleId) => {
      selectedRuleId = ruleId;
    },
    onConfirm: () => {
      submitCount += 1;
    },
  });
  const details = findByTestId(view, "rule-details-moon_game");
  assert.ok(details);

  (details.props.onClick as (event: { stopPropagation: () => void }) => void)({
    stopPropagation: () => {
      propagationStopped = true;
    },
  });

  assert.equal(propagationStopped, true);
  assert.equal(selectedRuleId, null);
  assert.equal(submitCount, 0);
});

test("submission gate blocks double Confirm and can recover after rejection", () => {
  const gate = createRuleDeclarationSubmissionGate();

  assert.deepEqual(gate.tryStart("court", true), {
    type: "chooseRuleDeclaration",
    ruleId: "court",
  });
  assert.equal(gate.tryStart("court", true), null);

  gate.reset();
  assert.deepEqual(gate.tryStart("court", true), {
    type: "chooseRuleDeclaration",
    ruleId: "court",
  });
});

test("non-chooser can inspect details but cannot select or confirm", () => {
  const view = renderChoiceView({ canChoose: false });
  const card = findByTestId(view, "rule-select-court");

  assert.ok(card);
  assert.equal(card.props.disabled, true);
  assert.equal(findByTestId(view, "confirm-rule"), null);
  assert.ok(findByTestId(view, "rule-waiting"));
  assert.ok(findByTestId(view, "rule-details-court"));
});

test("submission gate rejects missing selection and non-chooser submissions", () => {
  const gate = createRuleDeclarationSubmissionGate();
  assert.equal(gate.tryStart(null, true), null);
  assert.equal(gate.tryStart("normal_rule", false), null);
});
