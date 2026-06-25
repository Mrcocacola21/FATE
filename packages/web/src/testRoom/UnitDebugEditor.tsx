import { useEffect, useState } from "react";
import type { PlayerId, UnitState } from "rules";
import type { TestRoomCommand } from "./types";
import { useI18n } from "../i18n";

const statuses = [
  ["isStealthed", "testRoom.statusStealthed"],
  ["movementDisabledNextTurn", "testRoom.statusImmobilized"],
  ["transformed", "testRoom.statusTransformed"],
  ["bunker", "testRoom.statusBunker"],
  ["gutsBerserkModeActive", "testRoom.statusGuts"],
  ["papyrusUnbelieverActive", "testRoom.statusPapyrus"],
  ["papyrusBoneBlue", "testRoom.statusBlueBone"],
  ["papyrusBoneOrange", "testRoom.statusOrangeBone"],
  ["sansUnbelieverUnlocked", "testRoom.statusSans"],
  ["mettatonExUnlocked", "testRoom.statusMettatonEx"],
  ["mettatonNeoUnlocked", "testRoom.statusMettatonNeo"],
  ["undyneImmortalActive", "testRoom.statusUndyne"],
  ["chicken", "testRoom.statusChicken"],
] as const;

function statusValue(unit: UnitState, status: (typeof statuses)[number][0]) {
  switch (status) {
    case "bunker":
      return unit.bunker?.active === true;
    case "chicken":
      return (unit.lokiChickenSources?.length ?? 0) > 0;
    case "papyrusBoneBlue":
      return unit.papyrusBoneMode === "blue";
    case "papyrusBoneOrange":
      return unit.papyrusBoneMode === "orange";
    default:
      return unit[status] === true;
  }
}

export function UnitDebugEditor({
  unit,
  send,
}: {
  unit: UnitState | null;
  send: (command: TestRoomCommand) => void;
}) {
  const { t } = useI18n();
  const [hp, setHp] = useState(0);
  const [col, setCol] = useState(0);
  const [row, setRow] = useState(0);

  useEffect(() => {
    setHp(unit?.hp ?? 0);
    setCol(unit?.position?.col ?? 0);
    setRow(unit?.position?.row ?? 0);
  }, [unit]);

  if (!unit) {
    return <div className="text-sm text-slate-500">{t("testRoom.selectUnitBoard")}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-slate-100 p-3 text-xs dark:bg-slate-950/60">
        <div className="font-mono font-semibold">{unit.id}</div>
        <div>{unit.heroId ?? unit.figureId ?? unit.class} · {unit.class}</div>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          className="field-control"
          type="number"
          min={0}
          max={99}
          value={hp}
          onChange={(event) => setHp(Number(event.target.value))}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => send({ type: "debugSetHp", unitId: unit.id, hp })}
        >
          {t("testRoom.setHp")}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <select
          className="field-control"
          value={unit.owner}
          onChange={(event) =>
            send({
              type: "debugSetOwner",
              unitId: unit.id,
              owner: event.target.value as PlayerId,
            })
          }
        >
          <option value="P1">P1</option>
          <option value="P2">P2</option>
        </select>
        <input
          className="field-control"
          type="number"
          min={0}
          max={8}
          value={col}
          onChange={(event) => setCol(Number(event.target.value))}
        />
        <input
          className="field-control"
          type="number"
          min={0}
          max={8}
          value={row}
          onChange={(event) => setRow(Number(event.target.value))}
        />
      </div>
      <button
        type="button"
        className="btn btn-secondary w-full"
        onClick={() =>
          send({
            type: "debugMoveUnit",
            unitId: unit.id,
            to: { col, row },
          })
        }
      >
        {t("testRoom.teleportTo", { col, row })}
      </button>
      <div className="grid grid-cols-2 gap-2">
        {statuses.map(([status, label]) => (
          <label
            key={status}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-2 text-xs dark:border-slate-800"
          >
            <input
              type="checkbox"
              checked={statusValue(unit, status)}
              onChange={(event) =>
                send({
                  type: "debugSetStatus",
                  unitId: unit.id,
                  status,
                  value: event.target.checked,
                })
              }
            />
            {t(label)}
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => send({ type: "debugResetActions", unitId: unit.id })}
        >
          {t("testRoom.resetActions")}
        </button>
        <button
          type="button"
          className="btn btn-warning"
          onClick={() => {
            if (window.confirm(t("testRoom.removeUnitConfirm", { unitId: unit.id }))) {
              send({ type: "debugRemoveUnit", unitId: unit.id });
            }
          }}
        >
          {t("testRoom.removeUnit")}
        </button>
      </div>
    </div>
  );
}
