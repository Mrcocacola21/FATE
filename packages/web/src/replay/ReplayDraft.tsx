import { useState } from "react";
import type { PlayerId, RuleDeclarationId, UnitClass } from "rules";
import { getTokenSrc } from "../catalog/tokens";
import { useI18n, type Language, type Translate } from "../i18n";
import { getHeroDisplayName } from "../i18n/displayMetadata";
import { ruleDeclarationKey } from "../game/gameshell-content/components/RuleDeclarationChoicePanel";
import type { ReplayDraft, ReplayDraftEvent, ReplayMetadata, ReplayView } from "./types";

// The web bundle imports only types from "rules"; the roster order mirrors the draft screen.
const DRAFT_CLASSES: UnitClass[] = [
  "knight",
  "spearman",
  "rider",
  "archer",
  "assassin",
  "trickster",
  "berserker",
];

export type ReplayDraftStep = {
  step: number;
  round: 1 | 2 | null;
  kind: "ban" | "pick" | "skip";
  player: PlayerId;
  heroId: string | null;
  primaryClass: UnitClass | null;
  revision: number;
  state: "done" | "current" | "future";
};
export type ReplayDraftGroup = { kind: "ban" | "pick"; round: 1 | 2 | null; steps: ReplayDraftStep[] };

/** Draft position at a revision. Steps come from the server; nothing here re-runs the rules. */
export function replayDraftView(draft: ReplayDraft, revision: number) {
  const visible = draft.events.filter((event) => event.revision <= revision);
  const numbered = draft.events.filter(
    (event): event is ReplayDraftEvent & { step: number } => event.step !== undefined,
  );
  const latest = [...numbered].reverse().find((event) => event.revision <= revision)?.step ?? 0;
  const steps: ReplayDraftStep[] = numbered.map((event) => ({
    step: event.step,
    round: event.round ?? null,
    kind: event.type === "ban" ? "ban" : event.type === "pick" ? "pick" : "skip",
    player: event.player,
    heroId: "heroId" in event ? event.heroId : null,
    primaryClass: "primaryClass" in event ? event.primaryClass : null,
    revision: event.revision,
    state: event.step < latest ? "done" : event.step === latest ? "current" : "future",
  }));
  const groups: ReplayDraftGroup[] = [];
  for (const step of steps) {
    const kind = step.kind === "pick" ? "pick" : "ban";
    const last = groups[groups.length - 1];
    if (last && last.kind === kind && last.round === (kind === "ban" ? step.round : null))
      last.steps.push(step);
    else groups.push({ kind, round: kind === "ban" ? step.round : null, steps: [step] });
  }
  const picks: Record<PlayerId, Partial<Record<UnitClass, ReplayDraftStep>>> = { P1: {}, P2: {} };
  for (const step of steps)
    if (step.kind === "pick" && step.state !== "future" && step.primaryClass)
      picks[step.player][step.primaryClass] = step;
  const banSteps = steps.filter((step) => step.kind !== "pick");
  // Privileges: the last roll pair decides; sides name who picks and who places first.
  const rolls: Partial<Record<PlayerId, number>> = {};
  let firstPicker: PlayerId | null = null;
  let placementFirst: PlayerId | null = null;
  let ruleId: RuleDeclarationId | null = null;
  const other = (player: PlayerId): PlayerId => (player === "P1" ? "P2" : "P1");
  for (const event of visible) {
    if (event.type === "roll") rolls[event.player] = event.dice.reduce((sum, die) => sum + die, 0);
    if (event.type === "chooseDraftSide")
      firstPicker = event.side === "first" ? event.player : other(event.player);
    if (event.type === "chooseFieldSide")
      placementFirst = event.side === "placeFirst" ? event.player : other(event.player);
    if (event.type === "chooseRule") ruleId = event.ruleId;
  }
  const started = revision >= draft.startRevision;
  return {
    started,
    steps,
    groups,
    picks,
    banSteps,
    latest: steps.find((step) => step.state === "current") ?? null,
    privileges:
      draft.legacy || rolls.P1 === undefined || rolls.P2 === undefined
        ? null
        : { rolls: { P1: rolls.P1, P2: rolls.P2 }, firstPicker, placementFirst, ruleId },
  };
}

function heroName(heroId: string | null, language: Language) {
  return heroId ? getHeroDisplayName(heroId, heroId, language) : "";
}

export function describeReplayDraftStep(
  step: ReplayDraftStep,
  names: Record<PlayerId, string>,
  t: Translate,
  language: Language,
) {
  const values = { player: names[step.player], hero: heroName(step.heroId, language) };
  return step.kind === "ban"
    ? t("replay.draft.banned", values)
    : step.kind === "pick"
      ? t("replay.draft.picked", values)
      : t("replay.draft.skipped", values);
}

function groupTitle(group: ReplayDraftGroup, legacy: boolean, t: Translate) {
  if (group.kind === "pick") return t("replay.draft.picks", { count: group.steps.length });
  if (legacy) return t("draft.bans");
  return group.round === 2 ? t("replay.draft.middleBans") : t("replay.draft.openingBans");
}

function seatNames(metadata: ReplayMetadata): Record<PlayerId, string> {
  const name = (seat: PlayerId) =>
    metadata.participants.find((p) => p.seat === seat)?.displayName ?? seat;
  return { P1: name("P1"), P2: name("P2") };
}

function Seat({ player }: { player: PlayerId }) {
  return (
    <span className="replay-draft-seat" data-seat={player}>
      {player}
    </span>
  );
}

function Portrait({
  heroId,
  kind,
  size,
  fresh,
  fallen,
}: {
  heroId: string | null;
  kind: "pick" | "ban";
  size: "lg" | "md" | "sm";
  fresh?: boolean;
  fallen?: boolean;
}) {
  return (
    <span
      className="replay-draft-portrait"
      data-size={size}
      data-kind={kind}
      data-filled={heroId ? "true" : undefined}
      data-fresh={fresh ? "true" : undefined}
      data-fallen={fallen ? "true" : undefined}
    >
      {heroId && <img src={getTokenSrc(heroId)} alt="" />}
      {heroId && kind === "ban" && (
        <span className="replay-draft-portrait__cross" aria-hidden="true">
          ✕
        </span>
      )}
    </span>
  );
}

/** Shown in place of the empty lobby board while the replay is inside the draft. */
export function ReplayDraftTable({
  metadata,
  draft,
  revision,
  onNavigate,
}: {
  metadata: ReplayMetadata;
  draft: ReplayDraft;
  revision: number;
  onNavigate: (revision: number) => void;
}) {
  const { t, language } = useI18n();
  const view = replayDraftView(draft, revision);
  const names = seatNames(metadata);
  const total = view.steps.length;
  const bansTotal = draft.legacy ? 4 : 6;
  const roster = (player: PlayerId) => (
    <div className="replay-draft-roster" data-seat={player}>
      <div className="replay-draft-roster__head">
        <Seat player={player} />
        <strong>{names[player]}</strong>
        <span className="replay-draft-muted">
          {Object.keys(view.picks[player]).length}/{DRAFT_CLASSES.length}
        </span>
      </div>
      <ul className="replay-draft-slots">
        {DRAFT_CLASSES.map((unitClass) => {
          const pick = view.picks[player][unitClass];
          return (
            <li key={unitClass} className="replay-draft-slot">
              <Portrait
                heroId={pick?.heroId ?? null}
                kind="pick"
                size="lg"
                fresh={pick?.state === "current"}
              />
              <span className="replay-draft-slot__name">{heroName(pick?.heroId ?? null, language)}</span>
              <span className="replay-draft-muted">{t(`classes.${unitClass}`)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
  const visibleBans = view.banSteps.filter((step) => step.state !== "future");
  return (
    <section className="replay-draft" aria-label={t("replay.draft.title")} data-testid="replay-draft-table">
      <div className="replay-draft-table">
        {view.privileges && (
          <dl className="replay-draft-ledger">
            <div>
              <dt>{t("draftPrep.ledgerInitiative")}</dt>
              <dd>
                {t("draftPrep.ledgerInitiativeValue", {
                  player: names[view.privileges.rolls.P1 >= view.privileges.rolls.P2 ? "P1" : "P2"],
                  p1: view.privileges.rolls.P1,
                  p2: view.privileges.rolls.P2,
                })}
              </dd>
            </div>
            {view.privileges.firstPicker && (
              <div>
                <dt>{t("draftPrep.ledgerFirstPick")}</dt>
                <dd>{names[view.privileges.firstPicker]}</dd>
              </div>
            )}
            {view.privileges.placementFirst && (
              <div>
                <dt>{t("draftPrep.ledgerPlacesFirst")}</dt>
                <dd>{names[view.privileges.placementFirst]}</dd>
              </div>
            )}
            {view.privileges.ruleId && (
              <div>
                <dt>{t("draftPrep.ledgerRule")}</dt>
                <dd>
                  {t(`ruleDeclarations.${ruleDeclarationKey(view.privileges.ruleId)}.name`)}
                </dd>
              </div>
            )}
          </dl>
        )}
        <div className="replay-draft-board">
          {roster("P1")}
          <div className="replay-draft-bans">
            <span className="replay-draft-kicker">
              {t("draft.bans")} · {visibleBans.length}/{bansTotal}
            </span>
            <ul className="replay-draft-bans__grid">
              {Array.from({ length: bansTotal }, (_, index) => {
                const ban = visibleBans[index];
                return (
                  <li key={index} className="replay-draft-ban">
                    <Portrait
                      heroId={ban?.heroId ?? null}
                      kind="ban"
                      size="md"
                      fresh={ban?.state === "current"}
                    />
                    <span className="replay-draft-muted">
                      {ban
                        ? ban.kind === "skip"
                          ? `${ban.player} · ${t("replay.draft.skippedShort")}`
                          : `${heroName(ban.heroId, language)} · ${ban.player}`
                        : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          {roster("P2")}
        </div>
      </div>
      <nav className="replay-draft-order" aria-label={t("draft.draftOrder")}>
        <div className="replay-draft-order__head">
          <strong>{t("draft.draftOrder")}</strong>
          <span className="replay-draft-muted">
            {t("replay.draft.step", { step: view.latest?.step ?? 0, total })}
          </span>
        </div>
        {view.groups.map((group) => (
          <div key={`${group.kind}-${group.steps[0].step}`}>
            <p className="replay-draft-kicker">{groupTitle(group, draft.legacy, t)}</p>
            <ol className="replay-draft-steps">
              {group.steps.map((step) => (
                <li key={step.step}>
                  <button
                    type="button"
                    className="replay-draft-step"
                    data-state={step.state}
                    aria-current={step.state === "current" ? "step" : undefined}
                    onClick={() => onNavigate(step.revision)}
                  >
                    <span className="replay-draft-step__no">{step.step}</span>
                    <Seat player={step.player} />
                    <Portrait heroId={step.heroId} kind={step.kind === "pick" ? "pick" : "ban"} size="sm" />
                    <span className="replay-draft-step__text">
                      <span className="replay-draft-step__hero">
                        {step.heroId ? heroName(step.heroId, language) : t("replay.draft.skippedShort")}
                      </span>
                      <span className="replay-draft-muted">
                        {step.kind === "pick" ? t("draft.phases.pick") : t("draft.phases.ban")}
                        {step.primaryClass ? ` · ${t(`classes.${step.primaryClass}`)}` : ""}
                      </span>
                    </span>
                    <span className="sr-only">{describeReplayDraftStep(step, names, t, language)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </nav>
    </section>
  );
}

/** Above the battle board: both drafted squads (fallen dimmed), the bans, and the order on demand. */
export function ReplayDraftSummary({
  metadata,
  draft,
  state,
  revision,
  onNavigate,
}: {
  metadata: ReplayMetadata;
  draft: ReplayDraft;
  state: ReplayView;
  revision: number;
  onNavigate: (revision: number) => void;
}) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const view = replayDraftView(draft, Number.MAX_SAFE_INTEGER);
  const names = seatNames(metadata);
  const fallen = (player: PlayerId, heroId: string | null) =>
    Object.values(state.units).some(
      (unit) => unit.owner === player && unit.heroId === heroId && !unit.isAlive,
    );
  const squad = (player: PlayerId) => (
    <ul className="replay-draft-squad" aria-label={names[player]}>
      {view.steps
        .filter((step) => step.kind === "pick" && step.player === player)
        .map((step) => {
          const down = fallen(player, step.heroId);
          const name = heroName(step.heroId, language);
          return (
            <li key={step.step} title={down ? `${name} · ${t("replay.draft.fallen")}` : name}>
              <Portrait heroId={step.heroId} kind="pick" size="sm" fallen={down} />
              <span className="sr-only">{down ? `${name} · ${t("replay.draft.fallen")}` : name}</span>
            </li>
          );
        })}
    </ul>
  );
  return (
    <section className="replay-draft-summary" aria-label={t("replay.draft.summary")} data-testid="replay-draft-summary">
      <div className="replay-draft-summary__row">
        <strong>{t("replay.draft.summary")}</strong>
        <Seat player="P1" />
        {squad("P1")}
        <ul className="replay-draft-squad replay-draft-squad--bans" aria-label={t("draft.bans")}>
          {view.banSteps.map((step) => {
            const label = step.heroId ? heroName(step.heroId, language) : t("replay.draft.skippedShort");
            return (
              <li key={step.step} title={`${label} · ${step.player}`}>
                <Portrait heroId={step.heroId} kind="ban" size="sm" />
                <span className="sr-only">{`${label} · ${step.player}`}</span>
              </li>
            );
          })}
        </ul>
        {squad("P2")}
        <Seat player="P2" />
        <button
          type="button"
          className="replay-button text-sm"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t("replay.draft.hideOrder") : t("replay.draft.showOrder")}
        </button>
      </div>
      {open && (
        <ol className="replay-draft-ribbon" aria-label={t("draft.draftOrder")}>
          {view.steps.map((step, index) => {
            const previous = view.steps[index - 1];
            const breakBefore =
              !!previous &&
              (previous.kind === "pick") !== (step.kind === "pick");
            return (
              <li key={step.step} data-break={breakBefore ? "true" : undefined}>
                <button
                  type="button"
                  className="replay-draft-chip"
                  data-state={step.revision === revision ? "current" : "done"}
                  onClick={() => onNavigate(step.revision)}
                  aria-label={`${step.step}. ${describeReplayDraftStep(step, names, t, language)}`}
                  title={describeReplayDraftStep(step, names, t, language)}
                >
                  <span className="replay-draft-muted">{step.step}</span>
                  <Portrait heroId={step.heroId} kind={step.kind === "pick" ? "pick" : "ban"} size="sm" />
                  <span className="replay-draft-chip__bar" data-seat={step.player} />
                  <span className="replay-draft-chip__kind" data-kind={step.kind === "pick" ? "pick" : "ban"}>
                    {step.kind === "pick" ? t("draft.phases.pick") : t("draft.phases.ban")}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
