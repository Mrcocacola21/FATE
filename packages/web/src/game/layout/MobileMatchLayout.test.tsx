import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomNav } from "../../ui/BottomNav";
import { ResponsiveMatchLayout } from "../../layout/ResponsiveMatchLayout";
import { DesktopMatchScaffold, MobileBattleScaffold } from "./MatchScaffolds";
import {
  hasMobileMatchStarted,
  resetMobilePanel,
  toggleMobilePanel,
} from "./mobilePanelState";

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

test("starting a match resets stale mobile panel state", () => {
  assert.deepEqual(resetMobilePanel(), { activeTab: "unit", open: false });
});

test("an initiative pending roll exits the mobile room lobby before phase changes", () => {
  assert.equal(hasMobileMatchStarted("lobby", null), false);
  assert.equal(
    hasMobileMatchStarted("lobby", {
      id: "initiative-p1",
      kind: "initiativeRoll",
      player: "P1",
    }),
    true,
  );
  assert.equal(hasMobileMatchStarted("placement", null), true);
});

function renderMatchSwitchAt(width: number) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { innerWidth: width },
  });
  try {
    return renderToStaticMarkup(
      <ResponsiveMatchLayout
        mobile={<div data-testid="mobile-match-layout" />}
        desktop={<div data-testid="desktop-match-layout" />}
      />,
    );
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("Match shell selects mobile at 390px and desktop at 1024px", () => {
  assert.match(renderMatchSwitchAt(390), /data-testid="mobile-match-layout"/);
  assert.match(renderMatchSwitchAt(1024), /data-testid="desktop-match-layout"/);
});

test("desktop match scaffold keeps its desktop side panel marker", () => {
  const desktop = DesktopMatchScaffold({
    topBar: null,
    board: null,
    sidePanel: <div>Panel</div>,
  });
  const markup = renderToStaticMarkup(desktop);
  assert.match(markup, /data-testid="desktop-match-panel"/);
});

test("mobile match scaffold keeps the board, current task, and bottom navigation", () => {
  const scaffold = MobileBattleScaffold({
    topBar: <div>Top bar</div>,
    board: <div>Board</div>,
    currentTask: <div>Current task</div>,
    bottomNav: (
      <BottomNav
        value={null}
        ariaLabel="Battle panels"
        items={[{ value: "unit", label: "Unit", glyph: "U" }]}
        onChange={() => undefined}
      />
    ),
    bottomSheet: null,
  });

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

  function containsBottomNav(node: ReactNode): boolean {
    if (!isValidElement(node)) return false;
    const element = node as ReactElement<Record<string, unknown>>;
    if (element.type === BottomNav) return true;
    return Children.toArray(element.props.children as ReactNode).some(containsBottomNav);
  }

  assert.ok(findByTestId(scaffold, "mobile-board-stage"));
  assert.ok(findByTestId(scaffold, "mobile-current-task"));
  assert.ok(containsBottomNav(scaffold));
});
