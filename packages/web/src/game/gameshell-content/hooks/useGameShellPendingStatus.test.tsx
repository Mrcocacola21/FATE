import assert from "node:assert/strict";
import test from "node:test";
import { act, create } from "react-test-renderer";
import type { PlayerView } from "rules";
import { setLanguage } from "../../../i18n";
import { useGameShellPendingStatus } from "./useGameShellPendingStatus";

type Status = ReturnType<typeof useGameShellPendingStatus>;

function statusFor(kind: string): Status {
  const view = {
    phase: "battle",
    units: {},
    pendingRoll: { id: "roll-1", kind, player: "P1", context: { options: ["normal"] } },
  } as unknown as PlayerView;
  let captured: Status | null = null;
  function Probe() {
    captured = useGameShellPendingStatus({
      view,
      roomMeta: null,
      roomId: "room",
      leavingRoom: false,
      leaveRoom: () => undefined,
      seat: "P1",
      playerId: "P1",
    });
    return null;
  }
  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(<Probe />);
  });
  act(() => renderer!.unmount());
  assert(captured, "hook should render");
  return captured;
}

test("Tyrant mode choice is handled by the task panel, not the roll modal", () => {
  setLanguage("en", null);
  const status = statusFor("groznyTyrantOptionChoice");
  assert.equal(status.isGroznyTyrantOptionChoice, true);
  assert.equal(
    status.boardSelectionPending,
    true,
    "the roll modal has no Tyrant buttons, so it must stay closed for this choice",
  );
});
