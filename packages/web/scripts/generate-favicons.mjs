import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pngToIcoModule from "png-to-ico";
import sharp from "sharp";

const pngToIco = pngToIcoModule.default ?? pngToIcoModule;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const publicDir = resolve(webRoot, "public");
const sourcePath = resolve(publicDir, "favicon.png");
const icoPath = resolve(publicDir, "favicon.ico");

const pngTargets = [
  { fileName: "favicon-16x16.png", size: 16 },
  { fileName: "favicon-32x32.png", size: 32 },
  { fileName: "favicon-48x48.png", size: 48 },
  { fileName: "apple-touch-icon.png", size: 180 },
  { fileName: "android-chrome-192x192.png", size: 192 },
  { fileName: "android-chrome-512x512.png", size: 512 },
];

const requiredIcoSizes = [16, 32, 48];
const whiteBackground = {
  transparentDistance: 12,
  opaqueDistance: 200,
};
const contrastHalo = {
  color: { red: 248, green: 241, blue: 255 },
};

async function assertSourceExists() {
  try {
    await access(sourcePath);
  } catch {
    throw new Error(`Missing source favicon: ${sourcePath}`);
  }
}

function clampColor(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function alphaFromWhiteDistance(distance) {
  if (distance <= whiteBackground.transparentDistance) {
    return 0;
  }

  if (distance >= whiteBackground.opaqueDistance) {
    return 255;
  }

  const amount =
    (distance - whiteBackground.transparentDistance) /
    (whiteBackground.opaqueDistance - whiteBackground.transparentDistance);

  return clampColor(amount * 255);
}

async function createTransparentSource() {
  const { data, info } = await sharp(sourcePath, { failOn: "error" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let transparentPixels = 0;
  let softenedEdgePixels = 0;

  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const sourceAlpha = data[index + 3];
    const distanceFromWhite = Math.max(255 - red, 255 - green, 255 - blue);
    const matteAlpha = alphaFromWhiteDistance(distanceFromWhite);
    const outputAlpha = Math.round((sourceAlpha * matteAlpha) / 255);

    if (matteAlpha === 0 || outputAlpha === 0) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 0;
      transparentPixels += 1;
      continue;
    }

    if (matteAlpha < 255) {
      const alpha = matteAlpha / 255;
      data[index] = clampColor((red - 255 * (1 - alpha)) / alpha);
      data[index + 1] = clampColor((green - 255 * (1 - alpha)) / alpha);
      data[index + 2] = clampColor((blue - 255 * (1 - alpha)) / alpha);
      softenedEdgePixels += 1;
    }

    data[index + 3] = outputAlpha;
  }

  return {
    data,
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
    transparentPixels,
    softenedEdgePixels,
  };
}

function getHaloSettings(size) {
  if (size <= 16) {
    return { radius: 1, opacity: 0.95 };
  }

  if (size <= 32) {
    return { radius: 1, opacity: 0.86 };
  }

  if (size <= 48) {
    return { radius: 1, opacity: 0.78 };
  }

  if (size <= 192) {
    return { radius: 3, opacity: 0.55 };
  }

  return { radius: 5, opacity: 0.5 };
}

function createHaloAlpha(sourceAlpha, width, height, { radius, opacity }) {
  const haloAlpha = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = y * width + x;
      const alpha = sourceAlpha[sourceIndex];
      if (alpha === 0) {
        continue;
      }

      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        const targetY = y + offsetY;
        if (targetY < 0 || targetY >= height) {
          continue;
        }

        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const targetX = x + offsetX;
          if (targetX < 0 || targetX >= width) {
            continue;
          }

          const distance = Math.hypot(offsetX, offsetY);
          if (distance > radius) {
            continue;
          }

          const targetIndex = targetY * width + targetX;
          const falloff = 1 - distance / (radius + 1);
          const halo = alpha * falloff * opacity;
          if (halo > haloAlpha[targetIndex]) {
            haloAlpha[targetIndex] = halo;
          }
        }
      }
    }
  }

  return haloAlpha;
}

function applyContrastHalo(data, width, height, haloSettings) {
  const sourceAlpha = new Uint8ClampedArray(width * height);
  for (let index = 0; index < sourceAlpha.length; index += 1) {
    sourceAlpha[index] = data[index * 4 + 3];
  }

  const haloAlpha = createHaloAlpha(sourceAlpha, width, height, haloSettings);
  const output = Buffer.alloc(data.length);

  for (let index = 0; index < sourceAlpha.length; index += 1) {
    const pixelIndex = index * 4;
    const logoAlpha = sourceAlpha[index] / 255;
    const haloLayerAlpha = (haloAlpha[index] / 255) * (1 - logoAlpha);
    const outputAlpha = logoAlpha + haloLayerAlpha;

    if (outputAlpha === 0) {
      continue;
    }

    output[pixelIndex] = clampColor(
      (data[pixelIndex] * logoAlpha + contrastHalo.color.red * haloLayerAlpha) /
        outputAlpha,
    );
    output[pixelIndex + 1] = clampColor(
      (data[pixelIndex + 1] * logoAlpha +
        contrastHalo.color.green * haloLayerAlpha) /
        outputAlpha,
    );
    output[pixelIndex + 2] = clampColor(
      (data[pixelIndex + 2] * logoAlpha + contrastHalo.color.blue * haloLayerAlpha) /
        outputAlpha,
    );
    output[pixelIndex + 3] = clampColor(outputAlpha * 255);
  }

  return output;
}

async function resizePng(transparentSource, { fileName, size }) {
  const targetPath = resolve(publicDir, fileName);

  const { data, info } = await sharp(transparentSource.data, {
    raw: transparentSource.raw,
    failOn: "error",
  })
    .resize({
      width: size,
      height: size,
      fit: "contain",
      kernel: sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const haloSettings = getHaloSettings(size);
  const targetBuffer = applyContrastHalo(data, info.width, info.height, haloSettings);

  await sharp(targetBuffer, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(targetPath);

  const { width, height, hasAlpha } = await sharp(targetPath).metadata();
  if (width !== size || height !== size) {
    throw new Error(
      `${fileName} was generated at ${width}x${height}, expected ${size}x${size}`,
    );
  }

  if (!hasAlpha) {
    throw new Error(`${fileName} was generated without an alpha channel`);
  }

  return targetPath;
}

function readIcoSizes(buffer) {
  if (buffer.length < 6) {
    throw new Error("favicon.ico is too small to contain an ICO header");
  }

  const reserved = buffer.readUInt16LE(0);
  const type = buffer.readUInt16LE(2);
  const count = buffer.readUInt16LE(4);

  if (reserved !== 0 || type !== 1 || count < 1) {
    throw new Error("favicon.ico has an invalid ICO header");
  }

  const sizes = [];
  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + index * 16;
    if (entryOffset + 16 > buffer.length) {
      throw new Error("favicon.ico has a truncated directory");
    }

    const width = buffer[entryOffset] || 256;
    const height = buffer[entryOffset + 1] || 256;
    sizes.push(`${width}x${height}`);
  }

  return sizes;
}

async function createIco(pngPaths) {
  const icoPngPaths = requiredIcoSizes.map((size) => {
    const target = pngTargets.find((entry) => entry.size === size);
    if (!target) {
      throw new Error(`No PNG target configured for ICO size ${size}`);
    }
    return pngPaths.get(target.fileName);
  });

  const icoBuffer = await pngToIco(icoPngPaths);
  await writeFile(icoPath, icoBuffer);

  const writtenIco = await readFile(icoPath);
  const icoSizes = readIcoSizes(writtenIco);
  const missingSizes = requiredIcoSizes
    .map((size) => `${size}x${size}`)
    .filter((size) => !icoSizes.includes(size));

  if (missingSizes.length > 0) {
    throw new Error(`favicon.ico is missing required sizes: ${missingSizes.join(", ")}`);
  }

  return icoSizes;
}

async function main() {
  await assertSourceExists();

  const sourceMetadata = await sharp(sourcePath).metadata();
  const alphaNote = sourceMetadata.hasAlpha ? "with alpha" : "without alpha";
  console.log(
    `Using source public/favicon.png (${sourceMetadata.width}x${sourceMetadata.height}, ${alphaNote})`,
  );

  const transparentSource = await createTransparentSource();
  console.log(
    `Removed white background in generated assets (${transparentSource.transparentPixels} transparent pixels, ${transparentSource.softenedEdgePixels} softened edge pixels)`,
  );

  const generatedPngPaths = new Map();
  for (const target of pngTargets) {
    const targetPath = await resizePng(transparentSource, target);
    generatedPngPaths.set(target.fileName, targetPath);
    console.log(
      `Generated ${target.fileName} (${target.size}x${target.size}, halo radius ${
        getHaloSettings(target.size).radius
      }px)`,
    );
  }

  const icoSizes = await createIco(generatedPngPaths);
  console.log(`Generated favicon.ico (${icoSizes.join(", ")})`);
  console.log("Favicon assets generated successfully.");
}

main().catch((error) => {
  console.error(`Failed to generate favicons: ${error.message}`);
  process.exitCode = 1;
});
