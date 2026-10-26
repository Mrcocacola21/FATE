/** What the server accepts: matches packages/server/src/profile/avatarImage.ts. */
export const AVATAR_UPLOAD_MAX_BYTES = 256 * 1024;
export const AVATAR_SIDE = 256;
const AVATAR_MIN_SIDE = 16;
/** Big phone photos are fine to pick; they are shrunk before upload. */
const AVATAR_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export class AvatarFileError extends Error {
  constructor(readonly reason: "type" | "size" | "small" | "unreadable") {
    super(reason);
  }
}

/** Source rectangle for a centered square crop. */
export function centerSquare(width: number, height: number) {
  const side = Math.min(width, height);
  return { x: (width - side) / 2, y: (height - side) / 2, side };
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Crops the picked image to a centered square and re-encodes it at 256 px. Re-encoding also
 * strips metadata such as photo location, and keeps the upload far below the server limit.
 */
export async function prepareAvatarUpload(file: File): Promise<Blob> {
  if (!AVATAR_ACCEPT.split(",").includes(file.type)) throw new AvatarFileError("type");
  if (file.size > AVATAR_SOURCE_MAX_BYTES) throw new AvatarFileError("size");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AvatarFileError("unreadable");
  }
  try {
    const crop = centerSquare(bitmap.width, bitmap.height);
    if (crop.side < AVATAR_MIN_SIDE) throw new AvatarFileError("small");
    const size = Math.min(AVATAR_SIDE, crop.side);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new AvatarFileError("unreadable");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, crop.x, crop.y, crop.side, crop.side, 0, 0, size, size);
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
  } finally {
    bitmap.close();
  }
}
