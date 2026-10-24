import assert from "node:assert/strict";
import test from "node:test";
import type { ComponentProps } from "react";
import { act, create } from "react-test-renderer";
import type { PapyrusLineAxis } from "rules";
import { setLanguage } from "../../../i18n";
import { syncPapyrusLineAxis } from "../hooks/useGameShellCoreState";
import { PendingBoardNotice } from "./PendingBoardNotice";

type NoticeProps = ComponentProps<typeof PendingBoardNotice>;

function noticeProps(overrides: Partial<NoticeProps>): NoticeProps {
  // The is*Choice flags stay unset (falsy); only the charged-impulse branch is exercised here.
  return {
    pendingRollKind: "chargedImpulseTargetChoice",
    pendingQueueCount: 0,
    stakeSelections: [],
    stakeLimit: 0,
    hassanAssassinOrderSelections: [],
    groznyTyrantAllowSkip: false,
    onResolveChoice: () => undefined,
    onResolveSkip: () => undefined,
    onConfirmStakePlacement: () => undefined,
    onClearStakeSelections: () => undefined,
    onConfirmHassanAssassinOrder: () => undefined,
    onClearHassanAssassinOrder: () => undefined,
    ...overrides,
  } as NoticeProps;
}

test("Cool Guy impulse prompt offers all four line directions", () => {
  setLanguage("en", null);
  const chosen: PapyrusLineAxis[] = [];
  const renderer = create(
    <PendingBoardNotice
      {...noticeProps({
        pendingRollContext: { abilityId: "papyrusCoolGuy", unitId: "P1-spearman-2" },
        papyrusLineAxis: "row",
        onSetPapyrusLineAxis: (axis) => chosen.push(axis),
      })}
    />,
  );
  const group = renderer.root.findByProps({ "data-testid": "papyrus-cool-guy-axis" });
  const buttons = group.findAllByType("button");
  assert.equal(buttons.length, 4, "horizontal, vertical and both diagonals should be selectable");
  act(() => buttons.forEach((button) => button.props.onClick()));
  assert.deepEqual(chosen, ["row", "col", "diagMain", "diagAnti"]);
  renderer.unmount();
});

test("other charged impulses do not show the Papyrus axis picker", () => {
  setLanguage("en", null);
  const renderer = create(
    <PendingBoardNotice
      {...noticeProps({
        pendingRollContext: { abilityId: "jackRipperSnares", unitId: "P1-assassin-1" },
        onSetPapyrusLineAxis: () => undefined,
      })}
    />,
  );
  assert.equal(renderer.root.findAllByProps({ "data-testid": "papyrus-cool-guy-axis" }).length, 0);
  renderer.unmount();
});

test("a locally chosen Papyrus axis is not snapped back to the stored axis", () => {
  const papyrus = { id: "P1-spearman-2", heroId: "papyrus" };
  const first = syncPapyrusLineAxis(null, papyrus);
  assert.deepEqual(first, { key: "P1-spearman-2:row", axis: "row" }, "selecting Papyrus adopts the stored axis once");
  const again = syncPapyrusLineAxis(first.key, papyrus);
  assert.equal(again.axis, null, "re-rendering the same Papyrus must keep the player's local choice");
  const stored = syncPapyrusLineAxis(again.key, { ...papyrus, papyrusLineAxis: "diagAnti" as const });
  assert.equal(stored.axis, "diagAnti", "a new server-stored axis is adopted");
  assert.deepEqual(syncPapyrusLineAxis(stored.key, { id: "x", heroId: "sans" }), { key: null, axis: null });
});
