import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DeliveredGameEvent, PlayerView } from "rules";
import { CombatRollFeedback } from "../../src/game/effects/CombatRollFeedback";
import { useVisualResolution } from "../../src/game/effects/useVisualResolution";
import { useCombatExchange } from "../../src/game/effects/useCombatExchange";
import { UnitMeleeContent } from "../../src/features/vfx/UnitMeleeContent";
import { usePresentationVisibility } from "../../src/game/effects/presentationVisibility";
import { PresentationSession } from "../../src/game/effects/presentationSession";
import type { BoardEventBatch } from "../../src/game/effects/types";
import { GlobalPendingTaskLayer } from "../../src/game/gameshell-content/components/GlobalPendingTaskLayer";
import { gameShellFixture } from "../../src/game/testHelpers/gameShellFixture";
import { setLanguage, useI18n } from "../../src/i18n";

// Browser-only deterministic evidence, never imported by the application.
const view = {
  boardSize: 9,
  units: {
    attacker: { id: "attacker", owner: "P1", hp: 6, isAlive: true, position: { col: 2, row: 1 } },
    target: { id: "target", owner: "P2", hp: 5, isAlive: true, position: { col: 2, row: 2 } },
  },
  pendingCombatQueueCount: 0,
} as unknown as PlayerView;
const session = new PresentationSession();
const binding = { roomId: "dice-fixture", recipient: "P2" };
let revision = 0;
function resetSession() {
  session.begin(binding);
  session.snapshot({ ...binding, streamId: "fixture", revision });
}
resetSession();

function Fixture() {
  const { t } = useI18n();
  const [batches, setBatches] = useState<BoardEventBatch[]>([]);
  const [sessionKey, setSessionKey] = useState(session.key);
  const [pending, setPending] = useState(false);
  const [viewer, setViewer] = useState<"P1" | "P2" | null>("P2");
  const [sent, setSent] = useState<unknown[]>([]);
  const enabled = usePresentationVisibility();
  const consume = useCallback(() => setBatches([]), []);
  const displayView = {
    ...view,
    pendingDecision: pending
      ? {
          type: "pendingDecision" as const,
          ownerPlayerId: "P2" as const,
          viewerCanRespond: true,
          decisionType: "attack_defenderRoll" as const,
        }
      : null,
  };
  const output = useVisualResolution({
    batch: null,
    batches,
    onBatchesConsumed: consume,
    view: displayView,
    enabled,
    sessionKey,
  });
  const exchange = useCombatExchange({
    cue: output.roll,
    batch: output.batch,
    view: displayView,
    enabled,
    sessionKey,
  });
  const pendingRoll = {
    id: "defender-decision",
    kind: "attack_defenderRoll" as const,
    player: "P2" as const,
    context: {},
    presentation: {
      title: "Defense Roll",
      reason: "The attacker rolled. Roll your defense dice.",
      rollKind: "defense" as const,
      requestedPlayerId: "P2" as const,
      diceLabel: "2d6",
    },
  };
  Object.assign(window, {
    diceTest: {
      reset(
        options: { pending?: boolean; viewer?: "P1" | "P2" | null; language?: "en" | "uk" } = {},
      ) {
        resetSession();
        setSessionKey(session.key);
        setBatches([]);
        setPending(options.pending ?? false);
        setViewer(options.viewer === undefined ? "P2" : options.viewer);
        setSent([]);
        setLanguage(options.language ?? "en");
      },
      receive(events: DeliveredGameEvent[], stale = false) {
        const accepted = session.receive(
          { streamId: "fixture", revision: ++revision, events },
          binding,
          view,
        );
        if (stale)
          accepted.forEach((batch) => {
            batch.receivedAt = Date.now() - 16000;
          });
        setBatches((current) => [...current, ...accepted]);
      },
      get sent() {
        return sent;
      },
    },
  });
  const vm = gameShellFixture({
    pendingRoll: pending ? pendingRoll : null,
    pendingMeta: pending ? pendingRoll : null,
    playerId: "P2",
    boardSelectionPending: false,
    view,
    lastActionResult: null,
    showAttackerRoll: false,
    attackerDice: [],
    tieBreakAttacker: [],
    sendAction: (action) => {
      setSent((current) => [...current, action]);
      setPending(false);
    },
  });
  return (
    <main
      data-testid="dice-fixture"
      className="min-h-screen bg-stone-100 p-6 text-stone-800 dark:bg-stone-900 dark:text-stone-200"
    >
      <div
        className="mx-auto mt-16 grid max-w-lg grid-cols-9 overflow-hidden rounded-xl border border-stone-400/30"
        aria-hidden="true"
      >
        {Array.from({ length: 81 }, (_, index) => {
          const unit = Object.values(view.units).find(
            (unit) =>
              unit.position?.col === index % 9 && unit.position.row === Math.floor(index / 9),
          );
          return (
            <div
              key={index}
              className={`aspect-square ${index % 2 ? "bg-stone-500/30" : "bg-stone-400/10"}`}
            >
              {unit && (
                <UnitMeleeContent
                  cellSize={40}
                  isFlipped={false}
                  preparing={
                    exchange.preparingUnitId === unit.id && !exchange.display?.reducedMotion
                  }
                  pose={output.visualAttackByUnitId[unit.id]}
                >
                  <div className="flex aspect-square items-center justify-center rounded-full border border-amber-500 bg-stone-700 text-lg font-bold text-white">
                    {unit.id === "attacker" ? "A" : "D"}
                  </div>
                </UnitMeleeContent>
              )}
            </div>
          );
        })}
      </div>
      <CombatRollFeedback cue={exchange.display} t={t} playerId={viewer} />
      <GlobalPendingTaskLayer vm={vm} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
