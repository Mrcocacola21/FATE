import type { DebugPresetId } from "rules";
import type { TestRoomCommand } from "./types";
import { useI18n } from "../i18n";
import { useConfirmDialog } from "../ui/useConfirmDialog";

const presets: Array<[DebugPresetId, string]> = [
  ["empty", "testRoom.presetEmpty"],
  ["basic-duel", "testRoom.presetDuel"],
  ["aoe-cluster", "testRoom.presetAoe"],
  ["line-attack", "testRoom.presetLine"],
  ["rider-path", "testRoom.presetRider"],
  ["stake-trigger", "testRoom.presetStake"],
  ["stealth-reveal", "testRoom.presetStealth"],
  ["transformation", "testRoom.presetTransform"],
  ["impulse", "testRoom.presetImpulse"],
  ["healing-status", "testRoom.presetHealing"],
];

export function TestRoomPresets({
  send,
  boardEmpty = false,
}: {
  send: (command: TestRoomCommand) => void;
  /** Nothing would be lost, so the preset loads without asking. */
  boardEmpty?: boolean;
}) {
  const { t } = useI18n();
  const { confirm, dialog } = useConfirmDialog();
  return (
    <div className="grid grid-cols-2 gap-2">
      {presets.map(([presetId, label]) => (
        <button
          key={presetId}
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            const load = () => send({ type: "debugApplyPreset", presetId });
            if (boardEmpty) load();
            else confirm(t("testRoom.loadPresetConfirm", { preset: t(label) }), load);
          }}
        >
          {t(label)}
        </button>
      ))}
      {dialog}
    </div>
  );
}
