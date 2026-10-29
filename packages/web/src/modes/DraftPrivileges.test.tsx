import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { applyDraftChoice, createSafeClassDraftState, type DraftChoice, type DraftState, type PlayerId } from "rules";
import { setLanguage } from "../i18n";
import type { DraftClientChoice } from "../ws";
import { DraftPrivileges } from "./DraftPrivileges";

const names = { P1: "Mira", P2: "Drozd" };

function advance(state: DraftState, player: PlayerId, choice: DraftChoice) {
  const result = applyDraftChoice(state, player, choice);
  assert(result.ok, `${choice.type} accepted`);
  return result.state;
}

function mount(draft: DraftState, seat: PlayerId | null, sent: DraftClientChoice[] = []) {
  setLanguage("en", null);
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <DraftPrivileges
        draft={draft}
        seat={seat}
        names={names}
        clientLog={[]}
        onChoice={(choice) => sent.push(choice)}
      />,
    );
  });
  return renderer;
}

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

test("the roller gets the roll button; the other player sees whose turn it is", () => {
  const draft = createSafeClassDraftState();
  const sent: DraftClientChoice[] = [];
  const roller = mount(draft, "P1", sent);
  try {
    act(() => roller.root.findByProps({ "data-testid": "draft-roll" }).props.onClick());
    assert.deepEqual(sent, [{ type: "roll" }]);
    assert.equal(
      roller.root.findByProps({ "data-testid": "draft-roll" }).props.disabled,
      true,
      "a sent roll waits for the server",
    );
  } finally {
    act(() => roller.unmount());
  }
  const watcher = mount(draft, "P2");
  try {
    assert.equal(watcher.root.findAllByProps({ "data-testid": "draft-roll" }).length, 0);
    assert.match(text(watcher), /Mira is rolling/);
  } finally {
    act(() => watcher.unmount());
  }
});

test("the roll winner selects a right and confirms it; the ledger shows the roll", () => {
  let draft = createSafeClassDraftState();
  draft = advance(draft, "P1", { type: "roll", dice: [6, 5] });
  draft = advance(draft, "P2", { type: "roll", dice: [2, 2] });
  const sent: DraftClientChoice[] = [];
  const renderer = mount(draft, "P1", sent);
  try {
    const confirm = () => renderer.root.findByProps({ "data-testid": "draft-option-confirm" });
    assert.equal(confirm().props.disabled, true, "nothing is sent before a choice");
    act(() => renderer.root.findByProps({ "data-testid": "draft-option-field" }).props.onClick());
    act(() => confirm().props.onClick());
    assert.deepEqual(sent, [{ type: "chooseRight", right: "field" }]);
    assert.match(text(renderer), /Mira · 11:4/);
  } finally {
    act(() => renderer.unmount());
  }
});

test("the rule is chosen before the bans by the player who did not take first placement", () => {
  let draft = createSafeClassDraftState();
  draft = advance(draft, "P1", { type: "roll", dice: [6, 5] });
  draft = advance(draft, "P2", { type: "roll", dice: [2, 2] });
  draft = advance(draft, "P1", { type: "chooseRight", right: "draft" });
  draft = advance(draft, "P1", { type: "chooseDraftSide", side: "first" });
  draft = advance(draft, "P2", { type: "chooseFieldSide", side: "placeFirst" });
  assert.equal(draft.phase, "rule");
  const sent: DraftClientChoice[] = [];
  const renderer = mount(draft, "P1", sent);
  try {
    act(() => renderer.root.findByProps({ "data-testid": "rule-select-court" }).props.onClick());
    act(() => renderer.root.findByProps({ "data-testid": "confirm-rule" }).props.onClick());
    assert.deepEqual(sent, [{ type: "chooseRule", ruleId: "court" }]);
    assert.match(text(renderer), /Places first/);
  } finally {
    act(() => renderer.unmount());
  }
});
