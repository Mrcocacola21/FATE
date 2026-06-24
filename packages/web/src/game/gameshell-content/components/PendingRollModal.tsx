import type { PlayerView } from "rules";
import { getPendingRollLabel } from "../helpers";

type PendingRoll = NonNullable<PlayerView["pendingRoll"]>;

interface PendingRollModalProps {
  pendingRoll: PendingRoll;
  view: PlayerView;
  showAttackerRoll: boolean;
  attackerDice: number[];
  tieBreakAttacker: number[];
  isForestMoveCheck: boolean;
  isForestChoice: boolean;
  isDuelistChoice: boolean;
  isAsgoreBraveryDefenseChoice: boolean;
  isLokiLaughtChoice: boolean;
  isFriskPacifismChoice: boolean;
  isFriskGenocideChoice: boolean;
  isFriskKeenEyeChoice: boolean;
  isFriskSubstitutionChoice: boolean;
  isFriskChildsCryChoice: boolean;
  isOdinMuninnDefenseChoice: boolean;
  isChikatiloRevealChoice: boolean;
  isChikatiloDecoyChoice: boolean;
  isBerserkerDefenseChoice: boolean;
  lokiLaughtCurrent: number;
  lokiCanAgainSomeNonsense: boolean;
  lokiCanChicken: boolean;
  lokiCanMindControl: boolean;
  lokiCanSpinTheDrum: boolean;
  lokiCanGreatLokiJoke: boolean;
  lokiLaughtChickenOptions: string[];
  lokiLaughtMindControlEnemyOptions: string[];
  lokiLaughtSpinCandidateIds: string[];
  friskPacifismPoints: number;
  friskPacifismDisabled: boolean;
  friskPacifismHugsOptions: string[];
  friskPacifismWarmWordsOptions: string[];
  friskPacifismPowerOfFriendshipEnabled: boolean;
  friskGenocidePoints: number;
  friskKeenEyeTargetIds: string[];
  defenderFriskGenocidePoints: number;
  defenderFriskPacifismPoints: number;
  defenderBerserkCharges: number;
  defenderMuninnCharges: number;
  defenderAsgoreBraveryReady: boolean;
  decoyCharges: number;
  duelistAttackerHp: number;
  onResolvePendingRoll: (choice?: unknown) => void;
}

export function PendingRollModal({
  pendingRoll,
  view,
  showAttackerRoll,
  attackerDice,
  tieBreakAttacker,
  isForestMoveCheck,
  isForestChoice,
  isDuelistChoice,
  isAsgoreBraveryDefenseChoice,
  isLokiLaughtChoice,
  isFriskPacifismChoice,
  isFriskGenocideChoice,
  isFriskKeenEyeChoice,
  isFriskSubstitutionChoice,
  isFriskChildsCryChoice,
  isOdinMuninnDefenseChoice,
  isChikatiloRevealChoice,
  isChikatiloDecoyChoice,
  isBerserkerDefenseChoice,
  lokiLaughtCurrent,
  lokiCanAgainSomeNonsense,
  lokiCanChicken,
  lokiCanMindControl,
  lokiCanSpinTheDrum,
  lokiCanGreatLokiJoke,
  lokiLaughtChickenOptions,
  lokiLaughtMindControlEnemyOptions,
  lokiLaughtSpinCandidateIds,
  friskPacifismPoints,
  friskPacifismDisabled,
  friskPacifismHugsOptions,
  friskPacifismWarmWordsOptions,
  friskPacifismPowerOfFriendshipEnabled,
  friskGenocidePoints,
  friskKeenEyeTargetIds,
  defenderFriskGenocidePoints,
  defenderFriskPacifismPoints,
  defenderBerserkCharges,
  defenderMuninnCharges,
  defenderAsgoreBraveryReady,
  decoyCharges,
  duelistAttackerHp,
  onResolvePendingRoll,
}: PendingRollModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pending-roll-title"
      aria-describedby="pending-roll-description"
    >
      <div className="scroll-panel panel-card max-h-[92vh] w-full max-w-lg overflow-y-auto p-5 shadow-2xl sm:p-6">
        <div className="section-kicker">Action required</div>
        <div
          id="pending-roll-title"
          className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-white"
        >
          {pendingRoll.kind === "initiativeRoll"
            ? "Roll initiative"
            : isForestMoveCheck
              ? "Forest check"
              : isForestChoice
                ? "Forest of the Dead"
                : isDuelistChoice
                  ? "Demon Duelist"
                  : pendingRoll.kind === "asgoreSoulParadeRoll"
                    ? "Soul Parade"
                    : isAsgoreBraveryDefenseChoice
                      ? "Bravery Auto Defense"
                      : isLokiLaughtChoice
                        ? "Loki's Laughter"
                        : isFriskPacifismChoice
                          ? "Frisk: Pacifism"
                          : isFriskGenocideChoice
                            ? "Frisk: Genocide"
                            : isFriskKeenEyeChoice
                              ? "Frisk: Keen Eye"
                              : isFriskSubstitutionChoice
                                ? "Frisk: Substitution"
                                : isFriskChildsCryChoice
                                  ? "Frisk: Child's Cry"
                                  : isOdinMuninnDefenseChoice
                                    ? "Muninn Auto Defense"
                                    : isChikatiloRevealChoice
                                      ? "False Trail"
                                      : isChikatiloDecoyChoice
                                        ? "Decoy"
                                        : "Roll required"}
        </div>
        <div
          id="pending-roll-description"
          className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300"
        >
          {isBerserkerDefenseChoice
            ? "Choose berserker defense."
            : isLokiLaughtChoice
              ? "Pick one Loki trick. Costs Laughter and does not reveal stealth."
              : isFriskPacifismChoice
                ? "Pick a Pacifism option. Pacifism abilities do not reveal Frisk stealth."
                : isFriskGenocideChoice
                  ? "Pick a Genocide option."
                  : isFriskKeenEyeChoice
                    ? "Pick an enemy to reveal with Keen Eye, or attempt normal stealth."
                    : isFriskSubstitutionChoice
                      ? "Use Substitution before defense roll to take exactly 1 damage."
                      : isFriskChildsCryChoice
                        ? "Use Child's Cry after the roll to reduce this hit's damage to 0."
                        : isOdinMuninnDefenseChoice
                          ? "Defense roll is ready. Keep the roll or spend 6 charges for Muninn auto-defense."
                          : isAsgoreBraveryDefenseChoice
                            ? "Defense roll is ready. Keep the roll or consume Bravery for automatic defense."
                            : isChikatiloDecoyChoice
                              ? "Roll defense or spend 3 charges to take 1 damage."
                              : isChikatiloRevealChoice
                                ? "Explode the token or remove it."
                                : pendingRoll.kind === "asgoreSoulParadeRoll"
                                  ? "Roll 1d6 to determine Soul Parade effect."
                                  : isForestMoveCheck
                                    ? "Forest check: roll 5-6 to leave"
                                    : isForestChoice
                                      ? "Activate Forest of the Dead or skip."
                                      : isDuelistChoice
                                        ? "Pay 1 HP to continue the duel, or stop."
                                        : `Please roll the dice to resolve: ${getPendingRollLabel(pendingRoll.kind)}.`}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="status-pill border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-200">
            Pending for {pendingRoll.player}
          </span>
          <span className="status-pill border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {getPendingRollLabel(pendingRoll.kind)}
          </span>
        </div>
        {pendingRoll.kind === "initiativeRoll" && (
          <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
            {pendingRoll.player === "P2" && view.initiative.P1 !== null && (
              <div>P1 rolled: {view.initiative.P1}</div>
            )}
            {pendingRoll.player === "P1" && view.initiative.P2 !== null && (
              <div>P2 rolled: {view.initiative.P2}</div>
            )}
            {pendingRoll.player === "P1" &&
              view.initiative.P2 === null &&
              view.initiative.P1 === null && <div>Awaiting your roll.</div>}
          </div>
        )}
        {showAttackerRoll && attackerDice.length > 0 && (
          <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
            <div>Attacker roll: [{attackerDice.join(", ")}]</div>
            {tieBreakAttacker.length > 0 && (
              <div className="mt-1">Tie-break: [{tieBreakAttacker.join(", ")}]</div>
            )}
          </div>
        )}
        <div className="pending-choice mt-5 flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row">
          {isLokiLaughtChoice ? (
            <div className="grid w-full grid-cols-1 gap-2">
              <div className="text-xs text-slate-500 dark:text-slate-300">
                Laughter: {lokiLaughtCurrent}/15
              </div>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({
                    type: "lokiLaughtOption",
                    option: "againSomeNonsense",
                  })
                }
                disabled={!lokiCanAgainSomeNonsense}
                title={lokiCanAgainSomeNonsense ? "" : "Not Enough laughter"}
              >
                Again some nonsense (-3)
                {!lokiCanAgainSomeNonsense ? " - Not Enough laughter" : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({ type: "lokiLaughtOption", option: "chicken" })
                }
                disabled={!lokiCanChicken}
                title={
                  lokiLaughtCurrent < 5
                    ? "Not Enough laughter"
                    : lokiLaughtChickenOptions.length === 0
                      ? "No valid targets"
                      : ""
                }
              >
                Chicken (-5)
                {lokiLaughtCurrent < 5
                  ? " - Not Enough laughter"
                  : lokiLaughtChickenOptions.length === 0
                    ? " - No valid targets"
                    : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({
                    type: "lokiLaughtOption",
                    option: "mindControl",
                  })
                }
                disabled={!lokiCanMindControl}
                title={
                  lokiLaughtCurrent < 10
                    ? "Not Enough laughter"
                    : lokiLaughtMindControlEnemyOptions.length === 0
                      ? "No valid targets"
                      : ""
                }
              >
                Mind Control (-10)
                {lokiLaughtCurrent < 10
                  ? " - Not Enough laughter"
                  : lokiLaughtMindControlEnemyOptions.length === 0
                    ? " - No valid targets"
                    : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({
                    type: "lokiLaughtOption",
                    option: "spinTheDrum",
                  })
                }
                disabled={!lokiCanSpinTheDrum}
                title={lokiCanSpinTheDrum ? "" : "Not Enough laughter"}
              >
                Spin the drum (-12)
                {!lokiCanSpinTheDrum ? " - Not Enough laughter" : ""}
                {lokiCanSpinTheDrum && lokiLaughtSpinCandidateIds.length === 0
                  ? " - No allied heroes to spin"
                  : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({
                    type: "lokiLaughtOption",
                    option: "greatLokiJoke",
                  })
                }
                disabled={!lokiCanGreatLokiJoke}
                title={lokiCanGreatLokiJoke ? "" : "Not Enough laughter"}
              >
                Great Loki joke (-15)
                {!lokiCanGreatLokiJoke ? " - Not Enough laughter" : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("skip")}
              >
                Cancel
              </button>
            </div>
          ) : isFriskPacifismChoice ? (
            <div className="grid w-full grid-cols-1 gap-2">
              <div className="text-xs text-slate-500 dark:text-slate-300">
                Pacifism: {friskPacifismPoints}/30
              </div>
              {friskPacifismDisabled && (
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  Pacifism lost (One Path)
                </div>
              )}
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({ type: "friskPacifismOption", option: "hugs" })
                }
                disabled={
                  friskPacifismDisabled ||
                  friskPacifismPoints < 3 ||
                  friskPacifismHugsOptions.length === 0
                }
              >
                Hugs (-3)
                {friskPacifismPoints < 3
                  ? " - Not Enough charges"
                  : friskPacifismHugsOptions.length === 0
                    ? " - No valid targets"
                    : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({ type: "friskPacifismOption", option: "childsCry" })
                }
                disabled={friskPacifismDisabled || friskPacifismPoints < 5}
              >
                Child&apos;s Cry (-5)
                {friskPacifismPoints < 5 ? " - Not Enough charges" : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({ type: "friskPacifismOption", option: "warmWords" })
                }
                disabled={
                  friskPacifismDisabled ||
                  friskPacifismPoints < 10 ||
                  friskPacifismWarmWordsOptions.length === 0
                }
              >
                Warm Words (-10)
                {friskPacifismPoints < 10
                  ? " - Not Enough charges"
                  : friskPacifismWarmWordsOptions.length === 0
                    ? " - No valid targets"
                    : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({
                    type: "friskPacifismOption",
                    option: "powerOfFriendship",
                  })
                }
                disabled={friskPacifismDisabled || !friskPacifismPowerOfFriendshipEnabled}
              >
                Power of Friendship
                {!friskPacifismPowerOfFriendshipEnabled ? " - Condition not met" : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("skip")}
              >
                Cancel
              </button>
            </div>
          ) : isFriskGenocideChoice ? (
            <div className="grid w-full grid-cols-1 gap-2">
              <div className="text-xs text-slate-500 dark:text-slate-300">
                Genocide: {friskGenocidePoints}/30
              </div>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({ type: "friskGenocideOption", option: "substitution" })
                }
                disabled={friskGenocidePoints < 3}
              >
                Substitution (-3)
                {friskGenocidePoints < 3 ? " - Not Enough charges" : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({ type: "friskGenocideOption", option: "keenEye" })
                }
                disabled={friskGenocidePoints < 5}
              >
                Keen Eye (-5)
                {friskGenocidePoints < 5 ? " - Not Enough charges" : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                onClick={() =>
                  onResolvePendingRoll({
                    type: "friskGenocideOption",
                    option: "precisionStrike",
                  })
                }
                disabled={friskGenocidePoints < 10}
              >
                Precision Strike (-10)
                {friskGenocidePoints < 10 ? " - Not Enough charges" : ""}
              </button>
              <button
                className="w-full rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("skip")}
              >
                Cancel
              </button>
            </div>
          ) : isFriskKeenEyeChoice ? (
            <div className="grid w-full grid-cols-1 gap-2">
              {friskKeenEyeTargetIds.length === 0 && (
                <div className="text-xs text-slate-500 dark:text-slate-300">
                  No valid Keen Eye targets.
                </div>
              )}
              {friskKeenEyeTargetIds.map((unitId) => (
                <button
                  key={unitId}
                  className="w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                  onClick={() =>
                    onResolvePendingRoll({ type: "friskKeenEyeTarget", targetId: unitId })
                  }
                >
                  Reveal {unitId}
                </button>
              ))}
              <button
                className="w-full rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("skip")}
              >
                Attempt Stealth Instead
              </button>
            </div>
          ) : isFriskSubstitutionChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("roll")}
              >
                Roll Defense
              </button>
              <button
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
                onClick={() => onResolvePendingRoll("activate")}
                disabled={defenderFriskGenocidePoints < 3}
              >
                Use Substitution (-3)
              </button>
            </>
          ) : isFriskChildsCryChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("skip")}
              >
                Take Damage
              </button>
              <button
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
                onClick={() => onResolvePendingRoll("activate")}
                disabled={defenderFriskPacifismPoints < 5}
              >
                Use Child&apos;s Cry (-5)
              </button>
            </>
          ) : isBerserkerDefenseChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("roll")}
              >
                Roll Defense
              </button>
              <button
                className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
                onClick={() => onResolvePendingRoll("auto")}
                disabled={defenderBerserkCharges !== 6}
              >
                Auto-dodge (-6)
              </button>
            </>
          ) : isOdinMuninnDefenseChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("roll")}
              >
                Keep Roll
              </button>
              <button
                className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
                onClick={() => onResolvePendingRoll("auto")}
                disabled={defenderMuninnCharges !== 6}
              >
                Use Muninn (-6)
              </button>
            </>
          ) : isAsgoreBraveryDefenseChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("roll")}
              >
                Keep Roll
              </button>
              <button
                className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
                onClick={() => onResolvePendingRoll("auto")}
                disabled={!defenderAsgoreBraveryReady}
              >
                Use Bravery
              </button>
            </>
          ) : isChikatiloDecoyChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("roll")}
              >
                Roll Defense
              </button>
              <button
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
                onClick={() => onResolvePendingRoll("decoy")}
                disabled={decoyCharges < 3}
              >
                Use Decoy (-3)
              </button>
            </>
          ) : isDuelistChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
                onClick={() => onResolvePendingRoll("elCidDuelistContinue")}
                disabled={duelistAttackerHp <= 1}
              >
                Pay 1 HP
              </button>
              <button
                className="flex-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("elCidDuelistStop")}
              >
                Stop
              </button>
            </>
          ) : isForestChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
                onClick={() => onResolvePendingRoll("activate")}
              >
                Activate
              </button>
              <button
                className="flex-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("skip")}
              >
                Skip
              </button>
            </>
          ) : isChikatiloRevealChoice ? (
            <>
              <button
                className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
                onClick={() => onResolvePendingRoll("falseTrailExplode")}
              >
                Explode
              </button>
              <button
                className="flex-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onResolvePendingRoll("falseTrailRemove")}
              >
                Remove
              </button>
            </>
          ) : (
            <button
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-slate-100 dark:text-slate-900"
              onClick={() => onResolvePendingRoll()}
            >
              Roll
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
