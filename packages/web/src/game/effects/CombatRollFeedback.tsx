import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { PlayerId } from "rules";
import type { Translate } from "../../i18n";
import { combatRollSide } from "./combatPlayback";
import type { CombatRollDisplay } from "./combatExchange";
import { diceResultTiming } from "./diceResultTiming";

/** Displays only projected rollResolved evidence. Never guesses an outcome. */
export function CombatRollFeedback({
  cue,
  t,
  playerId = null,
}: {
  cue: CombatRollDisplay | null;
  t: Translate;
  playerId?: PlayerId | null;
}) {
  if (!cue) return null;
  const { roll } = cue;
  const side = combatRollSide(roll.rollKind);
  // The core combat resolver records 1d6 only for its separate tie-break stage.
  const usesCoreCombat =
    roll.rollKind.startsWith("attack_") || roll.rollKind.startsWith("riderPathAttack_");
  const tieBreak = usesCoreCombat && roll.sides === 6 && roll.dice.length === 1;
  const sideTitle = t(
    roll.rollKind === "kaiserCarpetStrikeCenter"
      ? "pending.context.centerRoll"
      : side === "attack"
        ? "pending.context.attackRoll"
        : "pending.context.defenseRoll",
  );
  const title = tieBreak ? t("diceResult.tieBreak") : sideTitle;
  const timing = diceResultTiming(cue.reducedMotion);
  const style = {
    "--dice-enter-ms": `${timing.entranceMs}ms`,
    "--dice-reveal-ms": `${timing.revealMs}ms`,
    "--dice-exit-ms": `${timing.exitMs}ms`,
    "--dice-exit-at-ms": `${timing.exitAtMs}ms`,
  } as CSSProperties;
  const attack = side === "attack" ? roll : cue.pairedRoll;
  const defense = side === "defense" ? roll : undefined;
  const rollColumn = (
    evidence: typeof roll | undefined,
    columnTitle: string,
    columnSide: string,
  ) => (
    <div
      className="combat-roll-column"
      data-roll-side={columnSide}
      key={columnSide}
      data-roll-winner={
        evidence &&
        cue.outcome &&
        (cue.outcome === "hit" ? columnSide === "attack" : columnSide === "defense")
          ? "true"
          : undefined
      }
    >
      <h2 className="combat-roll-feedback__title">{columnTitle}</h2>
      {evidence ? (
        <div key={`${evidence.rollId}:${evidence.rollIndex}`} data-combat-roll={evidence.rollId}>
          <div className="combat-roll-feedback__meta">
            <span>
              {evidence.rollerPlayerId === playerId
                ? t("diceResult.yourRoll")
                : t("diceResult.playerRoll", { player: evidence.rollerPlayerId })}
            </span>
            <span className="combat-roll-feedback__notation">
              {evidence.dice.length}d{evidence.sides}
            </span>
          </div>
          <div className="combat-roll-feedback__dice">
            {evidence.dice.map((value, index) => (
              <span
                key={index}
                data-combat-die={value}
                className="combat-roll-feedback__die"
                role="img"
                aria-label={t("diceResult.die", { index: index + 1, sides: evidence.sides, value })}
              >
                <span aria-hidden="true">{value}</span>
              </span>
            ))}
          </div>
          <div className="combat-roll-feedback__result">
            <div>
              <div className="combat-roll-feedback__total-label">{t("diceResult.total")}</div>
              {evidence.dice.length > 1 && (
                <div className="combat-roll-feedback__sum">
                  {evidence.dice.join(" + ")} = {evidence.total}
                </div>
              )}
            </div>
            <strong className="combat-roll-feedback__total" data-combat-total={evidence.total}>
              {evidence.total}
            </strong>
          </div>
        </div>
      ) : (
        <div className="combat-roll-feedback__waiting" aria-label={t("diceResult.waiting")}>
          <span aria-hidden="true">···</span>
          <span>{t("diceResult.waiting")}</span>
        </div>
      )}
    </div>
  );
  const card = (
    <div
      className="combat-roll-layer pointer-events-none"
      data-combat-cue={cue.id}
      data-reduced-motion={cue.reducedMotion ? "true" : "false"}
      style={style}
    >
      <section
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`combat-roll-feedback${side ? " combat-roll-feedback--exchange" : ""}`}
      >
        {tieBreak && <p className="combat-roll-feedback__phase">{title}</p>}
        {side ? (
          <div className="combat-roll-columns">
            {rollColumn(attack, t("pending.context.attackRoll"), "attack")}
            <span className="combat-roll-feedback__versus" aria-hidden="true">
              ×
            </span>
            {rollColumn(defense, t("pending.context.defenseRoll"), "defense")}
          </div>
        ) : (
          <div data-combat-roll={roll.rollId}>
            <div className="combat-roll-feedback__meta">
              <span>
                {roll.rollerPlayerId === playerId
                  ? t("diceResult.yourRoll")
                  : t("diceResult.playerRoll", { player: roll.rollerPlayerId })}
              </span>
              <span className="combat-roll-feedback__notation">
                {roll.dice.length}d{roll.sides}
              </span>
            </div>
            <h2 className="combat-roll-feedback__title">{title}</h2>
            {tieBreak ? <p className="combat-roll-feedback__phase">{sideTitle}</p> : null}
            <div className="combat-roll-feedback__dice">
              {roll.dice.map((value, index) => (
                <span
                  key={index}
                  data-combat-die={value}
                  className="combat-roll-feedback__die"
                  role="img"
                  aria-label={t("diceResult.die", { index: index + 1, sides: roll.sides, value })}
                >
                  <span aria-hidden="true">{value}</span>
                </span>
              ))}
            </div>
            <div className="combat-roll-feedback__result">
              <div>
                <div className="combat-roll-feedback__total-label">{t("diceResult.total")}</div>
                {roll.dice.length > 1 ? (
                  <div className="combat-roll-feedback__sum">
                    {roll.dice.join(" + ")} = {roll.total}
                  </div>
                ) : null}
              </div>
              <strong className="combat-roll-feedback__total" data-combat-total={roll.total}>
                {roll.total}
              </strong>
            </div>
          </div>
        )}
      </section>
    </div>
  );
  // Escape board clipping and stacking contexts, including the next pending dialog.
  return typeof document === "undefined" ? card : createPortal(card, document.body);
}
