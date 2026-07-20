import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { BottomNav } from "../../ui/BottomNav";
import { toggleMobilePanel } from "./mobilePanelState";

function findByPanel(node: ReactNode, panel: string): ReactElement | null {
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.props["data-panel"] === panel) return element;
  for (const child of Children.toArray(element.props.children as ReactNode)) {
    const found = findByPanel(child, panel);
    if (found) return found;
  }
  return null;
}

test("mobile bottom navigation exposes all battle panels and switches by tap", () => {
  let selected = "unit";
  const view = BottomNav({
    value: selected,
    ariaLabel: "Battle panels",
    items: [
      { value: "unit", label: "Unit", glyph: "U" },
      { value: "actions", label: "Actions", glyph: "A" },
      { value: "rules", label: "Rules", glyph: "R" },
      { value: "players", label: "Players", glyph: "P" },
      { value: "log", label: "Log", glyph: "L" },
    ],
    onChange: (value) => {
      selected = value;
    },
  });

  for (const panel of ["unit", "actions", "rules", "players", "log"]) {
    assert.ok(findByPanel(view, panel), `${panel} tab should render`);
  }
  const log = findByPanel(view, "log");
  assert.ok(log);
  (log.props.onClick as () => void)();
  assert.equal(selected, "log");
});

test("tapping the active mobile panel toggles its sheet closed", () => {
  assert.deepEqual(toggleMobilePanel({ activeTab: "unit", open: false }, "actions"), {
    activeTab: "actions",
    open: true,
  });
  assert.deepEqual(toggleMobilePanel({ activeTab: "actions", open: true }, "actions"), {
    activeTab: "actions",
    open: false,
  });
});
