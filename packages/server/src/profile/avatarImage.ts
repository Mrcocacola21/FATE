import { createHash } from "node:crypto";
import { AppError } from "../errors/appError";

export const AVATAR_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];
/** The web client resizes to 256 px before upload; this leaves room for a plain small file. */
export const AVATAR_MAX_BYTES = 256 * 1024;
export const AVATAR_MIN_SIDE = 16;
export const AVATAR_MAX_SIDE = 1024;

export interface AvatarImage {
  contentType: AvatarContentType;
  width: number;
  height: number;
  data: Buffer;
  sha256: string;
}

export const avatarInvalid = () =>
  new AppError("AVATAR_INVALID", 400, "Upload a PNG, JPEG or WebP image up to 256 KB.");

function startsWith(data: Buffer, bytes: number[], offset = 0) {
  return bytes.every((byte, index) => data[offset + index] === byte);
}

function detectType(data: Buffer): AvatarContentType | null {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(data, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP")
    return "image/webp";
  return null;
}

function pngSize(data: Buffer) {
  if (data.length < 24 || data.toString("latin1", 12, 16) !== "IHDR") return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

/** Walks the marker segments to the first start-of-frame header. */
function jpegSize(data: Buffer) {
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1];
    if (marker === 0xff) {
      offset++;
      continue;
    }
    const length = data.readUInt16BE(offset + 2);
    if (length < 2) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame)
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  return null;
}

function webpSize(data: Buffer) {
  if (data.length < 30) return null;
  const chunk = data.toString("latin1", 12, 16);
  if (chunk === "VP8 " && startsWith(data, [0x9d, 0x01, 0x2a], 23))
    return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L" && data[20] === 0x2f) {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X")
    return { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1 };
  return null;
}

/**
 * Accepts only a raster image whose bytes match the declared type and whose header reports
 * sane dimensions. The bytes are stored as uploaded and served back with that same type.
 */
export function parseAvatarImage(declaredType: string | undefined, body: unknown): AvatarImage {
  const contentType = declaredType?.split(";")[0].trim().toLowerCase();
  if (!Buffer.isBuffer(body) || body.length === 0 || body.length > AVATAR_MAX_BYTES)
    throw avatarInvalid();
  const detected = detectType(body);
  if (!detected || detected !== contentType) throw avatarInvalid();
  const size =
    detected === "image/png" ? pngSize(body) : detected === "image/jpeg" ? jpegSize(body) : webpSize(body);
  if (
    !size ||
    [size.width, size.height].some(
      (side) => !Number.isInteger(side) || side < AVATAR_MIN_SIDE || side > AVATAR_MAX_SIDE,
    )
  )
    throw avatarInvalid();
  return {
    contentType: detected,
    ...size,
    data: body,
    sha256: createHash("sha256").update(body).digest("hex"),
  };
}

/** The versioned path stored in Profile.avatarUrl; clients resolve it against the API origin. */
export function uploadedAvatarPath(userId: string, sha256: string) {
  return `/api/avatars/${userId}?v=${sha256.slice(0, 16)}`;
}
