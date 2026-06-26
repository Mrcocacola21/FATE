import { useState } from "react";
import type { PlayerId, RuleDeclarationId } from "rules";
import { useI18n } from "../i18n";
import type { TestRoomCommand } from "./types";

const RULE_IDS: RuleDeclarationId[] = [
  "normal_rule",
  "court",
  "chess_party",
  "moon_game",
  "advantage_game",
];

function ruleKey(ruleId: RuleDeclarationId) {
  switch (ruleId) {
    case "normal_rule":
      return "normalRule";
    case "court":
      return "court";
    case "chess_party":
      return "chessParty";
    case "moon_game":
      return "moonGame";
    case "advantage_game":
      return "advantageGame";
  }
}

function parseRolls(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 6)
    .slice(0, 12);
}

export function RuleDeclarationDebugControls({
  send,
}: {
  send: (command: TestRoomCommand) => void;
}) {
  const { t } = useI18n();
  const [ruleId, setRuleId] = useState<RuleDeclarationId>("normal_rule");
  const [chooserPlayer, setChooserPlayer] = useState<PlayerId>("P1");
  const [threshold, setThreshold] = useState(3);
  const [rolls, setRolls] = useState("");

  return (
    <div className="space-y-2">
      <div className="section-kicker">{t("ruleDeclarations.title")}</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-500 dark:text-slate-300">
          {t("ruleDeclarations.selected")}
          <select
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
            value={ruleId}
            onChange={(event) => setRuleId(event.target.value as RuleDeclarationId)}
          >
            {RULE_IDS.map((id) => (
              <option key={id} value={id}>
                {t(`ruleDeclarations.${ruleKey(id)}.name`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500 dark:text-slate-300">
          {t("game.currentPlayer")}
          <select
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
            value={chooserPlayer}
            onChange={(event) => setChooserPlayer(event.target.value as PlayerId)}
          >
            <option value="P1">P1</option>
            <option value="P2">P2</option>
          </select>
        </label>
      </div>
      <label className="block text-xs text-slate-500 dark:text-slate-300">
        {t("ruleDeclarations.chooseThreshold")}
        <input
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
          min={3}
          max={50}
          type="number"
          value={threshold}
          onChange={(event) => setThreshold(Number.parseInt(event.target.value, 10) || 3)}
        />
      </label>
      <button
        type="button"
        className="btn btn-secondary btn-sm w-full"
        onClick={() =>
          send({
            type: "debugSetRuleDeclaration",
            ruleId,
            chooserPlayer,
            threshold,
          })
        }
      >
        {t("common.set")}
      </button>
      <label className="block text-xs text-slate-500 dark:text-slate-300">
        {t("testRoom.forcedRuleRolls")}
        <input
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
          placeholder="1 6 3"
          value={rolls}
          onChange={(event) => setRolls(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn btn-primary btn-sm w-full"
        onClick={() =>
          send({
            type: "debugTriggerRuleRoundEnd",
            rolls: parseRolls(rolls),
          })
        }
      >
        {t("testRoom.triggerRuleRoundEnd")}
      </button>
    </div>
  );
}
