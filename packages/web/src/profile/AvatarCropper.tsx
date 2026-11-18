import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useI18n } from "../i18n";
import { TacticalIcon } from "../ui/TacticalIcon";
import {
  AVATAR_MAX_ZOOM,
  INITIAL_CROP,
  clampCrop,
  drawCrop,
  rotateCrop,
  zoomCrop,
  type AvatarCrop,
} from "./avatarFile";

/** Fine and coarse keyboard nudges, as a share of the frame side. */
const NUDGE = 0.02;
const NUDGE_FAST = 0.1;
const ZOOM_STEP = 0.1;
/**
 * The grimoire tile of the profile header (112 × 136, arched top, small lower corners) over the
 * square upload: the picture fills its height, so the tile shows the middle 81% of the width.
 */
const TILE =
  "M9.5 95 V40.5 A40.5 40.5 0 0 1 90.5 40.5 V95 A5 5 0 0 1 85.5 100 H14.5 A5 5 0 0 1 9.5 95 Z";

/**
 * Lets the player place a picked picture in the avatar square: drag or arrow keys move it, the
 * slider, wheel, pinch or +/- zoom it, and it can turn in quarter turns. The preview is drawn by
 * the same code that renders the upload, so what is framed is what gets saved.
 */
export function AvatarCropper({
  source,
  busy,
  error,
  onApply,
  onBack,
  onPickAnother,
}: {
  source: ImageBitmap;
  busy: boolean;
  error: string | null;
  onApply(crop: AvatarCrop): void;
  onBack(): void;
  onPickAnother(): void;
}) {
  const { t } = useI18n();
  const [crop, setCrop] = useState<AvatarCrop>(INITIAL_CROP);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const update = (next: (current: AvatarCrop) => AvatarCrop) =>
    setCrop((current) => clampCrop(source, next(current)));

  useEffect(() => setCrop(INITIAL_CROP), [source]);
  useEffect(() => stage.current?.focus({ preventScroll: true }), [source]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const side = Math.round(element.clientWidth * (window.devicePixelRatio || 1)) || 288;
    if (element.width !== side) element.width = element.height = side;
    drawCrop(context, source, crop, side);
  }, [source, crop]);

  // React registers wheel listeners as passive, and the page must not scroll while zooming.
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY / 400);
      setCrop((current) => zoomCrop(source, current, current.zoom * factor));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [source]);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (busy) return;
    try {
      // Keeps the drag going when the pointer leaves the frame.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* A pointer that is already gone cannot be captured; the drag still works inside. */
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) pinch.current = { distance: distance(), zoom: crop.zoom };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    const side = event.currentTarget.clientWidth || 1;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const ratio = distance() / (pinch.current.distance || 1);
      const zoom = pinch.current.zoom * ratio;
      setCrop((current) => zoomCrop(source, current, zoom));
      return;
    }
    const dx = (event.clientX - last.x) / side;
    const dy = (event.clientY - last.y) / side;
    update((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? NUDGE_FAST : NUDGE;
    const move = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (move) {
      update((current) => ({ ...current, x: current.x + move[0], y: current.y + move[1] }));
    } else if (event.key === "+" || event.key === "=") {
      setCrop((current) => zoomCrop(source, current, current.zoom + ZOOM_STEP));
    } else if (event.key === "-" || event.key === "_") {
      setCrop((current) => zoomCrop(source, current, current.zoom - ZOOM_STEP));
    } else if (event.key === "r" || event.key === "R") {
      setCrop((current) => rotateCrop(source, current));
    } else if (event.key === "0") {
      setCrop(INITIAL_CROP);
    } else return;
    event.preventDefault();
  };

  return (
    <div className="avatar-cropper" data-testid="avatar-cropper">
      <div
        ref={stage}
        className="avatar-cropper__stage"
        tabIndex={0}
        role="group"
        aria-roledescription={t("profile.cropStage")}
        aria-label={t("profile.cropStage")}
        aria-describedby="avatar-cropper-hint"
        aria-disabled={busy}
        data-testid="avatar-cropper-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        <canvas ref={canvas} className="avatar-cropper__canvas" aria-hidden="true" />
        <svg className="avatar-cropper__mask" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <mask id="avatar-cropper-hole">
              <rect width="100" height="100" fill="white" />
              <path d={TILE} fill="black" />
            </mask>
          </defs>
          <rect
            width="100"
            height="100"
            className="avatar-cropper__shade"
            mask="url(#avatar-cropper-hole)"
          />
          <path d={TILE} className="avatar-cropper__tile" />
        </svg>
      </div>
      <p id="avatar-cropper-hint" className="avatar-cropper__hint">
        {t("profile.cropHint")}
      </p>
      <div className="avatar-cropper__zoom">
        <TacticalIcon name="minimize" />
        <input
          type="range"
          min={1}
          max={AVATAR_MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          disabled={busy}
          aria-label={t("profile.cropZoom")}
          aria-valuetext={`${Math.round(crop.zoom * 100)}%`}
          data-testid="avatar-cropper-zoom"
          onChange={(event) =>
            setCrop((current) => zoomCrop(source, current, Number(event.target.value)))
          }
        />
        <TacticalIcon name="plus" />
      </div>
      <div className="avatar-cropper__tools">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => setCrop((current) => rotateCrop(source, current))}
        >
          {t("profile.cropRotate")}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => setCrop(INITIAL_CROP)}
        >
          {t("profile.cropReset")}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="profile-dialog__footer">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onPickAnother}>
          {t("profile.cropPickAnother")}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onBack}>
          {t("profile.cropBack")}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => onApply(crop)}
        >
          {busy ? t("profile.avatarUploading") : t("profile.cropApply")}
        </button>
      </div>
    </div>
  );
}
