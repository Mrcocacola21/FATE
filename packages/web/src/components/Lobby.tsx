import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "../store";
import type { PlayerRole } from "../ws";
import { PanelCard, SectionHeader, StatusBadge } from "./ui";
import { RulesModal } from "./RulesModal";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n } from "../i18n";
import {
  getConnectionLabel,
  getHeroDisplayName,
  getPhaseLabel,
  localizeServerText,
} from "../i18n/displayMetadata";
import { getServerCapabilities } from "../api";
import { EmptyState } from "../ui";
import { getGameModeName } from "../modes/modeLabels";
import { getSelectedHeroes } from "../figures/getSelectedHeroes";
import { LobbyLayout } from "../layout/LobbyLayouts";

interface LobbyProps {
  onOpenFigures?: () => void;
  onOpenHeartbreak?: () => void;
}
export function Lobby({ onOpenFigures, onOpenHeartbreak }: LobbyProps) {
  const { language, t } = useI18n();
  const { connectionStatus, roomsList, joinError, fetchRooms, joinRoom } = useGameStore();
  const roleLabel = (value: PlayerRole) => t(`roles.${value}`);

  const [roomId, setRoomId] = useState("");
  const [role, setRole] = useState<PlayerRole>("P1");
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [pendingJoinRoom, setPendingJoinRoom] = useState<{
    id: string;
    players: { P1: boolean; P2: boolean };
  } | null>(null);
  const [joinRole, setJoinRole] = useState<PlayerRole>("P1");
  const [joinBusy, setJoinBusy] = useState(false);
  const [testRoomEnabled, setTestRoomEnabled] = useState(import.meta.env.DEV);
  const [testRoomRequiresToken, setTestRoomRequiresToken] = useState(false);
  const [debugToken, setDebugToken] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const selectedHeroes = useMemo(() => getSelectedHeroes(), []);

  useEffect(() => {
    fetchRooms().catch((err) => {
      setLocalError(
        localizeServerText(err instanceof Error ? err.message : "", t) || t("errors.loadRooms"),
      );
    });
  }, [fetchRooms]);

  useEffect(() => {
    getServerCapabilities()
      .then((capabilities) => {
        const clientEnabled =
          import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_ROOM === "true";
        setTestRoomEnabled(clientEnabled && capabilities.testRooms.enabled);
        setTestRoomRequiresToken(capabilities.testRooms.requiresToken);
      })
      .catch(() => {
        setTestRoomEnabled(false);
      });
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setLocalError(null);
    try {
      await fetchRooms();
    } catch (err) {
      setLocalError(
        localizeServerText(err instanceof Error ? err.message : "", t) || t("errors.loadRooms"),
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setLocalError(null);
    try {
      await joinRoom({
        mode: "create",
        role,
        name: name.trim() ? name.trim() : undefined,
      });
      await fetchRooms();
    } catch (err) {
      setLocalError(
        localizeServerText(err instanceof Error ? err.message : "", t) || t("errors.createRoom"),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const trimmed = roomId.trim();
    if (!trimmed) {
      setLocalError(t("lobby.roomIdRequired"));
      return;
    }
    setLocalError(null);
    try {
      await joinRoom({
        mode: "join",
        roomId: trimmed,
        role,
        name: name.trim() ? name.trim() : undefined,
      });
    } catch (err) {
      setLocalError(
        localizeServerText(err instanceof Error ? err.message : "", t) || t("errors.joinRoom"),
      );
    }
  };

  const handleCreateTestRoom = async () => {
    setTestBusy(true);
    setLocalError(null);
    try {
      await joinRoom({
        mode: "create",
        role: "P1",
        name: name.trim() ? name.trim() : undefined,
        roomMode: "test",
        debugToken: debugToken.trim() || undefined,
      });
      await fetchRooms();
    } catch (err) {
      setLocalError(
        localizeServerText(err instanceof Error ? err.message : "", t) || t("errors.createRoom"),
      );
    } finally {
      setTestBusy(false);
    }
  };

  const connectionTone =
    connectionStatus === "connected"
      ? "success"
      : connectionStatus === "connecting"
        ? "warning"
        : "neutral";

  return (
    <LobbyLayout>
        <PanelCard as="header" variant="hud" className="hero-command p-3.5 sm:p-7">
          <div className="relative z-10 flex min-w-0 flex-col gap-3 sm:gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="hidden items-center gap-2 lg:absolute lg:right-0 lg:top-0 lg:flex">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
            <div className="flex min-w-0 items-start gap-4">
              <div className="brand-sigil mt-1 hidden h-16 w-16 sm:flex" aria-hidden="true" />
              <div className="min-w-0 max-w-2xl">
                <div className="section-kicker">{t("lobby.kicker")}</div>
                <h1 className="fate-brand mt-1 text-2xl sm:mt-2 sm:text-5xl">{t("lobby.title")}</h1>
                <p className="mt-3 hidden max-w-xl text-sm leading-6 text-stone-600 dark:text-stone-300 sm:block sm:text-base">
                  {t("lobby.subtitle")}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <StatusBadge tone={connectionTone} dot>
                    {connectionStatus === "connected"
                      ? t("connection.serverConnected")
                      : connectionStatus === "connecting"
                        ? t("connection.connectingToServer")
                        : t("connection.connectsWhenJoin")}
                  </StatusBadge>
                  <StatusBadge tone="info">
                    {t("lobby.openRooms", { count: roomsList.length })}
                  </StatusBadge>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary w-full lg:hidden"
              data-testid="mobile-lobby-settings"
              aria-expanded={showMobileSettings}
              onClick={() => setShowMobileSettings((current) => !current)}
            >
              {t("mobile.settings")}
            </button>
            <nav
              className={`${showMobileSettings ? "grid" : "hidden"} w-full min-w-0 grid-cols-2 gap-2 lg:flex lg:w-auto lg:max-w-md lg:flex-wrap lg:items-center lg:justify-end`}
              aria-label={t("lobby.navLabel")}
            >
              {onOpenFigures ? (
                <button
                  type="button"
                  className="btn btn-primary w-full lg:w-auto"
                  onClick={onOpenFigures}
                >
                  {t("lobby.figureSet")}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary w-full lg:w-auto"
                onClick={() => setShowRules(true)}
              >
                {t("lobby.rules")}
              </button>
              {onOpenHeartbreak ? (
                <button
                  type="button"
                  className="btn btn-secondary w-full lg:w-auto"
                  onClick={onOpenHeartbreak}
                >
                  {t("lobby.heartbreak")}
                </button>
              ) : null}
              <ThemeToggle className="w-full lg:hidden" />
              <LanguageSwitcher className="w-full justify-center lg:hidden" />
              <details className="panel-card-muted col-span-2 p-3 text-left lg:hidden">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">
                  {t("mobile.selectedFigureSet")}
                </summary>
                <div className="mt-2 grid gap-1.5 text-xs text-stone-600 dark:text-stone-300">
                  {selectedHeroes.map((hero) => (
                    <div key={hero.mainClass} className="flex min-w-0 justify-between gap-3">
                      <span className="font-semibold">{t(`classes.${hero.mainClass}`)}</span>
                      <span className="truncate">
                        {getHeroDisplayName(hero.id, hero.name, language)}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            </nav>
          </div>
        </PanelCard>

        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <PanelCard className="order-2 min-h-[430px] p-4 sm:p-6 lg:order-1">
            <SectionHeader
              kicker={t("lobby.browserKicker")}
              title={t("lobby.availableRooms")}
              description={t("lobby.availableRoomsDescription")}
              action={
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  {refreshing ? t("common.refreshing") : t("common.refresh")}
                </button>
              }
            />

            <div className="mt-5 space-y-3">
              {roomsList.length === 0 ? (
                <EmptyState
                  title={t("lobby.noRooms")}
                  description={t("lobby.noRoomsDescription")}
                  className="min-h-64"
                  icon={
                    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                      <path
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.7"
                        d="M4 7.5h16v10H4zM8 11h.01M16 11h.01M9 16h6"
                      />
                    </svg>
                  }
                />
              ) : null}

              {roomsList.map((room) => (
                <article
                  key={room.id}
                  className="group relative overflow-hidden rounded-2xl border border-stone-300/70 bg-stone-100/55 p-4 transition hover:-translate-y-px hover:border-amber-500/50 hover:bg-white hover:shadow-xl hover:shadow-amber-950/5 dark:border-stone-700/70 dark:bg-black/20 dark:hover:border-amber-500/45 dark:hover:bg-stone-900/80"
                >
                  <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-amber-500/55" />
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-all font-mono text-sm font-semibold text-slate-900 dark:text-white">
                          {room.id}
                        </h3>
                        <StatusBadge tone={room.phase === "lobby" ? "success" : "warning"}>
                          {getPhaseLabel(room.phase, t)}
                        </StatusBadge>
                        {room.roomMode === "test" ? (
                          <StatusBadge tone="special">{t("testRoom.badge")}</StatusBadge>
                        ) : null}
                        {room.roomMode === "normal" ? (
                          <StatusBadge tone="info">
                            {getGameModeName(room.gameMode ?? "standard", t)}
                          </StatusBadge>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusBadge tone="info">
                          {t("mobile.playersCount", {
                            count: Number(room.players.P1) + Number(room.players.P2),
                          })}
                        </StatusBadge>
                        <StatusBadge tone={room.players.P1 ? "neutral" : "success"}>
                          P1 {room.players.P1 ? t("common.occupied") : t("common.open")}
                        </StatusBadge>
                        <StatusBadge tone={room.players.P2 ? "neutral" : "success"}>
                          P2 {room.players.P2 ? t("common.occupied") : t("common.open")}
                        </StatusBadge>
                        <StatusBadge tone="info">
                          {t("lobby.spectators", { count: room.spectators })}
                        </StatusBadge>
                      </div>
                      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        {t("lobby.readyState", {
                          p1: room.ready.P1 ? t("common.ready") : t("common.waiting"),
                          p2: room.ready.P2 ? t("common.ready") : t("common.waiting"),
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary w-full sm:w-auto"
                      onClick={() => {
                        const suggested =
                          room.players.P1 && !room.players.P2
                            ? "P2"
                            : room.players.P2 && !room.players.P1
                              ? "P1"
                              : "spectator";
                        setJoinRole(suggested);
                        setLocalError(null);
                        setPendingJoinRoom({
                          id: room.id,
                          players: room.players,
                        });
                      }}
                    >
                      {room.phase !== "lobby" || (room.players.P1 && room.players.P2)
                        ? t("lobby.spectateRoom")
                        : t("lobby.joinRoom")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </PanelCard>

          <div className="order-1 flex flex-col gap-3 sm:gap-5 lg:order-2">
            <PanelCard variant="parchment" className="order-1 p-4 sm:p-6">
              <SectionHeader
                kicker={t("lobby.hostKicker")}
                title={t("lobby.createRoom")}
                description={t("lobby.createDescription", { role: roleLabel(role).toLowerCase() })}
              />
              <button
                type="button"
                className="btn btn-primary mt-5 w-full"
                data-testid="create-room"
                onClick={handleCreate}
                disabled={busy}
              >
                {busy ? t("lobby.creating") : t("lobby.createNew")}
              </button>
            </PanelCard>

            {testRoomEnabled ? (
              <PanelCard variant="arcane" className="order-3 p-4 sm:p-6 lg:order-2">
                <SectionHeader
                  kicker={t("testRoom.kicker")}
                  title={t("testRoom.create")}
                  description={t("testRoom.createDescription")}
                />
                {testRoomRequiresToken ? (
                  <div className="mt-4">
                    <label className="field-label" htmlFor="test-room-token">
                      {t("testRoom.debugToken")}
                    </label>
                    <input
                      id="test-room-token"
                      type="password"
                      className="field-control font-mono"
                      value={debugToken}
                      onChange={(event) => setDebugToken(event.target.value)}
                      autoComplete="off"
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  className="btn btn-arcane mt-4 w-full"
                  data-testid="create-test-room"
                  onClick={handleCreateTestRoom}
                  disabled={testBusy || (testRoomRequiresToken && !debugToken.trim())}
                >
                  {testBusy ? t("testRoom.creating") : t("testRoom.create")}
                </button>
              </PanelCard>
            ) : null}

            <PanelCard variant="hud" className="order-2 p-4 sm:p-6 lg:order-3">
              <SectionHeader
                kicker={t("lobby.directKicker")}
                title={t("lobby.joinById")}
                description={t("lobby.joinByIdDescription")}
              />
              <div className="mt-5 space-y-4">
                <div>
                  <label className="field-label" htmlFor="room-id">
                    {t("lobby.roomId")}
                  </label>
                  <input
                    id="room-id"
                    className="field-control font-mono"
                    placeholder={t("lobby.pasteRoomId")}
                    value={roomId}
                    onChange={(event) => setRoomId(event.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="lobby-role">
                    {t("lobby.role")}
                  </label>
                  <select
                    id="lobby-role"
                    className="field-control"
                    value={role}
                    onChange={(event) => setRole(event.target.value as PlayerRole)}
                  >
                    <option value="P1">{roleLabel("P1")} (P1)</option>
                    <option value="P2">{roleLabel("P2")} (P2)</option>
                    <option value="spectator">{roleLabel("spectator")}</option>
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="player-name">
                    {t("lobby.displayName")}{" "}
                    <span className="font-normal text-slate-400">({t("common.optional")})</span>
                  </label>
                  <input
                    id="player-name"
                    className="field-control"
                    placeholder={t("lobby.commanderName")}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="nickname"
                  />
                </div>
                <button type="button" className="btn btn-strong w-full" data-testid="join-by-id" onClick={handleJoin}>
                  {t("lobby.joinRoom")}
                </button>
                {localError || joinError ? (
                  <div
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-200"
                    role="alert"
                  >
                    {localError ?? localizeServerText(joinError, t)}
                  </div>
                ) : null}
              </div>
            </PanelCard>
          </div>
        </div>

        {pendingJoinRoom ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-room-title"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !joinBusy) {
                setPendingJoinRoom(null);
              }
            }}
          >
            <PanelCard
              variant="arcane"
              className="arcane-prompt w-full max-w-md p-5 shadow-2xl sm:p-6"
            >
              <SectionHeader
                kicker={t("lobby.chooseSeat")}
                title={<span id="join-room-title">{t("lobby.joinRoom")}</span>}
                description={
                  <span className="break-all font-mono text-xs">{pendingJoinRoom.id}</span>
                }
              />
              <fieldset className="mt-5 space-y-2">
                <legend className="sr-only">{t("lobby.roomRole")}</legend>
                {(["P1", "P2", "spectator"] as PlayerRole[]).map((option) => {
                  const taken = option !== "spectator" && pendingJoinRoom.players[option];
                  return (
                    <label
                      key={option}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-3 text-sm transition ${
                        joinRole === option
                          ? "border-teal-500 bg-teal-50 text-teal-900 ring-2 ring-teal-500/10 dark:bg-teal-950/40 dark:text-teal-100"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-200 dark:hover:border-slate-700"
                      } ${taken ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="joinRole"
                          value={option}
                          checked={joinRole === option}
                          disabled={taken}
                          onChange={() => setJoinRole(option)}
                          className="h-4 w-4 accent-teal-600"
                        />
                        <span className="font-semibold">{roleLabel(option)}</span>
                      </span>
                      <StatusBadge tone={taken ? "neutral" : "success"}>
                        {taken ? t("common.taken") : t("common.available")}
                      </StatusBadge>
                    </label>
                  );
                })}
              </fieldset>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPendingJoinRoom(null)}
                  disabled={joinBusy}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    if (!pendingJoinRoom) return;
                    setJoinBusy(true);
                    setLocalError(null);
                    try {
                      await joinRoom({
                        mode: "join",
                        roomId: pendingJoinRoom.id,
                        role: joinRole,
                        name: name.trim() ? name.trim() : undefined,
                      });
                      setPendingJoinRoom(null);
                    } catch (err) {
                      setLocalError(
                        localizeServerText(err instanceof Error ? err.message : "", t) ||
                          t("errors.joinRoom"),
                      );
                    } finally {
                      setJoinBusy(false);
                    }
                  }}
                  disabled={
                    joinBusy ||
                    (joinRole === "P1" && pendingJoinRoom.players.P1) ||
                    (joinRole === "P2" && pendingJoinRoom.players.P2)
                  }
                >
                  {joinBusy ? t("lobby.joining") : t("common.join")}
                </button>
              </div>
              {localError || joinError ? (
                <div
                  className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-200"
                  role="alert"
                >
                  {localError ?? localizeServerText(joinError, t)}
                </div>
              ) : null}
            </PanelCard>
          </div>
        ) : null}

        <RulesModal open={showRules} onClose={() => setShowRules(false)} />
    </LobbyLayout>
  );
}
