import type { DebugPresetId } from "rules";
import type { TestRoomCommand } from "./types";
import { useI18n } from "../i18n";

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
}: {
  send: (command: TestRoomCommand) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-2">
      {presets.map(([presetId, label]) => (
        <button
          key={presetId}
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            if (
              window.confirm(
                t("testRoom.loadPresetConfirm", { preset: t(label) }),
              )
            ) {
              send({ type: "debugApplyPreset", presetId });
            }
          }}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}
