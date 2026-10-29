import type { PlayerId, UnitClass } from "rules";
import type { GameShellViewModel } from "../hooks/useGameShellViewModel";
import { MatchTypeBadge } from "../../../matches/MatchTypeBadge";
import { Avatar } from "../../../profile/Avatar";
import { useI18n } from "../../../i18n";
import { getGameModeName } from "../../../modes/modeLabels";
import { getHeroDisplayName } from "../../../i18n/displayMetadata";
import { FALLBACK_TOKEN, getTokenSrc } from "../../../catalog/tokens";
import { useHeroes } from "../../../figures/useHeroes";

// The web bundle imports only types from "rules"; the class order is mirrored here.
const ARMY_ORDER: UnitClass[] = ["knight", "spearman", "rider", "archer", "assassin", "trickster", "berserker"];

function other(player: PlayerId): PlayerId {
  return player === "P1" ? "P2" : "P1";
}

/** One seat in the waiting room: the player's arched avatar, name and a single readiness state. */
export function LobbySeat({ vm, seat }: { vm: GameShellViewModel; seat: PlayerId }) {
  const { t } = useI18n();
  const meta = vm.roomMeta;
  const taken = !!meta?.players[seat] || meta?.origin === "MATCHMAKING";
  const name = taken ? meta?.playerNames?.[seat] || t("customLobby.guest") : null;
  const mine = vm.seat === seat;
  const ready = !!vm.readyStatus[seat];
  const rating =
    meta?.matchType === "RATED" ? (meta.ratedCompatibility?.ratings[seat] ?? null) : null;
  const state = !taken
    ? t(meta?.origin === "MATCHMAKING" ? "customLobby.reserved" : "customLobby.emptySeat")
    : ready
      ? t("common.ready")
      : t("common.waiting");
  return (
    <div
      className="lobby-seat"
      data-taken={taken || undefined}
      data-mine={mine || undefined}
      data-ready={(taken && ready) || undefined}
      data-testid={`lobby-seat-${seat}`}
    >
      <span className="lobby-seat__arch" aria-hidden="true">
        {name ? (
          <Avatar
            username={name}
            displayName={name}
            avatarUrl={meta?.playerAvatars?.[seat] ?? null}
            arch
          />
        ) : (
          <span className="lobby-seat__empty">+</span>
        )}
      </span>
      <span className="lobby-seat__kicker">
        {seat}
        {mine ? ` · ${t("competitive.you")}` : ""}
        {vm.view?.hostPlayerId === seat ? ` · ${t("roles.host")}` : ""}
      </span>
      <strong className="lobby-seat__name" dir="auto">
        {name ?? t("customLobby.emptySeat")}
      </strong>
      {rating != null && (
        <span className="lobby-seat__rating">
          {t("matchmaking.rating")} {Math.round(rating)}
        </span>
      )}
      {(taken || meta?.origin === "MATCHMAKING") && (
        <span className="lobby-seat__state">
          <span aria-hidden="true" className="lobby-seat__dot" />
          {state}
        </span>
      )}
    </div>
  );
}

/** Who the room is waiting for, in words; the start button repeats it when it is blocked. */
function useWaitingStatus(vm: GameShellViewModel) {
  const { t } = useI18n();
  const meta = vm.roomMeta;
  const names = {
    P1: meta?.playerNames?.P1 || "P1",
    P2: meta?.playerNames?.P2 || "P2",
  };
  const hostSeat = vm.view?.hostPlayerId ?? null;
  const seated = !!meta?.players.P1 && !!meta?.players.P2;
  const notReady = (["P1", "P2"] as const).filter((seat) => !vm.readyStatus[seat]);
  let status: string;
  if (!seated && meta?.origin !== "MATCHMAKING") {
    status = t("waitingRoom.status.openSeat");
  } else if (notReady.length === 2) {
    status = t("waitingRoom.status.bothNotReady");
  } else if (notReady.length === 1) {
    status =
      notReady[0] === vm.seat
        ? t("waitingRoom.status.youNotReady")
        : t("waitingRoom.status.notReady", { player: names[notReady[0]] });
  } else if (vm.isHost) {
    status = t("waitingRoom.status.allReadyHost");
  } else {
    status = t("waitingRoom.status.allReady", { player: hostSeat ? names[hostSeat] : "" });
  }
  const ready = seated && notReady.length === 0;
  const blocked = vm.canStartGame
    ? null
    : vm.pendingMeta
      ? t("waitingRoom.saving")
      : !ready
        ? status
        : meta?.matchType === "RATED"
          ? t("waitingRoom.ratedBlocked")
          : t("game.startBlocked");
  return { status, ready, blocked, names, hostSeat };
}

/** The ready, start and spectate controls; pinned under the stage on phones. */
export function WaitingRoomActions({
  vm,
  statusShown = false,
}: {
  vm: GameShellViewModel;
  /** The stage already shows the status line, so a reason that repeats it is left out. */
  statusShown?: boolean;
}) {
  const { t } = useI18n();
  const { blocked: reason, status, names, hostSeat } = useWaitingStatus(vm);
  const blocked = statusShown && reason === status ? null : reason;
  const draft = vm.roomMeta?.gameMode === "draft";
  if (!vm.seat) {
    return (
      <div className="waiting-actions" data-testid="waiting-actions">
        <p className="waiting-actions__reason">{t("waitingRoom.spectating")}</p>
      </div>
    );
  }
  const busy = !vm.joined || !!vm.pendingMeta;
  return (
    <div className="waiting-actions" data-testid="waiting-actions">
      <div className="waiting-actions__buttons">
        <button
          type="button"
          className={`btn waiting-actions__ready ${vm.playerReady ? "btn-secondary" : "btn-primary"}`}
          data-ready={vm.playerReady || undefined}
          onClick={() => vm.setReady(!vm.playerReady)}
          disabled={busy}
        >
          {vm.playerReady ? t("waitingRoom.readyOn") : t("game.readyUp")}
        </button>
        {vm.isHost ? (
          <button
            type="button"
            className="btn waiting-actions__start"
            onClick={() => vm.startGame()}
            disabled={!vm.canStartGame}
            aria-describedby={blocked ? "waiting-start-reason" : undefined}
          >
            {draft ? t("draft.startDraft") : t("game.startGame")}
          </button>
        ) : null}
      </div>
      {vm.isHost && blocked ? (
        <p id="waiting-start-reason" className="waiting-actions__reason">
          {blocked}
        </p>
      ) : !vm.isHost ? (
        <p className="waiting-actions__reason">
          {t("waitingRoom.hostStarts", { player: hostSeat ? names[hostSeat] : "" })}
        </p>
      ) : null}
      <button
        type="button"
        className="waiting-actions__link"
        onClick={() => vm.switchRole("spectator")}
        disabled={busy}
      >
        {t("game.switchSpectator")}
      </button>
    </div>
  );
}

/** "What you play": your army from the server in Standard and Classic; Draft picks in-match. */
function ArmyStrip({ vm }: { vm: GameShellViewModel }) {
  const { t, language } = useI18n();
  const { heroes } = useHeroes();
  const mode = vm.roomMeta?.gameMode ?? "standard";
  if (!vm.seat || mode === "draft" || !vm.view) return null;
  const byClass = new Map(
    Object.values(vm.view.units)
      .filter((unit) => unit.owner === vm.seat)
      .map((unit) => [unit.class, unit]),
  );
  const names = new Map(heroes.map((hero) => [hero.id, hero.name]));
  const army = ARMY_ORDER.map((unitClass) => byClass.get(unitClass)).filter(
    (unit): unit is NonNullable<typeof unit> => !!unit,
  );
  if (army.length === 0) return null;
  return (
    <section className="waiting-army" aria-labelledby="waiting-army-title">
      <h2 id="waiting-army-title" className="waiting-army__title">
        {t("waitingRoom.army", { mode: getGameModeName(mode, t) })}
      </h2>
      <ul className="waiting-army__list">
        {army.map((unit) => {
          const heroId = unit.heroId ?? `base-${unit.class}`;
          const name = getHeroDisplayName(heroId, names.get(heroId) ?? heroId, language);
          const token = getTokenSrc(heroId);
          return (
            <li key={unit.class} className="waiting-army__hero">
              <span className="waiting-army__arch" aria-hidden="true">
                {/* Base figures have no portrait: the arch carries the name's initial. */}
                {token === FALLBACK_TOKEN ? <span>{Array.from(name)[0]}</span> : <img src={token} alt="" />}
              </span>
              <span className="waiting-army__text">
                <small>{t(`classes.${unit.class}`)}</small>
                <strong>{name}</strong>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="waiting-army__note">
        {mode === "classic" ? t("waitingRoom.classicNote") : t("waitingRoom.standardNote")}
      </p>
    </section>
  );
}

/**
 * The waiting room before the match: both players face each other in arches, the room says in
 * words whom it waits for, and the buttons sit right under the players. Below, what you play.
 */
export function WaitingRoomStage({
  vm,
  withActions = true,
}: {
  vm: GameShellViewModel;
  withActions?: boolean;
}) {
  const { t } = useI18n();
  const meta = vm.roomMeta;
  const { status, ready } = useWaitingStatus(vm);
  const opponent = vm.seat ? other(vm.seat) : null;
  return (
    <section className="waiting-stage" aria-labelledby="waiting-stage-title" data-testid="waiting-stage">
      <div className="waiting-stage__duel-area">
        <header className="waiting-stage__head">
          <p className="waiting-stage__kicker">{t("game.stagingRoom")}</p>
          <h1 id="waiting-stage-title" className="waiting-stage__title">
            {meta?.lobbyName || t("customLobby.defaultName")}
          </h1>
          <p className="waiting-stage__facts">
            {meta ? <MatchTypeBadge matchType={meta.matchType} /> : null}
            <span>{getGameModeName(meta?.gameMode ?? "standard", t)}</span>
            <span>{t("lobby.spectators", { count: meta?.spectators ?? 0 })}</span>
          </p>
        </header>
        <div className="waiting-stage__duel lobby-seats" data-testid="lobby-seats">
          <LobbySeat vm={vm} seat={vm.seat === "P2" ? "P2" : "P1"} />
          <span className="waiting-stage__vs" aria-hidden="true">
            {t("customLobby.vs")}
          </span>
          <LobbySeat vm={vm} seat={vm.seat === "P2" ? "P1" : "P2"} />
        </div>
        <p
          className="waiting-stage__status"
          role="status"
          data-ready={ready || undefined}
          data-opponent={opponent ?? undefined}
        >
          {status}
        </p>
        {withActions ? <WaitingRoomActions vm={vm} statusShown /> : null}
      </div>
      <ArmyStrip vm={vm} />
    </section>
  );
}
