import { useMemo, type CSSProperties } from "react";
import type { Coord, PlayerId, PlayerView } from "rules";
import { BoneIcon } from "../../game/boneStatus";
import { SnaredOverlay } from "../../components/SnaredOverlay";
import type { CombatVisualPlaybackFrame } from "../../game/effects/combatPlayback";
import type { Translate } from "../../i18n";
import { cellToBoardRect } from "./vfxGeometry";
import { BOARD_LAYERS, vfxRegistry } from "./vfxRegistry";
import { VfxSprite } from "./VfxSprite";
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
            {summary ? label : bone ? <BoneIcon className="h-full w-full" /> : visual.glyph}
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
  const units = useMemo(() => resolvePersistentStatuses(view, playerId), [view, playerId]);
  return (
    <div
      className={`unit-status-root ${reducedMotion ? "unit-status-reduced" : ""}`}
      style={{ width: boardSize * cellSize, height: boardSize * cellSize, pointerEvents: "none" }}
    >
      {units.map(({ unitId, statuses }) => {
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
                    className={`persistent-status-art ${status.kind === "curse" ? "persistent-status-art--curse" : "persistent-status-art--bunker"}`}
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
