import { useState } from "react";
import type { AbilityView, GameAction, UnitState } from "rules";
import type { TestRoomCommand } from "./types";
import { useI18n } from "../i18n";

export function ChargeDebugControls({
  unit,
  abilities,
  send,
  sendAction,
}: {
  unit: UnitState | null;
  abilities: AbilityView[];
  send: (command: TestRoomCommand) => void;
  sendAction: (action: GameAction) => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, number>>({});
  if (!unit) return <div className="text-sm text-slate-500">{t("testRoom.selectUnit")}</div>;

  const formatDebugCharges = (ability: AbilityView) => {
    const current = ability.currentCharges ?? "—";
    if (ability.chargeUnlimited) return `${current}`;
    const max = ability.maxCharges ?? ability.chargeRequired ?? "∞";
    return `${current} / ${max}`;
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            send({ type: "debugSetCharges", unitId: unit.id, mode: "fill" })
          }
        >
          {t("testRoom.fillAll")}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            send({ type: "debugSetCharges", unitId: unit.id, mode: "clear" })
          }
        >
          {t("testRoom.clearAll")}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            send({
              type: "debugSetCharges",
              unitId: unit.id,
              mode: "add",
              abilityId: abilities[0]?.id,
              value: 1,
            })
          }
          disabled={!abilities[0]}
        >
          {t("testRoom.addOneFirst")}
        </button>
      </div>
      {abilities.map((ability) => (
        <div
          key={ability.id}
          className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">{ability.name}</div>
              <div className="font-mono text-[11px] text-slate-500">{ability.id}</div>
              <div className="mt-1 text-xs text-slate-500">
                {formatDebugCharges(ability)}
                {" · "}
                {ability.isAvailable ? t("testRoom.available") : ability.disabledReason}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={ability.kind !== "active" || !ability.isAvailable}
              onClick={() =>
                sendAction({
                  type: "useAbility",
                  unitId: unit.id,
                  abilityId: ability.id,
                })
              }
            >
              {t("testRoom.use")}
            </button>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <input
              className="field-control"
              type="number"
              min={0}
              max={99}
              value={values[ability.id] ?? ability.currentCharges ?? 0}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [ability.id]: Number(event.target.value),
                }))
              }
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                send({
                  type: "debugSetCharges",
                  unitId: unit.id,
                  abilityId: ability.id,
                  mode: "set",
                  value: values[ability.id] ?? ability.currentCharges ?? 0,
                })
              }
            >
              {t("testRoom.set")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
