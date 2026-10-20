import { useMemo, type CSSProperties } from "react";
import type { Coord, PlayerId, PlayerView } from "rules";
import { BoneIcon } from "../../game/boneStatus";
import { SnaredOverlay } from "../../components/SnaredOverlay";
import type { CombatVisualPlaybackFrame } from "../../game/effects/combatPlayback";
import type { Translate } from "../../i18n";
import { cellToBoardRect } from "./vfxGeometry";
import { BOARD_LAYERS, vfxRegistry } from "./vfxRegistry";
import { VfxSprite } from "./VfxSprite";
import { getUnitTokenAsset } from "../../assets/unitVisuals";
import { CommanderAura } from "./CommanderAura";
import { expansionStatusArt } from "./expansionStatuses";
import {
  resolvePersistentStatuses,
  STATUS_VISUALS,
  type PersistentUnitStatus,
} from "./persistentStatuses";

// Keep complete class names in source for Tailwind's production content scan.
const toneClasses = {
  negative: "unit-status-badge--negative",
  curse: "unit-status-badge--curse",
  positive: "unit-status-badge--positive",
  neutral: "unit-status-badge--neutral",
  stealth: "unit-status-badge--stealth",
  mark: "unit-status-badge--mark",
  blue: "unit-status-badge--blue",
  orange: "unit-status-badge--orange",
} as const;

export function StatusBadges({
  statuses,
  t,
  summary = false,
  maxBadges = 7,
}: {
  statuses: PersistentUnitStatus[];
  t: Translate;
  summary?: boolean;
  maxBadges?: number;
}) {
  if (!statuses.length) return null;
  // Normal stacks stay separate. Extreme synthetic stacks have an accessible
  // aggregate; its title lists every authorized condition without covering HP.
  const shown = summary ? statuses : statuses.slice(0, maxBadges);
  const overflow = statuses.slice(shown.length);
  return (
    <div
      className={summary ? "unit-status-summary" : "unit-status-row"}
      style={{ zIndex: BOARD_LAYERS.status }}
    >
      {shown.map((status) => {
        const visual = STATUS_VISUALS[status.kind];
        const label = t(status.labelKey);
        const bone = "bone" in visual ? visual.bone : undefined;
        return (
          <span
            key={status.id}
            className={`unit-status-badge ${toneClasses[visual.tone]}`}
            data-status-id={status.id}
            data-unit-status={status.kind}
            data-bone-status={
              bone &&
              (("source" in visual && visual.source === "sansBoneField") ||
                !statuses.some((item) => item.kind === "sansBlue" || item.kind === "sansOrange"))
                ? bone
                : undefined
            }
            data-bone-source={"source" in visual ? visual.source : undefined}
            data-blind-status={status.kind === "blind" ? "active" : undefined}
            role="img"
            aria-label={label}
            title={label}
          >
            {summary ? label : bone ? <BoneIcon className="h-full w-full" /> : "icon" in visual && visual.icon === "banner" ? (
              <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" fill="none">
                <path d="M4 14V2m0 0h8l-2 3 2 3H4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : visual.glyph}
          </span>
        );
      })}
      {overflow.length > 0 && (
        <span
          className="unit-status-badge unit-status-badge--neutral"
          role="img"
          aria-label={overflow.map((status) => t(status.labelKey)).join(", ")}
          title={overflow.map((status) => t(status.labelKey)).join(", ")}
        >
          +{overflow.length}
        </span>
      )}
    </div>
  );
}

/** State owns existence; the existing playback frame owns visual placement only. */
export function UnitStatusVfx({
  view,
  playerId,
  visualUnits,
  motion,
  boardSize,
  cellSize,
  isFlipped,
  reducedMotion,
  t,
}: {
  view: PlayerView;
  playerId: PlayerId | null;
  visualUnits: PlayerView["units"];
  motion: CombatVisualPlaybackFrame["visualMotionByUnitId"];
  boardSize: number;
  cellSize: number;
  isFlipped: boolean;
  reducedMotion: boolean;
  t: Translate;
}) {
  // Snare entry has an explicit playback phase. Keep its permanent badge/art
  // on that reached frame; a baseline snapshot already contains the final flag.
  const statusView = useMemo<PlayerView>(() => {
    const units: PlayerView["units"] = {};
    for (const unit of Object.values(view.units)) units[unit.id] = visualUnits[unit.id]
      ? { ...unit, immobilizedUntilOwnTurnStart: visualUnits[unit.id].immobilizedUntilOwnTurnStart } : unit;
    return { ...view, units };
  }, [view, visualUnits]);
  const units = useMemo(() => resolvePersistentStatuses(statusView, playerId), [statusView, playerId]);
  return (
    <div
      className={`unit-status-root ${reducedMotion ? "unit-status-reduced" : ""}`}
      style={{ width: boardSize * cellSize, height: boardSize * cellSize, pointerEvents: "none" }}
    >
      {Object.values(statusView.units).flatMap(unit => {
        const arts = expansionStatusArt(statusView, unit, playerId);
        if (!arts.length || !unit.position) return [];
        const position = motion[unit.id]?.position ?? visualUnits[unit.id]?.position;
        if (!position) return [];
        const rect = cellToBoardRect(position, boardSize, cellSize, isFlipped);
        return arts.map(art => art.effectId.endsWith("commander_aura") ? <CommanderAura key={`${unit.id}:${art.effectId}`}
          effectId={art.effectId} position={position} boardSize={boardSize} cellSize={cellSize} isFlipped={isFlipped}
          portraitSrc={getUnitTokenAsset(unit).src} reducedMotion={reducedMotion} opacity={motion[unit.id]?.opacity} /> : <span key={`${unit.id}:${art.effectId}`} data-expansion-status={art.effectId}
          className="pointer-events-none absolute" style={{ ...rect, opacity: motion[unit.id]?.opacity, zIndex: BOARD_LAYERS.ground }}>
          <VfxSprite definition={vfxRegistry[art.effectId]} reducedMotion
            style={{ width: `${art.scaleCells * 100}%`, height: `${art.scaleCells * 100}%`,
              left: `${(1 - art.scaleCells) * 50}%`, top: `${(1 - art.scaleCells) * 50}%`, animation: "none",
              opacity: 0.5 }} />
        </span>);
      })}
      {units.filter(({ unitId }) => motion[unitId]?.position ?? visualUnits[unitId]?.position).map(({ unitId, statuses }) => {
        const position: Coord =
          motion[unitId]?.position ?? visualUnits[unitId]?.position ?? view.units[unitId].position!;
        const rect = cellToBoardRect(position, boardSize, cellSize, isFlipped);
        return (
          <div
            key={unitId}
            data-status-unit={unitId}
            className="unit-status-anchor"
            style={{ ...rect, opacity: motion[unitId]?.opacity } as CSSProperties}
          >
            {statuses.map((status) => {
              const visual = STATUS_VISUALS[status.kind];
              if (!("effectId" in visual)) return null;
              return (
                <span
                  key={status.id}
                  data-bunker-state={status.kind === "bunker" ? "active" : undefined}
                >
                  <VfxSprite
                    definition={vfxRegistry[visual.effectId]}
                    reducedMotion
                    className={`persistent-status-art ${status.kind === "curse" ? "persistent-status-art--curse" : status.kind === "bunker" || status.kind === "cleanSoul" ? "persistent-status-art--bunker" : "persistent-status-art--small"}`}
                    style={{ zIndex: BOARD_LAYERS.status }}
                  />
                </span>
              );
            })}
            {statuses.some((status) => status.kind === "stealth") && (
              <span className="persistent-stealth-perimeter" />
            )}
            {statuses.some((status) => status.kind === "immobilized") && (
              <div className="persistent-wrapped">
                <SnaredOverlay label={t("board.wrappedInSnares")} />
              </div>
            )}
            <StatusBadges
              statuses={statuses}
              t={t}
              maxBadges={Math.min(7, Math.max(2, Math.floor((cellSize - 6) / 15) * 2 - 1))}
            />
          </div>
        );
      })}
    </div>
  );
}
