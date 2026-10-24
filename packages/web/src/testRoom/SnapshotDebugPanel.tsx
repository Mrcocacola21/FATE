import { useState } from "react";
import type { TestRoomSnapshot } from "rules";
import { copyText, downloadJson } from "./testRoomApi";
import type { TestRoomCommand } from "./types";
import { useI18n } from "../i18n";
import { useConfirmDialog } from "../ui/useConfirmDialog";

export function SnapshotDebugPanel({
  snapshot,
  roomId,
  send,
}: {
  snapshot: string | null;
  roomId: string | null;
  send: (command: TestRoomCommand) => void;
}) {
  const { t } = useI18n();
  const { confirm, dialog } = useConfirmDialog();
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={() => send({ type: "debugExportSnapshot" })}
      >
        {t("testRoom.exportSnapshot")}
      </button>
      {snapshot ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void copyText(snapshot)}
          >
            {t("testRoom.copyReproduction")}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              downloadJson(`fate-test-room-${roomId ?? "snapshot"}.json`, snapshot)
            }
          >
            {t("testRoom.downloadJson")}
          </button>
        </div>
      ) : null}
      <textarea
        className="field-control min-h-36 font-mono text-xs"
        placeholder={t("testRoom.pasteSnapshot")}
        value={importText}
        onChange={(event) => {
          setImportText(event.target.value);
          setImportError(null);
        }}
      />
      <button
        type="button"
        className="btn btn-warning w-full"
        disabled={!importText.trim()}
        onClick={() => {
          try {
            const parsed = JSON.parse(importText) as TestRoomSnapshot;
            confirm(t("testRoom.importConfirm"), () =>
              send({ type: "debugImportSnapshot", snapshot: parsed }),
            );
          } catch {
            setImportError(t("testRoom.invalidJson"));
          }
        }}
      >
        {t("testRoom.importSnapshot")}
      </button>
      {importError ? (
        <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">
          {importError}
        </p>
      ) : null}
      {dialog}
    </div>
  );
}
