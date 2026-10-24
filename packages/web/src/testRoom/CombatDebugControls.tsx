import { useMemo, useState } from "react";
import type { GameAction, UnitState } from "rules";
import { isDebugInteger, parseDiceQueue } from "./testRoomApi";
import type { TestRoomCommand } from "./types";
import { useI18n } from "../i18n";

export function CombatDebugControls({
  units,
  selectedUnit,
  legalTargets,
  legalTargetsByUnitId,
  diceQueue,
  send,
  sendAction,
}: {
  units: UnitState[];
  selectedUnit: UnitState | null;
  legalTargets: string[];
  legalTargetsByUnitId?: Record<string, string[]>;
  diceQueue: number[];
  send: (command: TestRoomCommand) => void;
  sendAction: (action: GameAction) => void;
}) {
  const { t } = useI18n();
  const [attackerId, setAttackerId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [queueText, setQueueText] = useState("");
  const [damage, setDamage] = useState(1);
  const alive = units.filter(unit => unit.isAlive && unit.position);
  const attacker = alive.some(unit => unit.id === attackerId) ? attackerId
    : alive.some(unit => unit.id === selectedUnit?.id) ? selectedUnit!.id : "";
  const targets = useMemo(
    () => units.filter((unit) => unit.id !== attacker && unit.isAlive && unit.position),
    [units, attacker],
  );
  const attackerUnit = alive.find(unit => unit.id === attacker);
  const attackerLegalTargets = legalTargetsByUnitId?.[attacker] ?? (attacker === selectedUnit?.id ? legalTargets : []);
  const target = targets.some(unit => unit.id === targetId) ? targetId
    : targets.find(unit => attackerLegalTargets.includes(unit.id))?.id
      ?? targets.find(unit => unit.owner !== attackerUnit?.owner)?.id ?? targets[0]?.id ?? "";
  const parsedQueue = parseDiceQueue(queueText);

  return (
    <div className="space-y-3">
      <select
        className="field-control"
        value={attacker}
        onChange={(event) => setAttackerId(event.target.value)}
      >
        <option value="">{t("testRoom.chooseAttacker")}</option>
        {alive.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.owner} · {unit.heroId ?? unit.class} · {unit.id}
          </option>
        ))}
      </select>
      <select
        className="field-control"
        value={target}
        onChange={(event) => setTargetId(event.target.value)}
      >
        <option value="">{t("testRoom.chooseTarget")}</option>
        {targets.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {attackerLegalTargets.includes(unit.id) ? `${t("testRoom.legal")} · ` : ""}
            {unit.owner} · {unit.heroId ?? unit.class}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={!attacker || !target}
        onClick={() =>
          sendAction({ type: "attack", attackerId: attacker, defenderId: target })
        }
      >
        {t("testRoom.resolveAttack")}
      </button>
      <button
        type="button"
        className="btn btn-secondary w-full"
        disabled={!attacker || !target}
        onClick={() =>
          send({
            type: "debugSetMarkedTarget",
            sourceUnitId: attacker,
            targetUnitId: target,
            value: true,
          })
        }
      >
        {t("testRoom.markTarget")}
      </button>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          className="field-control"
          type="number"
          min={0}
          max={99}
          value={damage}
          onChange={(event) => setDamage(Number(event.target.value))}
        />
        <button
          type="button"
          className="btn btn-warning"
          disabled={!target || !isDebugInteger(damage, 99)}
          onClick={() =>
            target &&
            send({ type: "debugDirectDamage", unitId: target, amount: damage })
          }
        >
          {t("testRoom.debugDamage")}
        </button>
      </div>
      <div className="rounded-xl bg-slate-100 p-3 text-xs dark:bg-slate-950/60">
        {t("testRoom.queuedDice", {
          values: diceQueue.length ? diceQueue.join(", ") : t("testRoom.normalRng"),
        })}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          className="field-control font-mono"
          placeholder="6,6,1,1"
          value={queueText}
          aria-invalid={parsedQueue === null}
          onChange={(event) => setQueueText(event.target.value)}
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={parsedQueue === null}
          onClick={() => {
            const values = parseDiceQueue(queueText);
            if (!values) return;
            send({ type: "debugSetDiceQueue", values });
          }}
        >
          {t("testRoom.queue")}
        </button>
      </div>
      <button
        type="button"
        className="btn btn-secondary w-full"
        onClick={() => send({ type: "debugClearDiceQueue" })}
      >
        {t("testRoom.useNormalRng")}
      </button>
    </div>
  );
}
