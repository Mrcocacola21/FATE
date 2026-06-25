import { useState } from "react";
import type { PlayerId } from "rules";
import type { TestRoomCommand } from "./types";
import { useI18n } from "../i18n";

export function MarkerDebugControls({
  send,
}: {
  send: (command: TestRoomCommand) => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<"stake" | "forest">("stake");
  const [owner, setOwner] = useState<PlayerId>("P1");
  const [col, setCol] = useState(4);
  const [row, setRow] = useState(4);
  const [revealed, setRevealed] = useState(true);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <select
          className="field-control"
          value={kind}
          onChange={(event) => setKind(event.target.value as "stake" | "forest")}
        >
          <option value="stake">{t("testRoom.vladStake")}</option>
          <option value="forest">{t("testRoom.forestMarker")}</option>
        </select>
        <select
          className="field-control"
          value={owner}
          onChange={(event) => setOwner(event.target.value as PlayerId)}
        >
          <option value="P1">P1</option>
          <option value="P2">P2</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
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
      {kind === "stake" ? (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={revealed}
            onChange={(event) => setRevealed(event.target.checked)}
          />
          {t("testRoom.revealed")}
        </label>
      ) : null}
      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={() =>
          send({
            type: "debugAddMarker",
            marker: { kind, owner, coord: { col, row }, revealed },
          })
        }
      >
        {t("testRoom.addMarker")}
      </button>
      <button
        type="button"
        className="btn btn-secondary w-full"
        onClick={() => send({ type: "debugClearMarkers" })}
      >
        {t("testRoom.clearMarkers")}
      </button>
    </div>
  );
}
