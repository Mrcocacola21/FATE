import type { Coord } from "rules";
import { getPendingRollLabel } from "../helpers";

interface PendingBoardNoticeProps {
  pendingRollKind: string;
  pendingQueueCount: number;
  stakeSelections: Coord[];
  stakeLimit: number;
  hassanAssassinOrderSelections: string[];
  isStakePlacement: boolean;
  isIntimidateChoice: boolean;
  isForestTarget: boolean;
  isForestMoveDestination: boolean;
  isForestChoice: boolean;
  isForestMoveCheck: boolean;
  isDuelistChoice: boolean;
  isChikatiloPlacement: boolean;
  isGuideTravelerPlacement: boolean;
  isRiverBoatCarryChoice: boolean;
  isRiverBoatDropDestination: boolean;
  isRiverTraLaLaTargetChoice: boolean;
  isRiverTraLaLaDestinationChoice: boolean;
  isJebeKhansShooterTargetChoice: boolean;
  isLokiLaughtChoice: boolean;
  isLokiChickenTargetChoice: boolean;
  isLokiMindControlEnemyChoice: boolean;
  isLokiMindControlTargetChoice: boolean;
  isHassanTrueEnemyTargetChoice: boolean;
  isAsgoreSoulParadePatienceTargetChoice: boolean;
  isAsgoreSoulParadePerseveranceTargetChoice: boolean;
  isAsgoreSoulParadeJusticeTargetChoice: boolean;
  isAsgoreSoulParadeIntegrityDestination: boolean;
  isHassanAssassinOrderSelection: boolean;
  isChikatiloRevealChoice: boolean;
  isChikatiloDecoyChoice: boolean;
  onResolveSkip: () => void;
  onConfirmStakePlacement: () => void;
  onClearStakeSelections: () => void;
  onConfirmHassanAssassinOrder: () => void;
  onClearHassanAssassinOrder: () => void;
}

export function PendingBoardNotice({
  pendingRollKind,
  pendingQueueCount,
  stakeSelections,
  stakeLimit,
  hassanAssassinOrderSelections,
  isStakePlacement,
  isIntimidateChoice,
  isForestTarget,
  isForestMoveDestination,
  isForestChoice,
  isForestMoveCheck,
  isDuelistChoice,
  isChikatiloPlacement,
  isGuideTravelerPlacement,
  isRiverBoatCarryChoice,
  isRiverBoatDropDestination,
  isRiverTraLaLaTargetChoice,
  isRiverTraLaLaDestinationChoice,
  isJebeKhansShooterTargetChoice,
  isLokiLaughtChoice,
  isLokiChickenTargetChoice,
  isLokiMindControlEnemyChoice,
  isLokiMindControlTargetChoice,
  isHassanTrueEnemyTargetChoice,
  isAsgoreSoulParadePatienceTargetChoice,
  isAsgoreSoulParadePerseveranceTargetChoice,
  isAsgoreSoulParadeJusticeTargetChoice,
  isAsgoreSoulParadeIntegrityDestination,
  isHassanAssassinOrderSelection,
  isChikatiloRevealChoice,
  isChikatiloDecoyChoice,
  onResolveSkip,
  onConfirmStakePlacement,
  onClearStakeSelections,
  onConfirmHassanAssassinOrder,
  onClearHassanAssassinOrder,
}: PendingBoardNoticeProps) {
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
      {isStakePlacement ? (
        <div>
          <div className="font-semibold">Place 3 stakes</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Selected: {stakeSelections.length}/{stakeLimit}
          </div>
          {stakeSelections.length > 0 && (
            <div className="mt-1 text-[10px] text-amber-700 dark:text-amber-200">
              {stakeSelections.map((pos) => `(${pos.col},${pos.row})`).join(", ")}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-lg bg-emerald-600 px-3 py-1 text-[10px] font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
              onClick={onConfirmStakePlacement}
              disabled={stakeSelections.length !== stakeLimit}
            >
              Place stakes
            </button>
            <button
              className="rounded-lg bg-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={onClearStakeSelections}
            >
              Clear
            </button>
          </div>
        </div>
      ) : isIntimidateChoice ? (
        <div>
          <div className="font-semibold">Intimidate: choose a push cell</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Click a highlighted cell or skip.
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            Skip
          </button>
        </div>
      ) : isForestTarget ? (
        <div>
          <div className="font-semibold">Forest of the Dead</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select the 3x3 center cell.
          </div>
        </div>
      ) : isForestMoveDestination ? (
        <div>
          <div className="font-semibold">Forest check failed</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Choose a highlighted destination inside the aura.
          </div>
        </div>
      ) : isForestChoice ? (
        <div>
          <div className="font-semibold">Forest of the Dead ready</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Decide whether to activate the phantasm.
          </div>
        </div>
      ) : isForestMoveCheck ? (
        <div>
          <div className="font-semibold">Forest check</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Forest check: roll 5-6 to leave
          </div>
        </div>
      ) : isDuelistChoice ? (
        <div>
          <div className="font-semibold">Demon Duelist</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Choose whether to continue the duel.
          </div>
        </div>
      ) : isChikatiloPlacement ? (
        <div>
          <div className="font-semibold">False Trail placement</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select any empty cell to place Chikatilo.
          </div>
        </div>
      ) : isGuideTravelerPlacement ? (
        <div>
          <div className="font-semibold">Guide Traveler placement</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select an empty cell to place the guided ally.
          </div>
        </div>
      ) : isRiverBoatCarryChoice ? (
        <div>
          <div className="font-semibold">Boat carry</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select an adjacent ally to carry, or move without carrying.
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            Move without carrying
          </button>
        </div>
      ) : isRiverBoatDropDestination ? (
        <div>
          <div className="font-semibold">Boat drop</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select an adjacent empty cell to drop the carried ally.
          </div>
        </div>
      ) : isRiverTraLaLaTargetChoice ? (
        <div>
          <div className="font-semibold">Tra-la-la</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select an adjacent enemy target.
          </div>
        </div>
      ) : isRiverTraLaLaDestinationChoice ? (
        <div>
          <div className="font-semibold">Tra-la-la</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select a highlighted straight-line destination.
          </div>
        </div>
      ) : isJebeKhansShooterTargetChoice ? (
        <div>
          <div className="font-semibold">Khan's Shooter</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select the next ricochet target.
          </div>
        </div>
      ) : isLokiLaughtChoice ? (
        <div>
          <div className="font-semibold">Loki's Laughter</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Choose one trick to activate without revealing Loki.
          </div>
        </div>
      ) : isLokiChickenTargetChoice ? (
        <div>
          <div className="font-semibold">Chicken</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select an enemy hero within 2 cells.
          </div>
        </div>
      ) : isLokiMindControlEnemyChoice ? (
        <div>
          <div className="font-semibold">Mind Control</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select the enemy hero to control.
          </div>
        </div>
      ) : isLokiMindControlTargetChoice ? (
        <div>
          <div className="font-semibold">Mind Control</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select a legal target for the controlled attack.
          </div>
        </div>
      ) : isHassanTrueEnemyTargetChoice ? (
        <div>
          <div className="font-semibold">True Enemy</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select a target for the forced enemy attack.
          </div>
        </div>
      ) : isAsgoreSoulParadePatienceTargetChoice ? (
        <div>
          <div className="font-semibold">Soul Parade: Patience</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select a target in assassin attack range.
          </div>
        </div>
      ) : isAsgoreSoulParadePerseveranceTargetChoice ? (
        <div>
          <div className="font-semibold">Soul Parade: Perseverance</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select a target in trickster attack range.
          </div>
        </div>
      ) : isAsgoreSoulParadeJusticeTargetChoice ? (
        <div>
          <div className="font-semibold">Soul Parade: Justice</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select a target in archer attack line.
          </div>
        </div>
      ) : isAsgoreSoulParadeIntegrityDestination ? (
        <div>
          <div className="font-semibold">Soul Parade: Integrity</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Select any highlighted destination cell.
          </div>
        </div>
      ) : isHassanAssassinOrderSelection ? (
        <div>
          <div className="font-semibold">
            Assassin Order: pick 2 allied heroes to gain Stealth (5-6)
          </div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Selected: {hassanAssassinOrderSelections.length}/2
          </div>
          {hassanAssassinOrderSelections.length > 0 && (
            <div className="mt-1 text-[10px] text-amber-700 dark:text-amber-200">
              {hassanAssassinOrderSelections.join(", ")}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-lg bg-emerald-600 px-3 py-1 text-[10px] font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
              onClick={onConfirmHassanAssassinOrder}
              disabled={hassanAssassinOrderSelections.length !== 2}
            >
              Confirm
            </button>
            <button
              className="rounded-lg bg-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={onClearHassanAssassinOrder}
            >
              Clear
            </button>
          </div>
        </div>
      ) : isChikatiloRevealChoice ? (
        <div>
          <div className="font-semibold">False Trail choice</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Decide whether the token explodes or is removed.
          </div>
        </div>
      ) : isChikatiloDecoyChoice ? (
        <div>
          <div className="font-semibold">Decoy</div>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            Roll defense or spend 3 charges to take 1 damage.
          </div>
        </div>
      ) : (
        <div>Pending roll: {getPendingRollLabel(pendingRollKind)}. Resolve to continue.</div>
      )}
      {!isStakePlacement && pendingQueueCount > 0 && (
        <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
          Pending attacks: {pendingQueueCount}
        </div>
      )}
    </div>
  );
}
