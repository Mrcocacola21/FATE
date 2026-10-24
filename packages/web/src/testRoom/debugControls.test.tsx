import assert from "node:assert/strict";
import test from "node:test";
import { act, create } from "react-test-renderer";
import type { AbilityView, UnitState } from "rules";
import { CombatDebugControls } from "./CombatDebugControls";
import { ChargeDebugControls } from "./ChargeDebugControls";
import { TurnDebugControls } from "./TurnDebugControls";
import { TestRoomPresets } from "./TestRoomPresets";
import { setLanguage } from "../i18n";

const unit = (id: string, owner: "P1" | "P2"): UnitState => ({
  id, owner, isAlive: true, hp: 5, position: { col: 4, row: 4 }, charges: {},
}) as UnitState;

test("combat controls recover from deleted attacker and target and reject invalid queued dice", () => {
  setLanguage("en", { setItem: () => undefined });
  const first = unit("first", "P1"), second = unit("second", "P2"), third = unit("third", "P2");
  const props = { selectedUnit: first, legalTargets: [second.id], diceQueue: [], send: () => {}, sendAction: () => {} };
  const renderer = create(<CombatDebugControls {...props} units={[first, second, third]} />);
  try {
    const selects = () => renderer.root.findAllByType("select");
    act(() => selects()[0].props.onChange({ target: { value: second.id } }));
    act(() => selects()[1].props.onChange({ target: { value: third.id } }));
    act(() => renderer.update(<CombatDebugControls {...props} units={[first, second]} />));
    assert.equal(selects()[1].props.value, first.id);
    act(() => renderer.update(<CombatDebugControls {...props} units={[first, third]} />));
    assert.equal(selects()[0].props.value, first.id);
    assert.equal(selects()[1].props.value, third.id);
    const queue = renderer.root.findByProps({ placeholder: "6,6,1,1" });
    act(() => queue.props.onChange({ target: { value: "6,invalid" } }));
    assert.equal(renderer.root.findAllByType("button").find(button => button.children.includes("Queue"))!.props.disabled, true);
  } finally { act(() => renderer.unmount()); }
});

test("charge tools select board targeting and refresh edited charge values after server changes", () => {
  setLanguage("en", { setItem: () => undefined });
  const selected = unit("kaiser", "P1");
  const ability = { id: "kaiserDora", name: "Dora", kind: "phantasm", isAvailable: true, currentCharges: 4 } as AbilityView;
  const modes: string[] = [], actions: unknown[] = [];
  const props = { unit: selected, send: () => {}, sendAction: (action: unknown) => actions.push(action),
    onSelectMode: (mode: string) => modes.push(mode) };
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(<ChargeDebugControls {...props} abilities={[ability]} />); });
  try {
    const use = renderer.root.findAllByType("button").find(button => button.children.includes("Use"))!;
    assert.equal(use.props.disabled, false);
    act(() => use.props.onClick());
    assert.deepEqual(modes, ["dora"]);
    assert.deepEqual(actions, []);
    const input = () => renderer.root.findByType("input");
    act(() => input().props.onChange({ target: { value: "9" } }));
    assert.equal(input().props.value, 9);
    act(() => renderer.update(<ChargeDebugControls {...props} abilities={[{ ...ability, currentCharges: 0 }]} />));
    assert.equal(input().props.value, 0, "clear/fill must replace a stale local draft");
  } finally { act(() => renderer.unmount()); }
});

test("presets load directly on an empty board and otherwise ask in an in-app dialog", () => {
  setLanguage("en", { setItem: () => undefined });
  const sent: unknown[] = [];
  const send = (command: unknown) => sent.push(command);
  const preset = (renderer: ReturnType<typeof create>) =>
    renderer.root.findAllByType("button").find(button => button.children.includes("Transformations"))!;
  const dialogButton = (renderer: ReturnType<typeof create>, label: string) =>
    renderer.root.findByProps({ role: "dialog" }).findAllByType("button").find(button => button.children.includes(label));
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(<TestRoomPresets send={send} boardEmpty />); });
  try {
    act(() => preset(renderer).props.onClick());
    assert.deepEqual(sent, [{ type: "debugApplyPreset", presetId: "transformation" }]);
    assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 0);

    act(() => renderer.update(<TestRoomPresets send={send} />));
    act(() => preset(renderer).props.onClick());
    assert.equal(sent.length, 1, "a populated board must not be replaced without confirmation");
    act(() => dialogButton(renderer, "Cancel")!.props.onClick());
    assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 0);
    assert.equal(sent.length, 1);

    act(() => preset(renderer).props.onClick());
    act(() => dialogButton(renderer, "Confirm")!.props.onClick());
    assert.equal(sent.length, 2);
    assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 0);
  } finally { act(() => renderer.unmount()); }
});

test("phase control follows the authoritative phase and cannot start a dead unit", () => {
  setLanguage("en", { setItem: () => undefined });
  const props = { selectedUnit: { ...unit("dead", "P1"), isAlive: false }, send: () => {}, sendAction: () => {} };
  const renderer = create(<TurnDebugControls {...props} phase="battle" />);
  try {
    assert.equal(renderer.root.findByType("select").props.value, "battle");
    const start = renderer.root.findAllByType("button").find(button => button.children.includes("Simulate start turn"))!;
    assert.equal(start.props.disabled, true);
    act(() => renderer.update(<TurnDebugControls {...props} phase="placement" />));
    assert.equal(renderer.root.findByType("select").props.value, "placement");
  } finally { act(() => renderer.unmount()); }
});
