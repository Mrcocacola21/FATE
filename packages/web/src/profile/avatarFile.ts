/** What the server accepts: matches packages/server/src/profile/avatarImage.ts. */
export const AVATAR_UPLOAD_MAX_BYTES = 256 * 1024;
export const AVATAR_SIDE = 256;
const AVATAR_MIN_SIDE = 16;
/** Big phone photos are fine to pick; they are shrunk before upload. */
const AVATAR_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
export const AVATAR_MAX_ZOOM = 4;

export class AvatarFileError extends Error {
  constructor(readonly reason: "type" | "size" | "small" | "unreadable") {
    super(reason);
  }
}

/**
 * How the picture sits in the square frame. The frame side is 1: `x` and `y` move the picture's
 * centre away from the frame's centre, `zoom` 1 makes the picture just cover the frame, and
 * `rotation` turns it clockwise in quarter turns.
 */
export interface AvatarCrop {
  x: number;
  y: number;
  zoom: number;
  rotation: 0 | 90 | 180 | 270;
}

export const INITIAL_CROP: AvatarCrop = { x: 0, y: 0, zoom: 1, rotation: 0 };

interface Size {
  width: number;
  height: number;
}

/** The picture's size once turned, before scaling. */
function turned({ width, height }: Size, rotation: AvatarCrop["rotation"]): Size {
  return rotation % 180 === 0 ? { width, height } : { width: height, height: width };
}

/** Frame sides per picture pixel. */
export function cropScale(source: Size, crop: AvatarCrop) {
  return crop.zoom / Math.min(source.width, source.height);
}

/** Keeps the zoom in range and the picture covering the whole frame. */
export function clampCrop(source: Size, crop: AvatarCrop): AvatarCrop {
  const zoom = Math.min(AVATAR_MAX_ZOOM, Math.max(1, crop.zoom));
  const scale = zoom / Math.min(source.width, source.height);
  const shown = turned(source, crop.rotation);
  const limitX = Math.max(0, (shown.width * scale - 1) / 2);
  const limitY = Math.max(0, (shown.height * scale - 1) / 2);
  const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value)) || 0;
  return { zoom, rotation: crop.rotation, x: clamp(crop.x, limitX), y: clamp(crop.y, limitY) };
}

/** Changes the zoom while the point under the frame's centre stays put. */
export function zoomCrop(source: Size, crop: AvatarCrop, zoom: number): AvatarCrop {
  const next = Math.min(AVATAR_MAX_ZOOM, Math.max(1, zoom));
  const ratio = next / crop.zoom;
  return clampCrop(source, { ...crop, zoom: next, x: crop.x * ratio, y: crop.y * ratio });
}

/** Turns a quarter clockwise; the offset turns with the picture. */
export function rotateCrop(source: Size, crop: AvatarCrop): AvatarCrop {
  const rotation = ((crop.rotation + 90) % 360) as AvatarCrop["rotation"];
  return clampCrop(source, { ...crop, rotation, x: -crop.y, y: crop.x });
}

/** Pixel side of the uploaded square: never upscale past what the picture holds. */
export function outputSide(source: Size, crop: AvatarCrop) {
  const available = Math.min(source.width, source.height) / crop.zoom;
  return Math.max(AVATAR_MIN_SIDE, Math.min(AVATAR_SIDE, Math.round(available)));
}

/** Draws the framed part of the picture onto a square canvas of `side` pixels. */
export function drawCrop(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource & Size,
  crop: AvatarCrop,
  side: number,
) {
  const scale = cropScale(source, crop) * side;
  context.save();
  context.clearRect(0, 0, side, side);
  context.imageSmoothingQuality = "high";
  context.translate(side / 2 + crop.x * side, side / 2 + crop.y * side);
  context.rotate((crop.rotation * Math.PI) / 180);
  context.scale(scale, scale);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  context.restore();
}

/** Checks the picked file and decodes it for the cropper. The caller closes the bitmap. */
export async function loadAvatarSource(file: File): Promise<ImageBitmap> {
  if (!AVATAR_ACCEPT.split(",").includes(file.type)) throw new AvatarFileError("type");
  if (file.size > AVATAR_SOURCE_MAX_BYTES) throw new AvatarFileError("size");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AvatarFileError("unreadable");
  }
  if (Math.min(bitmap.width, bitmap.height) < AVATAR_MIN_SIDE) {
    bitmap.close();
    throw new AvatarFileError("small");
  }
  return bitmap;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Renders the framed square at up to 256 px and re-encodes it. Re-encoding also strips metadata
 * such as photo location, and keeps the upload far below the server limit.
 */
export async function cropAvatar(source: ImageBitmap, crop: AvatarCrop): Promise<Blob> {
  const side = outputSide(source, crop);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  const context = canvas.getContext("2d");
  if (!context) throw new AvatarFileError("unreadable");
  drawCrop(context, source, clampCrop(source, crop), side);
  // Browsers without WebP encoding hand back PNG; JPEG is the last resort for size.
  for (const [type, quality] of [
    ["image/webp", 0.9],
    ["image/png", undefined],
    ["image/jpeg", 0.88],
  ] as const) {
    const blob = await toBlob(canvas, type, quality);
    if (blob && blob.type === type && blob.size <= AVATAR_UPLOAD_MAX_BYTES) return blob;
  }
  throw new AvatarFileError("size");
}
