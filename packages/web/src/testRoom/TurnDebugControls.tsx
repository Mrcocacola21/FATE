import type { GameAction, GamePhase, PlayerId, UnitState } from "rules";
import type { TestRoomCommand } from "./types";
import { useI18n } from "../i18n";

export function TurnDebugControls({
  selectedUnit,
  send,
  sendAction,
}: {
  selectedUnit: UnitState | null;
  send: (command: TestRoomCommand) => void;
  sendAction: (action: GameAction) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(["P1", "P2"] as PlayerId[]).map((player) => (
          <button
            key={player}
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              send({
                type: "debugSetTurn",
                player,
                unitId:
                  selectedUnit?.owner === player ? selectedUnit.id : undefined,
              })
            }
          >
            {t("testRoom.forcePlayer", { player })}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!selectedUnit}
          onClick={() =>
            selectedUnit &&
            send({ type: "debugSimulateStartTurn", unitId: selectedUnit.id })
          }
        >
          {t("testRoom.simulateStart")}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => sendAction({ type: "endTurn" })}
        >
          {t("testRoom.endTurn")}
        </button>
      </div>
      <select
        className="field-control"
        defaultValue="battle"
        onChange={(event) =>
          send({
            type: "debugSetPhase",
            phase: event.target.value as GamePhase,
          })
        }
      >
        <option value="lobby">{t("phases.lobby")}</option>
        <option value="placement">{t("phases.placement")}</option>
        <option value="battle">{t("phases.battle")}</option>
        <option value="ended">{t("phases.ended")}</option>
      </select>
    </div>
  );
}
