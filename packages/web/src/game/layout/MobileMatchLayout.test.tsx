import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomNav } from "../../ui/BottomNav";
import { BottomSheet } from "../../ui/BottomSheet";
import { setLanguage } from "../../i18n";
import { ResponsiveMatchLayout } from "../../layout/ResponsiveMatchLayout";
import { DesktopMatchScaffold, MobileBattleScaffold } from "./MatchScaffolds";
import {
  getMobileBoardInteractionKey,
  hasMobileMatchStarted,
  resetMobilePanel,
  shouldCloseMobileSheetForBoardInteraction,
  toggleMobilePanel,
} from "./mobilePanelState";
import {
  CurrentTaskPanel,
  hasActiveMobileTask,
} from "../gameshell-content/components/CurrentTaskPanel";

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

test("mobile task visibility omits idle state and includes placement and targeting", () => {
  const idle = { view: { phase: "battle" } };
  assert.equal(hasActiveMobileTask(idle), false);
  assert.equal(hasActiveMobileTask({ ...idle, actionMode: "attack" }), true);
  assert.equal(hasActiveMobileTask({ view: { phase: "placement" } }), true);
  assert.equal(hasActiveMobileTask({ ...idle, boardSelectionPending: true }), true);
  assert.equal(
    hasActiveMobileTask({
      ...idle,
      moveOptions: { unitId: "artemida", modes: ["normal", "trickster"] },
    }),
    true,
  );
});

test("mobile movement chooser remains a cancelable top task before board intent starts", () => {
  setLanguage("en", { setItem: () => undefined });
  const artemida = {
    id: "artemida",
    owner: "P1",
    class: "archer",
    heroId: "artemida",
    isAlive: true,
    position: { col: 2, row: 2 },
  };
  const markup = renderToStaticMarkup(
    <CurrentTaskPanel
      compact
      vm={{
        view: { phase: "battle" },
        pendingRoll: null,
        pendingMeta: null,
        actionMode: null,
        targetingMode: null,
        selectedUnit: artemida,
        moveOptions: { unitId: artemida.id, legalTo: [], modes: ["normal", "trickster"] },
        setMoveOptions: () => undefined,
        setActionMode: () => undefined,
      }}
    />,
  );
  assert.match(markup, /Artemis: choose movement mode/);
  assert.match(markup, /Cancel/);
  assert.doesNotMatch(markup, /No forced task/);
});

test("mobile targeting strip names the selected Oni Giri source and keeps cancel visible", () => {
  setLanguage("en", { setItem: () => undefined });
  const zoro = {
    id: "zoro",
    owner: "P1",
    class: "knight",
    heroId: "zoro",
    isAlive: true,
    position: { col: 1, row: 1 },
  };
  const markup = renderToStaticMarkup(
    <CurrentTaskPanel
      compact
      vm={{
        view: {
          phase: "battle",
          abilitiesByUnitId: {
            [zoro.id]: [
              {
                id: "zoroOniGiri",
                name: "Oni Giri",
                useOptions: [
                  {
                    id: "heroResource",
                    source: { type: "heroResource", resourceId: "zoroDetermination", amount: 2 },
                    sourceName: "Determination",
                  },
                ],
              },
            ],
          },
        },
        pendingRoll: null,
        pendingMeta: null,
        actionMode: "zoroOniGiri",
        targetingMode: {
          sourceUnitId: zoro.id,
          abilityId: "zoroOniGiri",
          step: "zoroOniGiri",
          useSource: { type: "heroResource", resourceId: "zoroDetermination", amount: 2 },
        },
        selectedUnitId: zoro.id,
        selectedUnit: zoro,
        newHeroAbilityTargetId: null,
        setActionMode: () => undefined,
        papyrusLineAxis: "row",
      }}
    />,
  );
  assert.match(markup, /Oni Giri.*Determination/);
  assert.match(markup, /choose an enemy on a straight line/i);
  assert.match(markup, /Cancel/);
});

test("mobile targeting strip names the selected Push Notification source", () => {
  setLanguage("en", { setItem: () => undefined });
  const duolingo = {
    id: "duolingo",
    owner: "P1",
    class: "trickster",
    heroId: "duolingo",
    isAlive: true,
    position: { col: 1, row: 1 },
  };
  const markup = renderToStaticMarkup(
    <CurrentTaskPanel
      compact
      vm={{
        view: {
          phase: "battle",
          abilitiesByUnitId: {
            [duolingo.id]: [
              {
                id: "duolingoPushNotification",
                name: "Push Notification",
                useOptions: [
                  {
                    id: "heroResource",
                    source: { type: "heroResource", resourceId: "duolingoSkipClasses", amount: 3 },
                    sourceName: "Missed Lessons",
                  },
                ],
              },
            ],
          },
        },
        pendingRoll: null,
        pendingMeta: null,
        actionMode: "duolingoPush",
        targetingMode: {
          sourceUnitId: duolingo.id,
          abilityId: "duolingoPushNotification",
          step: "duolingoPush",
          useSource: { type: "heroResource", resourceId: "duolingoSkipClasses", amount: 3 },
        },
        selectedUnitId: duolingo.id,
        selectedUnit: duolingo,
        newHeroAbilityTargetId: null,
        setActionMode: () => undefined,
        papyrusLineAxis: "row",
      }}
    />,
  );
  assert.match(markup, /Push Notification.*Missed Lessons/);
  assert.match(markup, /choose a creature/i);
  assert.match(markup, /Cancel/);
});

test("board interaction keys change for placement, targeting, and forced board choices", () => {
  assert.equal(getMobileBoardInteractionKey({}), null);
  assert.equal(
    getMobileBoardInteractionKey({ actionMode: "place", placeUnitId: "genghis" }),
    "place::genghis:",
  );
  assert.equal(
    getMobileBoardInteractionKey({ actionMode: "attack", targetingMode: "attack" }),
    "attack:attack::",
  );
  assert.equal(
    getMobileBoardInteractionKey({
      boardSelectionPending: true,
      pendingRoll: { id: "forced-reposition", kind: "donWindmillsRepositionChoice" },
    }),
    "pending:forced-reposition",
  );
  assert.notEqual(
    getMobileBoardInteractionKey({
      actionMode: "move",
      moveOptions: { unitId: "rider", modes: ["straight", "diagonal"] },
    }),
    getMobileBoardInteractionKey({ actionMode: "move", moveOptions: null }),
  );
  assert.equal(
    getMobileBoardInteractionKey({
      actionMode: "artemisSilverSickle",
      targetingMode: "artemidaSilverCrescent",
    }),
    "artemisSilverSickle:artemidaSilverCrescent::",
  );
});

test("mobile action sheet closes after selecting a board-targeted action", () => {
  const openedKey = getMobileBoardInteractionKey({});
  const targetingKey = getMobileBoardInteractionKey({
    actionMode: "zoroOniGiri",
    targetingMode: "zoroOniGiri",
  });
  assert.equal(openedKey, null);
  assert.ok(targetingKey);
  assert.equal(
    shouldCloseMobileSheetForBoardInteraction({
      sheetOpen: true,
      interactionKeyWhenOpened: openedKey,
      boardInteractionKey: targetingKey,
    }),
    true,
  );
  assert.equal(
    shouldCloseMobileSheetForBoardInteraction({
      sheetOpen: false,
      interactionKeyWhenOpened: openedKey,
      boardInteractionKey: targetingKey,
    }),
    false,
  );
});

test("mobile Silver Moon Sickle task asks for an endpoint and remains cancelable", () => {
  setLanguage("en", { setItem: () => undefined });
  const markup = renderToStaticMarkup(
    <CurrentTaskPanel
      compact
      vm={{
        view: { phase: "battle", abilitiesByUnitId: { artemida: [] } },
        pendingRoll: null,
        pendingMeta: null,
        actionMode: "artemisSilverSickle",
        targetingMode: {
          sourceUnitId: "artemida",
          abilityId: "artemidaSilverCrescent",
          step: "artemisSilverSickle",
        },
        selectedUnitId: "artemida",
        papyrusLineAxis: "row",
        undyneAxis: "row",
        setActionMode: () => undefined,
      }}
    />,
  );
  assert.match(markup, /Silver Moon Sickle/);
  assert.match(markup, /choose an endpoint on the attack line/i);
  assert.match(markup, /Cancel/);
});

test("an initiative pending roll exits the mobile room lobby before phase changes", () => {
  const lobbyView = {
    phase: "lobby",
    pendingRoll: null,
    initiative: { P1: null, P2: null, winner: null },
  } as any;
  assert.equal(hasMobileMatchStarted(lobbyView, null), false);
  assert.equal(
    hasMobileMatchStarted(lobbyView, {
      id: "initiative-p1",
      kind: "initiativeRoll",
      player: "P1",
    }),
    true,
  );
  assert.equal(hasMobileMatchStarted({ ...lobbyView, phase: "placement" }, null), true);
  assert.equal(
    hasMobileMatchStarted({ ...lobbyView, initiative: { P1: 11, P2: null, winner: null } }, null),
    true,
  );
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
    sidePanel: <div>{"Panel"}</div>,
  });
  const markup = renderToStaticMarkup(desktop);
  assert.match(markup, /data-testid="desktop-match-panel"/);
});

test("mobile match scaffold keeps the board, active task, and bottom navigation", () => {
  const scaffold = MobileBattleScaffold({
    topBar: <div>{"Top bar"}</div>,
    board: <div>{"Board"}</div>,
    currentTask: <div>{"Current task"}</div>,
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

test("mobile match scaffold does not reserve task space while idle", () => {
  const scaffold = MobileBattleScaffold({
    topBar: <div>{"Top bar"}</div>,
    board: <div>{"Board"}</div>,
    currentTask: null,
    bottomNav: null,
    bottomSheet: null,
  });
  const markup = renderToStaticMarkup(scaffold);
  assert.doesNotMatch(markup, /mobile-current-task/);
});

test("mobile placement task renders as a compact cancelable strip", () => {
  const markup = renderToStaticMarkup(
    <CurrentTaskPanel
      compact
      vm={{
        view: {
          phase: "placement",
          currentPlayer: "P1",
          units: {
            genghis: {
              id: "genghis",
              heroId: "genghis_khan",
              class: "rider",
              owner: "P1",
            },
          },
        },
        playerId: "P1",
        placeUnitId: "genghis",
        setActionMode: () => undefined,
        setPlaceUnitId: () => undefined,
      }}
    />,
  );
  assert.match(markup, /data-testid="mobile-active-task-strip"/);
  assert.doesNotMatch(markup, /No forced task/);
  assert.match(markup, /btn btn-secondary btn-sm shrink-0/);
});

test("mobile bottom sheet exposes its dialog and close control", () => {
  const markup = renderToStaticMarkup(
    <BottomSheet open title={"Actions"} onClose={() => undefined}>
      <div>{"Move"}</div>
    </BottomSheet>,
  );
  assert.match(markup, /data-testid="mobile-bottom-sheet"/);
  assert.match(markup, /<button type="button" class="btn btn-secondary btn-sm">/);
});
