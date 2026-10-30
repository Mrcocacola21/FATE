import { useId, type CSSProperties } from "react";
import type { Coord } from "rules";
import { cellToBoardRect } from "./vfxGeometry";
import { BOARD_LAYERS, vfxRegistry } from "./vfxRegistry";
import type { ExpansionEffectId } from "./expansionCatalog.generated";
import { usePortraitReady } from "./usePortraitReady";
import { commanderAuraBounds } from "./expansionPresence.generated";

const colors: Record<string, [string, string]> = {
  genghisKhan: ["#e9b870", "#89cce0"], jebe: ["#5cdec6", "#c4f6e7"],
  hassan: ["#e9c580", "#ded2f5"], donKihote: ["#e6bb6d", "#db9191"],
  elCidCompeador: ["#75c9cc", "#e3cd92"], vladTepes: ["#d48baf", "#cfa3e8"],
  griffith: ["#b9cfe9", "#e7eff8"], grozny: ["#d79168", "#eacba1"],
};

/** Chebyshev radius one, matching getPolkovodetsSource; center is not a recipient. */
export function commanderAuraCells(position: Coord, boardSize: number): Coord[] {
  const cells: Coord[] = [];
  for (let row = -1; row <= 1; row++) for (let col = -1; col <= 1; col++) {
    const cell = { col: position.col + col, row: position.row + row };
    if ((col || row) && cell.col >= 0 && cell.row >= 0 && cell.col < boardSize && cell.row < boardSize) cells.push(cell);
  }
  return cells;
}

/** Pixel size of commander_aura.png; commanderAuraBounds are measured in it. */
export const COMMANDER_AURA_CANVAS = 512;

/** Normalize the authored ring and its transparent padding to the board plane. */
export function commanderAuraFrame(heroId: string) {
  const bounds = commanderAuraBounds[heroId] ?? { left: 0, top: 0, width: COMMANDER_AURA_CANVAS, height: COMMANDER_AURA_CANVAS };
  const extent = 294, inset = 3;
  return { x: inset - bounds.left * extent / bounds.width, y: inset - bounds.top * extent / bounds.height,
    width: COMMANDER_AURA_CANVAS * extent / bounds.width, height: COMMANDER_AURA_CANVAS * extent / bounds.height };
}

/** The original artwork is the living radius-one ring; cell wash stays secondary. */
export function CommanderAura({ effectId, position, portraitSrc, boardSize, cellSize, isFlipped, reducedMotion, opacity }: {
  effectId: ExpansionEffectId; position: Coord; portraitSrc?: string; boardSize: number; cellSize: number;
  isFlipped: boolean; reducedMotion: boolean; opacity?: number;
}) {
  const id = useId().replace(/:/g, "");
  const ready = usePortraitReady(portraitSrc);
  if (!ready) return null;
  const rect = cellToBoardRect(position, boardSize, cellSize, isFlipped);
  const heroId = effectId.split(".")[1];
  const [color, light] = colors[heroId] ?? colors.genghisKhan;
  const artwork = commanderAuraFrame(heroId);
  const left = rect.left - cellSize, top = rect.top - cellSize;
  const clip = { left: Math.max(0, -left), top: Math.max(0, -top),
    right: Math.max(0, left + 3 * cellSize - boardSize * cellSize), bottom: Math.max(0, top + 3 * cellSize - boardSize * cellSize) };
  return <span aria-hidden="true" data-expansion-status={effectId} data-commander-radius="1"
    className={`commander-aura pointer-events-none absolute ${reducedMotion ? "commander-aura-reduced" : ""}`}
    style={{ left, top, width: 3 * cellSize, height: 3 * cellSize, opacity, zIndex: BOARD_LAYERS.ground,
      clipPath: `inset(${clip.top}px ${clip.right}px ${clip.bottom}px ${clip.left}px)`,
      "--aura-color": color, "--aura-light": light } as CSSProperties}>
    <svg viewBox="0 0 300 300" className="commander-aura-field" fill="none">
      <defs>
        <radialGradient id={`${id}-wash`}><stop stopColor={light} stopOpacity="0.002" />
          <stop offset="0.62" stopColor={color} stopOpacity="0.009" /><stop offset="1" stopColor={color} stopOpacity="0.018" /></radialGradient>
      </defs>
      <rect x="1" y="1" width="298" height="298" rx="28" fill={`url(#${id}-wash)`} className="commander-aura-breath" />
      {commanderAuraCells(position, boardSize).map(cell => {
        const cellRect = cellToBoardRect(cell, boardSize, cellSize, isFlipped);
        return <rect key={`${cell.col}:${cell.row}`} data-aura-cell={`${cell.col},${cell.row}`}
          x={(cellRect.left - left) * 100 / cellSize} y={(cellRect.top - top) * 100 / cellSize}
          width="100" height="100" fill={color} fillOpacity="0.005" />;
      })}
      <g className="commander-aura-orbit">
        <g className="commander-aura-artwork">
          <image href={vfxRegistry[effectId].asset} {...artwork} preserveAspectRatio="none" />
        </g>
      </g>
    </svg>
  </span>;
}
